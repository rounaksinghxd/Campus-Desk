import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
  backupDb,
  createSessionToken,
  hashSecret,
  loadDb,
  resetDbToSample,
  safeComparePlain,
  saveDb,
  toPublicFaculty,
  TokenPayload,
  verifySecret,
  verifySessionToken,
} from './server/store';
import {
  buildScheduleExactKey,
  buildScheduleSlotKey,
  normalizeDayCode,
  normalizeSlotType,
  normalizeTime24,
  parseFacultyCsvText,
  parseScheduleCsvText,
  parseStrictTimeTo24,
  parseTimeToMinutes,
  validateEmailAddress,
  validatePhoneNumber,
} from './src/utils/statusEngine';
import {
  DayOfWeek,
  DepartmentEvent,
  EventCategory,
  EventRegistrationStatus,
  MeetingRequest,
  ScheduleImportSummary,
  ScheduleSlot,
} from './src/types';

interface AuthedRequest extends Request {
  auth?: TokenPayload;
}

const VALID_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireRole(role: 'faculty' | 'admin') {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload || payload.role !== role) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
    if (role === 'faculty' && !payload.facultyId) {
      res.status(403).json({ error: 'Invalid faculty session.' });
      return;
    }
    req.auth = payload;
    next();
  };
}

function requireCoordinatorOrAdmin() {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Only admins or faculty coordinators can manage events.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired. Please sign in again.' });
      return;
    }
    if (payload.role === 'admin') {
      req.auth = payload;
      next();
      return;
    }
    if (payload.role === 'faculty' && payload.facultyId) {
      req.auth = payload;
      next();
      return;
    }
    res.status(403).json({ error: 'Insufficient permissions to manage events.' });
  };
}

const VALID_EVENT_CATEGORIES: EventCategory[] = [
  'Seminar',
  'Technical Talk',
  'Workshop',
  'Hackathon',
  'Competition',
  'Cultural Event',
  'Webinar',
  'Other',
];

const VALID_REG_STATUSES: EventRegistrationStatus[] = [
  'upcoming',
  'open',
  'closed',
  'completed',
];

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafeBannerInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.length > 2_000_000) return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return true;
  }
  return isSafeHttpUrl(trimmed);
}

function getDynamicDepartments(): string[] {
  const db = loadDb();
  const set = new Set<string>();
  for (const f of db.faculty) {
    if (f.department && f.department.trim()) {
      set.add(f.department.trim());
    }
  }
  for (const ev of db.events) {
    if (ev.department && ev.department.trim()) {
      set.add(ev.department.trim());
    }
  }
  return Array.from(set).sort();
}

function isAdminConfigured(): boolean {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass.length > 0) return true;
  const db = loadDb();
  return Boolean(db.adminPasscodeHash);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const defaultMobileOrigins = new Set([
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    ...(process.env.APP_URL ? [process.env.APP_URL.trim().replace(/\/+$/, '')] : []),
    ...envOrigins,
  ]);

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    const origin = req.headers.origin;
    if (origin) {
      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      if (
        defaultMobileOrigins.has('*') ||
        defaultMobileOrigins.has(normalizedOrigin) ||
        normalizedOrigin.startsWith('http://localhost:') ||
        normalizedOrigin.startsWith('https://localhost:')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        );
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Public directory: faculty (without password hashes), schedules, departments, auth flags
  app.get('/api/directory', (_req, res) => {
    const db = loadDb();
    const publicFaculty = db.faculty.map(toPublicFaculty);
    const departments = Array.from(
      new Set(publicFaculty.map((f) => f.department).filter(Boolean))
    ).sort();
    res.json({
      faculty: publicFaculty,
      schedules: db.schedules,
      scheduleMetadata: db.scheduleMetadata || {
        source: db.schedules.length > 0 ? 'imported' : 'empty',
      },
      departments,
      adminConfigured: isAdminConfigured(),
    });
  });

  // Dynamic departments endpoint
  app.get('/api/departments', (_req, res) => {
    res.json({ departments: getDynamicDepartments() });
  });

  // --- Department Events Public Endpoints ---
  app.get('/api/events', (req, res) => {
    const db = loadDb();
    const deptFilter = typeof req.query.department === 'string' ? req.query.department.trim() : '';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const upcomingOnly = req.query.upcoming === 'true';
    const regOpenOnly = req.query.registrationOpen === 'true';
    const sortDir = req.query.sort === 'desc' ? 'desc' : 'asc';

    const todayStr = new Date().toISOString().slice(0, 10);

    let list = [...db.events];

    if (deptFilter && deptFilter !== 'All') {
      list = list.filter((e) => e.department.toLowerCase() === deptFilter.toLowerCase());
    }
    if (categoryFilter && categoryFilter !== 'All') {
      list = list.filter((e) => e.category.toLowerCase() === categoryFilter.toLowerCase());
    }
    if (searchFilter) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(searchFilter) ||
          e.description.toLowerCase().includes(searchFilter) ||
          e.venue.toLowerCase().includes(searchFilter) ||
          e.organizer.toLowerCase().includes(searchFilter)
      );
    }
    if (upcomingOnly) {
      list = list.filter(
        (e) =>
          e.registrationStatus !== 'completed' &&
          e.eventDate >= todayStr
      );
    }
    if (regOpenOnly) {
      list = list.filter((e) => e.registrationStatus === 'open');
    }

    list.sort((a, b) => {
      const cmp = `${a.eventDate}T${a.startTime}`.localeCompare(
        `${b.eventDate}T${b.startTime}`
      );
      return sortDir === 'desc' ? -cmp : cmp;
    });

    res.json({
      events: list,
      departments: getDynamicDepartments(),
    });
  });

  app.get('/api/events/:id', (req, res) => {
    const db = loadDb();
    const event = db.events.find((e) => e.id === req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    res.json({ event });
  });

  // --- Protected Event Management Endpoints (Admin or Faculty Coordinator) ---
  app.post('/api/events', requireCoordinatorOrAdmin(), (req: AuthedRequest, res) => {
    const {
      title,
      description,
      department,
      category,
      eventDate,
      startTime,
      endTime,
      venue,
      organizer,
      bannerImage,
      registrationLink,
      registrationStatus,
    } = req.body ?? {};

    if (
      typeof title !== 'string' ||
      typeof description !== 'string' ||
      typeof department !== 'string' ||
      typeof eventDate !== 'string' ||
      typeof startTime !== 'string' ||
      typeof endTime !== 'string' ||
      typeof venue !== 'string' ||
      typeof organizer !== 'string'
    ) {
      res.status(400).json({ error: 'All required event fields must be provided.' });
      return;
    }

    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    const cleanDept = department.trim();
    const cleanVenue = venue.trim();
    const cleanOrganizer = organizer.trim();
    const cleanDate = eventDate.trim();
    const cleanStart = normalizeTime24(startTime.trim());
    const cleanEnd = normalizeTime24(endTime.trim());

    if (cleanTitle.length < 3 || cleanTitle.length > 140) {
      res.status(400).json({ error: 'Event title must be between 3 and 140 characters.' });
      return;
    }
    if (cleanDesc.length < 10 || cleanDesc.length > 2000) {
      res.status(400).json({ error: 'Description must be between 10 and 2000 characters.' });
      return;
    }
    if (!cleanDept || !cleanVenue || !cleanOrganizer) {
      res.status(400).json({ error: 'Department, venue, and organizer are required.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      res.status(400).json({ error: 'Event date must be in YYYY-MM-DD format.' });
      return;
    }
    if (parseTimeToMinutes(cleanEnd) <= parseTimeToMinutes(cleanStart)) {
      res.status(400).json({ error: 'Event end time must be after start time.' });
      return;
    }

    const cleanCategory: EventCategory = VALID_EVENT_CATEGORIES.includes(category)
      ? category
      : 'Other';
    const cleanRegStatus: EventRegistrationStatus = VALID_REG_STATUSES.includes(
      registrationStatus
    )
      ? registrationStatus
      : 'upcoming';

    let cleanRegLink: string | undefined;
    if (typeof registrationLink === 'string' && registrationLink.trim()) {
      const trimmedLink = registrationLink.trim();
      if (!isSafeHttpUrl(trimmedLink)) {
        res.status(400).json({ error: 'Registration link must be a valid http:// or https:// URL.' });
        return;
      }
      cleanRegLink = trimmedLink;
    }

    let cleanBanner: string | undefined;
    if (typeof bannerImage === 'string' && bannerImage.trim()) {
      const trimmedBanner = bannerImage.trim();
      if (!isSafeBannerInput(trimmedBanner)) {
        res.status(400).json({ error: 'Invalid banner image URL or image exceeds size limit.' });
        return;
      }
      cleanBanner = trimmedBanner;
    }

    const db = loadDb();
    if (req.auth!.role === 'faculty') {
      const fac = db.faculty.find(
        (f) => f.id.toUpperCase() === req.auth!.facultyId!.toUpperCase()
      );
      if (!fac) {
        res.status(403).json({ error: 'Faculty account not found.' });
        return;
      }
      if (fac.department.toLowerCase() !== cleanDept.toLowerCase()) {
        res.status(403).json({
          error: `Faculty coordinators can only create events for their own department (${fac.department}).`,
        });
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const newEvent: DepartmentEvent = {
      id: `EVT-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      title: cleanTitle,
      description: cleanDesc,
      department: cleanDept,
      category: cleanCategory,
      eventDate: cleanDate,
      startTime: cleanStart,
      endTime: cleanEnd,
      venue: cleanVenue,
      organizer: cleanOrganizer,
      bannerImage: cleanBanner,
      registrationLink: cleanRegLink,
      registrationStatus: cleanRegStatus,
      isDemo: false,
      createdByRole: req.auth!.role,
      createdById: req.auth!.facultyId || 'admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.events.unshift(newEvent);
    saveDb(db);
    res.status(201).json({ event: newEvent });
  });

  app.delete('/api/events/demo/clear', requireRole('admin'), (_req, res) => {
    const db = loadDb();
    const before = db.events.length;
    db.events = db.events.filter((e) => !e.isDemo);
    saveDb(db);
    res.json({ removedCount: before - db.events.length, events: db.events });
  });

  app.patch('/api/events/:id', requireCoordinatorOrAdmin(), (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.events.find((e) => e.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    if (req.auth!.role === 'faculty') {
      const fac = db.faculty.find(
        (f) => f.id.toUpperCase() === req.auth!.facultyId!.toUpperCase()
      );
      if (
        !fac ||
        (fac.department.toLowerCase() !== target.department.toLowerCase() &&
          target.createdById !== fac.id)
      ) {
        res.status(403).json({
          error: 'You can only edit events belonging to your department.',
        });
        return;
      }
    }

    const {
      title,
      description,
      department,
      category,
      eventDate,
      startTime,
      endTime,
      venue,
      organizer,
      bannerImage,
      registrationLink,
      registrationStatus,
    } = req.body ?? {};

    if (typeof title === 'string' && title.trim().length >= 3) {
      target.title = title.trim().slice(0, 140);
    }
    if (typeof description === 'string' && description.trim().length >= 10) {
      target.description = description.trim().slice(0, 2000);
    }
    if (typeof department === 'string' && department.trim()) {
      if (req.auth!.role === 'admin') {
        target.department = department.trim().slice(0, 100);
      }
    }
    if (VALID_EVENT_CATEGORIES.includes(category)) {
      target.category = category;
    }
    if (typeof eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())) {
      target.eventDate = eventDate.trim();
    }
    if (typeof startTime === 'string' && startTime.trim()) {
      target.startTime = normalizeTime24(startTime.trim());
    }
    if (typeof endTime === 'string' && endTime.trim()) {
      target.endTime = normalizeTime24(endTime.trim());
    }
    if (parseTimeToMinutes(target.endTime) <= parseTimeToMinutes(target.startTime)) {
      res.status(400).json({ error: 'Event end time must be after start time.' });
      return;
    }
    if (typeof venue === 'string' && venue.trim()) {
      target.venue = venue.trim().slice(0, 120);
    }
    if (typeof organizer === 'string' && organizer.trim()) {
      target.organizer = organizer.trim().slice(0, 140);
    }
    if (VALID_REG_STATUSES.includes(registrationStatus)) {
      target.registrationStatus = registrationStatus;
    }
    if (typeof registrationLink === 'string') {
      const trimmedLink = registrationLink.trim();
      if (!trimmedLink) {
        target.registrationLink = undefined;
      } else if (!isSafeHttpUrl(trimmedLink)) {
        res.status(400).json({ error: 'Registration link must be a valid http:// or https:// URL.' });
        return;
      } else {
        target.registrationLink = trimmedLink;
      }
    }
    if (typeof bannerImage === 'string') {
      const trimmedBanner = bannerImage.trim();
      if (!trimmedBanner) {
        target.bannerImage = undefined;
      } else if (!isSafeBannerInput(trimmedBanner)) {
        res.status(400).json({ error: 'Invalid banner image URL or image exceeds size limit.' });
        return;
      } else {
        target.bannerImage = trimmedBanner;
      }
    }

    target.isDemo = false;
    target.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ event: target });
  });

  app.delete('/api/events/:id', requireCoordinatorOrAdmin(), (req: AuthedRequest, res) => {
    const db = loadDb();
    const target = db.events.find((e) => e.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    if (req.auth!.role === 'faculty') {
      const fac = db.faculty.find(
        (f) => f.id.toUpperCase() === req.auth!.facultyId!.toUpperCase()
      );
      if (
        !fac ||
        (fac.department.toLowerCase() !== target.department.toLowerCase() &&
          target.createdById !== fac.id)
      ) {
        res.status(403).json({
          error: 'You can only delete events belonging to your department.',
        });
        return;
      }
    }

    db.events = db.events.filter((e) => e.id !== req.params.id);
    saveDb(db);
    res.json({ ok: true });
  });

  // Student submits a meeting request
  app.post('/api/requests', (req, res) => {
    const {
      facultyId,
      studentName,
      studentRoll,
      studentEmail,
      preferredDate,
      preferredTime,
      reason,
    } = req.body ?? {};

    if (
      typeof facultyId !== 'string' ||
      typeof studentName !== 'string' ||
      typeof studentRoll !== 'string' ||
      typeof preferredDate !== 'string' ||
      typeof preferredTime !== 'string' ||
      typeof reason !== 'string'
    ) {
      res.status(400).json({ error: 'All required meeting request fields must be provided.' });
      return;
    }

    const cleanName = studentName.trim();
    const cleanRoll = studentRoll.trim().toUpperCase();
    const cleanReason = reason.trim();
    const cleanDate = preferredDate.trim();
    const cleanTime = normalizeTime24(preferredTime.trim());

    if (cleanName.length < 2 || cleanName.length > 100) {
      res.status(400).json({ error: 'Please enter a valid student name.' });
      return;
    }
    if (cleanRoll.length < 2 || cleanRoll.length > 40) {
      res.status(400).json({ error: 'Please enter a valid student roll/ID.' });
      return;
    }
    if (cleanReason.length < 5 || cleanReason.length > 600) {
      res.status(400).json({ error: 'Please describe your meeting reason (5-600 characters).' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      res.status(400).json({ error: 'Preferred date must be in YYYY-MM-DD format.' });
      return;
    }

    const db = loadDb();
    const targetFaculty = db.faculty.find(
      (f) => f.id.toUpperCase() === facultyId.trim().toUpperCase()
    );
    if (!targetFaculty) {
      res.status(404).json({ error: 'Selected faculty member not found.' });
      return;
    }

    const nextNum = 1001 + db.requests.length + Math.floor(Math.random() * 90);
    const trackingCode = `REQ-${nextNum}`;
    const nowIso = new Date().toISOString();

    const newReq: MeetingRequest = {
      id: `${trackingCode}-${Date.now()}`,
      trackingCode,
      facultyId: targetFaculty.id,
      facultyName: targetFaculty.name,
      studentName: cleanName,
      studentRoll: cleanRoll,
      studentEmail: typeof studentEmail === 'string' ? studentEmail.trim().slice(0, 120) : undefined,
      preferredDate: cleanDate,
      preferredTime: cleanTime,
      reason: cleanReason,
      status: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.requests.unshift(newReq);
    saveDb(db);
    res.status(201).json({ request: newReq });
  });

  // Student tracks meeting requests by Student Roll/ID or Tracking Code
  app.get('/api/requests/track', (req, res) => {
    const rawQuery = typeof req.query.query === 'string' ? req.query.query.trim().toUpperCase() : '';
    if (!rawQuery || rawQuery.length < 2) {
      res.status(400).json({ error: 'Enter your Student ID / Roll No. or Tracking Code.' });
      return;
    }
    const db = loadDb();
    const matches = db.requests.filter(
      (r) =>
        r.studentRoll.toUpperCase() === rawQuery ||
        r.trackingCode.toUpperCase() === rawQuery
    );
    res.json({ requests: matches });
  });

  // Faculty first-time password activation
  app.post('/api/auth/faculty/activate', (req, res) => {
    const { facultyId, password } = req.body ?? {};
    if (typeof facultyId !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Faculty ID and password are required.' });
      return;
    }
    const cleanId = facultyId.trim().toUpperCase();
    if (password.length < 4 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 4 and 128 characters.' });
      return;
    }

    const db = loadDb();
    const member = db.faculty.find((f) => f.id.toUpperCase() === cleanId);
    if (!member) {
      res.status(404).json({ error: `Faculty ID "${cleanId}" was not found in the directory.` });
      return;
    }
    if (member.passwordHash) {
      res.status(409).json({
        error: 'This faculty ID already has a password set. Please sign in or ask Admin to reset it.',
      });
      return;
    }

    member.passwordHash = hashSecret(password);
    saveDb(db);

    const token = createSessionToken({ role: 'faculty', facultyId: member.id });
    res.json({
      token,
      faculty: toPublicFaculty(member),
    });
  });

  // Faculty sign-in
  app.post('/api/auth/faculty/login', (req, res) => {
    const { facultyId, password } = req.body ?? {};
    if (typeof facultyId !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Faculty ID and password are required.' });
      return;
    }
    const cleanId = facultyId.trim().toUpperCase();
    const db = loadDb();
    const member = db.faculty.find((f) => f.id.toUpperCase() === cleanId);
    if (!member) {
      res.status(401).json({ error: 'Invalid Faculty ID or password.' });
      return;
    }
    if (!member.passwordHash) {
      res.status(403).json({
        error: 'No password has been activated for this ID yet. Use First-Time Activation.',
        needsActivation: true,
      });
      return;
    }
    if (!verifySecret(password, member.passwordHash)) {
      res.status(401).json({ error: 'Invalid Faculty ID or password.' });
      return;
    }

    const token = createSessionToken({ role: 'faculty', facultyId: member.id });
    res.json({
      token,
      faculty: toPublicFaculty(member),
    });
  });

  // Admin first-run passcode claim (when ADMIN_PASSCODE env is empty and no hash stored)
  app.post('/api/auth/admin/claim', (req, res) => {
    if (isAdminConfigured()) {
      res.status(409).json({ error: 'Admin passcode is already configured.' });
      return;
    }
    const { passcode } = req.body ?? {};
    if (typeof passcode !== 'string' || passcode.trim().length < 6 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be at least 6 characters.' });
      return;
    }
    const db = loadDb();
    db.adminPasscodeHash = hashSecret(passcode.trim());
    saveDb(db);

    const token = createSessionToken({ role: 'admin' });
    res.json({ token });
  });

  // Admin sign-in
  app.post('/api/auth/admin/login', (req, res) => {
    const { passcode } = req.body ?? {};
    if (typeof passcode !== 'string' || !passcode) {
      res.status(400).json({ error: 'Admin passcode is required.' });
      return;
    }
    const envPass = (process.env.ADMIN_PASSCODE || '').trim();
    const db = loadDb();

    let valid = false;
    if (envPass.length > 0) {
      valid = safeComparePlain(passcode.trim(), envPass);
    } else if (db.adminPasscodeHash) {
      valid = verifySecret(passcode.trim(), db.adminPasscodeHash);
    } else {
      res.status(400).json({ error: 'Admin passcode has not been claimed yet.' });
      return;
    }

    if (!valid) {
      res.status(401).json({ error: 'Incorrect admin passcode.' });
      return;
    }

    const token = createSessionToken({ role: 'admin' });
    res.json({ token });
  });

  // Verify current session
  app.get('/api/auth/me', (req, res) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired.' });
      return;
    }
    if (payload.role === 'faculty' && payload.facultyId) {
      const db = loadDb();
      const member = db.faculty.find((f) => f.id === payload.facultyId);
      if (!member) {
        res.status(401).json({ error: 'Faculty account not found.' });
        return;
      }
      res.json({ role: 'faculty', faculty: toPublicFaculty(member) });
      return;
    }
    res.json({ role: 'admin' });
  });

  // --- Protected Faculty Endpoints ---
  app.get('/api/faculty/me/requests', requireRole('faculty'), (req: AuthedRequest, res) => {
    const facultyId = req.auth!.facultyId!;
    const db = loadDb();
    const requests = db.requests.filter(
      (r) => r.facultyId.toUpperCase() === facultyId.toUpperCase()
    );
    res.json({ requests });
  });

  app.patch(
    '/api/faculty/me/requests/:requestId',
    requireRole('faculty'),
    (req: AuthedRequest, res) => {
      const facultyId = req.auth!.facultyId!;
      const { requestId } = req.params;
      const { action, rescheduledDate, rescheduledTime, facultyNote } = req.body ?? {};

      if (action !== 'accepted' && action !== 'rejected' && action !== 'rescheduled') {
        res.status(400).json({ error: 'Action must be accepted, rejected, or rescheduled.' });
        return;
      }

      const db = loadDb();
      const target = db.requests.find((r) => r.id === requestId);
      if (!target) {
        res.status(404).json({ error: 'Meeting request not found.' });
        return;
      }
      if (target.facultyId.toUpperCase() !== facultyId.toUpperCase()) {
        res.status(403).json({ error: 'Cannot modify another faculty member’s request.' });
        return;
      }

      if (action === 'rescheduled') {
        if (
          typeof rescheduledDate !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(rescheduledDate.trim()) ||
          typeof rescheduledTime !== 'string'
        ) {
          res.status(400).json({ error: 'Rescheduling requires a valid new date and time.' });
          return;
        }
        target.rescheduledDate = rescheduledDate.trim();
        target.rescheduledTime = normalizeTime24(rescheduledTime.trim());
      }

      target.status = action;
      if (typeof facultyNote === 'string') {
        target.facultyNote = facultyNote.trim().slice(0, 400);
      }
      target.updatedAt = new Date().toISOString();
      saveDb(db);
      res.json({ request: target });
    }
  );

  app.put('/api/faculty/me/schedule', requireRole('faculty'), (req: AuthedRequest, res) => {
    const facultyId = req.auth!.facultyId!;
    const { slots, csvText } = req.body ?? {};

    let nextSlots: ScheduleSlot[] = [];

    if (typeof csvText === 'string' && csvText.trim().length > 0) {
      const { parsed, warnings } = parseScheduleCsvText(csvText, new Set([facultyId.toUpperCase()]));
      const ownParsed = parsed
        .filter((s) => s.facultyId.toUpperCase() === facultyId.toUpperCase())
        .map((s, idx) => ({ ...s, id: `${facultyId}-csv-${Date.now()}-${idx}` }));
      if (ownParsed.length === 0) {
        res.status(400).json({
          error:
            warnings[0] ||
            `No valid schedule rows found matching your Faculty ID (${facultyId}).`,
        });
        return;
      }
      nextSlots = ownParsed;
    } else if (Array.isArray(slots)) {
      const seenKeys = new Set<string>();
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const day = normalizeDayCode(String(s?.day || ''));
        if (!day || !VALID_DAYS.includes(day)) {
          res.status(400).json({ error: `Invalid day on slot ${i + 1}.` });
          return;
        }
        const startTime = parseStrictTimeTo24(String(s?.startTime || ''));
        const endTime = parseStrictTimeTo24(String(s?.endTime || ''));
        if (!startTime || !endTime) {
          res.status(400).json({ error: `Invalid start or end time on slot ${i + 1}.` });
          return;
        }
        if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) {
          res.status(400).json({ error: `Slot ${i + 1} end time must be after start time.` });
          return;
        }
        const slotItem: ScheduleSlot = {
          id: `${facultyId}-${day}-${startTime.replace(':', '')}-${Date.now()}-${i}`,
          facultyId,
          day,
          startTime,
          endTime,
          type: normalizeSlotType(String(s?.type || 'Class')),
          title: String(s?.title || 'Session').trim().slice(0, 120),
          room: String(s?.room || 'TBA').trim().slice(0, 60),
        };
        const slotKey = buildScheduleSlotKey(slotItem);
        if (!seenKeys.has(slotKey)) {
          seenKeys.add(slotKey);
          nextSlots.push(slotItem);
        }
      }
    } else {
      res.status(400).json({ error: 'Provide either slots array or csvText.' });
      return;
    }

    const db = loadDb();
    backupDb();
    const baseSchedules = db.scheduleMetadata?.source === 'sample' ? [] : db.schedules;
    db.schedules = [
      ...baseSchedules.filter((s) => s.facultyId.toUpperCase() !== facultyId.toUpperCase()),
      ...nextSlots,
    ];
    db.scheduleMetadata = {
      source: db.schedules.length > 0 ? 'imported' : 'empty',
      lastImportedAt: new Date().toISOString(),
      lastImportMode: 'faculty_portal',
      lastImportSummary: db.scheduleMetadata?.lastImportSummary,
    };
    saveDb(db);
    res.json({ schedules: nextSlots, scheduleMetadata: db.scheduleMetadata });
  });

  app.patch('/api/faculty/me/profile', requireRole('faculty'), (req: AuthedRequest, res) => {
    const facultyId = req.auth!.facultyId!;
    const { cabin, leaveStart, leaveUntil, availabilityNote, dutyStart, dutyEnd } = req.body ?? {};

    const db = loadDb();
    const member = db.faculty.find((f) => f.id.toUpperCase() === facultyId.toUpperCase());
    if (!member) {
      res.status(404).json({ error: 'Faculty profile not found.' });
      return;
    }

    if (typeof cabin === 'string' && cabin.trim()) {
      member.cabin = cabin.trim().slice(0, 60);
    }
    if (typeof leaveStart === 'string') {
      member.leaveStart = leaveStart.trim() || undefined;
    }
    if (typeof leaveUntil === 'string') {
      member.leaveUntil = leaveUntil.trim() || undefined;
    }
    if (typeof availabilityNote === 'string') {
      member.availabilityNote = availabilityNote.trim().slice(0, 200) || undefined;
    }
    if (typeof dutyStart === 'string' && dutyStart.trim()) {
      member.dutyStart = normalizeTime24(dutyStart.trim());
    }
    if (typeof dutyEnd === 'string' && dutyEnd.trim()) {
      member.dutyEnd = normalizeTime24(dutyEnd.trim());
    }

    saveDb(db);
    res.json({ faculty: toPublicFaculty(member) });
  });

  // --- Protected Admin Endpoints ---
  app.post('/api/admin/import/faculty', requireRole('admin'), (req, res) => {
    const { csvText, mode, overwriteEmptyContacts } = req.body ?? {};
    if (typeof csvText !== 'string' || !csvText.trim()) {
      res.status(400).json({ error: 'CSV content is required.' });
      return;
    }
    const replaceAll = mode === 'replace';
    const db = loadDb();
    const publicCurrent = db.faculty.map(toPublicFaculty);
    const { parsed, warnings } = parseFacultyCsvText(csvText, publicCurrent, {
      overwriteEmptyContacts: Boolean(overwriteEmptyContacts),
    });

    if (parsed.length === 0) {
      res.status(400).json({ error: warnings[0] || 'No valid faculty rows found in CSV.' });
      return;
    }

    backupDb();
    const existingMap = new Map(db.faculty.map((f) => [f.id.toUpperCase(), f]));

    if (replaceAll) {
      db.faculty = parsed.map((item) => {
        const prev = existingMap.get(item.id.toUpperCase());
        const { initialPassword, ...rest } = item;
        return {
          ...rest,
          passwordHash: initialPassword
            ? hashSecret(initialPassword)
            : prev?.passwordHash,
        };
      });
    } else {
      for (const item of parsed) {
        const key = item.id.toUpperCase();
        const prev = existingMap.get(key);
        const { initialPassword, ...rest } = item;
        existingMap.set(key, {
          ...rest,
          passwordHash: initialPassword
            ? hashSecret(initialPassword)
            : prev?.passwordHash,
        });
      }
      db.faculty = Array.from(existingMap.values());
    }

    saveDb(db);
    res.json({
      importedCount: parsed.length,
      warnings,
      faculty: db.faculty.map(toPublicFaculty),
    });
  });

  app.post('/api/admin/import/schedule', requireRole('admin'), (req, res) => {
    const { csvText, mode } = req.body ?? {};
    if (typeof csvText !== 'string' || !csvText.trim()) {
      res.status(400).json({ error: 'Schedule CSV content is required.' });
      return;
    }
    const importMode: 'merge' | 'replace' = mode === 'replace' ? 'replace' : 'merge';
    const db = loadDb();
    const knownIds = new Set(db.faculty.map((f) => f.id.toUpperCase()));
    const { parsed, warnings, stats } = parseScheduleCsvText(csvText, knownIds);
    const nowIso = new Date().toISOString();

    if (parsed.length === 0) {
      const failedSummary: ScheduleImportSummary = {
        totalRows: stats.totalRows,
        importedCount: 0,
        updatedCount: 0,
        duplicateCount: stats.duplicateCount,
        skippedCount: stats.skippedCount,
        invalidCount: stats.invalidCount,
        unknownFacultyIds: stats.unknownFacultyIds,
        warnings,
        importedAt: nowIso,
        mode: importMode,
      };
      res.status(400).json({
        error: warnings[0] || 'No valid schedule slots found in CSV. Active schedule was preserved.',
        warnings,
        summary: failedSummary,
      });
      return;
    }

    backupDb();

    let importedCount = 0;
    let updatedCount = 0;
    let duplicateCount = stats.duplicateCount;
    let skippedCount = stats.skippedCount;

    if (importMode === 'replace') {
      db.schedules = parsed.map((slot, idx) => ({
        ...slot,
        id: `${slot.facultyId}-${slot.day}-${slot.startTime.replace(':', '')}-${Date.now()}-${idx}`,
      }));
      importedCount = db.schedules.length;
    } else {
      // If migrating out of sample mode for the first real import, do not mix sample slots into official schedule
      const baseSchedules = db.scheduleMetadata?.source === 'sample' ? [] : [...db.schedules];
      const indexByTimeKey = new Map<string, number>();
      baseSchedules.forEach((slot, idx) => {
        indexByTimeKey.set(buildScheduleSlotKey(slot), idx);
      });

      for (let idx = 0; idx < parsed.length; idx++) {
        const incoming = parsed[idx];
        const timeKey = buildScheduleSlotKey(incoming);
        const existingIdx = indexByTimeKey.get(timeKey);

        if (existingIdx !== undefined) {
          const existing = baseSchedules[existingIdx];
          if (buildScheduleExactKey(existing) === buildScheduleExactKey(incoming)) {
            duplicateCount++;
            skippedCount++;
          } else {
            baseSchedules[existingIdx] = {
              ...incoming,
              id: existing.id,
            };
            updatedCount++;
          }
        } else {
          indexByTimeKey.set(timeKey, baseSchedules.length);
          baseSchedules.push({
            ...incoming,
            id: `${incoming.facultyId}-${incoming.day}-${incoming.startTime.replace(':', '')}-${Date.now()}-${idx}`,
          });
          importedCount++;
        }
      }

      db.schedules = baseSchedules;
    }

    const summary: ScheduleImportSummary = {
      totalRows: stats.totalRows,
      importedCount,
      updatedCount,
      duplicateCount,
      skippedCount,
      invalidCount: stats.invalidCount,
      unknownFacultyIds: stats.unknownFacultyIds,
      warnings,
      importedAt: nowIso,
      mode: importMode,
    };

    db.scheduleMetadata = {
      source: db.schedules.length > 0 ? 'imported' : 'empty',
      lastImportedAt: nowIso,
      lastImportMode: importMode,
      lastImportSummary: summary,
    };

    saveDb(db);
    res.json({
      importedCount,
      updatedCount,
      duplicateCount,
      skippedCount,
      invalidCount: stats.invalidCount,
      totalRows: stats.totalRows,
      unknownFacultyIds: stats.unknownFacultyIds,
      warnings,
      summary,
      scheduleMetadata: db.scheduleMetadata,
      schedules: db.schedules,
    });
  });

  app.patch('/api/admin/faculty/:id', requireRole('admin'), (req, res) => {
    const targetId = req.params.id.trim().toUpperCase();
    const {
      name,
      department,
      designation,
      cabin,
      mobileNumber,
      email,
      leaveStart,
      leaveUntil,
      availabilityNote,
      newPassword,
      clearPassword,
    } = req.body ?? {};

    const db = loadDb();
    const member = db.faculty.find((f) => f.id.toUpperCase() === targetId);
    if (!member) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }

    if (typeof mobileNumber === 'string') {
      const trimmedPhone = mobileNumber.trim();
      if (!trimmedPhone) {
        member.mobileNumber = undefined;
      } else {
        const checkedPhone = validatePhoneNumber(trimmedPhone);
        if (!checkedPhone.valid) {
          res.status(400).json({
            error: 'Invalid mobile number. Enter 10–15 digits (optional +91 country code).',
          });
          return;
        }
        member.mobileNumber = checkedPhone.display;
      }
    }

    if (typeof email === 'string') {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        member.email = undefined;
      } else {
        const checkedEmail = validateEmailAddress(trimmedEmail);
        if (!checkedEmail.valid) {
          res.status(400).json({ error: 'Invalid email address format.' });
          return;
        }
        member.email = checkedEmail.email;
      }
    }

    if (typeof name === 'string' && name.trim()) member.name = name.trim().slice(0, 120);
    if (typeof department === 'string' && department.trim()) {
      member.department = department.trim().slice(0, 80);
    }
    if (typeof designation === 'string' && designation.trim()) {
      member.designation = designation.trim().slice(0, 80);
    }
    if (typeof cabin === 'string' && cabin.trim()) member.cabin = cabin.trim().slice(0, 60);
    if (typeof leaveStart === 'string') member.leaveStart = leaveStart.trim() || undefined;
    if (typeof leaveUntil === 'string') member.leaveUntil = leaveUntil.trim() || undefined;
    if (typeof availabilityNote === 'string') {
      member.availabilityNote = availabilityNote.trim().slice(0, 200) || undefined;
    }
    if (clearPassword === true) {
      member.passwordHash = undefined;
    } else if (typeof newPassword === 'string' && newPassword.trim().length >= 4) {
      member.passwordHash = hashSecret(newPassword.trim());
    }

    saveDb(db);
    res.json({ faculty: toPublicFaculty(member) });
  });

  app.delete('/api/admin/faculty/:id', requireRole('admin'), (req, res) => {
    const targetId = req.params.id.trim().toUpperCase();
    const db = loadDb();
    const before = db.faculty.length;
    db.faculty = db.faculty.filter((f) => f.id.toUpperCase() !== targetId);
    if (db.faculty.length === before) {
      res.status(404).json({ error: 'Faculty member not found.' });
      return;
    }
    db.schedules = db.schedules.filter((s) => s.facultyId.toUpperCase() !== targetId);
    saveDb(db);
    res.json({ ok: true });
  });

  app.post('/api/admin/reset-sample', requireRole('admin'), (_req, res) => {
    const db = resetDbToSample();
    res.json({
      faculty: db.faculty.map(toPublicFaculty),
      schedules: db.schedules,
      scheduleMetadata: db.scheduleMetadata,
      events: db.events,
    });
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusDesk server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

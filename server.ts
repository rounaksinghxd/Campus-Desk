import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import {
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
  normalizeDayCode,
  normalizeSlotType,
  normalizeTime24,
  parseFacultyCsvText,
  parseScheduleCsvText,
  parseTimeToMinutes,
} from './src/utils/statusEngine';
import { DayOfWeek, MeetingRequest, ScheduleSlot } from './src/types';

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

function isAdminConfigured(): boolean {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass.length > 0) return true;
  const db = loadDb();
  return Boolean(db.adminPasscodeHash);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

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
      departments,
      adminConfigured: isAdminConfigured(),
    });
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
      const { parsed, warnings } = parseScheduleCsvText(csvText);
      const ownParsed = parsed
        .filter((s) => s.facultyId.toUpperCase() === facultyId.toUpperCase())
        .map((s, idx) => ({ ...s, id: `${facultyId}-csv-${Date.now()}-${idx}` }));
      if (ownParsed.length === 0) {
        res.status(400).json({
          error:
            warnings[0] ||
            `No schedule rows found matching your Faculty ID (${facultyId}).`,
        });
        return;
      }
      nextSlots = ownParsed;
    } else if (Array.isArray(slots)) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const day = normalizeDayCode(String(s?.day || ''));
        if (!day || !VALID_DAYS.includes(day)) {
          res.status(400).json({ error: `Invalid day on slot ${i + 1}.` });
          return;
        }
        const startTime = normalizeTime24(String(s?.startTime || ''));
        const endTime = normalizeTime24(String(s?.endTime || ''));
        if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) {
          res.status(400).json({ error: `Slot ${i + 1} end time must be after start time.` });
          return;
        }
        nextSlots.push({
          id: `${facultyId}-${day}-${startTime.replace(':', '')}-${Date.now()}-${i}`,
          facultyId,
          day,
          startTime,
          endTime,
          type: normalizeSlotType(String(s?.type || 'Class')),
          title: String(s?.title || 'Session').trim().slice(0, 120),
          room: String(s?.room || 'TBA').trim().slice(0, 60),
        });
      }
    } else {
      res.status(400).json({ error: 'Provide either slots array or csvText.' });
      return;
    }

    const db = loadDb();
    db.schedules = [
      ...db.schedules.filter((s) => s.facultyId.toUpperCase() !== facultyId.toUpperCase()),
      ...nextSlots,
    ];
    saveDb(db);
    res.json({ schedules: nextSlots });
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
    const { csvText, mode } = req.body ?? {};
    if (typeof csvText !== 'string' || !csvText.trim()) {
      res.status(400).json({ error: 'CSV content is required.' });
      return;
    }
    const replaceAll = mode === 'replace';
    const db = loadDb();
    const publicCurrent = db.faculty.map(toPublicFaculty);
    const { parsed, warnings } = parseFacultyCsvText(csvText, publicCurrent);

    if (parsed.length === 0) {
      res.status(400).json({ error: warnings[0] || 'No valid faculty rows found in CSV.' });
      return;
    }

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
    const replaceAll = mode !== 'merge';
    const db = loadDb();
    const knownIds = new Set(db.faculty.map((f) => f.id.toUpperCase()));
    const { parsed, warnings } = parseScheduleCsvText(csvText, knownIds);

    if (parsed.length === 0) {
      res.status(400).json({ error: warnings[0] || 'No valid schedule slots found in CSV.' });
      return;
    }

    if (replaceAll) {
      db.schedules = parsed;
    } else {
      const touchedIds = new Set(parsed.map((s) => s.facultyId.toUpperCase()));
      db.schedules = [
        ...db.schedules.filter((s) => !touchedIds.has(s.facultyId.toUpperCase())),
        ...parsed,
      ];
    }

    saveDb(db);
    res.json({
      importedCount: parsed.length,
      warnings,
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

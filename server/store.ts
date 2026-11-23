import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DepartmentEvent,
  FacultyMember,
  MeetingRequest,
  ScheduleMetadata,
  ScheduleSlot,
} from '../src/types';
import {
  INITIAL_DEMO_EVENTS,
  INITIAL_FACULTY,
  INITIAL_REQUESTS,
  INITIAL_SCHEDULES,
  StoredFaculty,
} from './dataSeed';

export interface CampusDatabase {
  adminPasscodeHash?: string;
  faculty: StoredFaculty[];
  schedules: ScheduleSlot[];
  scheduleMetadata?: ScheduleMetadata;
  requests: MeetingRequest[];
  events: DepartmentEvent[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'campus-data.json');
const DATA_BACKUP_FILE = path.join(DATA_DIR, 'campus-data.backup.json');
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(secret, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function safeComparePlain(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface TokenPayload {
  role: 'faculty' | 'admin';
  facultyId?: string;
  exp: number;
}

export function createSessionToken(payload: Omit<TokenPayload, 'exp'>): string {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  if (!safeComparePlain(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8')
    ) as TokenPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    if (parsed.role !== 'faculty' && parsed.role !== 'admin') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function toPublicFaculty(member: StoredFaculty): FacultyMember {
  const { passwordHash, ...rest } = member;
  return {
    ...rest,
    hasPassword: Boolean(passwordHash),
  };
}

const SAMPLE_SCHEDULE_ID_SET = new Set(INITIAL_SCHEDULES.map((s) => s.id));

function inferScheduleMetadata(schedules: ScheduleSlot[]): ScheduleMetadata {
  if (schedules.length === 0) {
    return { source: 'empty' };
  }
  const allMatchSample =
    schedules.length === INITIAL_SCHEDULES.length &&
    schedules.every((s) => SAMPLE_SCHEDULE_ID_SET.has(s.id));
  return { source: allMatchSample ? 'sample' : 'imported' };
}

function normalizeParsedDb(parsed: Partial<CampusDatabase>): CampusDatabase | null {
  if (
    !Array.isArray(parsed.faculty) ||
    !Array.isArray(parsed.schedules) ||
    !Array.isArray(parsed.requests)
  ) {
    return null;
  }

  const scheduleMetadata =
    parsed.scheduleMetadata &&
    (parsed.scheduleMetadata.source === 'sample' ||
      parsed.scheduleMetadata.source === 'imported' ||
      parsed.scheduleMetadata.source === 'empty')
      ? parsed.scheduleMetadata
      : inferScheduleMetadata(parsed.schedules);

  return {
    adminPasscodeHash: parsed.adminPasscodeHash,
    faculty: parsed.faculty,
    schedules: parsed.schedules,
    scheduleMetadata,
    requests: parsed.requests,
    events: Array.isArray(parsed.events)
      ? parsed.events
      : structuredClone(INITIAL_DEMO_EVENTS),
  };
}

function createInitialDb(): CampusDatabase {
  return {
    faculty: structuredClone(INITIAL_FACULTY),
    schedules: structuredClone(INITIAL_SCHEDULES),
    scheduleMetadata: { source: 'sample' },
    requests: structuredClone(INITIAL_REQUESTS),
    events: structuredClone(INITIAL_DEMO_EVENTS),
  };
}

let cachedDb: CampusDatabase | null = null;

export function loadDb(): CampusDatabase {
  if (cachedDb) return cachedDb;
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<CampusDatabase>;
      const normalized = normalizeParsedDb(parsed);
      if (normalized) {
        cachedDb = normalized;
        if (!Array.isArray(parsed.events) || !parsed.scheduleMetadata) {
          saveDb(normalized);
        }
        return cachedDb;
      }
    } catch {
      try {
        const corruptCopy = path.join(DATA_DIR, `campus-data.corrupt.${Date.now()}.json`);
        fs.copyFileSync(DATA_FILE, corruptCopy);
      } catch {
        // Ignore corrupt copy errors
      }
    }
  }

  // Try recovering from backup before ever creating fresh sample seed
  if (fs.existsSync(DATA_BACKUP_FILE)) {
    try {
      const backupRaw = fs.readFileSync(DATA_BACKUP_FILE, 'utf-8');
      const backupParsed = JSON.parse(backupRaw) as Partial<CampusDatabase>;
      const normalizedBackup = normalizeParsedDb(backupParsed);
      if (normalizedBackup) {
        cachedDb = normalizedBackup;
        saveDb(normalizedBackup);
        return cachedDb;
      }
    } catch {
      // Backup invalid, fall back to initial seed
    }
  }

  cachedDb = createInitialDb();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(db: CampusDatabase): void {
  cachedDb = db;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DATA_FILE);
}

export function backupDb(): boolean {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DATA_FILE)) {
    const tmpBackup = `${DATA_BACKUP_FILE}.tmp`;
    fs.copyFileSync(DATA_FILE, tmpBackup);
    fs.renameSync(tmpBackup, DATA_BACKUP_FILE);
    return true;
  }
  return false;
}

export function resetDbToSample(): CampusDatabase {
  const current = loadDb();
  backupDb();
  const next = createInitialDb();
  next.scheduleMetadata = {
    source: 'sample',
    lastImportedAt: new Date().toISOString(),
    lastImportMode: 'reset',
  };
  // Preserve claimed admin passcode hash so admin stays authenticated
  if (current.adminPasscodeHash) {
    next.adminPasscodeHash = current.adminPasscodeHash;
  }
  saveDb(next);
  return next;
}

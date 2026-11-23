import {
  ClockConfig,
  DayOfWeek,
  FacultyLiveState,
  FacultyMember,
  FacultyStatusInfo,
  ScheduleSlot,
  ScheduleSource,
  SlotType,
} from '../types';

export const DAYS_OF_WEEK: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const JS_DAY_TO_CODE: Record<number, DayOfWeek> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export const DAY_FULL_LABELS: Record<DayOfWeek, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export function getLiveClockValues(now = new Date()): { dateStr: string; timeStr: string } {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return {
    dateStr: `${year}-${month}-${day}`,
    timeStr: `${hours}:${minutes}`,
  };
}

export function getDayOfWeekFromDateStr(dateStr: string): DayOfWeek {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return JS_DAY_TO_CODE[new Date().getDay()];
  }
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return JS_DAY_TO_CODE[d.getDay()] || 'Mon';
}

export function parseStrictTimeTo24(timeStr: string): string | null {
  const cleaned = timeStr
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\./g, ':')
    .replace(/\s+/g, ' ');
  if (!cleaned) return null;

  // Support "9 AM", "9:30 AM", "09:30:00 PM", "9:30pm", "9:30 p:m:"
  const normalizedMeridiem = cleaned.replace(/([ap])\s*:?\s*m\b:?/i, (_, ap) =>
    `${ap.toUpperCase()}M`
  );

  const ampmMatch = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)$/i.exec(normalizedMeridiem);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const mins = ampmMatch[2] ? Number(ampmMatch[2]) : 0;
    const period = ampmMatch[3].toUpperCase();
    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  // Support 24h "9:30", "09:30", "09:30:00"
  const match24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(cleaned);
  if (match24) {
    const hours = Number(match24[1]);
    const mins = Number(match24[2]);
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  return null;
}

export function parseTimeRange(raw: string): { startTime: string; endTime: string } | null {
  const parts = raw
    .replace(/\u00A0/g, ' ')
    .split(/\s*(?:-|–|—|\bto\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const startTime = parseStrictTimeTo24(parts[0]);
  const endTime = parseStrictTimeTo24(parts[1]);
  if (!startTime || !endTime) return null;
  return { startTime, endTime };
}

export function parseTimeToMinutes(timeStr: string): number {
  const strict = parseStrictTimeTo24(timeStr);
  if (!strict) return 0;
  const [h, m] = strict.split(':').map(Number);
  return h * 60 + m;
}

export function normalizeTime24(timeStr: string): string {
  const strict = parseStrictTimeTo24(timeStr);
  if (strict) return strict;
  return '00:00';
}

export function formatTimeDisplay(time24: string): string {
  const mins = parseTimeToMinutes(time24);
  const h24 = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, '0');
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${period}`;
}

export function resolveEffectiveClock(clock: ClockConfig, now = new Date()): {
  dateStr: string;
  timeStr: string;
  day: DayOfWeek;
  minutes: number;
} {
  const active = clock.useLiveTime ? getLiveClockValues(now) : clock;
  const dateStr = active.dateStr;
  const timeStr = normalizeTime24(active.timeStr);
  return {
    dateStr,
    timeStr,
    day: getDayOfWeekFromDateStr(dateStr),
    minutes: parseTimeToMinutes(timeStr),
  };
}

export function computeFacultyStatus(
  member: FacultyMember,
  allSlots: ScheduleSlot[],
  clock: ClockConfig,
  now = new Date(),
  options?: { scheduleSource?: ScheduleSource }
): FacultyStatusInfo {
  const { dateStr, day, minutes } = resolveEffectiveClock(clock, now);
  const memberAllSlots = allSlots.filter(
    (s) => s.facultyId.toUpperCase() === member.id.toUpperCase()
  );
  const memberSlots = memberAllSlots
    .filter((s) => s.day === day)
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  // 1. Check leave dates
  if (member.leaveUntil) {
    const startOk = !member.leaveStart || dateStr >= member.leaveStart;
    if (startOk && dateStr <= member.leaveUntil) {
      return {
        state: 'on_leave',
        headline: `On leave until ${member.leaveUntil}`,
        subline: member.availabilityNote || `Cabin ${member.cabin} unattended during leave`,
        roomOrVenue: member.cabin,
        activeSlot: null,
        nextSlot: null,
      };
    }
  }

  // 2. Check active slot at this minute
  const activeSlot =
    memberSlots.find((s) => {
      const start = parseTimeToMinutes(s.startTime);
      const end = parseTimeToMinutes(s.endTime);
      return minutes >= start && minutes < end;
    }) || null;

  const nextSlot =
    memberSlots.find((s) => parseTimeToMinutes(s.startTime) > minutes) || null;

  if (activeSlot) {
    if (activeSlot.type === 'Class' || activeSlot.type === 'Lab') {
      return {
        state: 'in_class',
        headline: `Taking ${activeSlot.type.toLowerCase()} in ${activeSlot.room}`,
        subline: `${activeSlot.title} · Until ${formatTimeDisplay(activeSlot.endTime)}`,
        roomOrVenue: activeSlot.room,
        activeSlot,
        nextSlot,
      };
    }
    if (activeSlot.type === 'Meeting') {
      return {
        state: 'in_meeting',
        headline: `In meeting · ${activeSlot.room}`,
        subline: `${activeSlot.title} · Until ${formatTimeDisplay(activeSlot.endTime)}`,
        roomOrVenue: activeSlot.room,
        activeSlot,
        nextSlot,
      };
    }
    // Office Hours
    return {
      state: 'free_cabin',
      headline: `Office hours · Cabin ${activeSlot.room || member.cabin}`,
      subline: `${activeSlot.title} · Until ${formatTimeDisplay(activeSlot.endTime)}`,
      roomOrVenue: activeSlot.room || member.cabin,
      activeSlot,
      nextSlot,
    };
  }

  // 3. Check duty hours for the day
  const isWorkingDay = member.workingDays.includes(day);
  const dutyStart = parseTimeToMinutes(member.dutyStart || '09:00');
  const dutyEnd = parseTimeToMinutes(member.dutyEnd || '17:30');
  const scheduleSource = options?.scheduleSource ?? 'imported';
  const missingTimetable =
    scheduleSource === 'empty' ||
    (scheduleSource === 'imported' && memberAllSlots.length === 0);

  if (isWorkingDay && minutes >= dutyStart && minutes < dutyEnd) {
    if (missingTimetable) {
      return {
        state: 'free_cabin',
        headline: `No schedule uploaded · Cabin ${member.cabin}`,
        subline:
          member.availabilityNote ||
          'Timetable unavailable — check cabin or contact directly',
        roomOrVenue: member.cabin,
        activeSlot: null,
        nextSlot: null,
      };
    }

    const nextText = nextSlot
      ? `Next: ${nextSlot.type} at ${formatTimeDisplay(nextSlot.startTime)} (${nextSlot.room})`
      : member.availabilityNote || 'No more scheduled sessions today';
    return {
      state: 'free_cabin',
      headline: `Free · Likely in Cabin ${member.cabin}`,
      subline: nextText,
      roomOrVenue: member.cabin,
      activeSlot: null,
      nextSlot,
    };
  }

  // 4. Off duty
  const nextResume = isWorkingDay && minutes < dutyStart
    ? `Duty starts at ${formatTimeDisplay(member.dutyStart)}`
    : `Resumes next working day at ${formatTimeDisplay(member.dutyStart)}`;

  return {
    state: 'off_duty',
    headline: 'Off duty',
    subline: missingTimetable ? `${nextResume} · No schedule uploaded` : nextResume,
    roomOrVenue: member.cabin,
    activeSlot: null,
    nextSlot,
  };
}

export const STATUS_LABELS: Record<FacultyLiveState, string> = {
  in_class: 'Taking Class',
  in_meeting: 'In Meeting',
  on_leave: 'On Leave',
  free_cabin: 'Free in Cabin',
  off_duty: 'Off Duty',
};

// RFC-4180 compliant CSV parser for uploaded or pasted CSV data
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  const clean = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentVal += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentVal += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if (ch === '\n') {
      currentRow.push(currentVal.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += ch;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function normalizeDayCode(raw: string): DayOfWeek | null {
  const val = raw.trim().toLowerCase();
  if (!val) return null;
  if (val.startsWith('mon') || val === 'm') return 'Mon';
  if (val.startsWith('tue') || val === 'tu') return 'Tue';
  if (val.startsWith('wed') || val === 'w') return 'Wed';
  if (val.startsWith('thu') || val === 'th') return 'Thu';
  if (val.startsWith('fri') || val === 'f') return 'Fri';
  if (val.startsWith('sat') || val === 'sa') return 'Sat';
  if (val.startsWith('sun') || val === 'su') return 'Sun';
  return null;
}

export function normalizeSlotType(raw: string): SlotType {
  const val = raw.trim().toLowerCase();
  if (val.includes('meet') || val.includes('conf') || val.includes('committee')) return 'Meeting';
  if (val.includes('lab') || val.includes('practical')) return 'Lab';
  if (val.includes('office') || val.includes('consult') || val.includes('cabin')) return 'Office Hours';
  return 'Class';
}

export function validatePhoneNumber(raw: string): {
  valid: boolean;
  display: string;
  telHref: string;
} {
  const cleaned = String(raw ?? '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) {
    return { valid: false, display: '', telHref: '' };
  }
  // Reject Excel scientific-notation corruption (e.g. 9.19063E+11)
  if (/e\+/i.test(cleaned)) {
    return { valid: false, display: cleaned, telHref: '' };
  }
  const hasPlus = cleaned.startsWith('+');
  const digitsOnly = cleaned.replace(/\D/g, '');
  // Support Indian numbers (+91 + 10 digits, 0 + 10 digits, or 10 digits) and general 10-15 digit numbers
  const isValidLength = digitsOnly.length >= 10 && digitsOnly.length <= 15;
  const isValidChars = /^\+?[\d\s\-()]+$/.test(cleaned);
  if (!isValidLength || !isValidChars) {
    return { valid: false, display: cleaned, telHref: '' };
  }
  const dialNumber = `${hasPlus ? '+' : ''}${digitsOnly}`;
  return {
    valid: true,
    display: cleaned,
    telHref: `tel:${dialNumber}`,
  };
}

export function validateEmailAddress(raw: string): {
  valid: boolean;
  email: string;
  mailtoHref: string;
} {
  const cleaned = raw.trim();
  if (!cleaned) {
    return { valid: false, email: '', mailtoHref: '' };
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
  return {
    valid,
    email: cleaned,
    mailtoHref: valid ? `mailto:${encodeURIComponent(cleaned).replace(/%40/g, '@')}` : '',
  };
}

export function parseFacultyCsvText(
  csvText: string,
  existingFaculty: FacultyMember[] = [],
  options: { overwriteEmptyContacts?: boolean } = {}
): {
  parsed: Array<Omit<FacultyMember, 'hasPassword'> & { initialPassword?: string }>;
  warnings: string[];
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { parsed: [], warnings: ['CSV must contain a header row and at least one data row.'] };
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colIndex = (candidates: string[]) => {
    const exact = headers.findIndex((h) => candidates.some((c) => h === c));
    if (exact !== -1) return exact;
    return headers.findIndex((h) => candidates.some((c) => h.includes(c)));
  };

  const idIdx = colIndex(['id', 'facultyid', 'code', 'empid']);
  const nameIdx = colIndex(['facultynames', 'facultyname', 'name', 'fullname']);
  const roomIdx = colIndex(['roomnos', 'roomno', 'cabin', 'room', 'office']);
  const deptIdx = colIndex(['department', 'dept']);
  const desigIdx = colIndex(['designation', 'title', 'role', 'position']);
  const roleTypeIdx = colIndex(['roletype', 'category', 'type', 'stafftype']);
  const mobileIdx = colIndex([
    'mobilenumber',
    'mobileno',
    'mobilenos',
    'mobilenumbers',
    'mobile',
    'phonenumber',
    'phoneno',
    'phone',
    'contactno',
    'contactnumber',
    'contact',
    'mob',
    'whatsapp',
    'cell',
  ]);
  const emailIdx = colIndex(['emailaddress', 'emailid', 'email', 'mail']);
  const leaveStartIdx = colIndex(['leavestart', 'fromdate']);
  const leaveUntilIdx = colIndex(['leaveuntil', 'leaveend', 'leave', 'todate']);
  const dutyStartIdx = colIndex(['dutystart', 'startduty', 'workstart']);
  const dutyEndIdx = colIndex(['dutyend', 'endduty', 'workend']);
  const noteIdx = colIndex(['note', 'availabilitynote', 'remarks']);
  const passIdx = colIndex(['password', 'passcode', 'pin']);

  const warnings: string[] = [];
  if (idIdx === -1 || nameIdx === -1) {
    return {
      parsed: [],
      warnings: [
        'Missing required columns. Expected at least "Id" and "Faculty Names" (or "name") plus "Room Nos." (or "cabin").',
      ],
    };
  }

  const existingById = new Map(existingFaculty.map((f) => [f.id.toUpperCase(), f]));
  const seenIds = new Map<string, number>();
  const parsed: Array<Omit<FacultyMember, 'hasPassword'> & { initialPassword?: string }> = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = (r[idIdx] || '').trim().toUpperCase();
    let name = (r[nameIdx] || '').trim();
    if (!id || !name) {
      warnings.push(`Row ${i + 1}: Skipped empty ID or Name.`);
      continue;
    }

    // Fix minor missing closing parenthesis like "Prof. Dr. Abir Chatterjee (AC"
    if (name.includes(`(${id}`) && !name.includes(`(${id})`)) {
      name = name.replace(`(${id}`, `(${id})`);
    }

    const prev = existingById.get(id);
    const rawRoom = roomIdx !== -1 ? (r[roomIdx] || '').trim() : '';
    const cleanedRoom = rawRoom.replace(/^B!\s*/i, 'B1 ').replace(/\s+/g, ' ') || prev?.cabin || 'TBD';

    const department =
      (deptIdx !== -1 ? r[deptIdx] : '') || prev?.department || 'Computer Science & Eng.';
    const designation =
      (desigIdx !== -1 ? r[desigIdx] : '') ||
      prev?.designation ||
      (name.toLowerCase().includes('dr.') ? 'Associate Professor' : 'Assistant Professor');
    const roleRaw = roleTypeIdx !== -1 ? (r[roleTypeIdx] || '').toLowerCase() : '';
    const roleType: 'Faculty' | 'Staff' =
      roleRaw.includes('staff') || roleRaw.includes('admin')
        ? 'Staff'
        : prev?.roleType || 'Faculty';

    // Handle Mobile Number (always string, preserve leading zeros / +91, don't overwrite valid data with empty)
    let mobileNumber: string | undefined = prev?.mobileNumber;
    if (mobileIdx !== -1) {
      const rawMobile = (r[mobileIdx] || '').trim();
      if (rawMobile) {
        const checked = validatePhoneNumber(rawMobile);
        if (checked.valid) {
          mobileNumber = checked.display;
        } else {
          warnings.push(`Row ${i + 1} (${id}): Invalid mobile number format ignored.`);
        }
      } else if (options.overwriteEmptyContacts) {
        mobileNumber = undefined;
      }
    }

    // Handle Email (never generate fake emails; don't overwrite valid email with empty)
    let email: string | undefined = prev?.email;
    if (emailIdx !== -1) {
      const rawEmail = (r[emailIdx] || '').trim();
      if (rawEmail) {
        const checked = validateEmailAddress(rawEmail);
        if (checked.valid) {
          email = checked.email;
        } else {
          warnings.push(`Row ${i + 1} (${id}): Invalid email format ignored.`);
        }
      } else if (options.overwriteEmptyContacts) {
        email = undefined;
      }
    }

    const leaveStart = leaveStartIdx !== -1 ? (r[leaveStartIdx] || '').trim() : prev?.leaveStart || '';
    const leaveUntil = leaveUntilIdx !== -1 ? (r[leaveUntilIdx] || '').trim() : prev?.leaveUntil || '';
    const dutyStart =
      dutyStartIdx !== -1 && r[dutyStartIdx] ? normalizeTime24(r[dutyStartIdx]) : prev?.dutyStart || '09:00';
    const dutyEnd =
      dutyEndIdx !== -1 && r[dutyEndIdx] ? normalizeTime24(r[dutyEndIdx]) : prev?.dutyEnd || '17:30';
    const availabilityNote =
      (noteIdx !== -1 ? r[noteIdx] : '') || prev?.availabilityNote || '';
    const initialPassword = passIdx !== -1 ? (r[passIdx] || '').trim() : undefined;

    const record: Omit<FacultyMember, 'hasPassword'> & { initialPassword?: string } = {
      id,
      name,
      department: department.trim(),
      designation: designation.trim(),
      cabin: cleanedRoom,
      roleType,
      mobileNumber: mobileNumber || undefined,
      email: email || undefined,
      leaveStart: leaveStart || undefined,
      leaveUntil: leaveUntil || undefined,
      dutyStart,
      dutyEnd,
      workingDays: prev?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      availabilityNote: availabilityNote || undefined,
      initialPassword: initialPassword || undefined,
    };

    const existingParsedIndex = seenIds.get(id);
    if (existingParsedIndex !== undefined) {
      warnings.push(`Row ${i + 1} (${id}): Duplicate ID in CSV merged with earlier row.`);
      parsed[existingParsedIndex] = {
        ...parsed[existingParsedIndex],
        ...record,
        mobileNumber: record.mobileNumber ?? parsed[existingParsedIndex].mobileNumber,
        email: record.email ?? parsed[existingParsedIndex].email,
      };
    } else {
      seenIds.set(id, parsed.length);
      parsed.push(record);
    }
  }

  return { parsed, warnings };
}

export interface ScheduleCsvStats {
  totalRows: number;
  validRows: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
  unknownFacultyIds: string[];
}

export function buildScheduleSlotKey(slot: {
  facultyId: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
}): string {
  return `${slot.facultyId.trim().toUpperCase()}|${slot.day}|${slot.startTime}|${slot.endTime}`;
}

export function buildScheduleExactKey(slot: {
  facultyId: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  type: SlotType;
  title: string;
  room: string;
}): string {
  return [
    slot.facultyId.trim().toUpperCase(),
    slot.day,
    slot.startTime,
    slot.endTime,
    slot.type,
    slot.title.trim().toLowerCase(),
    slot.room.trim().toLowerCase(),
  ].join('|');
}

export function parseScheduleCsvText(
  csvText: string,
  knownFacultyIds?: Set<string>
): {
  parsed: ScheduleSlot[];
  warnings: string[];
  stats: ScheduleCsvStats;
} {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      parsed: [],
      warnings: ['Schedule CSV must include a header row and at least one slot.'],
      stats: {
        totalRows: 0,
        validRows: 0,
        duplicateCount: 0,
        skippedCount: 0,
        invalidCount: 0,
        unknownFacultyIds: [],
      },
    };
  }

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  // Exact match across all candidates first so substring matches (e.g. "coursecode" vs "code") never hijack a real column
  const colIndex = (candidates: string[]) => {
    for (const c of candidates) {
      const exact = headers.findIndex((h) => h === c);
      if (exact !== -1) return exact;
    }
    return headers.findIndex((h) => candidates.some((c) => h.includes(c)));
  };

  const facIdx = colIndex(['facultyid', 'facid', 'empid', 'id', 'code', 'faculty']);
  const dayIdx = colIndex(['day', 'weekday', 'dayofweek']);
  const startIdx = colIndex(['starttime', 'start', 'fromtime', 'from']);
  const endIdx = colIndex(['endtime', 'end', 'totime', 'to']);
  const rangeIdx = colIndex(['timerange', 'timing', 'timings', 'time', 'slot']);
  const typeIdx = colIndex(['type', 'slottype', 'activity', 'category']);
  const titleIdx = colIndex(['title', 'subject', 'coursename', 'course', 'description', 'event']);
  const roomIdx = colIndex(['room', 'roomno', 'roomnos', 'venue', 'hall', 'classroom', 'location']);

  const hasTimeCols = (startIdx !== -1 && endIdx !== -1) || rangeIdx !== -1;
  if (facIdx === -1 || dayIdx === -1 || !hasTimeCols) {
    return {
      parsed: [],
      warnings: [
        'Missing required columns. Expected: faculty_id, day, start_time, end_time (or time range), type, title, room.',
      ],
      stats: {
        totalRows: rows.length - 1,
        validRows: 0,
        duplicateCount: 0,
        skippedCount: rows.length - 1,
        invalidCount: rows.length - 1,
        unknownFacultyIds: [],
      },
    };
  }

  const warnings: string[] = [];
  const parsed: ScheduleSlot[] = [];
  const seenTimeKeys = new Map<string, number>();
  const seenExactKeys = new Set<string>();
  const unknownIdSet = new Set<string>();

  const totalRows = rows.length - 1;
  let duplicateCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const facultyId = (r[facIdx] || '').trim().toUpperCase();
    const day = normalizeDayCode(r[dayIdx] || '');

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (startIdx !== -1 && endIdx !== -1) {
      startTime = parseStrictTimeTo24(r[startIdx] || '');
      endTime = parseStrictTimeTo24(r[endIdx] || '');
      if (!startTime || !endTime) {
        const fallbackRange =
          parseTimeRange(r[startIdx] || '') ||
          (rangeIdx !== -1 ? parseTimeRange(r[rangeIdx] || '') : null);
        if (fallbackRange) {
          startTime = fallbackRange.startTime;
          endTime = fallbackRange.endTime;
        }
      }
    } else if (rangeIdx !== -1) {
      const range = parseTimeRange(r[rangeIdx] || '');
      if (range) {
        startTime = range.startTime;
        endTime = range.endTime;
      }
    }

    if (!facultyId || !day || !startTime || !endTime) {
      invalidCount++;
      skippedCount++;
      warnings.push(
        `Row ${i + 1}: Invalid or missing faculty ID ("${r[facIdx] || ''}"), day ("${r[dayIdx] || ''}"), or time.`
      );
      continue;
    }

    if (parseTimeToMinutes(endTime) <= parseTimeToMinutes(startTime)) {
      invalidCount++;
      skippedCount++;
      warnings.push(
        `Row ${i + 1} (${facultyId}): End time (${endTime}) must be after start time (${startTime}).`
      );
      continue;
    }

    if (knownFacultyIds && !knownFacultyIds.has(facultyId)) {
      unknownIdSet.add(facultyId);
      skippedCount++;
      warnings.push(
        `Row ${i + 1}: Faculty ID "${facultyId}" not found in directory (row skipped).`
      );
      continue;
    }

    const type = typeIdx !== -1 ? normalizeSlotType(r[typeIdx] || 'Class') : 'Class';
    const title = ((titleIdx !== -1 ? r[titleIdx] : '') || `${type} Session`).trim();
    const room = ((roomIdx !== -1 ? r[roomIdx] : '') || 'TBA').trim();

    const slot: ScheduleSlot = {
      id: `${facultyId}-${day}-${startTime.replace(':', '')}-${i}`,
      facultyId,
      day,
      startTime,
      endTime,
      type,
      title,
      room,
    };

    const exactKey = buildScheduleExactKey(slot);
    if (seenExactKeys.has(exactKey)) {
      duplicateCount++;
      skippedCount++;
      warnings.push(
        `Row ${i + 1} (${facultyId}): Duplicate slot (${day} ${startTime}-${endTime}) skipped.`
      );
      continue;
    }

    const timeKey = buildScheduleSlotKey(slot);
    const existingIdx = seenTimeKeys.get(timeKey);
    if (existingIdx !== undefined) {
      duplicateCount++;
      skippedCount++;
      parsed[existingIdx] = { ...slot, id: parsed[existingIdx].id };
      warnings.push(
        `Row ${i + 1} (${facultyId}): Overwrote duplicate time slot (${day} ${startTime}-${endTime}).`
      );
      continue;
    }

    seenExactKeys.add(exactKey);
    seenTimeKeys.set(timeKey, parsed.length);
    parsed.push(slot);
  }

  return {
    parsed,
    warnings,
    stats: {
      totalRows,
      validRows: parsed.length,
      duplicateCount,
      skippedCount,
      invalidCount,
      unknownFacultyIds: Array.from(unknownIdSet).sort(),
    },
  };
}

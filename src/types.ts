export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type SlotType = 'Class' | 'Lab' | 'Meeting' | 'Office Hours';

export type FacultyLiveState =
  | 'in_class'
  | 'in_meeting'
  | 'on_leave'
  | 'free_cabin'
  | 'off_duty';

export interface FacultyMember {
  id: string;
  name: string;
  department: string;
  designation: string;
  cabin: string;
  roleType: 'Faculty' | 'Staff';
  mobileNumber?: string;
  email?: string;
  leaveStart?: string; // YYYY-MM-DD
  leaveUntil?: string; // YYYY-MM-DD
  dutyStart: string;   // HH:MM (24h)
  dutyEnd: string;     // HH:MM (24h)
  workingDays: DayOfWeek[];
  availabilityNote?: string;
  hasPassword?: boolean;
}

export interface ScheduleSlot {
  id: string;
  facultyId: string;
  day: DayOfWeek;
  startTime: string; // HH:MM (24h)
  endTime: string;   // HH:MM (24h)
  type: SlotType;
  title: string;
  room: string;
}

export type MeetingRequestStatus = 'pending' | 'accepted' | 'rejected' | 'rescheduled';

export interface MeetingRequest {
  id: string;
  trackingCode: string;
  facultyId: string;
  facultyName: string;
  studentName: string;
  studentRoll: string;
  studentEmail?: string;
  preferredDate: string; // YYYY-MM-DD
  preferredTime: string; // HH:MM
  reason: string;
  status: MeetingRequestStatus;
  rescheduledDate?: string;
  rescheduledTime?: string;
  facultyNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FacultyStatusInfo {
  state: FacultyLiveState;
  headline: string;
  subline: string;
  roomOrVenue: string;
  activeSlot: ScheduleSlot | null;
  nextSlot: ScheduleSlot | null;
}

export interface ClockConfig {
  useLiveTime: boolean;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:MM
}

export interface AuthSession {
  role: 'faculty' | 'admin';
  token: string;
  facultyId?: string;
  facultyName?: string;
}

export type EventCategory =
  | 'Seminar'
  | 'Technical Talk'
  | 'Workshop'
  | 'Hackathon'
  | 'Competition'
  | 'Cultural Event'
  | 'Webinar'
  | 'Other';

export type EventRegistrationStatus =
  | 'upcoming'
  | 'open'
  | 'closed'
  | 'completed';

export interface DepartmentEvent {
  id: string;
  title: string;
  description: string;
  department: string;
  category: EventCategory;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  venue: string;
  organizer: string;
  bannerImage?: string;
  registrationLink?: string;
  registrationStatus: EventRegistrationStatus;
  isDemo?: boolean;
  createdByRole?: 'admin' | 'faculty';
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleSource = 'sample' | 'imported' | 'empty';

export interface ScheduleImportSummary {
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
  unknownFacultyIds: string[];
  warnings: string[];
  importedAt: string;
  mode: 'merge' | 'replace' | 'faculty_portal' | 'reset';
}

export interface ScheduleMetadata {
  source: ScheduleSource;
  lastImportedAt?: string;
  lastImportMode?: 'merge' | 'replace' | 'faculty_portal' | 'reset';
  lastImportSummary?: ScheduleImportSummary;
}

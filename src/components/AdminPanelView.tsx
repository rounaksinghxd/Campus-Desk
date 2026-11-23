import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  KeyRound,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AuthSession,
  DepartmentEvent,
  FacultyMember,
  ScheduleImportSummary,
  ScheduleMetadata,
  ScheduleSlot,
} from '../types';
import {
  parseFacultyCsvText,
  parseScheduleCsvText,
  validateEmailAddress,
  validatePhoneNumber,
} from '../utils/statusEngine';
import { apiFetch } from '../utils/api';
import { EventManagerPanel } from './EventManagerPanel';

interface AdminPanelViewProps {
  faculty: FacultyMember[];
  schedules: ScheduleSlot[];
  scheduleMetadata?: ScheduleMetadata;
  departments: string[];
  events: DepartmentEvent[];
  adminConfigured: boolean;
  session: AuthSession | null;
  onAuthenticated: (session: AuthSession) => void;
  onDirectoryRefresh: () => Promise<void>;
  onEventsChanged: () => Promise<void>;
  initialTab?: 'directory' | 'events';
  initialEditEvent?: DepartmentEvent | null;
}

const SAMPLE_FACULTY_UPLOAD = `Id,Faculty Names,Room Nos.,Department,Designation,Mobile,Email,Leave Until
AC,Prof. Dr. Abir Chatterjee (AC),B1 LG 1.7(a),Computer Science & Eng.,Professor & HOD,,,
AYC,Prof. Dr. Ayan Chatterjee (AYC),B1 3.11,Computer Science & Eng.,Professor,,,
SGH,Prof. Dr. Sudipta Ghosh (SGH),B2 LG 0.7,Electronics & Comm.,Professor,,,2026-11-27`;

const SAMPLE_SCHEDULE_UPLOAD = `faculty_id,day,start_time,end_time,type,title,room
AC,Mon,09:30,11:00,Class,CS601 Distributed Systems,B1 LH 2.02
AC,Wed,14:00,15:30,Meeting,Academic Senate Board,Main Conference Hall
AYC,Mon,10:00,11:30,Class,CS402 Design & Analysis of Algorithms,B1 LH 1.04`;

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  faculty,
  schedules,
  scheduleMetadata,
  departments,
  events,
  adminConfigured,
  session,
  onAuthenticated,
  onDirectoryRefresh,
  onEventsChanged,
  initialTab = 'directory',
  initialEditEvent = null,
}) => {
  const [adminTab, setAdminTab] = useState<'directory' | 'events'>(initialTab);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    setAdminTab(initialTab);
  }, [initialTab]);

  // CSV importer states
  const [facultyCsv, setFacultyCsv] = useState('');
  const [facultyMode, setFacultyMode] = useState<'merge' | 'replace'>('merge');
  const [facultyImportStatus, setFacultyImportStatus] = useState<string | null>(null);
  const [facultyImportError, setFacultyImportError] = useState<string | null>(null);

  const [scheduleCsv, setScheduleCsv] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'merge' | 'replace'>('merge');
  const [scheduleImportStatus, setScheduleImportStatus] = useState<string | null>(null);
  const [scheduleImportError, setScheduleImportError] = useState<string | null>(null);
  const [scheduleImportSummary, setScheduleImportSummary] =
    useState<ScheduleImportSummary | null>(null);
  const [pendingReplaceConfirm, setPendingReplaceConfirm] = useState(false);
  const [pendingResetConfirm, setPendingResetConfirm] = useState(false);

  // Roster search & inline edit
  const [rosterSearch, setRosterSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDept, setEditDept] = useState('');
  const [editDesig, setEditDesig] = useState('');
  const [editCabin, setEditCabin] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLeaveUntil, setEditLeaveUntil] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [rosterMsg, setRosterMsg] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const endpoint = adminConfigured ? '/api/auth/admin/login' : '/api/auth/admin/claim';
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
      } else {
        setPasscode('');
        await onDirectoryRefresh();
        onAuthenticated({ role: 'admin', token: data.token });
      }
    } catch (err) {
      setAuthError(
        err instanceof Error && err.message && !err.message.includes('fetch')
          ? err.message
          : 'Network error during admin sign in.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const downloadCsvFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportFaculty = async () => {
    if (!session?.token || !facultyCsv.trim()) return;
    setFacultyImportStatus(null);
    setFacultyImportError(null);
    try {
      const res = await apiFetch('/api/admin/import/faculty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ csvText: facultyCsv, mode: facultyMode }),
      });
      const data = await res.json();
      if (res.ok) {
        await onDirectoryRefresh();
        const warnSuffix =
          data.warnings?.length > 0 ? ` (${data.warnings.length} warnings)` : '';
        setFacultyImportStatus(
          `Imported ${data.importedCount} faculty/staff records${warnSuffix}.`
        );
      } else {
        setFacultyImportError(data.error || 'Import failed. Existing directory preserved.');
      }
    } catch {
      setFacultyImportError('Network error while importing faculty CSV.');
    }
  };

  const executeImportSchedule = async () => {
    if (!session?.token || !scheduleCsv.trim()) return;
    setScheduleImportStatus(null);
    setScheduleImportError(null);
    try {
      const res = await apiFetch('/api/admin/import/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ csvText: scheduleCsv, mode: scheduleMode }),
      });
      const data = await res.json();
      if (res.ok) {
        setPendingReplaceConfirm(false);
        setScheduleCsv('');
        if (data.summary) {
          setScheduleImportSummary(data.summary);
        }
        await onDirectoryRefresh();
        const parts: string[] = [];
        if (data.importedCount > 0) parts.push(`${data.importedCount} added`);
        if (data.updatedCount > 0) parts.push(`${data.updatedCount} updated`);
        if (data.duplicateCount > 0) parts.push(`${data.duplicateCount} duplicates skipped`);
        if (parts.length === 0) parts.push('no changes needed (all rows already up to date)');
        setScheduleImportStatus(`Schedule saved: ${parts.join(', ')}.`);
      } else {
        if (data.summary) {
          setScheduleImportSummary(data.summary);
        }
        setScheduleImportError(
          data.error || 'Schedule import failed. Active schedule was preserved.'
        );
      }
    } catch {
      setScheduleImportError(
        'Network error while importing schedule CSV. Active schedule was preserved.'
      );
    }
  };

  const handleImportSchedule = async () => {
    if (!session?.token || !scheduleCsv.trim()) return;
    if (scheduleMode === 'replace' && schedules.length > 0 && !pendingReplaceConfirm) {
      setPendingReplaceConfirm(true);
      setScheduleImportStatus(null);
      setScheduleImportError(null);
      return;
    }
    await executeImportSchedule();
  };

  const startEdit = (m: FacultyMember) => {
    setEditingId(m.id);
    setEditDept(m.department);
    setEditDesig(m.designation);
    setEditCabin(m.cabin);
    setEditMobile(m.mobileNumber || '');
    setEditEmail(m.email || '');
    setEditLeaveUntil(m.leaveUntil || '');
    setEditPassword('');
    setRosterMsg(null);
    setRosterError(null);
  };

  const saveEdit = async (id: string) => {
    if (!session?.token) return;
    setRosterError(null);
    setRosterMsg(null);
    try {
      const res = await apiFetch(`/api/admin/faculty/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          department: editDept,
          designation: editDesig,
          cabin: editCabin,
          mobileNumber: editMobile,
          email: editEmail,
          leaveUntil: editLeaveUntil,
          newPassword: editPassword.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditingId(null);
        await onDirectoryRefresh();
        setRosterMsg(`Updated ${id}.`);
      } else {
        setRosterError(data.error || `Failed to update ${id}.`);
      }
    } catch {
      setRosterError(`Network error while updating ${id}.`);
    }
  };

  const deleteFaculty = async (id: string) => {
    if (!session?.token) return;
    setRosterError(null);
    try {
      const res = await apiFetch(`/api/admin/faculty/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        await onDirectoryRefresh();
        setRosterMsg(`Removed ${id} from directory.`);
      } else {
        setRosterError(`Failed to remove ${id}.`);
      }
    } catch {
      setRosterError(`Network error while removing ${id}.`);
    }
  };

  const executeResetSample = async () => {
    if (!session?.token) return;
    setRosterError(null);
    try {
      const res = await apiFetch('/api/admin/reset-sample', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (res.ok) {
        setPendingResetConfirm(false);
        setScheduleImportSummary(null);
        setScheduleImportStatus(null);
        setScheduleImportError(null);
        await onDirectoryRefresh();
        setRosterMsg('Restored default university sample faculty and schedule dataset.');
      } else {
        setRosterError('Could not restore sample dataset.');
      }
    } catch {
      setRosterError('Network error while restoring sample dataset.');
    }
  };

  // Unauthenticated / First-run setup gate
  if (!session || session.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">
            {adminConfigured ? 'Admin Panel Sign In' : 'First-Run Admin Setup'}
          </h1>
          <p className="text-xs text-slate-600">
            {adminConfigured
              ? 'Enter the university admin passcode to upload faculty CSVs, weekly schedules, and manage leave dates.'
              : 'No admin passcode is configured yet. Choose an initial passcode (minimum 6 characters) to claim Admin access.'}
          </p>
        </div>

        <form onSubmit={handleAdminAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {adminConfigured ? 'Admin Passcode' : 'Create Initial Admin Passcode'}
            </label>
            <input
              type="password"
              required
              minLength={adminConfigured ? 1 : 6}
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder={adminConfigured ? 'Enter admin passcode' : 'Minimum 6 characters'}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {authError && <p className="text-xs font-medium text-rose-700">{authError}</p>}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            <span>
              {authLoading
                ? 'Verifying...'
                : adminConfigured
                ? 'Sign In as Admin'
                : 'Set Passcode & Open Admin Panel'}
            </span>
          </button>
        </form>
      </div>
    );
  }

  const facultyPreview = facultyCsv.trim() ? parseFacultyCsvText(facultyCsv, faculty) : null;
  const knownIds = new Set(faculty.map((f) => f.id.toUpperCase()));
  const schedulePreview = scheduleCsv.trim()
    ? parseScheduleCsvText(scheduleCsv, knownIds)
    : null;

  const filteredRoster = faculty.filter((f) => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      f.id.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.department.toLowerCase().includes(q) ||
      f.cabin.toLowerCase().includes(q) ||
      (f.mobileNumber || '').toLowerCase().includes(q) ||
      (f.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Admin Schedule, Directory &amp; Events Manager
          </h1>
          <p className="text-sm text-slate-600">
            Upload or paste Faculty &amp; Schedule CSVs, manage leave dates, or publish and maintain Department Events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setAdminTab('directory')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                adminTab === 'directory'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Directory &amp; CSVs
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('events')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                adminTab === 'events'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Department Events ({events.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => setPendingResetConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Sample Data</span>
          </button>
        </div>
      </div>

      {pendingResetConfirm && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-0.5">
              <p className="font-semibold">Confirm Restore Sample Dataset?</p>
              <p>
                This will overwrite your current faculty contacts, imported weekly schedules, and events with the default sample dataset (a backup copy is saved automatically).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingResetConfirm(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeResetSample}
              className="px-3 py-1.5 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
            >
              Confirm Restore Sample
            </button>
          </div>
        </div>
      )}

      {adminTab === 'events' ? (
        <EventManagerPanel
          session={session}
          departments={departments}
          events={events}
          initialEditEvent={initialEditEvent}
          onEventsChanged={onEventsChanged}
        />
      ) : (
        <>
      {/* Dual CSV Upload / Paste Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* CSV 1: Faculty & Staff */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  1. Faculty &amp; Staff CSV
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFacultyCsv(SAMPLE_FACULTY_UPLOAD)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Load sample
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile('sample_faculty_staff.csv', SAMPLE_FACULTY_UPLOAD)
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Template</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Supports <span className="font-mono">Id,Faculty Names,Room Nos.,Mobile,Email</span> as well as full columns (<span className="font-mono">department,designation,mobile_number,email,leave_until</span>). Empty contact cells preserve existing valid records.
            </p>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) file.text().then(setFacultyCsv);
                  }}
                />
              </label>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setFacultyMode('merge')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    facultyMode === 'merge'
                      ? 'bg-white text-slate-900 font-medium'
                      : 'text-slate-600'
                  }`}
                >
                  Merge / Update
                </button>
                <button
                  type="button"
                  onClick={() => setFacultyMode('replace')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    facultyMode === 'replace'
                      ? 'bg-white text-slate-900 font-medium'
                      : 'text-slate-600'
                  }`}
                >
                  Replace All
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={facultyCsv}
              onChange={(e) => setFacultyCsv(e.target.value)}
              placeholder="Paste Faculty & Staff CSV here..."
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />

            {facultyPreview && (
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  Preview: <span className="font-mono font-semibold">{facultyPreview.parsed.length}</span> valid rows detected.
                </div>
                {facultyPreview.warnings.length > 0 && (
                  <div className="text-amber-700">{facultyPreview.warnings[0]}</div>
                )}
              </div>
            )}

            {facultyImportStatus && (
              <p className="text-xs font-medium text-emerald-700">{facultyImportStatus}</p>
            )}
            {facultyImportError && (
              <p className="text-xs font-medium text-rose-700">{facultyImportError}</p>
            )}
          </div>

          <button
            type="button"
            disabled={!facultyCsv.trim()}
            onClick={handleImportFaculty}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            Import Faculty &amp; Staff CSV
          </button>
        </div>

        {/* CSV 2: Weekly Schedule */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  2. Weekly Schedule CSV
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleCsv(SAMPLE_SCHEDULE_UPLOAD);
                    setPendingReplaceConfirm(false);
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Load sample
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile('sample_weekly_schedule.csv', SAMPLE_SCHEDULE_UPLOAD)
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Template</span>
                </button>
              </div>
            </div>

            {/* Active Schedule Source Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    scheduleMetadata?.source === 'imported'
                      ? 'bg-emerald-600'
                      : scheduleMetadata?.source === 'empty'
                      ? 'bg-amber-600'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="font-medium text-slate-800">
                  {scheduleMetadata?.source === 'imported'
                    ? 'Official Imported Schedule Active'
                    : scheduleMetadata?.source === 'empty'
                    ? 'No Schedule Uploaded'
                    : 'Demo Sample Schedule Active'}
                </span>
              </div>
              <span className="font-mono text-slate-500">
                {schedules.length} active slots
                {scheduleMetadata?.lastImportedAt
                  ? ` · ${new Date(scheduleMetadata.lastImportedAt).toLocaleString()}`
                  : ''}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Columns: <span className="font-mono">faculty_id,day,start_time,end_time,type,title,room</span> (Class, Lab, Meeting, Office Hours). Supports 24h, AM/PM, and Excel time formats.
            </p>

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Choose CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    setPendingReplaceConfirm(false);
                    if (file) file.text().then(setScheduleCsv);
                  }}
                />
              </label>

              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode('merge');
                    setPendingReplaceConfirm(false);
                  }}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    scheduleMode === 'merge'
                      ? 'bg-white text-slate-900 font-medium'
                      : 'text-slate-600'
                  }`}
                >
                  Merge / Update
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleMode('replace');
                    setPendingReplaceConfirm(false);
                  }}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    scheduleMode === 'replace'
                      ? 'bg-white text-slate-900 font-medium'
                      : 'text-slate-600'
                  }`}
                >
                  Replace All
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={scheduleCsv}
              onChange={(e) => {
                setScheduleCsv(e.target.value);
                setPendingReplaceConfirm(false);
              }}
              placeholder="Paste Weekly Schedule CSV here..."
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />

            {schedulePreview && (
              <div className="text-xs text-slate-600 space-y-1">
                <div>
                  Preview: <span className="font-mono font-semibold">{schedulePreview.parsed.length}</span> valid unique slots from{' '}
                  <span className="font-mono">{schedulePreview.stats.totalRows}</span> rows
                  {schedulePreview.stats.duplicateCount > 0 && (
                    <span className="text-amber-700"> ({schedulePreview.stats.duplicateCount} duplicates in file)</span>
                  )}
                  {schedulePreview.stats.invalidCount > 0 && (
                    <span className="text-rose-700"> ({schedulePreview.stats.invalidCount} invalid)</span>
                  )}
                  .
                </div>
                {schedulePreview.stats.unknownFacultyIds.length > 0 && (
                  <div className="text-amber-700">
                    Unrecognized Faculty IDs: <span className="font-mono">{schedulePreview.stats.unknownFacultyIds.join(', ')}</span>
                  </div>
                )}
                {schedulePreview.warnings.length > 0 && (
                  <div className="text-amber-700">{schedulePreview.warnings[0]}</div>
                )}
              </div>
            )}

            {scheduleImportStatus && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{scheduleImportStatus}</span>
              </div>
            )}

            {scheduleImportError && (
              <div className="flex items-start gap-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{scheduleImportError}</span>
              </div>
            )}

            {(scheduleImportSummary || scheduleMetadata?.lastImportSummary) && (() => {
              const summary = scheduleImportSummary || scheduleMetadata!.lastImportSummary!;
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-800">
                    <span>Last Import Summary ({summary.mode === 'replace' ? 'Replace All' : summary.mode === 'merge' ? 'Merge / Update' : summary.mode})</span>
                    <span className="font-mono font-normal text-slate-500">
                      {new Date(summary.importedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      Total rows: <span className="font-semibold text-slate-900">{summary.totalRows}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      New slots: <span className="font-semibold text-emerald-700">{summary.importedCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      Updated: <span className="font-semibold text-blue-700">{summary.updatedCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      Duplicates: <span className="font-semibold text-amber-700">{summary.duplicateCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      Skipped: <span className="font-semibold text-slate-700">{summary.skippedCount}</span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded px-2 py-1">
                      Invalid: <span className="font-semibold text-rose-700">{summary.invalidCount}</span>
                    </div>
                  </div>
                  {summary.unknownFacultyIds.length > 0 && (
                    <div className="text-amber-800">
                      Faculty IDs not found in directory:{' '}
                      <span className="font-mono font-semibold">{summary.unknownFacultyIds.join(', ')}</span>
                    </div>
                  )}
                  {summary.warnings.length > 0 && (
                    <details className="text-amber-800">
                      <summary className="cursor-pointer font-medium">
                        {summary.warnings.length} import warning{summary.warnings.length > 1 ? 's' : ''}
                      </summary>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                        {summary.warnings.slice(0, 15).map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })()}

            {pendingReplaceConfirm && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2 text-xs text-amber-900">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Confirm Replace All Weekly Schedules?</span>
                </p>
                <p>
                  This will replace all {schedules.length} active weekly schedule entries with the {schedulePreview?.parsed.length ?? 0} parsed slots from this CSV.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingReplaceConfirm(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={executeImportSchedule}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-lg cursor-pointer"
                  >
                    Confirm Replace All
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!scheduleCsv.trim()}
            onClick={handleImportSchedule}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            {scheduleMode === 'replace'
              ? 'Replace All Weekly Schedules'
              : 'Merge / Update Weekly Schedule CSV'}
          </button>
        </div>
      </div>

      {/* Faculty & Leave Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Faculty, Staff &amp; Leave Roster ({faculty.length})
            </h2>
            {rosterMsg && (
              <p className="text-xs font-medium text-blue-700 mt-0.5">{rosterMsg}</p>
            )}
            {rosterError && (
              <p className="text-xs font-medium text-rose-700 mt-0.5">{rosterError}</p>
            )}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Filter roster by ID, name, room, contact..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                <th className="py-2.5 px-4">ID</th>
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Cabin Room</th>
                <th className="py-2.5 px-4">Direct Contact</th>
                <th className="py-2.5 px-4">Leave Until</th>
                <th className="py-2.5 px-4">Portal Password</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRoster.map((m) => {
                const isEditing = editingId === m.id;
                const phoneInfo = m.mobileNumber ? validatePhoneNumber(m.mobileNumber) : null;
                const emailInfo = m.email ? validateEmailAddress(m.email) : null;
                return (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {m.id}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{m.name}</div>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDesig}
                          onChange={(e) => setEditDesig(e.target.value)}
                          className="mt-1 px-2 py-1 text-xs border border-slate-300 rounded w-full"
                        />
                      ) : (
                        <div className="text-slate-500">{m.designation}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editDept}
                          onChange={(e) => setEditDept(e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-300 rounded w-44"
                        />
                      ) : (
                        m.department
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-800">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editCabin}
                          onChange={(e) => setEditCabin(e.target.value)}
                          className="px-2 py-1 text-xs font-mono border border-slate-300 rounded w-28"
                        />
                      ) : (
                        m.cabin
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {isEditing ? (
                        <div className="space-y-1.5 min-w-[180px]">
                          <input
                            type="tel"
                            value={editMobile}
                            onChange={(e) => setEditMobile(e.target.value)}
                            placeholder="Mobile (e.g. +91...)"
                            className="px-2 py-1 text-xs font-mono border border-slate-300 rounded w-full"
                          />
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="Official email"
                            className="px-2 py-1 text-xs border border-slate-300 rounded w-full"
                          />
                        </div>
                      ) : phoneInfo?.valid || emailInfo?.valid ? (
                        <div className="space-y-0.5">
                          {phoneInfo?.valid && (
                            <div className="font-mono tabular-nums text-slate-800">
                              {phoneInfo.display}
                            </div>
                          )}
                          {emailInfo?.valid && (
                            <div className="text-slate-600 truncate max-w-[200px]">
                              {emailInfo.email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-700">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editLeaveUntil}
                          onChange={(e) => setEditLeaveUntil(e.target.value)}
                          className="px-2 py-1 text-xs font-mono border border-slate-300 rounded"
                        />
                      ) : m.leaveUntil ? (
                        <span className="text-rose-700 font-medium">{m.leaveUntil}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {isEditing ? (
                        <input
                          type="password"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Optional new pass"
                          className="px-2 py-1 text-xs border border-slate-300 rounded w-32"
                        />
                      ) : m.hasPassword ? (
                        'Activated'
                      ) : (
                        'Unclaimed'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(m.id)}
                            className="font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setRosterError(null);
                            }}
                            className="text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${m.name}`}
                            onClick={() => deleteFaculty(m.id)}
                            className="text-slate-400 hover:text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

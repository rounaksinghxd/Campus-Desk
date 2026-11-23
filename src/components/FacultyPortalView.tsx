import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarClock,
  Check,
  Clock,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AuthSession,
  DayOfWeek,
  DepartmentEvent,
  FacultyMember,
  MeetingRequest,
  MeetingRequestStatus,
  ScheduleSlot,
  SlotType,
} from '../types';
import {
  DAYS_OF_WEEK,
  formatTimeDisplay,
  parseTimeToMinutes,
} from '../utils/statusEngine';
import { apiFetch } from '../utils/api';
import { EventManagerPanel } from './EventManagerPanel';

interface FacultyPortalViewProps {
  faculty: FacultyMember[];
  schedules: ScheduleSlot[];
  departments: string[];
  events: DepartmentEvent[];
  session: AuthSession | null;
  onAuthenticated: (session: AuthSession) => void;
  onDirectoryRefresh: () => Promise<void>;
  onEventsChanged: () => Promise<void>;
  initialTab?: 'requests' | 'schedule' | 'events';
  initialEditEvent?: DepartmentEvent | null;
}

export const FacultyPortalView: React.FC<FacultyPortalViewProps> = ({
  faculty,
  schedules,
  departments,
  events,
  session,
  onAuthenticated,
  onDirectoryRefresh,
  onEventsChanged,
  initialTab = 'requests',
  initialEditEvent = null,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'activate'>('login');
  const [facultyIdInput, setFacultyIdInput] = useState('AC');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Authenticated workspace state
  const [portalTab, setPortalTab] = useState<'requests' | 'schedule' | 'events'>(initialTab);

  useEffect(() => {
    setPortalTab(initialTab);
  }, [initialTab]);
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<'all' | MeetingRequestStatus>('all');
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Per-request action UI state
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('15:00');
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Faculty profile & schedule editing
  const activeFaculty =
    session?.role === 'faculty'
      ? faculty.find((f) => f.id.toUpperCase() === session.facultyId?.toUpperCase()) || null
      : null;

  const [cabin, setCabin] = useState('');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveUntil, setLeaveUntil] = useState('');
  const [dutyStart, setDutyStart] = useState('09:00');
  const [dutyEnd, setDutyEnd] = useState('17:30');
  const [availabilityNote, setAvailabilityNote] = useState('');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  const [editableSlots, setEditableSlots] = useState<ScheduleSlot[]>([]);
  const [newSlotDay, setNewSlotDay] = useState<DayOfWeek>('Mon');
  const [newSlotStart, setNewSlotStart] = useState('10:00');
  const [newSlotEnd, setNewSlotEnd] = useState('11:00');
  const [newSlotType, setNewSlotType] = useState<SlotType>('Class');
  const [newSlotTitle, setNewSlotTitle] = useState('');
  const [newSlotRoom, setNewSlotRoom] = useState('');
  const [csvScheduleText, setCsvScheduleText] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);

  const selectedLoginFaculty = faculty.find(
    (f) => f.id.toUpperCase() === facultyIdInput.trim().toUpperCase()
  );

  // Auto-suggest activation if chosen ID has no password yet
  useEffect(() => {
    if (selectedLoginFaculty && !selectedLoginFaculty.hasPassword) {
      setAuthMode('activate');
    } else if (selectedLoginFaculty && selectedLoginFaculty.hasPassword) {
      setAuthMode('login');
    }
  }, [facultyIdInput, selectedLoginFaculty?.hasPassword]);

  useEffect(() => {
    if (activeFaculty) {
      setCabin(activeFaculty.cabin);
      setLeaveStart(activeFaculty.leaveStart || '');
      setLeaveUntil(activeFaculty.leaveUntil || '');
      setDutyStart(activeFaculty.dutyStart || '09:00');
      setDutyEnd(activeFaculty.dutyEnd || '17:30');
      setAvailabilityNote(activeFaculty.availabilityNote || '');
      const ownSlots = schedules
        .filter((s) => s.facultyId.toUpperCase() === activeFaculty.id.toUpperCase())
        .sort((a, b) => {
          const dayDiff = DAYS_OF_WEEK.indexOf(a.day) - DAYS_OF_WEEK.indexOf(b.day);
          return dayDiff !== 0
            ? dayDiff
            : parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
        });
      setEditableSlots(ownSlots);
    }
  }, [activeFaculty?.id, schedules]);

  const fetchFacultyRequests = async (token: string) => {
    setLoadingRequests(true);
    try {
      const res = await apiFetch('/api/faculty/me/requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      // Request list remains unchanged if offline
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (session?.role === 'faculty' && session.token) {
      fetchFacultyRequests(session.token);
    }
  }, [session?.role, session?.token]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const endpoint =
      authMode === 'activate' ? '/api/auth/faculty/activate' : '/api/auth/faculty/login';
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facultyId: facultyIdInput.trim(),
          password: passwordInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsActivation) setAuthMode('activate');
        setAuthError(data.error || 'Authentication failed.');
      } else {
        setPasswordInput('');
        await onDirectoryRefresh();
        onAuthenticated({
          role: 'faculty',
          token: data.token,
          facultyId: data.faculty.id,
          facultyName: data.faculty.name,
        });
      }
    } catch (err) {
      setAuthError(
        err instanceof Error && err.message && !err.message.includes('fetch')
          ? err.message
          : 'Network error during authentication.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRequestDecision = async (
    reqItem: MeetingRequest,
    action: 'accepted' | 'rejected' | 'rescheduled'
  ) => {
    if (!session?.token) return;
    setActionBusyId(reqItem.id);
    try {
      const res = await apiFetch(`/api/faculty/me/requests/${reqItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          action,
          rescheduledDate: action === 'rescheduled' ? rescheduleDate : undefined,
          rescheduledTime: action === 'rescheduled' ? rescheduleTime : undefined,
          facultyNote: actionNotes[reqItem.id] || '',
        }),
      });
      const data = await res.json();
      if (res.ok && data.request) {
        setRequests((prev) =>
          prev.map((r) => (r.id === reqItem.id ? data.request : r))
        );
        if (action === 'rescheduled') {
          setRescheduleTargetId(null);
        }
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;
    setProfileMsg(null);
    try {
      const res = await apiFetch('/api/faculty/me/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          cabin,
          leaveStart,
          leaveUntil,
          dutyStart,
          dutyEnd,
          availabilityNote,
        }),
      });
      if (res.ok) {
        await onDirectoryRefresh();
        setProfileMsg('Profile, cabin, and leave dates saved.');
      } else {
        const data = await res.json();
        setProfileMsg(data.error || 'Failed to update profile.');
      }
    } catch {
      setProfileMsg('Network error while updating profile.');
    }
  };

  const handleSaveSlots = async (slotsToSave: ScheduleSlot[]) => {
    if (!session?.token) return;
    setScheduleMsg(null);
    try {
      const res = await apiFetch('/api/faculty/me/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ slots: slotsToSave }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditableSlots(data.schedules);
        await onDirectoryRefresh();
        setScheduleMsg('Weekly schedule updated.');
      } else {
        setScheduleMsg(data.error || 'Failed to update schedule.');
      }
    } catch {
      setScheduleMsg('Network error while saving weekly schedule.');
    }
  };

  const handleUploadPersonalCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !csvScheduleText.trim()) return;
    setScheduleMsg(null);
    try {
      const res = await apiFetch('/api/faculty/me/schedule', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ csvText: csvScheduleText }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditableSlots(data.schedules);
        setCsvScheduleText('');
        await onDirectoryRefresh();
        setScheduleMsg(`Imported ${data.schedules.length} schedule slots from CSV.`);
      } else {
        setScheduleMsg(data.error || 'Could not import CSV schedule.');
      }
    } catch {
      setScheduleMsg('Network error while importing CSV schedule.');
    }
  };

  // Unauthenticated Login / First-Time Activation View
  if (!session || session.role !== 'faculty' || !activeFaculty) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">Faculty Portal Sign In</h1>
          <p className="text-xs text-slate-600">
            Sign in with your Unique Faculty ID and password to manage student meeting requests, cabin status, and your weekly class schedule.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setAuthError(null);
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              authMode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('activate');
              setAuthError(null);
            }}
            className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              authMode === 'activate'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            First-Time Activation
          </button>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Unique Faculty ID
            </label>
            <select
              value={facultyIdInput}
              onChange={(e) => setFacultyIdInput(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
            >
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} — {f.name} ({f.hasPassword ? 'Activated' : 'Needs Activation'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {authMode === 'activate'
                ? `Create Password for ${facultyIdInput}`
                : 'Password'}
            </label>
            <input
              type="password"
              required
              minLength={4}
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder={
                authMode === 'activate'
                  ? 'Choose a password (min. 4 chars)'
                  : 'Enter your faculty password'
              }
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {authMode === 'activate' && (
            <p className="text-xs text-slate-500">
              First-time setup securely sets your personal password for Faculty ID{' '}
              <span className="font-mono font-semibold text-slate-800">{facultyIdInput}</span>.
            </p>
          )}

          {authError && (
            <p className="text-xs font-medium text-rose-700">{authError}</p>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            {authLoading
              ? 'Verifying...'
              : authMode === 'activate'
              ? 'Activate & Sign In'
              : 'Sign In to Faculty Panel'}
          </button>
        </form>
      </div>
    );
  }

  const filteredRequests = requests.filter((r) =>
    requestFilter === 'all' ? true : r.status === requestFilter
  );

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Faculty Workspace Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            <span className="font-mono font-semibold text-slate-700">{activeFaculty.id}</span>
            <span aria-hidden="true"> · </span>
            <span>{activeFaculty.department}</span>
            <span aria-hidden="true"> · </span>
            <span>Cabin {activeFaculty.cabin}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{activeFaculty.name}</h1>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setPortalTab('requests')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              portalTab === 'requests'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meeting Requests ({pendingCount} pending)
          </button>
          <button
            type="button"
            onClick={() => setPortalTab('schedule')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              portalTab === 'schedule'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            My Schedule &amp; Leave
          </button>
          <button
            type="button"
            onClick={() => setPortalTab('events')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              portalTab === 'events'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Department Events
          </button>
        </div>
      </div>

      {portalTab === 'events' ? (
        <EventManagerPanel
          session={session}
          departments={departments}
          events={events}
          lockedDepartment={activeFaculty.department}
          defaultOrganizer={activeFaculty.name}
          initialEditEvent={initialEditEvent}
          onEventsChanged={onEventsChanged}
        />
      ) : portalTab === 'requests' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(['all', 'pending', 'accepted', 'rescheduled', 'rejected'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setRequestFilter(st)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors cursor-pointer whitespace-nowrap ${
                      requestFilter === st
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {st}
                  </button>
                )
              )}
            </div>
            <button
              type="button"
              onClick={() => fetchFacultyRequests(session.token)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Refresh inbox
            </button>
          </div>

          {loadingRequests ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              Loading meeting requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No student meeting requests in this view.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const isRescheduling = rescheduleTargetId === req.id;
                const busy = actionBusyId === req.id;
                return (
                  <div
                    key={req.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">
                            {req.trackingCode}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>Student ID: </span>
                          <span className="font-mono text-slate-700">{req.studentRoll}</span>
                          {req.studentEmail && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span>{req.studentEmail}</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {req.studentName}
                        </h3>
                      </div>

                      <div className="text-right space-y-0.5">
                        <div className="text-xs font-semibold capitalize text-slate-800">
                          Status: {req.status}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-slate-500 flex items-center justify-end gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {req.preferredDate} · {formatTimeDisplay(req.preferredTime)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                      {req.reason}
                    </p>

                    {req.status === 'rescheduled' && req.rescheduledDate && req.rescheduledTime && (
                      <div className="text-xs font-medium text-amber-800">
                        Rescheduled to{' '}
                        <span className="font-mono tabular-nums">
                          {req.rescheduledDate} at {formatTimeDisplay(req.rescheduledTime)}
                        </span>
                      </div>
                    )}

                    {/* Faculty Response Controls: Accept, Reject, Reschedule */}
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <input
                        type="text"
                        value={actionNotes[req.id] ?? req.facultyNote ?? ''}
                        onChange={(e) =>
                          setActionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="Optional note to student (e.g. Meet at Cabin or bring lab record)..."
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                      />

                      {isRescheduling && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-end gap-3">
                          <div>
                            <label className="block text-xs font-medium text-amber-900 mb-1">
                              New Date
                            </label>
                            <input
                              type="date"
                              required
                              value={rescheduleDate || req.preferredDate}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-mono bg-white border border-amber-300 rounded-md"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-900 mb-1">
                              New Time
                            </label>
                            <input
                              type="time"
                              required
                              value={rescheduleTime}
                              onChange={(e) => setRescheduleTime(e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-mono bg-white border border-amber-300 rounded-md"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRequestDecision(req, 'rescheduled')}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-700 hover:bg-amber-800 text-white rounded-md cursor-pointer"
                          >
                            Confirm Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={() => setRescheduleTargetId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRequestDecision(req, 'accepted')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRescheduleTargetId(req.id);
                            setRescheduleDate(req.rescheduledDate || req.preferredDate);
                            setRescheduleTime(req.rescheduledTime || req.preferredTime);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg transition-colors cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Reschedule</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRequestDecision(req, 'rejected')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Cabin & Leave Management */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">
              Cabin, Duty Hours &amp; Leave Dates
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cabin / Room Number
              </label>
              <input
                type="text"
                required
                value={cabin}
                onChange={(e) => setCabin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Duty Start
                </label>
                <input
                  type="time"
                  value={dutyStart}
                  onChange={(e) => setDutyStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Duty End
                </label>
                <input
                  type="time"
                  value={dutyEnd}
                  onChange={(e) => setDutyEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Leave Start (optional)
                </label>
                <input
                  type="date"
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  On Leave Until
                </label>
                <input
                  type="date"
                  value={leaveUntil}
                  onChange={(e) => setLeaveUntil(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Availability / Leave Note
              </label>
              <input
                type="text"
                value={availabilityNote}
                onChange={(e) => setAvailabilityNote(e.target.value)}
                placeholder="e.g. Conference travel or thesis advising hours"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            {profileMsg && (
              <p className="text-xs font-medium text-blue-700">{profileMsg}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Save Availability
              </button>
              {(leaveStart || leaveUntil) && (
                <button
                  type="button"
                  onClick={() => {
                    setLeaveStart('');
                    setLeaveUntil('');
                  }}
                  className="py-2.5 px-3 border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 rounded-lg cursor-pointer"
                >
                  Clear Leave
                </button>
              )}
            </div>
          </form>

          {/* Weekly Schedule Editor & Personal CSV Upload */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                My Weekly Class &amp; Meeting Schedule
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {editableSlots.length} slots
              </span>
            </div>

            {/* Add Slot Row */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
              <div className="text-xs font-medium text-slate-700">Add a Weekly Slot</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <select
                  value={newSlotDay}
                  onChange={(e) => setNewSlotDay(e.target.value as DayOfWeek)}
                  className="px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={newSlotStart}
                  onChange={(e) => setNewSlotStart(e.target.value)}
                  className="px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md"
                />
                <input
                  type="time"
                  value={newSlotEnd}
                  onChange={(e) => setNewSlotEnd(e.target.value)}
                  className="px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md"
                />
                <select
                  value={newSlotType}
                  onChange={(e) => setNewSlotType(e.target.value as SlotType)}
                  className="px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="Class">Class</option>
                  <option value="Lab">Lab</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Office Hours">Office Hours</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newSlotTitle}
                  onChange={(e) => setNewSlotTitle(e.target.value)}
                  placeholder="Subject or Meeting Title"
                  className="sm:col-span-2 px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md"
                />
                <input
                  type="text"
                  value={newSlotRoom}
                  onChange={(e) => setNewSlotRoom(e.target.value)}
                  placeholder="Room (e.g. B1 LH 2.02)"
                  className="px-2.5 py-2 text-xs font-mono bg-white border border-slate-200 rounded-md"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newSlotTitle.trim() || !newSlotRoom.trim()) {
                    setScheduleMsg('Enter both a title and room/venue before adding.');
                    return;
                  }
                  const nextSlot: ScheduleSlot = {
                    id: `${activeFaculty.id}-${Date.now()}`,
                    facultyId: activeFaculty.id,
                    day: newSlotDay,
                    startTime: newSlotStart,
                    endTime: newSlotEnd,
                    type: newSlotType,
                    title: newSlotTitle.trim(),
                    room: newSlotRoom.trim(),
                  };
                  const updated = [...editableSlots, nextSlot];
                  setNewSlotTitle('');
                  setNewSlotRoom('');
                  handleSaveSlots(updated);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add &amp; Save Slot</span>
              </button>
            </div>

            {/* Existing Slots List */}
            {editableSlots.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No classes or meetings scheduled yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                {editableSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {slot.title}
                      </div>
                      <div className="text-slate-500 font-mono tabular-nums mt-0.5">
                        {slot.day} · {formatTimeDisplay(slot.startTime)}–{formatTimeDisplay(slot.endTime)} · {slot.type} · {slot.room}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${slot.title}`}
                      onClick={() => {
                        const updated = editableSlots.filter((s) => s.id !== slot.id);
                        handleSaveSlots(updated);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-700 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Personal Schedule CSV Paste */}
            <form onSubmit={handleUploadPersonalCsv} className="pt-3 border-t border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Or Replace Schedule via CSV (rows for {activeFaculty.id})</span>
                </label>
                <label className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .csv</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      file.text().then((txt) => setCsvScheduleText(txt));
                    }}
                  />
                </label>
              </div>
              <textarea
                rows={3}
                value={csvScheduleText}
                onChange={(e) => setCsvScheduleText(e.target.value)}
                placeholder={`faculty_id,day,start_time,end_time,type,title,room\n${activeFaculty.id},Mon,10:00,11:30,Class,Course Title,B1 LH 1.02`}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                disabled={!csvScheduleText.trim()}
                className="px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 rounded-lg cursor-pointer"
              >
                Import CSV Schedule
              </button>
            </form>

            {scheduleMsg && (
              <p className="text-xs font-medium text-blue-700">{scheduleMsg}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

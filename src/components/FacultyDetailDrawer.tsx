import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Send,
  X,
} from 'lucide-react';
import {
  ClockConfig,
  DayOfWeek,
  FacultyMember,
  MeetingRequest,
  ScheduleSlot,
} from '../types';
import {
  computeFacultyStatus,
  DAY_FULL_LABELS,
  DAYS_OF_WEEK,
  formatTimeDisplay,
  parseTimeToMinutes,
  resolveEffectiveClock,
  validateEmailAddress,
  validatePhoneNumber,
} from '../utils/statusEngine';
import { apiFetch } from '../utils/api';

interface FacultyDetailDrawerProps {
  member: FacultyMember | null;
  allFaculty: FacultyMember[];
  schedules: ScheduleSlot[];
  clock: ClockConfig;
  now: Date;
  onClose: () => void;
  onSelectFaculty: (member: FacultyMember) => void;
}

export const FacultyDetailDrawer: React.FC<FacultyDetailDrawerProps> = ({
  member,
  allFaculty,
  schedules,
  clock,
  now,
  onClose,
  onSelectFaculty,
}) => {
  const effective = resolveEffectiveClock(clock, now);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(effective.day);

  // Meeting request form state
  const [studentName, setStudentName] = useState('');
  const [studentRoll, setStudentRoll] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [preferredDate, setPreferredDate] = useState(effective.dateStr);
  const [preferredTime, setPreferredTime] = useState('15:00');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<MeetingRequest | null>(null);

  useEffect(() => {
    setSelectedDay(effective.day);
    setPreferredDate(effective.dateStr);
    setSubmittedRequest(null);
    setErrorMsg(null);
  }, [member?.id, effective.day, effective.dateStr]);

  if (!member) return null;

  const status = computeFacultyStatus(member, schedules, clock, now);
  const phoneInfo = member.mobileNumber ? validatePhoneNumber(member.mobileNumber) : null;
  const emailInfo = member.email ? validateEmailAddress(member.email) : null;
  const hasPhone = Boolean(phoneInfo?.valid);
  const hasEmail = Boolean(emailInfo?.valid);

  const daySlots = schedules
    .filter(
      (s) => s.facultyId.toUpperCase() === member.id.toUpperCase() && s.day === selectedDay
    )
    .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facultyId: member.id,
          studentName,
          studentRoll,
          studentEmail,
          preferredDate,
          preferredTime,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not submit meeting request.');
      } else {
        setSubmittedRequest(data.request);
        setReason('');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message && !err.message.includes('fetch')
          ? err.message
          : 'Network error while sending request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Schedule and meeting request for ${member.name}`}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-xl bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
        {/* Sticky Drawer Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-800">{member.id}</span>
              <span aria-hidden="true">·</span>
              <span>{member.department}</span>
              <span aria-hidden="true">·</span>
              <span>{member.designation}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 truncate">{member.name}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-7 flex-1">
          {/* Quick Faculty Switcher if needed */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>Cabin:</span>
                <span className="font-mono font-semibold text-slate-900">{member.cabin}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Duty hours {formatTimeDisplay(member.dutyStart)} – {formatTimeDisplay(member.dutyEnd)}
                </span>
              </div>
            </div>

            <select
              aria-label="Switch faculty member"
              value={member.id}
              onChange={(e) => {
                const found = allFaculty.find((f) => f.id === e.target.value);
                if (found) onSelectFaculty(found);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-blue-600 cursor-pointer"
            >
              {allFaculty.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id} — {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Live / Demo Status Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <div className="text-xs font-medium text-slate-500">
              Status on {DAY_FULL_LABELS[effective.day]} at {formatTimeDisplay(effective.timeStr)}
            </div>
            <div className="text-base font-semibold text-slate-900">{status.headline}</div>
            <p className="text-sm text-slate-600">{status.subline}</p>
          </div>

          {/* Direct Contact Actions */}
          {(hasPhone || hasEmail) && (
            <section className="space-y-2.5" aria-label="Direct Contact">
              <h3 className="text-sm font-semibold text-slate-900">Direct Contact</h3>
              <div
                className={`grid gap-2.5 ${
                  hasPhone && hasEmail ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {hasPhone && phoneInfo && (
                  <a
                    href={phoneInfo.telHref}
                    aria-label="Call Faculty"
                    className="flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] bg-white border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 rounded-xl transition-colors"
                  >
                    <Phone className="w-4 h-4 text-blue-700 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">Call Faculty</div>
                      <div className="text-xs font-mono tabular-nums text-slate-600 truncate">
                        {phoneInfo.display}
                      </div>
                    </div>
                  </a>
                )}
                {hasEmail && emailInfo && (
                  <a
                    href={emailInfo.mailtoHref}
                    aria-label="Send Email"
                    className="flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] bg-white border border-slate-200 hover:border-blue-600 hover:bg-blue-50/40 rounded-xl transition-colors"
                  >
                    <Mail className="w-4 h-4 text-blue-700 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">Send Email</div>
                      <div className="text-xs text-slate-600 truncate">{emailInfo.email}</div>
                    </div>
                  </a>
                )}
              </div>
            </section>
          )}

          {/* Day Schedule Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Schedule for {DAY_FULL_LABELS[selectedDay]}
              </h3>
              <div className="flex items-center gap-1 overflow-x-auto">
                {DAYS_OF_WEEK.map((d) => {
                  const active = d === selectedDay;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDay(d)}
                      className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {daySlots.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center text-sm text-slate-500">
                No classes or meetings scheduled for {DAY_FULL_LABELS[selectedDay]}.
                {member.workingDays.includes(selectedDay)
                  ? ` Available in Cabin ${member.cabin} during duty hours.`
                  : ' Off duty.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {daySlots.map((slot) => {
                  const isCurrentSlot =
                    status.activeSlot && status.activeSlot.id === slot.id && selectedDay === effective.day;
                  return (
                    <div
                      key={slot.id}
                      className={`p-3.5 flex items-start justify-between gap-4 ${
                        isCurrentSlot ? 'bg-blue-50/70' : 'bg-white'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-slate-600">{slot.type}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-700">{slot.room}</span>
                          {isCurrentSlot && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-blue-700">
                                Current Slot
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-medium text-slate-900">
                          {slot.title}
                        </div>
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-700 shrink-0 pt-0.5">
                        {formatTimeDisplay(slot.startTime)} – {formatTimeDisplay(slot.endTime)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Student Meeting Request Form */}
          <section className="pt-5 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Request a Meeting
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Send a meeting request directly to {member.name}. The faculty member can accept, reject, or reschedule your slot.
              </p>
            </div>

            {submittedRequest ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Meeting request sent</span>
                </div>
                <p className="text-xs text-emerald-800">
                  Tracking Code:{' '}
                  <span className="font-mono font-semibold">{submittedRequest.trackingCode}</span>
                  {' · '}Student ID:{' '}
                  <span className="font-mono font-semibold">{submittedRequest.studentRoll}</span>
                </p>
                <p className="text-xs text-emerald-700">
                  Use the Track Request tab anytime with your Student ID or Tracking Code to see whether it was accepted, rejected, or rescheduled.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmittedRequest(null)}
                  className="text-xs font-medium text-emerald-900 underline cursor-pointer pt-1"
                >
                  Send another request
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitRequest} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g. Rounak Singh"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Student Roll / ID
                    </label>
                    <input
                      type="text"
                      required
                      value={studentRoll}
                      onChange={(e) => setStudentRoll(e.target.value)}
                      placeholder="e.g. CSE2024-018"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Preferred Date
                    </label>
                    <input
                      type="date"
                      required
                      value={preferredDate}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Preferred Time
                    </label>
                    <input
                      type="time"
                      required
                      value={preferredTime}
                      onChange={(e) => setPreferredTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      placeholder="you@campus.edu"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Specific Reason for Meeting
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly describe your project, course doubt, or advising topic..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 resize-none"
                  />
                </div>

                {errorMsg && (
                  <p className="text-xs font-medium text-rose-700">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'Sending Request...' : 'Send Meeting Request'}</span>
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

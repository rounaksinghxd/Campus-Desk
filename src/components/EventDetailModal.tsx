import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { AuthSession, DepartmentEvent, EventRegistrationStatus } from '../types';
import { openExternalUrl } from '../utils/api';
import { formatTimeDisplay } from '../utils/statusEngine';

interface EventDetailModalProps {
  event: DepartmentEvent | null;
  session: AuthSession | null;
  userDepartment?: string;
  onClose: () => void;
  onEdit?: (event: DepartmentEvent) => void;
  onDelete?: (event: DepartmentEvent) => void;
}

export const EVENT_STATUS_META: Record<
  EventRegistrationStatus,
  { label: string; textClass: string; surfaceClass: string }
> = {
  open: {
    label: 'Registration Open',
    textClass: 'text-emerald-800',
    surfaceClass: 'bg-emerald-50 border-emerald-200',
  },
  upcoming: {
    label: 'Upcoming',
    textClass: 'text-blue-800',
    surfaceClass: 'bg-blue-50 border-blue-200',
  },
  closed: {
    label: 'Registration Closed',
    textClass: 'text-amber-800',
    surfaceClass: 'bg-amber-50 border-amber-200',
  },
  completed: {
    label: 'Completed',
    textClass: 'text-slate-600',
    surfaceClass: 'bg-slate-100 border-slate-200',
  },
};

export function formatEventDateLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  session,
  userDepartment,
  onClose,
  onEdit,
  onDelete,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!event) return null;

  const statusMeta = EVENT_STATUS_META[event.registrationStatus];
  const canManage =
    session?.role === 'admin' ||
    (session?.role === 'faculty' &&
      ((userDepartment &&
        userDepartment.toLowerCase() === event.department.toLowerCase()) ||
        (session.facultyId && event.createdById === session.facultyId)));

  const safeRegHref =
    event.registrationLink &&
    /^https?:\/\//i.test(event.registrationLink.trim())
      ? event.registrationLink.trim()
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-xl overflow-y-auto flex flex-col">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">{event.category}</span>
              <span aria-hidden="true">·</span>
              <span>{event.department}</span>
              {event.isDemo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    Sample Demo Data
                  </span>
                </>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">
              {event.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close event details"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Optional Banner */}
          {event.bannerImage && !imgFailed && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-[16/9]">
              <img
                src={event.bannerImage}
                alt={`${event.title} banner`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Status & Registration Box */}
          <div
            className={`rounded-lg border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${statusMeta.surfaceClass}`}
          >
            <div>
              <div className={`text-xs font-semibold ${statusMeta.textClass}`}>
                Event Status: {statusMeta.label}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {event.registrationStatus === 'open'
                  ? 'Registrations are currently open for eligible participants.'
                  : event.registrationStatus === 'upcoming'
                  ? 'Event announced; registration details will open soon or walk-ins are welcome.'
                  : event.registrationStatus === 'closed'
                  ? 'Registration window has closed for this event.'
                  : 'This event has already concluded.'}
              </p>
            </div>

            {safeRegHref && (
              <a
                href={safeRegHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  void openExternalUrl(safeRegHref, e);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Register Externally</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Full Description */}
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-900">About This Event</h3>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {event.description}
            </p>
          </div>

          {/* Structured Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500">Event Date</div>
                <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                  {formatEventDateLabel(event.eventDate)} ({event.eventDate})
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500">Time</div>
                <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                  {formatTimeDisplay(event.startTime)} – {formatTimeDisplay(event.endTime)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500">Venue / Room</div>
                <div className="font-medium text-slate-900 mt-0.5">{event.venue}</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500">Organized By</div>
                <div className="font-medium text-slate-900 mt-0.5">{event.organizer}</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 sm:col-span-2 pt-2 border-t border-slate-200">
              <Building2 className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <div className="text-slate-500">Department</div>
                <div className="font-medium text-slate-900 mt-0.5">{event.department}</div>
              </div>
            </div>
          </div>

          {/* Authorized Coordinator / Admin Quick Actions */}
          {canManage && (onEdit || onDelete) && (
            <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Coordinator actions available for your signed-in role.
              </span>
              <div className="flex items-center gap-2">
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Event</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(event)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

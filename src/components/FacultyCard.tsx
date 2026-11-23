import React from 'react';
import {
  BookOpen,
  CalendarOff,
  ChevronRight,
  DoorOpen,
  Mail,
  MapPin,
  Moon,
  Phone,
  Users,
} from 'lucide-react';
import { FacultyLiveState, FacultyMember, FacultyStatusInfo } from '../types';
import { validateEmailAddress, validatePhoneNumber } from '../utils/statusEngine';

interface FacultyCardProps {
  member: FacultyMember;
  status: FacultyStatusInfo;
  onSelect: (member: FacultyMember) => void;
}

const STATE_STYLES: Record<
  FacultyLiveState,
  {
    text: string;
    surface: string;
    icon: React.FC<{ className?: string }>;
  }
> = {
  in_class: {
    text: 'text-emerald-800',
    surface: 'bg-emerald-50 border-emerald-200',
    icon: BookOpen,
  },
  in_meeting: {
    text: 'text-amber-800',
    surface: 'bg-amber-50 border-amber-200',
    icon: Users,
  },
  on_leave: {
    text: 'text-rose-800',
    surface: 'bg-rose-50 border-rose-200',
    icon: CalendarOff,
  },
  free_cabin: {
    text: 'text-blue-800',
    surface: 'bg-blue-50 border-blue-200',
    icon: DoorOpen,
  },
  off_duty: {
    text: 'text-slate-600',
    surface: 'bg-slate-50 border-slate-200',
    icon: Moon,
  },
};

export const FacultyCard: React.FC<FacultyCardProps> = ({
  member,
  status,
  onSelect,
}) => {
  const style = STATE_STYLES[status.state];
  const StatusIcon = style.icon;

  const phoneInfo = member.mobileNumber ? validatePhoneNumber(member.mobileNumber) : null;
  const emailInfo = member.email ? validateEmailAddress(member.email) : null;
  const hasPhone = Boolean(phoneInfo?.valid);
  const hasEmail = Boolean(emailInfo?.valid);

  return (
    <article className="group w-full bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-5 transition-colors flex flex-col justify-between gap-3.5">
      <button
        type="button"
        onClick={() => onSelect(member)}
        className="text-left w-full space-y-2.5 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        {/* Quiet unboxed metadata line */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <div className="truncate">
            <span className="font-mono font-medium text-slate-700">{member.id}</span>
            <span aria-hidden="true"> · </span>
            <span>{member.department}</span>
          </div>
          <span className="shrink-0 text-slate-400">{member.roleType}</span>
        </div>

        {/* Name & Designation */}
        <div>
          <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
            {member.name}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">{member.designation}</p>
        </div>

        {/* Cabin Location */}
        <div className="flex items-center gap-1.5 text-xs text-slate-700 pt-0.5">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500">Cabin</span>
          <span className="font-mono font-medium text-slate-900 tabular-nums">
            {member.cabin}
          </span>
        </div>
      </button>

      {/* Direct Contact Actions (only rendered when valid phone or email exists) */}
      {(hasPhone || hasEmail) && (
        <div
          className="w-full space-y-1.5 pt-2.5 border-t border-slate-100"
          aria-label="Direct Contact"
        >
          {hasPhone && phoneInfo && (
            <a
              href={phoneInfo.telHref}
              aria-label={`Call ${member.name} at ${phoneInfo.display}`}
              title={`Call ${member.name}`}
              className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-300 text-slate-700 hover:text-blue-800 transition-colors text-xs font-medium"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <Phone className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span className="font-semibold text-slate-900 shrink-0">Call</span>
                <span className="font-mono tabular-nums text-slate-600 truncate">
                  {phoneInfo.display}
                </span>
              </span>
            </a>
          )}
          {hasEmail && emailInfo && (
            <a
              href={emailInfo.mailtoHref}
              aria-label={`Email ${member.name} at ${emailInfo.email}`}
              title={`Email ${member.name}`}
              className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-300 text-slate-700 hover:text-blue-800 transition-colors text-xs font-medium"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span className="font-semibold text-slate-900 shrink-0">Email</span>
                <span className="text-slate-600 truncate">{emailInfo.email}</span>
              </span>
            </a>
          )}
        </div>
      )}

      {/* Live Status Footer */}
      <button
        type="button"
        onClick={() => onSelect(member)}
        className="text-left w-full space-y-3 pt-3 border-t border-slate-100 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <div className={`rounded-lg border px-3 py-2.5 ${style.surface}`}>
          <div className={`flex items-center gap-2 text-xs font-semibold ${style.text}`}>
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{status.headline}</span>
          </div>
          <p className="text-xs text-slate-600 mt-1 line-clamp-1">{status.subline}</p>
        </div>

        <div className="flex items-center justify-between text-xs font-medium text-slate-500 group-hover:text-slate-900 transition-colors">
          <span>Schedule &amp; meeting request</span>
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>
    </article>
  );
};

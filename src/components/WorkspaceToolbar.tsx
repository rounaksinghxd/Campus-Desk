import React from 'react';
import { Calendar, Clock, Search, X } from 'lucide-react';
import { ClockConfig, FacultyLiveState } from '../types';
import {
  DAY_FULL_LABELS,
  formatTimeDisplay,
  resolveEffectiveClock,
} from '../utils/statusEngine';

interface WorkspaceToolbarProps {
  departments: string[];
  selectedDepartment: string;
  onSelectDepartment: (dept: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: 'all' | FacultyLiveState;
  onStatusFilterChange: (s: 'all' | FacultyLiveState) => void;
  statusCounts: Record<'all' | FacultyLiveState, number>;
  clock: ClockConfig;
  onClockChange: (next: ClockConfig) => void;
  now: Date;
}

const DEMO_PRESETS = [
  { label: 'Mon 10:15 · Classes', dateStr: '2026-11-23', timeStr: '10:15' },
  { label: 'Wed 14:30 · Conf. Hall', dateStr: '2026-11-25', timeStr: '14:30' },
  { label: 'Sat 10:30 · Weekend', dateStr: '2026-11-21', timeStr: '10:30' },
  { label: 'Fri 19:00 · Off Duty', dateStr: '2026-11-27', timeStr: '19:00' },
];

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
  departments,
  selectedDepartment,
  onSelectDepartment,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  clock,
  onClockChange,
  now,
}) => {
  const effective = resolveEffectiveClock(clock, now);

  const filterTabs: Array<{ id: 'all' | FacultyLiveState; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'in_class', label: 'Taking Class' },
    { id: 'in_meeting', label: 'In Meeting' },
    { id: 'free_cabin', label: 'Free in Cabin' },
    { id: 'on_leave', label: 'On Leave' },
    { id: 'off_duty', label: 'Off Duty' },
  ];

  return (
    <section className="space-y-5">
      {/* Page Title & Demo Clock Row */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-1 max-w-xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
            Faculty &amp; Staff Availability Directory
          </h1>
          <p className="text-sm text-slate-600">
            Select a department or search by name, ID, or cabin number to check live class, meeting, and leave statuses.
          </p>
        </div>

        {/* Demo Clock Panel */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={clock.useLiveTime}
                onChange={(e) =>
                  onClockChange({
                    ...clock,
                    useLiveTime: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-blue-600 cursor-pointer"
              />
              <span>Use live time</span>
            </label>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {DAY_FULL_LABELS[effective.day]} · {effective.dateStr} · {formatTimeDisplay(effective.timeStr)}
              </span>
            </div>
          </div>

          {!clock.useLiveTime && (
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    aria-label="Demo date"
                    value={clock.dateStr}
                    onChange={(e) =>
                      onClockChange({
                        ...clock,
                        dateStr: e.target.value || clock.dateStr,
                      })
                    }
                    className="text-xs font-mono tabular-nums text-slate-800 focus:outline-none bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="time"
                    aria-label="Demo time"
                    value={clock.timeStr}
                    onChange={(e) =>
                      onClockChange({
                        ...clock,
                        timeStr: e.target.value || clock.timeStr,
                      })
                    }
                    className="text-xs font-mono tabular-nums text-slate-800 focus:outline-none bg-transparent"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DEMO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onClockChange({
                        useLiveTime: false,
                        dateStr: preset.dateStr,
                        timeStr: preset.timeStr,
                      })
                    }
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-400 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Department Tabs + Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search faculty or staff by name, ID (e.g. AC), designation, room (B2 LG 0.7), or department..."
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Department Dropdown for rapid switching */}
          <div className="sm:w-64 shrink-0">
            <select
              aria-label="Filter by department"
              value={selectedDepartment}
              onChange={(e) => onSelectDepartment(e.target.value)}
              className="w-full py-2.5 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
            >
              <option value="All">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Segmented Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {filterTabs.map((tab) => {
            const active = statusFilter === tab.id;
            const count = statusCounts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onStatusFilterChange(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono tabular-nums ${
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

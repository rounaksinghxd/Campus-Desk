import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Calendar,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Plus,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { AuthSession, DepartmentEvent, EventCategory } from '../types';
import { formatTimeDisplay } from '../utils/statusEngine';
import {
  EVENT_STATUS_META,
  EventDetailModal,
  formatEventDateLabel,
} from './EventDetailModal';
import { EVENT_CATEGORIES } from './EventManagerPanel';

interface DepartmentEventsViewProps {
  departments: string[];
  session: AuthSession | null;
  userDepartment?: string;
  onNavigateManage: (editTarget?: DepartmentEvent) => void;
}

export const DepartmentEventsView: React.FC<DepartmentEventsViewProps> = ({
  departments: directoryDepartments,
  session,
  userDepartment,
  onNavigateManage,
}) => {
  const [events, setEvents] = useState<DepartmentEvent[]>([]);
  const [apiDepartments, setApiDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<'All' | EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [registrationOpenOnly, setRegistrationOpenOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedEvent, setSelectedEvent] = useState<DepartmentEvent | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error('Failed to load department events');
      const data = await res.json();
      setEvents(data.events || []);
      if (Array.isArray(data.departments)) {
        setApiDepartments(data.departments);
      }
    } catch {
      setError('Unable to load department events right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const dynamicDepartments = useMemo(() => {
    const merged = new Set([...directoryDepartments, ...apiDepartments]);
    return Array.from(merged).sort();
  }, [directoryDepartments, apiDepartments]);

  const departmentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ev of events) {
      map[ev.department] = (map[ev.department] || 0) + 1;
    }
    return map;
  }, [events]);

  const filteredEvents = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const q = searchQuery.trim().toLowerCase();

    return events
      .filter((ev) => {
        if (selectedDepartment !== 'All' && ev.department !== selectedDepartment) {
          return false;
        }
        if (selectedCategory !== 'All' && ev.category !== selectedCategory) {
          return false;
        }
        if (upcomingOnly) {
          if (ev.registrationStatus === 'completed' || ev.eventDate < todayStr) {
            return false;
          }
        }
        if (registrationOpenOnly && ev.registrationStatus !== 'open') {
          return false;
        }
        if (q) {
          return (
            ev.title.toLowerCase().includes(q) ||
            ev.description.toLowerCase().includes(q) ||
            ev.venue.toLowerCase().includes(q) ||
            ev.organizer.toLowerCase().includes(q) ||
            ev.department.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const cmp = `${a.eventDate}T${a.startTime}`.localeCompare(
          `${b.eventDate}T${b.startTime}`
        );
        return sortOrder === 'desc' ? -cmp : cmp;
      });
  }, [
    events,
    selectedDepartment,
    selectedCategory,
    upcomingOnly,
    registrationOpenOnly,
    searchQuery,
    sortOrder,
  ]);

  const handleDeleteFromModal = async (ev: DepartmentEvent) => {
    if (!session?.token) return;
    const res = await fetch(`/api/events/${encodeURIComponent(ev.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (res.ok) {
      setSelectedEvent(null);
      await loadEvents();
    }
  };

  const hasDemoEvents = filteredEvents.some((e) => e.isDemo);

  return (
    <div className="space-y-6">
      {/* Header & Department Selection Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Department Events
            </h1>
            <p className="text-sm text-slate-600">
              Browse seminars, technical talks, workshops, hackathons, and campus competitions organized by university departments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <select
              aria-label="Select department for events"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="py-2.5 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer min-w-56"
            >
              <option value="All">All Departments ({events.length})</option>
              {dynamicDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept} ({departmentCounts[dept] || 0})
                </option>
              ))}
            </select>

            {session && (
              <button
                type="button"
                onClick={() => onNavigateManage()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manage Events</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Department Selector Strip */}
        {dynamicDepartments.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedDepartment('All')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedDepartment === 'All'
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Departments ({events.length})
            </button>
            {dynamicDepartments.map((dept) => {
              const active = selectedDepartment === dept;
              const count = departmentCounts[dept] || 0;
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDepartment(dept)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {dept} <span className="font-mono tabular-nums opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Search, Category & Quick Filters Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events by title, venue, or organizer..."
              className="w-full pl-10 pr-9 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear event search"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setUpcomingOnly((v) => !v)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                upcomingOnly
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Upcoming only
            </button>

            <button
              type="button"
              onClick={() => setRegistrationOpenOnly((v) => !v)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                registrationOpenOnly
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Registration open
            </button>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>Date: {sortOrder === 'asc' ? 'Earliest' : 'Latest'}</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {EVENT_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Clear Demo Data Notice (when demo sample events are visible) */}
      {!loading && !error && hasDemoEvents && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
          <span>
            Events labeled <strong>Sample Demo</strong> are prototype examples. Admins and Faculty Coordinators can replace or clear them from the portal.
          </span>
        </div>
      )}

      {/* Events Grid States */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3"
            >
              <div className="h-3 w-32 bg-slate-200 rounded" />
              <div className="h-5 w-3/4 bg-slate-200 rounded" />
              <div className="h-12 w-full bg-slate-100 rounded" />
              <div className="h-14 w-full bg-slate-100 rounded-lg mt-4" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-rose-700 font-medium">{error}</p>
          <button
            type="button"
            onClick={loadEvents}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-800">
            {selectedDepartment !== 'All'
              ? `No events found for ${selectedDepartment} with the current filters.`
              : 'No department events match your current filters.'}
          </p>
          <p className="text-xs text-slate-500">
            Try clearing your search, disabling "Upcoming only", or viewing All Departments.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedDepartment('All');
              setSelectedCategory('All');
              setSearchQuery('');
              setUpcomingOnly(false);
              setRegistrationOpenOnly(false);
            }}
            className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
          >
            Show All Events
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEvents.map((ev) => {
            const st = EVENT_STATUS_META[ev.registrationStatus];
            const safeRegHref =
              ev.registrationLink && /^https?:\/\//i.test(ev.registrationLink.trim())
                ? ev.registrationLink.trim()
                : null;

            return (
              <article
                key={ev.id}
                className="bg-white border border-slate-200 hover:border-slate-400 rounded-xl overflow-hidden transition-colors flex flex-col justify-between"
              >
                <div>
                  {ev.bannerImage && (
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      className="block w-full aspect-[16/9] bg-slate-100 border-b border-slate-200 overflow-hidden cursor-pointer"
                    >
                      <img
                        src={ev.bannerImage}
                        alt={`${ev.title} banner`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  )}

                  <div className="p-5 space-y-3">
                    {/* Category & Demo Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-md">
                        {ev.category}
                      </span>
                      {ev.isDemo && (
                        <span className="font-mono text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Sample Demo
                        </span>
                      )}
                    </div>

                    {/* Title & Department */}
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                      className="text-left block w-full group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                        {ev.title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">{ev.department}</p>
                    </button>

                    {/* Short Description */}
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {ev.description}
                    </p>

                    {/* Schedule & Venue Metadata */}
                    <div className="space-y-1.5 pt-1 text-xs text-slate-700">
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatEventDateLabel(ev.eventDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {formatTimeDisplay(ev.startTime)} – {formatTimeDisplay(ev.endTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{ev.venue}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{ev.organizer}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Registration Status & Actions */}
                <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border ${st.surfaceClass} ${st.textClass}`}
                    >
                      {st.label}
                    </span>

                    {safeRegHref && ev.registrationStatus !== 'completed' && (
                      <a
                        href={safeRegHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap"
                      >
                        <span>Register</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 pt-1 cursor-pointer"
                  >
                    <span>View full event details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EventDetailModal
        event={selectedEvent}
        session={session}
        userDepartment={userDepartment}
        onClose={() => setSelectedEvent(null)}
        onEdit={(ev) => {
          setSelectedEvent(null);
          onNavigateManage(ev);
        }}
        onDelete={handleDeleteFromModal}
      />
    </div>
  );
};

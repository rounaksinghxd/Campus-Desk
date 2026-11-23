import React, { useEffect, useState } from 'react';
import {
  Calendar,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  AuthSession,
  DepartmentEvent,
  EventCategory,
  EventRegistrationStatus,
} from '../types';
import { formatTimeDisplay } from '../utils/statusEngine';
import { EVENT_STATUS_META } from './EventDetailModal';

export const EVENT_CATEGORIES: EventCategory[] = [
  'Seminar',
  'Technical Talk',
  'Workshop',
  'Hackathon',
  'Competition',
  'Cultural Event',
  'Webinar',
  'Other',
];

interface EventManagerPanelProps {
  session: AuthSession;
  departments: string[];
  events: DepartmentEvent[];
  lockedDepartment?: string; // Set when a faculty coordinator manages their department
  defaultOrganizer?: string;
  initialEditEvent?: DepartmentEvent | null;
  onEventsChanged: () => Promise<void>;
}

export const EventManagerPanel: React.FC<EventManagerPanelProps> = ({
  session,
  departments,
  events,
  lockedDepartment,
  defaultOrganizer = '',
  initialEditEvent = null,
  onEventsChanged,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState(
    lockedDepartment || departments[0] || 'Computer Science & Eng.'
  );
  const [category, setCategory] = useState<EventCategory>('Seminar');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [venue, setVenue] = useState('');
  const [organizer, setOrganizer] = useState(defaultOrganizer);
  const [registrationStatus, setRegistrationStatus] =
    useState<EventRegistrationStatus>('open');
  const [registrationLink, setRegistrationLink] = useState('');
  const [bannerImage, setBannerImage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDepartment(lockedDepartment || departments[0] || 'Computer Science & Eng.');
    setCategory('Seminar');
    setEventDate(new Date().toISOString().slice(0, 10));
    setStartTime('10:00');
    setEndTime('12:00');
    setVenue('');
    setOrganizer(defaultOrganizer);
    setRegistrationStatus('open');
    setRegistrationLink('');
    setBannerImage('');
  };

  const loadIntoForm = (ev: DepartmentEvent) => {
    setEditingId(ev.id);
    setTitle(ev.title);
    setDescription(ev.description);
    setDepartment(ev.department);
    setCategory(ev.category);
    setEventDate(ev.eventDate);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime);
    setVenue(ev.venue);
    setOrganizer(ev.organizer);
    setRegistrationStatus(ev.registrationStatus);
    setRegistrationLink(ev.registrationLink || '');
    setBannerImage(ev.bannerImage || '');
    setFeedback(null);
  };

  useEffect(() => {
    if (initialEditEvent) {
      loadIntoForm(initialEditEvent);
    }
  }, [initialEditEvent?.id]);

  const handleBannerUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'err', text: 'Please select a valid image file (PNG, JPG, WebP).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1200;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setBannerImage(compressed);
        setFeedback(null);
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const payload = {
      title,
      description,
      department: lockedDepartment || department,
      category,
      eventDate,
      startTime,
      endTime,
      venue,
      organizer,
      registrationStatus,
      registrationLink,
      bannerImage,
    };

    try {
      const url = editingId ? `/api/events/${encodeURIComponent(editingId)}` : '/api/events';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not save event.' });
      } else {
        await onEventsChanged();
        setFeedback({
          type: 'ok',
          text: editingId
            ? `Updated "${data.event.title}".`
            : `Published "${data.event.title}".`,
        });
        resetForm();
      }
    } catch {
      setFeedback({ type: 'err', text: 'Network error while saving event.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ev: DepartmentEvent) => {
    setFeedback(null);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(ev.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Could not delete event.' });
      } else {
        if (editingId === ev.id) resetForm();
        await onEventsChanged();
        setFeedback({ type: 'ok', text: `Deleted "${ev.title}".` });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Network error while deleting event.' });
    }
  };

  const handleClearDemoEvents = async () => {
    setFeedback(null);
    try {
      const res = await fetch('/api/events/demo/clear', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (res.ok) {
        await onEventsChanged();
        setFeedback({
          type: 'ok',
          text: `Removed ${data.removedCount} sample demo event(s).`,
        });
      }
    } catch {
      setFeedback({ type: 'err', text: 'Could not clear demo events.' });
    }
  };

  const manageableEvents = lockedDepartment
    ? events.filter(
        (e) =>
          e.department.toLowerCase() === lockedDepartment.toLowerCase() ||
          (session.facultyId && e.createdById === session.facultyId)
      )
    : events;

  const hasDemoEvents = events.some((e) => e.isDemo);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Create / Edit Event Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? 'Edit Department Event' : 'Create Department Event'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Event Title
          </label>
          <input
            type="text"
            required
            minLength={3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Robotics & Embedded Systems Symposium"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Department
            </label>
            {lockedDepartment ? (
              <input
                type="text"
                readOnly
                value={lockedDepartment}
                className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
              />
            ) : (
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as EventCategory)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
            >
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Event Date
            </label>
            <input
              type="date"
              required
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Start Time
            </label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              End Time
            </label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Venue / Room
            </label>
            <input
              type="text"
              required
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Conference Hall A"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Organizer
            </label>
            <input
              type="text"
              required
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="e.g. CSE Dept. / IEEE Student Branch"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Registration Status
            </label>
            <select
              value={registrationStatus}
              onChange={(e) =>
                setRegistrationStatus(e.target.value as EventRegistrationStatus)
              }
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600 cursor-pointer"
            >
              <option value="open">Registration Open</option>
              <option value="upcoming">Upcoming</option>
              <option value="closed">Registration Closed</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Registration Link (optional)
            </label>
            <input
              type="url"
              value={registrationLink}
              onChange={(e) => setRegistrationLink(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Full Event Description
          </label>
          <textarea
            required
            minLength={10}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe agenda, target audience, speakers, and prerequisites..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 resize-none"
          />
        </div>

        {/* Banner Image Upload or URL */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">
              Event Banner (optional)
            </label>
            <label className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer">
              <ImagePlus className="w-3.5 h-3.5" />
              <span>Upload Image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBannerUpload(f);
                }}
              />
            </label>
          </div>
          <input
            type="text"
            value={bannerImage.startsWith('data:') ? '' : bannerImage}
            onChange={(e) => setBannerImage(e.target.value)}
            placeholder={
              bannerImage.startsWith('data:')
                ? 'Uploaded image attached below'
                : 'Or paste an image URL (https://...)'
            }
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
          {bannerImage && (
            <div className="relative rounded-lg overflow-hidden border border-slate-200 aspect-[16/9] bg-slate-100">
              <img
                src={bannerImage}
                alt="Event banner preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                aria-label="Remove banner image"
                onClick={() => setBannerImage('')}
                className="absolute top-2 right-2 p-1 bg-white/90 hover:bg-white text-slate-700 rounded-md border border-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {feedback && (
          <p
            className={`text-xs font-medium ${
              feedback.type === 'err' ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>
            {submitting
              ? 'Saving...'
              : editingId
              ? 'Save Event Changes'
              : 'Publish Department Event'}
          </span>
        </button>
      </form>

      {/* Managed Events List */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {lockedDepartment
                ? `${lockedDepartment} Events (${manageableEvents.length})`
                : `All Department Events (${manageableEvents.length})`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Only signed-in admins and department faculty coordinators can create, edit, or delete events.
            </p>
          </div>

          {session.role === 'admin' && hasDemoEvents && (
            <button
              type="button"
              onClick={handleClearDemoEvents}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Clear Demo Events
            </button>
          )}
        </div>

        {manageableEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No events published yet. Use the form on the left to add an event.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {manageableEvents.map((ev) => {
              const st = EVENT_STATUS_META[ev.registrationStatus];
              return (
                <div
                  key={ev.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{ev.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ev.department}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-medium ${st.textClass}`}>{st.label}</span>
                      {ev.isDemo && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-amber-800">Demo Data</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {ev.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {ev.eventDate} · {formatTimeDisplay(ev.startTime)}–{formatTimeDisplay(ev.endTime)}
                      </span>
                      <span>{ev.venue}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => loadIntoForm(ev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${ev.title}`}
                      onClick={() => handleDelete(ev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

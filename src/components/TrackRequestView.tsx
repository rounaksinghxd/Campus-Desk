import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import { MeetingRequest, MeetingRequestStatus } from '../types';
import { formatTimeDisplay } from '../utils/statusEngine';

const STATUS_BADGE: Record<
  MeetingRequestStatus,
  { label: string; colorClass: string; icon: React.FC<{ className?: string }> }
> = {
  pending: {
    label: 'Pending Faculty Review',
    colorClass: 'text-slate-700 bg-slate-100 border-slate-200',
    icon: Clock,
  },
  accepted: {
    label: 'Accepted',
    colorClass: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    icon: CheckCircle2,
  },
  rescheduled: {
    label: 'Rescheduled',
    colorClass: 'text-amber-800 bg-amber-50 border-amber-200',
    icon: CalendarClock,
  },
  rejected: {
    label: 'Declined',
    colorClass: 'text-rose-800 bg-rose-50 border-rose-200',
    icon: XCircle,
  },
};

export const TrackRequestView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MeetingRequest[] | null>(null);

  const runLookup = async (lookupValue: string) => {
    const trimmed = lookupValue.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/track?query=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not look up requests.');
        setResults(null);
      } else {
        setResults(data.requests || []);
      }
    } catch {
      setError('Network error while checking request status.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runLookup(query);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Track Student Meeting Requests
          </h1>
          <p className="text-sm text-slate-600">
            Enter your Student Roll / ID or Tracking Code to check whether a faculty member accepted, rescheduled, or declined your meeting request.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Student ID (e.g. CSE2023-042) or Code (e.g. REQ-1001)"
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? 'Searching...' : 'Check Status'}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Try sample lookups:</span>
          {['CSE2023-042', 'CSE2024-019', 'REQ-1003'].map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setQuery(sample);
                runLookup(sample);
              }}
              className="font-mono px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors cursor-pointer"
            >
              {sample}
            </button>
          ))}
        </div>

        {error && <p className="text-xs font-medium text-rose-700">{error}</p>}
      </div>

      {results !== null && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No meeting requests found matching <span className="font-mono font-semibold text-slate-800">{query}</span>.
            </div>
          ) : (
            results.map((req) => {
              const badge = STATUS_BADGE[req.status];
              const Icon = badge.icon;
              return (
                <div
                  key={req.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        {req.trackingCode} · Student {req.studentRoll} ({req.studentName})
                      </div>
                      <h2 className="text-base font-semibold text-slate-900 mt-0.5">
                        {req.facultyName}
                      </h2>
                    </div>

                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${badge.colorClass}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{badge.label}</span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-700">{req.reason}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-500">Requested slot: </span>
                      <span className="font-mono font-medium text-slate-800 tabular-nums">
                        {req.preferredDate} at {formatTimeDisplay(req.preferredTime)}
                      </span>
                    </div>

                    {req.status === 'rescheduled' && req.rescheduledDate && req.rescheduledTime && (
                      <div>
                        <span className="text-amber-700 font-medium">New proposed slot: </span>
                        <span className="font-mono font-semibold text-amber-900 tabular-nums">
                          {req.rescheduledDate} at {formatTimeDisplay(req.rescheduledTime)}
                        </span>
                      </div>
                    )}
                  </div>

                  {req.facultyNote && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">Faculty Note: </span>
                      {req.facultyNote}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

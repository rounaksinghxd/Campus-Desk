import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanelView } from './components/AdminPanelView';
import { DepartmentEventsView } from './components/DepartmentEventsView';
import { FacultyCard } from './components/FacultyCard';
import { FacultyDetailDrawer } from './components/FacultyDetailDrawer';
import { FacultyPortalView } from './components/FacultyPortalView';
import { ActiveTab, TopBar } from './components/TopBar';
import { TrackRequestView } from './components/TrackRequestView';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  AuthSession,
  ClockConfig,
  DepartmentEvent,
  FacultyLiveState,
  FacultyMember,
  FacultyStatusInfo,
  ScheduleSlot,
} from './types';
import { apiFetch, getNativeApiConfigIssue, isNativeApp } from './utils/api';
import { computeFacultyStatus, getLiveClockValues } from './utils/statusEngine';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('directory');
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSlot[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [events, setEvents] = useState<DepartmentEvent[]>([]);
  const [adminConfigured, setAdminConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Portal sub-tab routing for Manage Events shortcut
  const [adminInitialTab, setAdminInitialTab] = useState<'directory' | 'events'>('directory');
  const [facultyInitialTab, setFacultyInitialTab] = useState<'requests' | 'schedule' | 'events'>('requests');
  const [eventToEdit, setEventToEdit] = useState<DepartmentEvent | null>(null);

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | FacultyLiveState>('all');

  // Demo / Live Clock
  const [now, setNow] = useState<Date>(() => new Date());
  const [clock, setClock] = useState<ClockConfig>(() => {
    const live = getLiveClockValues(new Date());
    return {
      useLiveTime: true,
      dateStr: live.dateStr,
      timeStr: live.timeStr,
    };
  });

  // Selected faculty drawer & event modal state (for Android hardware back button)
  const [drawerFaculty, setDrawerFaculty] = useState<FacultyMember | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState<boolean>(false);
  const [closeEventModalSignal, setCloseEventModalSignal] = useState<number>(0);

  // Auth session held strictly in JS memory
  const [session, setSession] = useState<AuthSession | null>(null);
  const isOnline = useOnlineStatus();
  const nativeConfigIssue = getNativeApiConfigIssue();

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const res = await apiFetch('/api/directory');
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      setFaculty(data.faculty || []);
      setSchedules(data.schedules || []);
      setDepartments(data.departments || []);
      setAdminConfigured(Boolean(data.adminConfigured));
    } catch (err) {
      const detail = err instanceof Error && err.message ? err.message : '';
      if (nativeConfigIssue) {
        setLoadError(nativeConfigIssue);
      } else if (!isOnline) {
        setLoadError('You appear to be offline. Reconnect to the internet and tap Retry.');
      } else if (detail.includes('AbortError')) {
        setLoadError('Request timed out while connecting to CampusDesk server. Tap Retry.');
      } else {
        setLoadError('Unable to reach CampusDesk server. Check your connection and tap Retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline, nativeConfigIssue]);

  const loadEvents = useCallback(async () => {
    try {
      const res = await apiFetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // Handled independently inside DepartmentEventsView
    }
  }, []);

  useEffect(() => {
    loadDirectory();
    loadEvents();
  }, [loadDirectory, loadEvents]);

  // Configure native Android StatusBar & hide SplashScreen cleanly
  useEffect(() => {
    if (!isNativeApp()) return;
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
    SplashScreen.hide().catch(() => {});
  }, []);

  // Android hardware back button navigation
  const backStateRef = useRef({
    drawerOpen: false,
    eventModalOpen: false,
    activeTab: 'directory' as ActiveTab,
  });
  backStateRef.current = {
    drawerOpen: Boolean(drawerFaculty),
    eventModalOpen,
    activeTab,
  };

  useEffect(() => {
    if (!isNativeApp()) return;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    CapApp.addListener('backButton', () => {
      const state = backStateRef.current;
      if (state.drawerOpen) {
        setDrawerFaculty(null);
      } else if (state.eventModalOpen) {
        setCloseEventModalSignal((n) => n + 1);
      } else if (state.activeTab !== 'directory') {
        setActiveTab('directory');
      } else {
        CapApp.exitApp();
      }
    })
      .then((handle) => {
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      listenerHandle?.remove().catch(() => {});
    };
  }, []);

  // Keep live clock current every 15 seconds when useLiveTime is enabled
  useEffect(() => {
    if (!clock.useLiveTime) return;
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, [clock.useLiveTime]);

  // Compute statuses for all faculty
  const facultyWithStatus = useMemo(() => {
    return faculty.map((member) => ({
      member,
      status: computeFacultyStatus(member, schedules, clock, now),
    }));
  }, [faculty, schedules, clock, now]);

  // Filter by department and search first to compute accurate status counts
  const deptAndSearchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return facultyWithStatus.filter(({ member, status }) => {
      if (selectedDepartment !== 'All' && member.department !== selectedDepartment) {
        return false;
      }
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        member.id.toLowerCase().includes(q) ||
        member.designation.toLowerCase().includes(q) ||
        member.cabin.toLowerCase().includes(q) ||
        member.department.toLowerCase().includes(q) ||
        (member.mobileNumber || '').toLowerCase().includes(q) ||
        (member.email || '').toLowerCase().includes(q) ||
        status.roomOrVenue.toLowerCase().includes(q) ||
        status.headline.toLowerCase().includes(q)
      );
    });
  }, [facultyWithStatus, selectedDepartment, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<'all' | FacultyLiveState, number> = {
      all: deptAndSearchFiltered.length,
      in_class: 0,
      in_meeting: 0,
      free_cabin: 0,
      on_leave: 0,
      off_duty: 0,
    };
    for (const item of deptAndSearchFiltered) {
      counts[item.status.state] += 1;
    }
    return counts;
  }, [deptAndSearchFiltered]);

  const visibleCards = useMemo(() => {
    if (statusFilter === 'all') return deptAndSearchFiltered;
    return deptAndSearchFiltered.filter((item) => item.status.state === statusFilter);
  }, [deptAndSearchFiltered, statusFilter]);

  const handleQuickBook = () => {
    setActiveTab('directory');
    const target = visibleCards[0]?.member || faculty[0] || null;
    if (target) setDrawerFaculty(target);
  };

  const loggedInFacultyDepartment = useMemo(() => {
    if (session?.role !== 'faculty' || !session.facultyId) return undefined;
    return faculty.find((f) => f.id === session.facultyId)?.department;
  }, [session, faculty]);

  const handleNavigateManageEvents = (editTarget?: DepartmentEvent) => {
    setEventToEdit(editTarget || null);
    if (session?.role === 'admin') {
      setAdminInitialTab('events');
      setActiveTab('admin');
    } else if (session?.role === 'faculty') {
      setFacultyInitialTab('events');
      setActiveTab('faculty');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'admin') setAdminInitialTab('directory');
          if (tab === 'faculty') setFacultyInitialTab('requests');
          setEventToEdit(null);
          setActiveTab(tab);
        }}
        session={session}
        onLogout={() => setSession(null)}
        onQuickBook={handleQuickBook}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7 space-y-6">
        {!isOnline && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-amber-900"
          >
            <div className="flex items-center gap-2 font-medium">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-700" />
              <span>You are currently offline. Live schedules and requests require an internet connection.</span>
            </div>
            <button
              type="button"
              onClick={() => {
                loadDirectory();
                loadEvents();
              }}
              className="px-3 py-1.5 text-xs font-medium bg-amber-900 text-white rounded-lg shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {nativeConfigIssue && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900 font-medium"
          >
            {nativeConfigIssue}
          </div>
        )}

        {activeTab === 'directory' && (
          <>
            <WorkspaceToolbar
              departments={departments}
              selectedDepartment={selectedDepartment}
              onSelectDepartment={setSelectedDepartment}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              statusCounts={statusCounts}
              clock={clock}
              onClockChange={setClock}
              now={now}
            />

            {/* Department Quick Switcher Strip */}
            {departments.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedDepartment('All')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedDepartment === 'All'
                      ? 'bg-blue-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  All Departments
                </button>
                {departments.map((dept) => {
                  const active = selectedDepartment === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDepartment(dept)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-blue-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {dept}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Directory Grid States */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-52 bg-white border border-slate-200 rounded-xl p-5 animate-pulse space-y-3"
                  >
                    <div className="h-3 w-36 bg-slate-200 rounded" />
                    <div className="h-5 w-52 bg-slate-200 rounded" />
                    <div className="h-3 w-28 bg-slate-100 rounded" />
                    <div className="h-14 w-full bg-slate-100 rounded-lg mt-4" />
                  </div>
                ))}
              </div>
            ) : loadError ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
                <p className="text-sm text-rose-700 font-medium">{loadError}</p>
                <button
                  type="button"
                  onClick={loadDirectory}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : visibleCards.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                <p className="text-sm font-medium text-slate-800">
                  No faculty or staff members match your current filters.
                </p>
                <p className="text-xs text-slate-500">
                  Try clearing your search query, switching departments, or selecting "All" statuses.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDepartment('All');
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleCards.map(
                  ({
                    member,
                    status,
                  }: {
                    member: FacultyMember;
                    status: FacultyStatusInfo;
                  }) => (
                    <FacultyCard
                      key={member.id}
                      member={member}
                      status={status}
                      onSelect={setDrawerFaculty}
                    />
                  )
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'events' && (
          <DepartmentEventsView
            departments={departments}
            session={session}
            userDepartment={loggedInFacultyDepartment}
            onNavigateManage={handleNavigateManageEvents}
            onModalOpenChange={setEventModalOpen}
            closeModalSignal={closeEventModalSignal}
          />
        )}

        {activeTab === 'track' && <TrackRequestView />}

        {activeTab === 'faculty' && (
          <FacultyPortalView
            faculty={faculty}
            schedules={schedules}
            departments={departments}
            events={events}
            session={session}
            onAuthenticated={setSession}
            onDirectoryRefresh={loadDirectory}
            onEventsChanged={loadEvents}
            initialTab={facultyInitialTab}
            initialEditEvent={eventToEdit}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanelView
            faculty={faculty}
            schedules={schedules}
            departments={departments}
            events={events}
            adminConfigured={adminConfigured}
            session={session}
            onAuthenticated={setSession}
            onDirectoryRefresh={loadDirectory}
            onEventsChanged={loadEvents}
            initialTab={adminInitialTab}
            initialEditEvent={eventToEdit}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>CampusDesk University Faculty &amp; Staff Locator</span>
          <span>Live schedule &amp; cabin directory</span>
        </div>
      </footer>

      <FacultyDetailDrawer
        member={
          drawerFaculty
            ? faculty.find((f) => f.id === drawerFaculty.id) || drawerFaculty
            : null
        }
        allFaculty={faculty}
        schedules={schedules}
        clock={clock}
        now={now}
        onClose={() => setDrawerFaculty(null)}
        onSelectFaculty={setDrawerFaculty}
      />
    </div>
  );
}

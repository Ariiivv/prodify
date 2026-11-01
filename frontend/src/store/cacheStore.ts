import { create } from 'zustand';
import { API_BASE, getAuthHeaders } from '@/lib/config';

export interface CachedWorkspace {
  id: number;
  name: string;
  mode: string;
  category?: string;
  target_hours?: number;
  daily_target_minutes?: number;
  deadline?: string;
  work_duration?: number;
  break_duration?: number;
  long_break_duration?: number;
  long_break_interval?: number;
  focus_keywords?: string;
  current_goal?: string;
  theme_color?: string;
  current_streak?: number;
  longest_streak?: number;
  created_at?: string;
}

export interface WorkspaceMetrics {
  pace: {
    score: number;
    label: string;
    consistency: number;
    volume: number;
    quality: number;
  };
  deep_work_ratio: number | null;
  calendar: { date: string; status: 'red' | 'yellow' | 'green' | 'golden' | null; actual_minutes?: number; target_minutes?: number }[];
  workspace_streak_current: number;
  workspace_streak_longest: number;
  today_target_minutes: number;
  today_actual_minutes: number;
}

export interface HomeMetrics {
  momentum: {
    score: number;
    label: string;
    consistency: number;
    volume: number;
    quality: number;
  };
  total_workspaces: number;
  deep_work_ratio_aggregate: number | null;
  peak_focus_window: {
    insufficient_data: boolean;
    peak_range?: string;
    alignment_rate?: number;
  };
  current_streak: number;
  longest_streak: number;
  calendar: any[];
}

export interface PerformanceMatrix {
  global_summary: any;
  workspaces_matrix: any[];
}

interface DashboardData {
  workspaces: CachedWorkspace[];
  homeMetrics: HomeMetrics | null;
  sessions: any[];
  performanceMatrix: PerformanceMatrix | null;
  lastFetched: number;
}

interface CacheStoreState {
  dashboard: DashboardData;
  workspaceDetails: Record<number, { data: CachedWorkspace; timestamp: number }>;
  workspaceMetrics: Record<number, { data: WorkspaceMetrics; timestamp: number }>;
  isDashboardFetching: boolean;

  // Actions
  fetchDashboard: (force?: boolean) => Promise<DashboardData>;
  fetchWorkspaceDetail: (id: number, force?: boolean) => Promise<CachedWorkspace | null>;
  fetchWorkspaceMetrics: (id: number, force?: boolean) => Promise<WorkspaceMetrics | null>;
  updateWorkspaceInCache: (workspace: Partial<CachedWorkspace> & { id: number }) => void;
  updateWorkspaceGoal: (id: number, goal: string) => void;
  deleteWorkspace: (id: number, keepMetrics?: boolean) => Promise<void>;
  removeWorkspaceFromCache: (id: number) => void;
  invalidateAll: () => void;
}

// In-flight promise map for request deduplication
const inFlightRequests = new Map<string, Promise<any>>();
const requestGenerations = new Map<string, number>();
const requestControllers = new Map<string, AbortController>();
const deletedWorkspaceIds = new Set<number>();

const nextGeneration = (key: string) => {
  const generation = (requestGenerations.get(key) ?? 0) + 1;
  requestGenerations.set(key, generation);
  return generation;
};

const isCurrentGeneration = (key: string, generation: number) =>
  requestGenerations.get(key) === generation;

const DASHBOARD_TTL = 30000; // 30 seconds fresh
const DETAIL_TTL = 45000;    // 45 seconds fresh
const METRICS_TTL = 30000;   // 30 seconds fresh

export const useCacheStore = create<CacheStoreState>((set, get) => ({
  dashboard: {
    workspaces: [],
    homeMetrics: null,
    sessions: [],
    performanceMatrix: null,
    lastFetched: 0,
  },
  workspaceDetails: {},
  workspaceMetrics: {},
  isDashboardFetching: false,

  fetchDashboard: async (force = false) => {
    const { dashboard, isDashboardFetching } = get();
    const now = Date.now();

    // Stale-while-revalidate check: if fresh and not forced, return cached
    if (!force && dashboard.lastFetched > 0 && now - dashboard.lastFetched < DASHBOARD_TTL) {
      return dashboard;
    }

    // Deduplicate in-flight dashboard requests
    const flightKey = 'dashboard';
    if (inFlightRequests.has(flightKey)) {
      return inFlightRequests.get(flightKey);
    }

    set({ isDashboardFetching: true });
    const requestGeneration = nextGeneration(flightKey);
    requestControllers.get(flightKey)?.abort();
    const controller = new AbortController();
    requestControllers.set(flightKey, controller);

    const fetchPromise = (async () => {
      try {
        let headers = getAuthHeaders();
        if (!headers.Authorization) {
          await new Promise(r => setTimeout(r, 400));
          headers = getAuthHeaders();
        }

        // Parallel unified fetch
        const [wsRes, metRes, sessRes, perfRes] = await Promise.allSettled([
          fetch(`${API_BASE}/workspaces`, { headers, cache: 'no-store', signal: controller.signal }),
          fetch(`${API_BASE}/api/metrics/home`, { headers, cache: 'no-store', signal: controller.signal }),
          fetch(`${API_BASE}/api/telemetry/sessions?limit=100`, { headers, cache: 'no-store', signal: controller.signal }),
          fetch(`${API_BASE}/api/analytics/performance-matrix`, { headers, cache: 'no-store', signal: controller.signal }),
        ]);

        let workspaces = dashboard.workspaces;
        if (wsRes.status === 'fulfilled' && wsRes.value.ok) {
          try {
            workspaces = await wsRes.value.json();
          } catch (e) {}
        }

        let homeMetrics = dashboard.homeMetrics;
        if (metRes.status === 'fulfilled' && metRes.value.ok) {
          try {
            homeMetrics = await metRes.value.json();
          } catch (e) {}
        }

        let sessions = dashboard.sessions;
        if (sessRes.status === 'fulfilled' && sessRes.value.ok) {
          try {
            sessions = await sessRes.value.json();
          } catch (e) {}
        }

        let performanceMatrix = dashboard.performanceMatrix;
        if (perfRes.status === 'fulfilled' && perfRes.value.ok) {
          try {
            performanceMatrix = await perfRes.value.json();
          } catch (e) {}
        }

        const newDashboard: DashboardData = {
          workspaces,
          homeMetrics,
          sessions,
          performanceMatrix,
          lastFetched: Date.now(),
        };

        // Also prime workspaceDetails cache with newly loaded workspaces
        const newDetails = { ...get().workspaceDetails };
        workspaces.forEach((ws: CachedWorkspace) => {
          newDetails[ws.id] = { data: ws, timestamp: Date.now() };
        });

        if (isCurrentGeneration(flightKey, requestGeneration)) {
          set({
            dashboard: newDashboard,
            workspaceDetails: newDetails,
            isDashboardFetching: false,
          });
        }

        return newDashboard;
      } catch (err) {
        console.error('[CacheStore] Dashboard fetch error:', err);
        if (isCurrentGeneration(flightKey, requestGeneration)) {
          set({ isDashboardFetching: false });
        }
        return get().dashboard;
      } finally {
        inFlightRequests.delete(flightKey);
        requestControllers.delete(flightKey);
      }
    })();

    inFlightRequests.set(flightKey, fetchPromise);
    return fetchPromise;
  },

  fetchWorkspaceDetail: async (id: number, force = false) => {
    const { workspaceDetails } = get();
    const cached = workspaceDetails[id];
    const now = Date.now();

    if (!force && cached && now - cached.timestamp < DETAIL_TTL) {
      return cached.data;
    }

    const flightKey = `workspace-detail-${id}`;
    if (inFlightRequests.has(flightKey)) {
      return inFlightRequests.get(flightKey);
    }

    const fetchPromise = (async () => {
      const requestGeneration = nextGeneration(flightKey);
      const controller = new AbortController();
      requestControllers.set(flightKey, controller);
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_BASE}/workspaces/${id}`, { headers, cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CachedWorkspace = await res.json();

        if (isCurrentGeneration(flightKey, requestGeneration) && !deletedWorkspaceIds.has(id)) {
          set(state => ({
            workspaceDetails: {
              ...state.workspaceDetails,
              [id]: { data, timestamp: Date.now() },
            },
          }));
        }

        return data;
      } catch (err) {
        console.error(`[CacheStore] Workspace ${id} fetch error:`, err);
        return cached?.data || null;
      } finally {
        inFlightRequests.delete(flightKey);
        requestControllers.delete(flightKey);
      }
    })();

    inFlightRequests.set(flightKey, fetchPromise);
    return fetchPromise;
  },

  fetchWorkspaceMetrics: async (id: number, force = false) => {
    const { workspaceMetrics } = get();
    const cached = workspaceMetrics[id];
    const now = Date.now();

    if (!force && cached && now - cached.timestamp < METRICS_TTL) {
      return cached.data;
    }

    const flightKey = `workspace-metrics-${id}`;
    if (inFlightRequests.has(flightKey)) {
      return inFlightRequests.get(flightKey);
    }

    const fetchPromise = (async () => {
      const requestGeneration = nextGeneration(flightKey);
      const controller = new AbortController();
      requestControllers.set(flightKey, controller);
      try {
        const headers = getAuthHeaders();
        const res = await fetch(`${API_BASE}/api/metrics/workspace/${id}`, { headers, cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: WorkspaceMetrics = await res.json();

        if (isCurrentGeneration(flightKey, requestGeneration) && !deletedWorkspaceIds.has(id)) {
          set(state => ({
            workspaceMetrics: {
              ...state.workspaceMetrics,
              [id]: { data, timestamp: Date.now() },
            },
          }));
        }

        return data;
      } catch (err) {
        console.error(`[CacheStore] Workspace metrics ${id} fetch error:`, err);
        return cached?.data || null;
      } finally {
        inFlightRequests.delete(flightKey);
        requestControllers.delete(flightKey);
      }
    })();

    inFlightRequests.set(flightKey, fetchPromise);
    return fetchPromise;
  },

  updateWorkspaceInCache: (updated) => {
    set(state => {
      const id = updated.id;
      const currentDetail = state.workspaceDetails[id]?.data;
      const mergedDetail = currentDetail ? { ...currentDetail, ...updated } : (updated as CachedWorkspace);

      const newWorkspaces = state.dashboard.workspaces.map(w =>
        w.id === id ? { ...w, ...updated } : w
      );

      return {
        workspaceDetails: {
          ...state.workspaceDetails,
          [id]: { data: mergedDetail, timestamp: Date.now() },
        },
        dashboard: {
          ...state.dashboard,
          workspaces: newWorkspaces,
        },
      };
    });
  },

  updateWorkspaceGoal: (id: number, goal: string) => {
    get().updateWorkspaceInCache({ id, current_goal: goal });
  },

  deleteWorkspace: async (id: number, keepMetrics = false) => {
    const previous = get();
    deletedWorkspaceIds.add(id);
    nextGeneration('dashboard');
    nextGeneration(`workspace-detail-${id}`);
    nextGeneration(`workspace-metrics-${id}`);
    requestControllers.get('dashboard')?.abort();
    requestControllers.get(`workspace-detail-${id}`)?.abort();
    requestControllers.get(`workspace-metrics-${id}`)?.abort();

    get().removeWorkspaceFromCache(id);
    try {
      const response = await fetch(
        `${API_BASE}/workspaces/${id}?keep_metrics=${keepMetrics}`,
        { method: 'DELETE', headers: getAuthHeaders(), cache: 'no-store' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${response.status}`);
      }
      await get().fetchDashboard(true);
      deletedWorkspaceIds.delete(id);
    } catch (error) {
      deletedWorkspaceIds.delete(id);
      set({
        dashboard: previous.dashboard,
        workspaceDetails: previous.workspaceDetails,
        workspaceMetrics: previous.workspaceMetrics,
      });
      throw error;
    }
  },

  removeWorkspaceFromCache: (id: number) => {
    set(state => {
      const newDetails = { ...state.workspaceDetails };
      delete newDetails[id];
      const newMetrics = { ...state.workspaceMetrics };
      delete newMetrics[id];

      const remainingWorkspaces = state.dashboard.workspaces.filter(w => w.id !== id);
      const remainingSessions = state.dashboard.sessions.filter(s => s.workspace_id !== id);

      let newPerformanceMatrix = state.dashboard.performanceMatrix;
      if (newPerformanceMatrix) {
        newPerformanceMatrix = {
          ...newPerformanceMatrix,
          workspaces_matrix: (newPerformanceMatrix.workspaces_matrix || []).filter(
            (wm: any) => wm.id !== id && wm.workspace_id !== id
          ),
        };
      }

      return {
        workspaceDetails: newDetails,
        workspaceMetrics: newMetrics,
        dashboard: {
          ...state.dashboard,
          workspaces: remainingWorkspaces,
          sessions: remainingSessions,
          performanceMatrix: newPerformanceMatrix,
          lastFetched: 0,
        },
      };
    });
    // Callers that only have a confirmed server deletion can explicitly revalidate.
  },

  invalidateAll: () => {
    set({
      dashboard: {
        workspaces: [],
        homeMetrics: null,
        sessions: [],
        performanceMatrix: null,
        lastFetched: 0,
      },
      workspaceDetails: {},
      workspaceMetrics: {},
    });
  },
}));

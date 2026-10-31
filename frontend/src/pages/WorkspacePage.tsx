import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CameraOff, AlertTriangle, Webcam, Activity, Brain, Clock, Settings, Target, Pencil, Check, X, ShieldCheck, Trophy, Award, Pause, Play, CheckCircle2, HeartPulse } from 'lucide-react';
import { MetricInfoPopover } from '@/components/ui/MetricInfoPopover';
import { SpotlightTour } from '@/components/onboarding/SpotlightTour';
import { useTimerStore, initTimer, useTimer, switchMode } from '@/lib/timerStore';
import { useAdaptiveFocus, type DistractionMetadata } from '@/hooks/useAdaptiveFocus';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useCacheStore } from '@/store/cacheStore';
import { toLocalISODate, getTodayLocalISODate } from '@/lib/dateUtils';
import { computeDeepFlowRatio, computeTotalDailySessions } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import WebcamStream from '@/components/workspace/WebcamStream';
import TimerRing from '@/components/timer/TimerRing';
import TimerControls from '@/components/timer/TimerControls';

import AiCoachPanel from '@/components/chat/AiCoachPanel';
import CoachInsightPanel from '@/components/dashboard/CoachInsightPanel';
import { StructuredGoalCalendar } from '@/components/workspace/StructuredGoalCalendar';
import { TimerSettingsModal } from '@/components/timer/TimerSettingsModal';
import { WorkspaceReportModal } from '@/components/workspace/WorkspaceReportModal';
import { EditWorkspaceModal } from '@/components/workspace/EditWorkspaceModal';

type CameraStatus = 'loading' | 'streaming' | 'error' | 'disabled';

interface WorkspaceMetrics {
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
  today_distractions_count?: number;
  today_completed_sessions?: number;
}

function formatHoursLeftToday(targetMinutes: number, actualMinutes: number): string {
  const remaining = Math.max(0, Math.round((targetMinutes || 0) - (actualMinutes || 0)));
  if ((targetMinutes || 0) > 0 && remaining <= 0) return 'Target met';
  if ((targetMinutes || 0) <= 0) return actualMinutes > 0 ? `${formatDuration(actualMinutes)} logged` : 'No daily target';
  return `${formatDuration(remaining)} left`;
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const staggerContainerVariants: any = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const columnVariants: any = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

/** Parse workspace keywords from the DB, handling JSON arrays, raw strings, or intent text */
function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy format: JSON array of keywords
      return parsed.flatMap((k: string) =>
        String(k)
          .split(/[\n,]+/)
          .map(s => s.trim())
          .filter(Boolean)
      );
    }
    return [];
  } catch {
    // New format: raw intent string — split into meaningful words for
    // the frontend's local keyword matching (the real classification
    // happens on the backend via Gemini AI using the full intent string)
    return raw
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 2); // skip tiny words like "I", "am", "a"
  }
}

/** Get the raw intent string from the workspace's focus_keywords field */
function getIntentString(raw: string | null | undefined): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy format: join keywords into a sentence for the AI
      return parsed.join(', ');
    }
    return '';
  } catch {
    // New format: already a raw intent string
    return raw;
  }
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const wsId = id ? parseInt(id) : null;
  const timerState = useTimer();

  // Pause timer if user navigates away
  useEffect(() => {
    return () => {
      const store = useTimerStore.getState();
      const ws = store.workspaces[wsId || -1];
      if (ws && (ws.currentState === 'FOCUS_RUNNING' || ws.currentState === 'BREAK_RUNNING')) {
        if (ws.currentState === 'FOCUS_RUNNING') store.pauseFocus('Navigated away');
        if (ws.currentState === 'BREAK_RUNNING') store.pauseBreak();
      }
    };
  }, [wsId]);

interface ActiveDistractionInfo {
  reason: string;
  cleanAppName?: string;
  platformName?: string;
  contentTitle?: string;
  rawAppName?: string;
  rawWindowTitle?: string;
}

  // Cache-first initialization (reactive stale-while-revalidate for instant transitions)
  const cachedWs = useCacheStore(useCallback(state => wsId ? (state.workspaceDetails[wsId]?.data || state.dashboard.workspaces.find(w => w.id === wsId)) : null, [wsId]));
  const cachedMet = useCacheStore(useCallback(state => wsId ? state.workspaceMetrics[wsId]?.data : null, [wsId]));

  // Component State
  const [burnoutProb, setBurnoutProb] = useState(0);
  const [workspace, setWorkspace] = useState<any>(cachedWs || null);
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(cachedMet || null);
  const [isLoading, setIsLoading] = useState(!cachedWs);

  // Sync state seamlessly whenever cache updates
  useEffect(() => {
    if (cachedWs) {
      setWorkspace(cachedWs);
      setIsLoading(false);
    }
  }, [cachedWs]);

  useEffect(() => {
    if (cachedMet) {
      setMetrics(cachedMet);
    }
  }, [cachedMet]);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('disabled');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [engagementState, setEngagementState] = useState<string>('ACTIVE_WORK');
  const [lastFocusedWindow, setLastFocusedWindow] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleToggleStatus = async () => {
    if (!wsId || !workspace) return;
    const newStatus = workspace.status === 'paused' ? 'active' : 'paused';
    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkspace((prev: any) => ({ ...prev, status: updated.status }));
        useCacheStore.getState().invalidateWorkspace(wsId);
        toast.success(newStatus === 'paused' ? "Track Paused ⏸" : "Track Resumed ▶", {
          description: newStatus === 'paused' ? "Daily quota suspended. Streaks protected." : "Daily quota restored.",
        });
      } else {
        toast.error("Failed to update track status");
      }
    } catch (err) {
      console.error("Failed to toggle status:", err);
      toast.error("Failed to update track status");
    }
  };
  const [showDebrief, setShowDebrief] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefData, setDebriefData] = useState<any>(null);

  const fetchSprintDebrief = async () => {
    if (!wsId) return;
    setDebriefLoading(true);
    setShowDebrief(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/complete-summary`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDebriefData(data);
      }
    } catch (e) {
      console.error("Failed to load sprint debrief:", e);
    } finally {
      setDebriefLoading(false);
    }
  };
  const [activeDistraction, setActiveDistraction] = useState<ActiveDistractionInfo | null>(null);
  const loggedCompletionRef = useRef<number | null>(null);
  const lastBurnoutMinuteRef = useRef<number | null>(null);

  // Editable Intent / Declared Goal state
  const [isEditingIntent, setIsEditingIntent] = useState(false);
  const [intentInput, setIntentInput] = useState('');
  const [isSavingIntent, setIsSavingIntent] = useState(false);

  const handleSaveIntent = async () => {
    if (!wsId) return;
    const trimmedGoal = intentInput.trim();
    setIsSavingIntent(true);
    try {
      const res = await fetch(`${API_BASE}/workspaces/${wsId}/goal`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ current_goal: trimmedGoal }),
      });
      if (res.ok) {
        const updated = await res.json();
        setWorkspace((prev: any) => ({ ...prev, current_goal: updated.current_goal }));
        useCacheStore.getState().updateWorkspaceGoal(wsId, updated.current_goal);
        toast.success("Focus Intent Updated", { description: trimmedGoal ? `Active intent: "${trimmedGoal}"` : "Session intent cleared." });
        setIsEditingIntent(false);
      } else {
        const putRes = await fetch(`${API_BASE}/workspaces/${wsId}`, {
          method: 'PUT',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            ...workspace,
            current_goal: trimmedGoal,
          }),
        });
        if (putRes.ok) {
          const updated = await putRes.json();
          setWorkspace((prev: any) => ({ ...prev, current_goal: updated.current_goal }));
          useCacheStore.getState().updateWorkspaceGoal(wsId, updated.current_goal);
          toast.success("Focus Intent Updated");
          setIsEditingIntent(false);
        } else {
          toast.error("Failed to update focus intent");
        }
      }
    } catch (err) {
      console.error("Failed to update focus intent:", err);
      toast.error("Failed to update focus intent");
    } finally {
      setIsSavingIntent(false);
    }
  };

  // Compute workspace keywords for frontend-side matching
  const workspaceKeywords = useMemo(() => parseKeywords(workspace?.focus_keywords), [workspace?.focus_keywords]);
  // Extract the raw intent string for the AI backend
  const sessionIntent = workspace?.current_goal || getIntentString(workspace?.focus_keywords);


  // Compute if detection should run
  const isDetectionEnabled = !isManualOverride && timerState.sessionMode === 'FOCUS';

  // Distraction Handler
  const handleDistraction = useCallback((reason?: string) => {
    const store = useTimerStore.getState();
    const ws = store.workspaces[store.activeWorkspaceId ?? -1];
    if (!ws || ws.currentState !== 'FOCUS_RUNNING') return; // prevent toast spam on breaks
    const displayReason = reason?.trim() || "Distraction detected";
    
    toast.error("Focus lost!", {
      description: `${displayReason}. Timer paused. 📉`,
      duration: 3000,
    });
    store.incrementDistraction();
    store.pauseFocus(displayReason);
  }, []);

  // --- Adaptive Focus Tracking ---
  const { currentTabTitle, isFocused: isTabFocused, markAsRelevant, activeTelemetry } = useAdaptiveFocus({
    keywords: workspaceKeywords,
    enabled: isDetectionEnabled,
    sessionIntent,
    workspaceId: wsId,
    onDistracted: (reason?: string, appName?: string, summary?: string, meta?: DistractionMetadata) => {
      const store = useTimerStore.getState();
      const currentWsId = store.activeWorkspaceId;
      const timerWs = currentWsId !== null ? store.workspaces[currentWsId] : undefined;
      const currentState = timerWs?.currentState || 'IDLE';
      const pauseReason = timerWs?.pauseReason;

      const isActivelyDistracted = currentState === 'FOCUS_RUNNING' || 
        (currentState === 'FOCUS_PAUSED' && pauseReason && !['Manual', 'manual_pause'].includes(pauseReason));

      if (isDetectionEnabled && isActivelyDistracted) {
        const trimmedReason = reason?.trim();
        const trimmedSummary = summary?.trim();
        const isErrorOrEmpty = !trimmedReason ||
          trimmedReason.toLowerCase().includes("evaluation failed") ||
          trimmedReason.toLowerCase().includes("rate limit");

        const appLabel = meta?.platformName || meta?.cleanAppName || (appName ? appName.replace(/\.(exe|app)$/i, '') : "an application");
        const displayReason = isErrorOrEmpty
          ? `You switched to ${appLabel} which does not match your session intent.`
          : (trimmedReason || trimmedSummary);

        setActiveDistraction({
          reason: displayReason,
          cleanAppName: meta?.cleanAppName,
          platformName: meta?.platformName,
          contentTitle: meta?.contentTitle || meta?.windowTitle,
          rawAppName: appName || meta?.appName,
          rawWindowTitle: meta?.windowTitle,
        });

        // 🚀 Active Enforcement: Instantly pop Prodify back to the front!
        if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
          try {
            // 0. Mitigate Distracting Window
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('minimize_active_window').catch(err => console.error("Failed to minimize distracting window:", err));
            }).catch((e) => console.warn('[WorkspacePage] Failed to minimize distracting window:', e));

            // 1. Force Window to Front
            import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
              const appWindow = getCurrentWindow();
              // Await the sequence for robust Windows 11 focus elevation
              const elevate = async () => {
                try {
                  await appWindow.unminimize();
                  await appWindow.show();
                  await appWindow.setAlwaysOnTop(true);
                  await appWindow.setFocus();
                  setTimeout(async () => {
                    await appWindow.setAlwaysOnTop(false);
                  }, 3500); // Keep topmost briefly
                } catch (err) {
                  console.error('Failed to elevate window:', err);
                }
              };
              elevate();
            });

            // 2. Play Audio Alert
            try {
              import('@/lib/audio').then(({ audioEngine }) => {
                if (audioEngine && typeof audioEngine.playDistractionAlert === 'function') {
                  audioEngine.playDistractionAlert();
                } else {
                  console.warn("audioEngine.playDistractionAlert is missing.");
                }
              }).catch(e => console.error("Failed to load audio engine:", e));
            } catch (err) {
              console.error("Audio playback failed:", err);
            }

            // 3. Native Desktop Notification
            import('@tauri-apps/plugin-notification').then(async ({ sendNotification, isPermissionGranted, requestPermission }) => {
              let permissionGranted = await isPermissionGranted();
              if (!permissionGranted) {
                const permission = await requestPermission();
                permissionGranted = permission === 'granted';
              }
              if (permissionGranted) {
                sendNotification({
                  title: 'Distraction Detected',
                  body: displayReason,
                });
              }
            }).catch(() => {});

          } catch (e) {
            console.error("Failed to execute active enforcement:", e);
          }
        }

        if (currentState === 'FOCUS_RUNNING') {
          toast.warning("Distraction Detected!", {
            description: `${displayReason} Timer paused.`,
            duration: 5000,
          });
          store.incrementDistraction();
          store.pauseFocus(displayReason);
        } else if (currentState === 'FOCUS_PAUSED' && pauseReason !== displayReason) {
          // Update the reason in the store to reflect the new distraction target
          store.pauseFocus(displayReason);
        }
      }
    },
    onFocused: () => {
    },
  });

  const handleReturnToFocus = useCallback(async () => {
    try {
      if (wsId) {
        await fetch(`${API_BASE}/api/telemetry/reset-focus`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ workspace_id: wsId }),
        });
      }
    } catch (e) {
      console.error('Failed to reset focus state:', e);
    }
    setActiveDistraction(null);
    useTimerStore.getState().resumeFocus();
  }, [wsId]);

  const handleAllowForSession = useCallback(async () => {
    toast.success("Allowed for this session", { description: "Resuming focus now." });
    markAsRelevant();
    try {
      if (wsId) {
        const appName = activeDistraction?.rawAppName || activeDistraction?.cleanAppName || '';
        const windowTitle = activeDistraction?.rawWindowTitle || activeDistraction?.contentTitle || '';
        if (appName || windowTitle) {
          await fetch(`${API_BASE}/api/telemetry/allow-window`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              workspace_id: wsId,
              app_name: appName,
              window_title: windowTitle,
            }),
          });
        }
        await fetch(`${API_BASE}/api/telemetry/reset-focus`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ workspace_id: wsId }),
        });
      }
    } catch (e) {
      console.error('Failed to reset focus state:', e);
    }
    setActiveDistraction(null);
    useTimerStore.getState().decrementDistraction();
    useTimerStore.getState().resumeFocus();
  }, [markAsRelevant, wsId, activeDistraction]);

  const isTabDistracted = !isTabFocused;


  // --- Camera Status Handler ---
  const handleCameraStatus = useCallback((status: CameraStatus, error?: { type: string; message: string }) => {
    setCameraStatus(status);
    setCameraErrorMessage(error?.message || null);

    if (status === 'error') {
      const isPermission = error?.type === 'NotAllowedError';
      const isNotFound = error?.type === 'NotFoundError';
      if (isPermission) {
        toast.warning("Camera permission denied", {
          description: "Focus tracking won't work without camera access.",
          duration: 4000,
        });
      } else if (isNotFound) {
        toast.warning("No camera detected", {
          description: "Plug in a webcam or disable tracking to proceed.",
          duration: 4000,
        });
      }
    }
  }, []);

  // Fetch workspace (stale-while-revalidate for instantaneous render)
  useEffect(() => {
    if (!wsId) {
      setIsLoading(false);
      return;
    }
    let isMounted = true;
    useCacheStore.getState().fetchWorkspaceDetail(wsId).then((ws: any) => {
      if (isMounted) {
        if (ws) setWorkspace(ws);
        setIsLoading(false);
      }
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, [wsId]);

  // Workspace metrics (stale-while-revalidate & deduplicated)
  useEffect(() => {
    if (!wsId) return;
    let isMounted = true;
    useCacheStore.getState().fetchWorkspaceMetrics(wsId).then((met: any) => {
      if (isMounted && met) {
        setMetrics(met);
      }
    });
    return () => { isMounted = false; };
  }, [wsId, timerState.sessionCount]);

  // Initialize timer
  useEffect(() => {
    if (workspace && wsId) {
      useTimerStore.getState().setActiveWorkspace(
        wsId, 
        workspace.work_duration || 25, 
        workspace.break_duration || 5, 
        workspace.long_break_duration || 15, 
        workspace.long_break_interval || 4
      );
      initTimer(
        workspace.work_duration || 25, 
        workspace.break_duration || 5, 
        workspace.long_break_duration || 15, 
        workspace.long_break_interval || 4
      );
    }
  }, [workspace, wsId]);

  // Query the backend risk estimator based on cumulative daily focus + distractions.
  useEffect(() => {
    const activeElapsed = (timerState.currentState === 'FOCUS_RUNNING' || timerState.currentState === 'FOCUS_PAUSED')
      ? Math.max(0, Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60))
      : 0;
    const cumulativeFocusMinutes = Math.round((metrics?.today_actual_minutes || 0) + activeElapsed);
    const cumulativeDistractions = Math.max(timerState.distractionCount, metrics?.today_distractions_count || 0);

    const controller = new AbortController();
    fetch(
      `${API_BASE}/api/ml/burnout-prediction?current_hour=${new Date().getHours()}&current_focus_minutes=${cumulativeFocusMinutes}&distraction_count=${cumulativeDistractions}`,
      { headers: getAuthHeaders(), signal: controller.signal },
    )
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => setBurnoutProb(Number(data.tab_switch_probability) || 0.0))
      .catch(error => {
        if (error.name !== 'AbortError') console.error('Unable to fetch burnout risk:', error);
      });
    return () => controller.abort();
  }, [timerState.timeRemaining, timerState.currentState, timerState.distractionCount, timerState.focusDuration, metrics?.today_actual_minutes, metrics?.today_distractions_count]);

  const previousStateRef = useRef(timerState.currentState);
  const maxElapsedRef = useRef(0);
  const breakNotifiedRef = useRef<string | null>(null);

  // Track max elapsed time to prevent it reading 0 on reset
  useEffect(() => {
    if (timerState.currentState.includes('FOCUS')) {
      const elapsed = Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60);
      if (elapsed > maxElapsedRef.current) {
         maxElapsedRef.current = elapsed;
      }
    }
  }, [timerState.timeRemaining, timerState.currentState, timerState.focusDuration]);

  // Log session completion & save metrics, and pop break-transition toasts.
  useEffect(() => {
    // Paused tracks must not log active timer data or compute daily quotas
    if (workspace?.status === 'paused') {
      previousStateRef.current = timerState.currentState;
      return;
    }

    const prev = previousStateRef.current;
    const current = timerState.currentState;
    const isFocus = prev === 'FOCUS_RUNNING' || prev === 'FOCUS_PAUSED';
    const isEnded = current === 'IDLE' || current === 'SESSION_COMPLETED';

    // Break finished → focus starts again (auto-advanced by the store).
    // SESSION_COMPLETED here is transient: break→focus also passes through it.
    const breakJustEnded =
      (prev === 'BREAK_RUNNING' || prev === 'BREAK_PAUSED') &&
      (current === 'FOCUS_RUNNING' || current === 'SESSION_COMPLETED');
    if (breakJustEnded && breakNotifiedRef.current !== `${timerState.sessionCount}-${timerState.roundCount}`) {
      breakNotifiedRef.current = `${timerState.sessionCount}-${timerState.roundCount}`;
      toast.success('Break over — back to focus! 💪', { duration: 4000 });
      import('@tauri-apps/plugin-notification').then(async ({ isPermissionGranted, requestPermission, sendNotification }) => {
        try {
          let granted = await isPermissionGranted();
          if (!granted) granted = (await requestPermission()) === 'granted';
          if (granted) sendNotification({ title: 'Break over', body: 'Back to your focus session!' });
        } catch (err) {
          console.error('Failed to send break-over notification:', err);
        }
      }).catch((err) => console.error('Failed to load notifications:', err));
      // Bring the app window forward so the toast is actually seen.
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        (async () => {
          try {
            await appWindow.unminimize();
            await appWindow.show();
            await appWindow.setAlwaysOnTop(true);
            await appWindow.setFocus();
            setTimeout(async () => {
              await appWindow.setAlwaysOnTop(false);
            }, 3500);
          } catch (err) {
            console.error('Failed to elevate window:', err);
          }
        })();
      }).catch((err) => console.error('Failed to load window API:', err));
    }

    if (isFocus && isEnded && workspace && wsId) {
      const completed = current === 'SESSION_COMPLETED';
      
      // Notify user on completion — but ONLY for focus→done, never for
      // break→focus (that path is handled by breakJustEnded above).
      if (completed && isFocus && loggedCompletionRef.current !== timerState.sessionCount) {
        toast.success(`Yayy! You completed session ${timerState.sessionCount} of this workspace! 🎉`, { duration: 4000 });
        
        // Force App Window to Front
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          const appWindow = getCurrentWindow();
          const elevate = async () => {
            try {
              await appWindow.unminimize();
              await appWindow.show();
              await appWindow.setAlwaysOnTop(true);
              await appWindow.setFocus();
              setTimeout(async () => {
                await appWindow.setAlwaysOnTop(false);
              }, 3500);
            } catch (err) {
              console.error('Failed to elevate window:', err);
            }
          };
          elevate();
        });
      }

      const currentHour = new Date().getHours();
      let time_of_day = 'night';
      if (currentHour >= 5 && currentHour < 12) time_of_day = 'morning';
      else if (currentHour >= 12 && currentHour < 18) time_of_day = 'afternoon';
      else if (currentHour >= 18 && currentHour < 22) time_of_day = 'evening';

      // 1. Send ML metrics (silent, non-blocking)
      fetch(`${API_BASE}/workspaces/${wsId}/metrics`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          focus_minutes: maxElapsedRef.current,
          distraction_count: timerState.distractionCount,
          burnout_score: burnoutProb,
          time_of_day,
          completed,
        }),
      }).catch(console.error);

      // 2. Telemetry sessions call (Completed or Partial)
      const elapsedMinutes = maxElapsedRef.current;
      if (completed && loggedCompletionRef.current !== timerState.sessionCount) {
        loggedCompletionRef.current = timerState.sessionCount;
        fetch(`${API_BASE}/api/telemetry/sessions`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            workspace_id: wsId,
            duration_minutes: workspace.work_duration || 45,
            distraction_count: timerState.distractionCount,
            distracted_seconds: timerState.distractedSeconds || 0,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            burnout_score: burnoutProb,
            status: "COMPLETED",
          }),
        })
          .then(() => {
            if (wsId) useCacheStore.getState().invalidateWorkspace(wsId);
            useCacheStore.getState().invalidateDashboard();
          })
          .catch(error => {
            loggedCompletionRef.current = null;
            console.error('Unable to save completed focus session:', error);
          });
      } else if (!completed && elapsedMinutes >= 1) {
        fetch(`${API_BASE}/api/telemetry/sessions`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            workspace_id: wsId,
            duration_minutes: elapsedMinutes,
            distraction_count: timerState.distractionCount,
            distracted_seconds: timerState.distractedSeconds || 0,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            burnout_score: burnoutProb,
            status: "PARTIAL",
          }),
        })
          .then(() => {
            if (wsId) useCacheStore.getState().invalidateWorkspace(wsId);
            useCacheStore.getState().invalidateDashboard();
          })
          .catch(error => {
            console.error('Unable to save partial focus session:', error);
          });
      }

      // Reset elapsed tracker for next session
      maxElapsedRef.current = 0;
    } else if (current !== 'SESSION_COMPLETED') {
      loggedCompletionRef.current = null;
    }

    previousStateRef.current = current;
  }, [timerState.currentState, workspace, wsId, burnoutProb, timerState.distractionCount, timerState.sessionCount]);

  // Live folded stats & fatigue computations
  const activeElapsedMinutes = (timerState.currentState === 'FOCUS_RUNNING' || timerState.currentState === 'FOCUS_PAUSED')
    ? Math.max(0, Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60))
    : 0;
  const cumulativeFocusMinutes = Math.round((metrics?.today_actual_minutes || 0) + activeElapsedMinutes);
  const todayDistractions = Math.max(timerState.distractionCount, metrics?.today_distractions_count || 0);
  const todayCompletedSessions = Math.max(timerState.sessionCount, metrics?.today_completed_sessions || 0);
  const todayLoggedMinutes = Math.round(metrics?.today_actual_minutes || 0);

  const effectiveBurnoutProb = useMemo(() => {
    if (burnoutProb > 0) return burnoutProb;
    const fatigueTime = (cumulativeFocusMinutes / 60.0) * 0.12;
    const fatigueDist = todayDistractions * 0.02;
    const hour = new Date().getHours();
    const circadian = (hour >= 22 || hour < 5) ? 0.10 : (hour >= 14 && hour <= 16) ? 0.05 : 0;
    return Math.max(0.0, Math.min(0.90, fatigueTime + fatigueDist + circadian));
  }, [burnoutProb, cumulativeFocusMinutes, todayDistractions]);

  const liveDeepFlowRatio = useMemo(() => {
    const focusSec = cumulativeFocusMinutes * 60;
    const distractedSec = timerState.distractedSeconds || 0;
    const distractionCnt = timerState.distractionCount || 0;

    // Zero-state: pristine clean session → 100%
    if (focusSec === 0 && distractionCnt === 0) {
      return 100;
    }

    return computeDeepFlowRatio(focusSec, distractedSec, distractionCnt);
  }, [metrics?.deep_work_ratio, timerState.distractionCount, timerState.distractedSeconds, todayDistractions, cumulativeFocusMinutes]);

  const focusMinutes = (timerState.currentState === 'IDLE' || timerState.currentState === 'SESSION_COMPLETED')
    ? 0
    : Math.max(0, Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60));

  
  const activeColor = timerState.sessionMode === 'SHORT_BREAK' ? '#10b981' : 
                      timerState.sessionMode === 'LONG_BREAK' ? '#3b82f6' : 
                      (workspace?.theme_color || '#3b82f6');

  const totalDuration = timerState.sessionMode === 'LONG_BREAK' 
    ? timerState.defaultLongBreakDuration 
    : timerState.sessionMode === 'SHORT_BREAK' 
      ? timerState.breakDuration 
      : timerState.focusDuration;
  const isCameraBlocked = cameraStatus === 'error';

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" /></div>;
  if (!workspace) return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-muted-foreground">Workspace not found</p><Link to="/" className="text-white hover:underline text-sm">Go back</Link></div>;

  return (
    <motion.div
      className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto text-[#f4f4f5]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {isCameraBlocked && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-400">Focus Tracking Unavailable</p>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              {cameraErrorMessage || "Camera is not accessible. The timer will still work, but distraction detection is disabled."}
            </p>
          </div>
          <button
            onClick={() => setIsManualOverride(true)}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="w-10 h-10 rounded-xl border border-[#27272a] bg-[#202024] flex items-center justify-center text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#f4f4f5]">{workspace.name}</h1>
            <p className="text-xs text-[#a1a1aa]">
              {workspace.category === 'casual' ? '⚡ Quick Work' : 
               workspace.category === 'sprint' ? '🎯 Sprint Track' : 
               '🌱 Mastery Track'} 
              {' · '}
              {workspace.work_duration || 45}m Focus
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button 
                  onClick={() => setIsManualOverride(!isManualOverride)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    isManualOverride ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-[#202024] border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a]'
                  }`}
                >
                  {isManualOverride ? "Tracking Paused (Manual)" : "Tracking Active"}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px] text-center bg-[#202024] border-[#27272a] text-[#f4f4f5]">
                Prodify is actively monitoring your window activity, keyboard input, and camera (if enabled) to track your focus.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {workspace?.category === 'sprint' && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={fetchSprintDebrief}
                    aria-label="Sprint Debrief"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Debrief</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[#202024] border-[#27272a] text-[#f4f4f5]">
                  AI Coach Sprint Completion Debrief & Memory Review
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggleStatus}
                  aria-label="Toggle track status"
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-sm border ${
                    workspace?.status === 'paused'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25'
                      : workspace?.status === 'completed'
                        ? 'bg-sky-500/15 border-sky-500/30 text-sky-400 hover:bg-sky-500/25'
                        : 'bg-[#202024] border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a]'
                  }`}
                >
                  {workspace?.status === 'paused' ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Resume Track</span>
                    </>
                  ) : workspace?.status === 'completed' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                      <span className="hidden sm:inline">Completed</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-[#a1a1aa]" />
                      <span className="hidden sm:inline">Pause Track</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[#202024] border-[#27272a] text-[#f4f4f5]">
                {workspace?.status === 'paused' ? "Resume this track to reactivate daily quotas" : "Pause this track to temporarily stop daily requirements without breaking streaks"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <button 
            onClick={() => setIsEditModalOpen(true)}
            aria-label="Edit Workspace Settings"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#202024] border border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] hover:bg-[#27272a] transition-colors"
            title="Edit Workspace & Timer Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
      
      <EditWorkspaceModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        workspace={workspace}
        onSaved={(updated) => {
          setWorkspace((prev: any) => ({ ...prev, ...updated }));
          if (wsId) useCacheStore.getState().invalidateWorkspace(wsId);
        }}
      />
      <TimerSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <WorkspaceReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        workspaceId={wsId || 0}
        workspaceName={workspace.name}
        category={workspace.category}
        dailyTargetMinutes={workspace.daily_target_minutes}
      />

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={columnVariants} className="lg:col-span-2 flex flex-col items-center w-full">
            {/* 🎯 Interactive Declared Goal / Intent Pill */}
            <div className="mb-6 flex justify-center w-full">
              {!isEditingIntent ? (
                <button
                  onClick={() => {
                    setIntentInput(workspace?.current_goal || (typeof workspace?.focus_keywords === 'string' ? workspace.focus_keywords : '') || '');
                    setIsEditingIntent(true);
                  }}
                  className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#202024] border border-[#27272a] hover:border-zinc-700 hover:bg-[#27272a] transition-all cursor-pointer shadow-sm max-w-xl text-left"
                >
                  <div className="w-5 h-5 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                    <Target className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#a1a1aa] shrink-0 font-semibold">Intent Guard:</span>
                    <span className="text-xs text-[#f4f4f5] font-medium truncate max-w-[260px] sm:max-w-[340px]">
                      {workspace?.current_goal || workspace?.focus_keywords || 'Click to declare session goal & allowed tools...'}
                    </span>
                  </div>
                  <Pencil className="w-3 h-3 text-[#a1a1aa] opacity-60 group-hover:opacity-100 group-hover:text-sky-400 transition-all shrink-0 ml-1" />
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveIntent();
                  }}
                  className="flex items-center gap-2 max-w-xl w-full px-3 py-1.5 bg-[#202024] border border-zinc-700 rounded-full shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                  <Target className="w-4 h-4 text-sky-400 shrink-0 ml-1" />
                  <input
                    type="text"
                    autoFocus
                    value={intentInput}
                    onChange={(e) => setIntentInput(e.target.value)}
                    placeholder="e.g. VS Code React frontend, documentation, Linear tasks..."
                    className="flex-1 bg-transparent border-none text-xs text-[#f4f4f5] focus:outline-none focus:ring-0 px-2 py-0.5 placeholder:text-zinc-600"
                  />
                  <button
                    type="submit"
                    disabled={isSavingIntent}
                    className="w-7 h-7 rounded-full bg-sky-500 hover:bg-sky-400 text-black flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    title="Save Intent"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingIntent(false)}
                    className="w-7 h-7 rounded-full hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>

            <div className="mb-8 flex flex-col items-center w-full">
              {/* Pomofocus Mode Pills */}
                <div className="flex items-center gap-1.5 mb-6 bg-[#202024] p-1.5 rounded-full border border-[#27272a]">
                  <button 
                    onClick={() => switchMode('FOCUS')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 cursor-pointer ${timerState.sessionMode === 'FOCUS' ? 'bg-zinc-800 text-[#f4f4f5] shadow-sm border border-zinc-700/60' : 'text-[#a1a1aa] hover:text-[#f4f4f5]'}`}
                  >
                    Focus
                  </button>
                  <button 
                    onClick={() => switchMode('SHORT_BREAK')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 cursor-pointer ${timerState.sessionMode === 'SHORT_BREAK' ? 'bg-zinc-800 text-[#f4f4f5] shadow-sm border border-zinc-700/60' : 'text-[#a1a1aa] hover:text-[#f4f4f5]'}`}
                  >
                    Short Break
                  </button>
                  <button 
                    onClick={() => switchMode('LONG_BREAK')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 cursor-pointer ${timerState.sessionMode === 'LONG_BREAK' ? 'bg-zinc-800 text-[#f4f4f5] shadow-sm border border-zinc-700/60' : 'text-[#a1a1aa] hover:text-[#f4f4f5]'}`}
                  >
                    Long Break
                  </button>
                </div>

                {/* Round Indicator */}
                {workspace?.category !== 'casual' && (
                  <div className="flex flex-col items-center mb-6">
                  {(() => {
                    const isSprint = workspace?.category === 'sprint';
                    const isMastery = workspace?.category === 'mastery';
                    let dailyTarget = 60;
                    if (isMastery) {
                      const rawTarget = (workspace?.daily_target_minutes && workspace.daily_target_minutes > 0)
                        ? workspace.daily_target_minutes
                        : (metrics?.today_target_minutes && metrics.today_target_minutes > 0 ? metrics.today_target_minutes : 60);
                      // Sanitize: Cap legacy mastery quota at 240m (4h) so 540m targets don't create 22 sessions
                      dailyTarget = Math.min(240, Math.max(15, rawTarget));
                    } else if (isSprint) {
                      if (workspace?.target_hours && workspace?.deadline) {
                        const now = new Date();
                        const deadlineDate = new Date(workspace.deadline);
                        const diffMs = deadlineDate.getTime() - now.getTime();
                        const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                        dailyTarget = Math.min(480, Math.max(15, Math.round((workspace.target_hours * 60) / daysRemaining)));
                      } else {
                        dailyTarget = metrics?.today_target_minutes || workspace?.daily_target_minutes || 60;
                      }
                    } else {
                      dailyTarget = metrics?.today_target_minutes || workspace?.daily_target_minutes || 60;
                    }
                    const sessionDuration = workspace?.work_duration || 25;
                    const totalSessionsForDay = computeTotalDailySessions(dailyTarget, sessionDuration, workspace?.status || 'active');
                    const displaySessionNumber = Math.min(timerState.sessionCount + (timerState.sessionMode === 'FOCUS' ? 1 : 0), totalSessionsForDay);
                    
                    return (
                      <>
                        <span className="text-xs font-mono font-semibold text-[#a1a1aa] tracking-wider uppercase mb-2">
                          Session {displaySessionNumber} of {totalSessionsForDay} today
                        </span>
                        <div className="flex gap-2 flex-wrap justify-center max-w-[280px]">
                          {Array.from({ length: totalSessionsForDay }).map((_, i) => {
                            const isCompleted = i < timerState.sessionCount;
                            return (
                              <div 
                                key={i} 
                                className={`w-2 h-2 rounded-full transition-colors ${isCompleted ? 'bg-[#f4f4f5]' : 'bg-[#27272a]'}`} 
                              />
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <TimerRing timeRemaining={timerState.timeRemaining} totalDuration={totalDuration} state={timerState.currentState} themeColor={workspace?.theme_color} sessionMode={timerState.sessionMode} />

              {/* 📡 Live Telemetry Status Pill (Under the Timer) */}
              <div className="mt-6 flex flex-col items-center">
                {timerState.currentState === 'FOCUS_RUNNING' && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border text-xs shadow-sm backdrop-blur-md transition-all ${
                      isTabFocused
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isTabFocused ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isTabFocused ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      </span>
                      {isTabFocused ? (
                        <>
                          <span>Aligned •</span>
                          <span className="font-semibold text-emerald-200">
                            {activeTelemetry?.platformName || activeTelemetry?.cleanAppName || activeTelemetry?.rawAppName?.replace(/\.exe$/i, '') || currentTabTitle || 'Flow State'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>Attention Shift •</span>
                          <span className="font-semibold text-rose-200">
                            {activeTelemetry?.platformName || activeTelemetry?.cleanAppName || 'External App'}
                          </span>
                        </>
                      )}
                    </span>

                    {isTabFocused && activeTelemetry?.summary && (
                      <span className="text-[11px] font-medium text-emerald-300/80 bg-emerald-500/15 border border-emerald-500/20 px-2.5 py-0.5 rounded-full max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap" title={activeTelemetry.summary}>
                        {activeTelemetry.summary}
                      </span>
                    )}
                    {!isTabFocused && activeTelemetry?.reason && (
                      <span className="text-[11px] font-medium text-rose-300/80 bg-rose-500/15 border border-rose-500/20 px-2.5 py-0.5 rounded-full max-w-[280px] break-words text-center leading-snug" title={activeTelemetry.reason}>
                        {activeTelemetry.reason}
                      </span>
                    )}
                  </motion.div>
                )}

                {timerState.currentState === 'IDLE' && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#202024] border border-[#27272a] text-xs shadow-sm backdrop-blur-md"
                  >
                    <span className="flex items-center gap-2 font-medium text-[#f4f4f5]">
                      <span className="inline-flex rounded-full h-2 w-2 bg-[#a1a1aa]"></span>
                      Ready • Intent Guard Armed
                    </span>
                    {sessionIntent && (
                      <span className="text-[11px] font-medium text-[#a1a1aa] bg-[#18181b] px-2.5 py-0.5 rounded-full truncate max-w-[260px] italic border border-[#27272a]" title={sessionIntent}>
                        "{sessionIntent}"
                      </span>
                    )}
                  </motion.div>
                )}

                {timerState.currentState === 'FOCUS_PAUSED' && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border text-xs shadow-sm backdrop-blur-md ${
                      activeDistraction
                        ? 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span className={`inline-flex rounded-full h-2 w-2 ${activeDistraction ? 'bg-rose-400' : 'bg-amber-400'} animate-pulse`}></span>
                      {activeDistraction
                        ? `Paused • ${activeDistraction.platformName || activeDistraction.cleanAppName || 'External App'}`
                        : `Paused • ${timerState.pauseReason || 'Manual'}`}
                    </span>
                    {activeDistraction?.reason && (
                      <span className="text-[11px] font-medium text-rose-300/80 bg-rose-500/15 border border-rose-500/20 px-2.5 py-0.5 rounded-full max-w-[280px] break-words text-center leading-snug" title={activeDistraction.reason}>
                        {activeDistraction.reason}
                      </span>
                    )}
                  </motion.div>
                )}

                {(timerState.currentState === 'BREAK_RUNNING' || timerState.currentState === 'BREAK_PAUSED') && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/25 text-xs shadow-sm backdrop-blur-md text-sky-300"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span className="inline-flex rounded-full h-2 w-2 bg-sky-400 animate-pulse"></span>
                      Recharge Break • Stretch & Hydrate
                    </span>
                  </motion.div>
                )}
              </div>
            </div>

            {isDetectionEnabled && timerState.currentState === 'IDLE' && cameraStatus === 'streaming' && engagementState === 'FACE_ABSENT' && (
              <div className="mb-6 w-full max-w-sm rounded-xl border bg-amber-500/10 border-amber-500/20 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-400">Poor Lighting / Face Not Visible</h4>
                    <p className="text-xs text-[#a1a1aa] mt-1 leading-relaxed">
                      The camera cannot clearly see your face. It may be too dark, or you might be out of frame. Please move to a well-lit area to start your session.
                    </p>
                  </div>
                </div>
              </div>
            )}

          <TimerControls 
            state={timerState.currentState} 
            timeRemaining={timerState.timeRemaining} 
            totalDuration={totalDuration} 
            canStartFocus={
              (isDetectionEnabled && workspace.camera_enabled)
                ? (cameraStatus === 'streaming' && engagementState !== 'FACE_ABSENT' && engagementState !== 'STRANGER')
                : true
            }
            onStartFocusBlocked={() => {
              if (cameraStatus !== 'streaming') {
                toast.error("Camera is not ready. Please wait or ensure it is not blocked.");
              } else {
                toast.error("No face detected. Please face the camera to start.");
              }
            }}
          />

          {timerState.currentState === 'FOCUS_PAUSED' && activeDistraction && !['Manual', 'manual_pause'].includes(timerState.pauseReason || '') && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
              <motion.div 
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-lg bg-[#202024] border border-[#27272a] rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden"
              >
                {/* Header: Badge + Title + Detected Pill */}
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <h3 className="text-lg font-bold text-[#f4f4f5] tracking-tight">Focus Interrupted</h3>
                  </div>

                  {(activeDistraction?.platformName || activeDistraction?.cleanAppName) && (
                    <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 shrink-0">
                      {activeDistraction.platformName
                        ? `${activeDistraction.platformName}${activeDistraction.cleanAppName && activeDistraction.cleanAppName !== activeDistraction.platformName ? ` • ${activeDistraction.cleanAppName}` : ''}`
                        : activeDistraction.cleanAppName}
                    </span>
                  )}
                </div>
                
                {/* Detected Activity Title */}
                <div className="mb-4">
                  <p className="text-[11px] text-[#a1a1aa] uppercase tracking-wider font-semibold mb-1">Detected Activity</p>
                  <p className="text-sm font-semibold text-[#f4f4f5] leading-snug break-words">
                    {activeDistraction?.contentTitle || activeDistraction?.rawWindowTitle || currentTabTitle || 'External application'}
                  </p>
                </div>
                
                {/* AI Coach Callout Box: Full semantic reason */}
                <div className="mb-4 bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Brain className="w-4 h-4 text-rose-400" />
                    <p className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Why Prodify Paused Your Session</p>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {activeDistraction?.reason || timerState.pauseReason}
                  </p>
                </div>

                {/* Comparison Box: Declared Goal */}
                {sessionIntent && (
                  <div className="mb-6 bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
                    <p className="text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider mb-1">Your Stated Goal</p>
                    <p className="text-xs font-medium text-zinc-200 italic">"{sessionIntent}"</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button 
                    onClick={handleReturnToFocus}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-[#f4f4f5] border border-zinc-700 font-medium py-2 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    Return to Focus
                  </button>
                  <button 
                    onClick={handleAllowForSession}
                    className="flex-1 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:text-[#f4f4f5] font-medium py-2 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                  >
                    Allow for This Session
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>

        <motion.div variants={columnVariants} className="space-y-4">
          {!isDetectionEnabled && (
            <div className="rounded-xl border border-[#27272a] p-4 bg-[#202024]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <CameraOff className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#f4f4f5]">Tracking Disabled</p>
                  <p className="text-[10px] text-[#a1a1aa]">
                    {isManualOverride ? 'Manual override active' : 'Whitelisted site'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(isDetectionEnabled && workspace.camera_enabled) && (
            <div className="rounded-xl border border-[#27272a] overflow-hidden bg-[#202024]/80 backdrop-blur-md">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a] bg-[#202024]/40">
                <span className="text-xs font-medium text-[#a1a1aa] flex items-center gap-1.5">
                  <Webcam className="w-3.5 h-3.5" />
                  Camera Feed
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  cameraStatus === 'streaming'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : cameraStatus === 'loading'
                      ? 'bg-sky-500/15 text-sky-400'
                      : 'bg-rose-500/15 text-rose-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    cameraStatus === 'streaming'
                      ? 'bg-emerald-400 animate-pulse'
                      : cameraStatus === 'loading'
                        ? 'bg-sky-400 animate-pulse'
                        : 'bg-rose-400'
                  }`} />
                  {cameraStatus === 'streaming' && 'Live'}
                  {cameraStatus === 'loading' && 'Starting'}
                  {cameraStatus === 'error' && 'Offline'}
                  {cameraStatus === 'disabled' && 'Off'}
                </span>
              </div>
              <div className="p-3">
                <WebcamStream 
                  onDistractionDetected={handleDistraction} 
                  onStatus={handleCameraStatus}
                  onEngagementState={(state) => {
                    setEngagementState(state);
                    // Track the last focused window when user is actively working
                    if (state === 'ACTIVE_WORK' || state === 'FOCUSED_THINKING') {
                      if (currentTabTitle) setLastFocusedWindow(currentTabTitle);
                    }
                  }}
                  isEnabled={isDetectionEnabled}
                  isTimerRunning={timerState.currentState === 'FOCUS_RUNNING'}
                />
                {cameraStatus === 'disabled' && (
                  <div className="flex flex-col items-center justify-center py-6 text-[#a1a1aa]">
                    <CameraOff className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs">Camera not initialized</p>
                  </div>
                )}
                {cameraStatus === 'loading' && (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {timerState.currentState === 'FOCUS_RUNNING' && (
            <CoachInsightPanel
              engagementState={engagementState}
              isSessionActive={true}
              currentHour={new Date().getHours()}
              workspaceName={workspace.name}
              lastFocusedWindow={lastFocusedWindow || currentTabTitle}
              lastFocusedApp=""
            />
          )}
            {/* ── Compact 2×2 Key Metrics Grid (Folded Live Stats) ── */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {/* 1. Pace or Logged Today */}
              <div className="flex flex-col justify-between bg-[#202024]/80 border border-[#27272a] hover:border-zinc-700 transition-colors p-3 rounded-xl shadow-sm">
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">
                    {workspace?.category !== 'casual' ? 'Pace' : 'Logged'}
                  </span>
                  <MetricInfoPopover
                    title="Workspace Pace"
                    description="Rolling 7-day consistency and volume score for this workspace."
                    formula="(Consistency + Volume + Quality) / 3"
                    benchmark=">=80 Strong · 60-79 Solid · <40 Slipping"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[#f4f4f5] font-mono font-bold text-sm leading-snug">
                    {workspace?.category !== 'casual' ? (
                      metrics?.pace ? (
                        (() => {
                          const createdDateStr = toLocalISODate(workspace?.created_at);
                          const todayDateStr = getTodayLocalISODate();
                          const isCreatedToday = !createdDateStr || createdDateStr >= todayDateStr;
                          const hasPastWork = metrics?.calendar?.some(d => d.date < todayDateStr && (d.actual_minutes || 0) > 0);
                          const isDay1 = isCreatedToday || !hasPastWork;
                          
                          let effectiveLabel = metrics.pace.label;
                          if (isDay1 && (effectiveLabel === 'Slipping' || effectiveLabel === 'Shaky')) {
                            effectiveLabel = metrics.today_actual_minutes > 0 ? 'On Track' : 'Ready';
                          }
                          const effectiveScore = (isDay1 && (effectiveLabel === 'Ready' || effectiveLabel === 'On Track')) ? null : metrics.pace.score;
                          return (
                            <>
                              <span className={
                                effectiveLabel === 'Strong' ? 'text-sky-400' :
                                effectiveLabel === 'Solid' || effectiveLabel === 'On Track' ? 'text-emerald-400' :
                                effectiveLabel === 'Ready' ? 'text-sky-400' :
                                effectiveLabel === 'Shaky' ? 'text-amber-400' : 'text-rose-400'
                              }>
                                {effectiveLabel}
                              </span>
                              {effectiveScore != null && <span className="text-[#a1a1aa] text-[10px] ml-1">({Math.round(effectiveScore)})</span>}
                            </>
                          );
                        })()
                      ) : (
                        <span className="text-[#a1a1aa]">—</span>
                      )
                    ) : (
                      metrics ? `${Math.floor(metrics.today_actual_minutes / 60)}h ${Math.round(metrics.today_actual_minutes % 60)}m` : '—'
                    )}
                  </span>
                  <span className="text-[10px] font-mono mt-0.5 text-[#a1a1aa] truncate">
                    {metrics?.workspace_streak_current ? `${metrics.workspace_streak_current}d streak` : 'Streak active'}
                  </span>
                </div>
              </div>

              {/* 2. Deep Work Ratio (Reflects Cognitive Penalty) */}
              <div className="flex flex-col justify-between bg-[#202024]/80 border border-[#27272a] hover:border-zinc-700 transition-colors p-3 rounded-xl shadow-sm">
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">
                    Deep Flow
                  </span>
                  <MetricInfoPopover
                    title="Deep Work Ratio"
                    description="Deep flow purity: percentage of session time spent focused vs distracted."
                    formula="(Focus Sec / (Focus Sec + Distracted Sec)) × 100"
                    benchmark="Aim for >85% deep flow"
                    align="end"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-emerald-400 font-mono font-bold text-sm">
                    {liveDeepFlowRatio != null ? `${liveDeepFlowRatio}%` : '—'}
                  </span>
                  <span className={`text-[10px] font-mono mt-0.5 truncate ${todayDistractions > 0 ? 'text-rose-400 font-medium' : 'text-[#a1a1aa]'}`}>
                    {todayDistractions} distraction{todayDistractions === 1 ? '' : 's'} today
                  </span>
                </div>
              </div>

              {/* 3. Today's Quota / Remaining */}
              <div className="flex flex-col justify-between bg-[#202024]/80 border border-[#27272a] hover:border-zinc-700 transition-colors p-3 rounded-xl shadow-sm">
                <div className="flex items-center gap-1 mb-1.5">
                  <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">
                    Today's Quota
                  </span>
                  <MetricInfoPopover
                    title="Today's Quota"
                    description="Calculated daily target quota remaining for today. Dynamically adjusted for sprint deadlines."
                    formula="Target Minutes Today - Logged Minutes Today"
                    benchmark="Target: 0m left (Quota Met)"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[#f4f4f5] font-mono font-bold text-sm">
                    {metrics ? (
                      (() => {
                        const effectiveTarget = workspace?.category === 'mastery'
                          ? Math.min(240, Math.max(15, (workspace?.daily_target_minutes && workspace.daily_target_minutes > 0)
                              ? workspace.daily_target_minutes
                              : (metrics.today_target_minutes > 0 ? metrics.today_target_minutes : 60)))
                          : metrics.today_target_minutes;
                        const totalSessions = computeTotalDailySessions(effectiveTarget, workspace?.work_duration || 25, workspace?.status || 'active');
                        return `${totalSessions} session${totalSessions !== 1 ? 's' : ''} today`;
                      })()
                    ) : (
                      <span className="text-[#a1a1aa]">—</span>
                    )}
                  </span>
                  <span className="text-[10px] font-mono mt-0.5 text-[#a1a1aa] truncate">
                    {todayCompletedSessions} session{todayCompletedSessions === 1 ? '' : 's'} ({todayLoggedMinutes}m) today
                  </span>
                </div>
              </div>

              {/* 4. Vitality (Cumulative Focus + Distractions) */}
              {(() => {
                const vitalityPct = Math.max(10, Math.round((1 - effectiveBurnoutProb) * 100));
                const isHighFatigue = effectiveBurnoutProb >= 0.70;
                const isModFatigue = effectiveBurnoutProb >= 0.35;
                const iconColor = isHighFatigue ? 'text-rose-400' : isModFatigue ? 'text-amber-400' : 'text-emerald-400';
                const vitalityColor = isHighFatigue ? 'text-rose-400' : isModFatigue ? 'text-amber-400' : 'text-emerald-400';
                const tileBorder = isHighFatigue
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : isModFatigue
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-[#202024]/80 border border-[#27272a]';
                const fatigueLabel = isHighFatigue
                  ? 'High Fatigue'
                  : isModFatigue
                    ? 'Moderate'
                    : 'Peak Flow';
                return (
                  <div className={`flex flex-col justify-between p-3 rounded-xl border ${tileBorder} hover:border-zinc-700 transition-colors shadow-sm`}>
                    <div className="flex items-center gap-1 mb-1.5">
                      <HeartPulse className={`w-3 h-3 ${iconColor}`} />
                      <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">
                        Vitality
                      </span>
                      <MetricInfoPopover
                        title="Focus Vitality & Fatigue"
                        description="Biometric and session pacing model estimating cognitive fatigue based on cumulative focus minutes and context switches."
                        formula="100% - Burnout Probability"
                        benchmark="Vitality >70% = Peak Flow"
                        align="end"
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className={`font-mono font-bold text-sm ${vitalityColor}`}>
                        {vitalityPct}%
                      </span>
                      <span className="text-[10px] font-mono mt-0.5 text-[#a1a1aa] truncate">
                        {fatigueLabel}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Structured Goal Calendar ── */}
            {workspace?.id && workspace?.category !== 'casual' && (
              <StructuredGoalCalendar 
                workspaceId={workspace.id} 
                mode={workspace.mode} 
                sessionCount={timerState.sessionCount}
                calendar={metrics?.calendar}
                createdDate={toLocalISODate(workspace.created_at)}
                sprintStartDate={toLocalISODate(workspace.created_at)}
                sprintDeadlineDate={toLocalISODate(workspace.deadline)}
              />
            )}



        </motion.div>
      </motion.div>

      {(() => {
        const minutes = Math.floor(timerState.timeRemaining / 60).toString().padStart(2, '0');
        const seconds = (timerState.timeRemaining % 60).toString().padStart(2, '0');
        const timerString = `${minutes}:${seconds}`;
        return (
          <div data-tour="ai-coach" className="contents">
            <AiCoachPanel
            workspaceId={wsId}
            focusMinutes={focusMinutes}
            distractionCount={timerState.distractionCount}
            distractedSeconds={timerState.distractedSeconds || 0}
            burnoutProbability={burnoutProb}
            currentState={timerState.currentState}
            sessionCount={timerState.sessionCount}
            workspaceName={workspace.name}
            idleSeconds={0}
            timeRemainingString={timerString}
            workDuration={workspace.work_duration || 45}
            breakDuration={workspace.break_duration || 5}
            targetHours={workspace.target_hours || 0}
            themeColor={workspace.theme_color || 'violet'}
            currentTabTitle={currentTabTitle}
            focusKeywords={workspaceKeywords}
            isTabDistracted={isTabDistracted}
            workspaceCategory={workspace.category}
            sessionIntent={workspace.current_goal || (typeof workspace.focus_keywords === 'string' ? workspace.focus_keywords : '') || ''}
          />
          </div>
        );
      })()}

      {/* 🏆 Sprint Victory / AI Coach Memory Debrief Modal */}
      <div className="contents">
        {showDebrief && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl bg-[#202024] border border-[#27272a] rounded-xl p-6 sm:p-8 shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => setShowDebrief(false)}
                className="absolute top-4 right-4 p-2 text-[#a1a1aa] hover:text-[#f4f4f5] rounded-lg hover:bg-[#27272a] transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>

              {debriefLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-xs font-mono text-[#a1a1aa] animate-pulse">
                    Synthesizing Sprint Debrief & Reviewing Coach Memory...
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Header Badge & Title */}
                  <div className="flex flex-col items-center text-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold text-amber-400">
                        Mission Debrief
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold text-[#f4f4f5] tracking-tight mt-0.5">
                        {workspace.name}
                      </h2>
                    </div>
                    {debriefData?.tier && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-400/10 border border-amber-400/25 text-amber-300">
                        <Award className="w-3.5 h-3.5" />
                        {debriefData.tier} Rating • {debriefData.tier_title}
                      </span>
                    )}
                  </div>

                  {/* 4 Stat KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#18181b] border border-[#27272a] p-3 rounded-xl flex flex-col items-center text-center shadow-sm">
                      <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">Focus Hours</span>
                      <span className="text-base sm:text-lg font-mono font-bold text-[#f4f4f5] mt-0.5">
                        {debriefData?.total_focus_hours ?? 0}h
                      </span>
                      <span className="text-[10px] text-[#a1a1aa]/80">of {debriefData?.target_hours ?? workspace.target_hours ?? 0}h target</span>
                    </div>
                    <div className="bg-[#18181b] border border-[#27272a] p-3 rounded-xl flex flex-col items-center text-center shadow-sm">
                      <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">Goal Progress</span>
                      <span className="text-base sm:text-lg font-mono font-bold text-emerald-400 mt-0.5">
                        {debriefData?.completion_pct ?? 0}%
                      </span>
                      <span className="text-[10px] text-[#a1a1aa]/80">Total volume</span>
                    </div>
                    <div className="bg-[#18181b] border border-[#27272a] p-3 rounded-xl flex flex-col items-center text-center shadow-sm">
                      <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">Deep Work Purity</span>
                      <span className="text-base sm:text-lg font-mono font-bold text-sky-400 mt-0.5">
                        {debriefData?.focus_purity ?? 0}%
                      </span>
                      <span className="text-[10px] text-[#a1a1aa]/80">Flow purity</span>
                    </div>
                    <div className="bg-[#18181b] border border-[#27272a] p-3 rounded-xl flex flex-col items-center text-center shadow-sm">
                      <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider font-semibold font-mono">Sessions</span>
                      <span className="text-base sm:text-lg font-mono font-bold text-[#f4f4f5] mt-0.5">
                        {debriefData?.session_count ?? 0}
                      </span>
                      <span className="text-[10px] text-[#a1a1aa]/80">Completed</span>
                    </div>
                  </div>

                  {/* AI Coach Memory Debrief Bubble */}
                  <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5 relative">
                    <div className="flex items-center gap-2 mb-2 text-xs font-mono font-semibold text-sky-400">
                      <Brain className="w-4 h-4" />
                      <span>AI Performance Coach Memory Debrief</span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-body">
                      {debriefData?.coach_message || "Congratulations on finishing your sprint! Take a well-deserved rest before planning your next challenge."}
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowDebrief(false);
                        setIsReportOpen(true);
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-[#f4f4f5] transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#a1a1aa]" />
                      View Analytics
                    </button>
                    <button
                      onClick={() => setShowDebrief(false)}
                      className="px-5 py-2 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[#f4f4f5] transition-colors cursor-pointer"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </div>

      <SpotlightTour />
    </motion.div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CameraOff, AlertTriangle, Webcam, Activity, Brain, Clock, Settings } from 'lucide-react';
import { useTimerStore, initTimer, useTimer, switchMode } from '@/lib/timerStore';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useAdaptiveFocus } from '@/hooks/useAdaptiveFocus';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import WebcamStream from '@/components/workspace/WebcamStream';
import TimerRing from '@/components/timer/TimerRing';
import TimerControls from '@/components/timer/TimerControls';
import SessionStats from '@/components/timer/SessionStats';
import AiCoachPanel from '@/components/chat/AiCoachPanel';
import CoachInsightPanel from '@/components/dashboard/CoachInsightPanel';
import { StructuredGoalCalendar } from '@/components/workspace/StructuredGoalCalendar';
import { TimerSettingsModal } from '@/components/timer/TimerSettingsModal';

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

  // Component State
  const [burnoutProb, setBurnoutProb] = useState(0);
  const [workspace, setWorkspace] = useState<any>(null);
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('disabled');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [engagementState, setEngagementState] = useState<string>('ACTIVE_WORK');
  const [lastFocusedWindow, setLastFocusedWindow] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const loggedCompletionRef = useRef<number | null>(null);
  const lastBurnoutMinuteRef = useRef<number | null>(null);

  // Compute workspace keywords for frontend-side matching
  const workspaceKeywords = useMemo(() => parseKeywords(workspace?.focus_keywords), [workspace?.focus_keywords]);
  // Extract the raw intent string for the AI backend
  const sessionIntent = workspace?.current_goal || getIntentString(workspace?.focus_keywords);

  // If keywords are defined, disable tab-visibility enforcement (trust camera/gaze)
  useTabVisibility({
    disabled: workspaceKeywords.length > 0,
  });

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
  const { currentTabTitle, isFocused: isTabFocused, markAsRelevant } = useAdaptiveFocus({
    keywords: workspaceKeywords,
    enabled: isDetectionEnabled,
    sessionIntent,
    workspaceId: wsId,
    onDistracted: (reason?: string, appName?: string, summary?: string) => {
      const store = useTimerStore.getState();
      const currentWsId = store.activeWorkspaceId;
      const timerWs = currentWsId !== null ? store.workspaces[currentWsId] : undefined;
      const currentState = timerWs?.currentState || 'IDLE';
      const pauseReason = timerWs?.pauseReason;

      const isActivelyDistracted = currentState === 'FOCUS_RUNNING' || 
        (currentState === 'FOCUS_PAUSED' && pauseReason && !['IDLE_DETECTED', 'Manual', 'manual_pause'].includes(pauseReason));

      if (isDetectionEnabled && isActivelyDistracted) {
        const trimmedReason = reason?.trim();
        const trimmedSummary = summary?.trim();
        const isErrorOrEmpty = !trimmedReason ||
          trimmedReason.toLowerCase().includes("evaluation failed") ||
          trimmedReason.toLowerCase().includes("rate limit");

        const appLabel = appName ? appName.replace(/\.(exe|app)$/i, '') : "an application";
        const displayReason = isErrorOrEmpty
          ? `You switched to ${appLabel} which does not match your session intent.`
          : (trimmedSummary || trimmedReason);

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

  const isTabDistracted = !isTabFocused;

  // --- Idle Detection ---
  const handleIdle = useCallback(() => {
    const store = useTimerStore.getState();
    const ws = store.workspaces[store.activeWorkspaceId ?? -1];
    if (ws && ws.currentState === 'FOCUS_RUNNING') {
      store.incrementDistraction();
      store.pauseFocus('IDLE_DETECTED');
      toast.error("You walked away!", {
        description: "No activity detected for 60 seconds. Timer paused.",
        duration: 4000,
      });
    }
  }, []);

  const handleActive = useCallback(() => {
    toast.success("Welcome back!", {
      description: "Resume your focus session whenever ready.",
      duration: 2000,
    });
  }, []);

  const dynamicIdleTimeout = isTabFocused ? 0 : 60000; // 0 (Suppressed) for aligned (passive study), 1 min for unaligned

  const { isIdle, idleTime } = useIdleDetection({
    idleTimeout: dynamicIdleTimeout,
    enabled: isDetectionEnabled && timerState.currentState === 'FOCUS_RUNNING',
    onIdle: handleIdle,
    onActive: handleActive,
  });

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

  // Fetch workspace
  useEffect(() => {
    if (!wsId) {
      setIsLoading(false);
      return;
    }
    fetch(`${API_BASE}/workspaces/${wsId}`, { 
      headers: getAuthHeaders(),
      cache: 'no-store'
    })
      .then(res => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((ws: any) => {
        setWorkspace(ws || null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [wsId]);

  // Workspace metrics — same fetch pattern as WorkspaceCard
  useEffect(() => {
    if (!wsId) return;
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/metrics/workspace/${wsId}`, {
          headers: getAuthHeaders(),
          cache: 'no-store'
        });
        if (res.ok && isMounted) {
          setMetrics(await res.json());
        } else if (!res.ok) {
          console.error(`Failed to fetch workspace metrics: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('Failed to fetch workspace metrics', err);
      }
    };
    fetchMetrics();
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

  // Query the backend risk estimator once per elapsed focus minute.
  useEffect(() => {
    if (timerState.currentState === 'IDLE' || timerState.currentState === 'SESSION_COMPLETED') {
      setBurnoutProb(0);
      lastBurnoutMinuteRef.current = null;
      return;
    }
    const totalDuration = timerState.focusDuration;
    const elapsed = totalDuration - timerState.timeRemaining;
    const focusMinutes = Math.max(0, Math.floor(elapsed / 60));
    if (lastBurnoutMinuteRef.current === focusMinutes) return;
    lastBurnoutMinuteRef.current = focusMinutes;

    const controller = new AbortController();
    fetch(
      `${API_BASE}/api/ml/burnout-prediction?current_hour=${new Date().getHours()}&current_focus_minutes=${focusMinutes}`,
      { headers: getAuthHeaders(), signal: controller.signal },
    )
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => setBurnoutProb(Number(data.tab_switch_probability) || 0))
      .catch(error => {
        if (error.name !== 'AbortError') console.error('Unable to fetch burnout risk:', error);
      });
    return () => controller.abort();
  }, [timerState.timeRemaining, timerState.currentState, timerState.distractionCount, timerState.focusDuration]);

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

      // 2. Legacy telemetry call
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
          }),
        }).catch(error => {
          loggedCompletionRef.current = null;
          console.error('Unable to save completed focus session:', error);
        });
      }

      // Reset elapsed tracker for next session
      maxElapsedRef.current = 0;
    } else if (current !== 'SESSION_COMPLETED') {
      loggedCompletionRef.current = null;
    }

    previousStateRef.current = current;
  }, [timerState.currentState, workspace, wsId, burnoutProb, timerState.distractionCount, timerState.sessionCount]);

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
      className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto"
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
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Focus Tracking Unavailable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {cameraErrorMessage || "Camera is not accessible. The timer will still work, but distraction detection is disabled."}
            </p>
          </div>
          <button
            onClick={() => setIsManualOverride(true)}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
          >
            Dismiss
          </button>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <Link to="/" className="w-10 h-10 rounded-xl border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{workspace.name}</h1>
            <p className="text-xs text-muted-foreground">
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isManualOverride ? 'bg-amber-500/20 text-amber-500' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {isManualOverride ? "Tracking Paused (Manual)" : "Tracking Active"}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px] text-center">
                Prodify is actively monitoring your window activity, keyboard input, and camera (if enabled) to track your focus.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 rounded-lg flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
      
      <TimerSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={columnVariants} className="lg:col-span-2 flex flex-col items-center w-full">
            <div className="mb-8 flex flex-col items-center w-full">
              {/* Pomofocus Mode Pills */}
                <div className="flex items-center gap-2 mb-6 bg-secondary/30 p-1.5 rounded-full border border-border/40">
                  <button 
                    onClick={() => switchMode('FOCUS')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-500 cursor-pointer ${timerState.sessionMode === 'FOCUS' ? 'text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    style={timerState.sessionMode === 'FOCUS' ? { backgroundColor: activeColor } : {}}
                  >
                    Focus
                  </button>
                  <button 
                    onClick={() => switchMode('SHORT_BREAK')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-500 cursor-pointer ${timerState.sessionMode === 'SHORT_BREAK' ? 'text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    style={timerState.sessionMode === 'SHORT_BREAK' ? { backgroundColor: activeColor } : {}}
                  >
                    Short Break
                  </button>
                  <button 
                    onClick={() => switchMode('LONG_BREAK')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-500 cursor-pointer ${timerState.sessionMode === 'LONG_BREAK' ? 'text-black shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    style={timerState.sessionMode === 'LONG_BREAK' ? { backgroundColor: activeColor } : {}}
                  >
                    Long Break
                  </button>
                </div>

                {/* Round Indicator */}
                {workspace?.category !== 'casual' && (
                  <div className="flex flex-col items-center mb-6">
                  {(() => {
                    const dailyTarget = workspace?.daily_target_minutes || 60;
                    const sessionDuration = workspace?.work_duration || 25;
                    const totalSessionsForDay = Math.max(1, Math.ceil(dailyTarget / sessionDuration));
                    const displaySessionNumber = Math.min(timerState.sessionCount + (timerState.sessionMode === 'FOCUS' ? 1 : 0), totalSessionsForDay);
                    
                    return (
                      <>
                        <span className="text-sm font-bold text-muted-foreground tracking-widest uppercase mb-2">
                          Session {displaySessionNumber} of {totalSessionsForDay} today
                        </span>
                        <div className="flex gap-2 flex-wrap justify-center max-w-[280px]">
                          {Array.from({ length: totalSessionsForDay }).map((_, i) => {
                            const isCompleted = i < timerState.sessionCount;
                            return (
                              <div 
                                key={i} 
                                className={`w-2 h-2 rounded-full transition-colors ${isCompleted ? 'bg-blue-500' : 'bg-border'}`} 
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
            </div>

            {isDetectionEnabled && timerState.currentState === 'IDLE' && cameraStatus === 'streaming' && engagementState === 'FACE_ABSENT' && (
              <div className="mb-6 w-full max-w-sm rounded-xl border bg-amber-500/10 border-amber-500/20 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Poor Lighting / Face Not Visible</h4>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1 leading-relaxed">
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

          {timerState.currentState === 'FOCUS_PAUSED' && timerState.pauseReason === 'IDLE_DETECTED' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 w-full max-w-lg bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 rounded-l-2xl"></div>
              
              <div className="flex items-start gap-4">
                <div className="shrink-0 mt-1 w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-amber-500 mb-1">Session Paused Due to Inactivity</h3>
                  <p className="text-sm text-foreground mb-5 leading-relaxed">
                    No input was detected for an extended period. Click Resume when you are back.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => useTimerStore.getState().resumeFocus()}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-xl transition-colors shadow-sm"
                    >
                      Resume Session
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {timerState.currentState === 'FOCUS_PAUSED' && timerState.pauseReason && !['IDLE_DETECTED', 'Manual', 'manual_pause'].includes(timerState.pauseReason) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-lg bg-zinc-950 border border-red-500/50 rounded-xl p-6 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                
                <div className="flex items-start gap-4">
                  <div className="shrink-0 mt-1 w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-red-500 mb-1">Focus Interrupted</h3>
                  <p className="text-sm text-foreground mb-2 leading-relaxed">
                    {timerState.pauseReason}
                  </p>
                  
                  {sessionIntent && (
                    <div className="bg-background/50 rounded-lg p-3 border border-border/50 mb-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Declared Goal</p>
                      <p className="text-sm font-medium text-foreground">"{sessionIntent}"</p>
                    </div>
                  )}

                  <p className="text-sm font-semibold text-red-400 mb-5">
                    You shouldn't be here. Return to your session.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => useTimerStore.getState().resumeFocus()}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-xl transition-colors shadow-sm"
                    >
                      Back to Focus
                    </button>
                    <button 
                      onClick={() => {
                        toast.success("Noted as relevant", { description: "We'll try to learn from this." });
                        markAsRelevant();
                        useTimerStore.getState().decrementDistraction();
                        useTimerStore.getState().resumeFocus();
                      }}
                      className="flex-1 border border-[#444] text-[#ccc] hover:bg-zinc-800 hover:text-white font-medium py-2 px-4 rounded-xl transition-colors"
                    >
                      This is relevant
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
            </div>
          )}
        </motion.div>

        <motion.div variants={columnVariants} className="space-y-4">
          {!isDetectionEnabled && (
            <div className="rounded-xl border border-border/40 p-4 bg-card">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <CameraOff className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Tracking Disabled</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isManualOverride ? 'Manual override active' : 'Whitelisted site'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(isDetectionEnabled && workspace.camera_enabled) && (
            <div className="rounded-xl border border-border/40 overflow-hidden bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Webcam className="w-3.5 h-3.5" />
                  Camera Feed
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  cameraStatus === 'streaming'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : cameraStatus === 'loading'
                      ? 'bg-blue-500/15 text-blue-500'
                      : 'bg-red-500/15 text-red-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    cameraStatus === 'streaming'
                      ? 'bg-emerald-500 animate-pulse'
                      : cameraStatus === 'loading'
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-red-500'
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
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <CameraOff className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-xs">Camera not initialized</p>
                  </div>
                )}
                {cameraStatus === 'loading' && (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}



          {timerState.currentState === 'FOCUS_RUNNING' && engagementState === 'FACE_ABSENT' && (
            <CoachInsightPanel
              engagementState={engagementState}
              isSessionActive={true}
              currentHour={new Date().getHours()}
              workspaceName={workspace.name}
              lastFocusedWindow={lastFocusedWindow || currentTabTitle}
              lastFocusedApp=""
            />
          )}
            <div className="grid grid-cols-1 gap-3 mb-4">
              {workspace?.category !== 'casual' ? (
                <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Pace</span>
                    <span className="text-white font-mono font-bold text-sm">
                      {metrics?.pace ? (
                        <>
                          <span className={
                            metrics.pace.label === 'Strong' ? 'text-blue-500' :
                            metrics.pace.label === 'Solid' ? 'text-green-400' :
                            metrics.pace.label === 'Shaky' ? 'text-amber-400' : 'text-red-400'
                          }>
                            {metrics.pace.label}
                          </span>
                          <span className="text-[#888888] ml-1">{Math.round(metrics.pace.score)}</span>
                          <span className="text-[#888888] text-[10px] ml-1">7d</span>
                        </>
                      ) : (
                        <span className="text-[#888888] animate-pulse">loading...</span>
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                    <Activity className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Total Logged Today</span>
                    <span className="text-white font-mono font-bold text-sm">
                      {metrics ? (
                        <>
                          {Math.floor(metrics.today_actual_minutes / 60)}h {metrics.today_actual_minutes % 60}m
                        </>
                      ) : (
                        <span className="text-[#888888] animate-pulse">loading...</span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Deep Work Ratio</span>
                  <span className="text-white font-mono font-bold text-sm">
                    {metrics ? (
                      <>
                        {metrics.deep_work_ratio != null ? `${Math.round(metrics.deep_work_ratio)}%` : '-'}
                        {workspace?.category !== 'casual' ? <span className="text-[#888888] text-[10px] ml-1">7d</span> : <span className="text-[#888888] text-[10px] ml-1">Today</span>}
                      </>
                    ) : (
                      <span className="text-[#888888] animate-pulse">loading...</span>
                    )}
                  </span>
                </div>
              </div>
              
              {workspace?.category !== 'casual' && (
                <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded-xl">
                  <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Today</span>
                    <span className="text-white font-mono font-bold text-sm">
                      {metrics ? (
                        formatHoursLeftToday(metrics.today_target_minutes, metrics.today_actual_minutes)
                      ) : (
                        <span className="text-[#888888] animate-pulse">loading...</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          {workspace?.id && workspace?.category !== 'casual' && (
              <StructuredGoalCalendar 
                workspaceId={workspace.id} 
                mode={workspace.mode} 
                sessionCount={timerState.sessionCount}
                calendar={metrics?.calendar}
              />
            )}
          {(timerState.currentState === 'SESSION_COMPLETED' || timerState.sessionCount > 0) && (
            <SessionStats sessionCount={timerState.sessionCount} distractionCount={timerState.distractionCount} focusMinutes={focusMinutes} workDuration={workspace.work_duration || 45} />
          )}

        </motion.div>
      </motion.div>

      {(() => {
        const minutes = Math.floor(timerState.timeRemaining / 60).toString().padStart(2, '0');
        const seconds = (timerState.timeRemaining % 60).toString().padStart(2, '0');
        const timerString = `${minutes}:${seconds}`;
        return (
          <AiCoachPanel
            workspaceId={wsId}
            focusMinutes={focusMinutes}
            distractionCount={timerState.distractionCount}
            distractedSeconds={timerState.distractedSeconds || 0}
            burnoutProbability={burnoutProb}
            currentState={timerState.currentState}
            sessionCount={timerState.sessionCount}
            workspaceName={workspace.name}
            idleSeconds={Math.floor(idleTime / 1000)}
            timeRemainingString={timerString}
            workDuration={workspace.work_duration || 45}
            breakDuration={workspace.break_duration || 5}
            targetHours={workspace.target_hours || 0}
            themeColor={workspace.theme_color || 'violet'}
            currentTabTitle={currentTabTitle}
            focusKeywords={workspaceKeywords}
            isTabDistracted={isTabDistracted}
          />
        );
      })()}
    </motion.div>
  );
}

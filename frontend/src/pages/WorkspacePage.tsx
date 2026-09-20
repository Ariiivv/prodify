import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CameraOff, AlertTriangle, Webcam } from 'lucide-react';
import { useTimerStore, initTimer, useTimer } from '@/lib/timerStore';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useAdaptiveFocus } from '@/hooks/useAdaptiveFocus';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { toast } from 'sonner';
import { audioEngine } from '@/lib/audio';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

import WebcamStream from '@/components/workspace/WebcamStream';
import TimerRing from '@/components/timer/TimerRing';
import TimerControls from '@/components/timer/TimerControls';
import BurnoutGauge from '@/components/timer/BurnoutGauge';
import SessionStats from '@/components/timer/SessionStats';
import EnforcementModal from '@/components/timer/EnforcementModal';
import AiCoachPanel from '@/components/chat/AiCoachPanel';
import CoachInsightPanel from '@/components/dashboard/CoachInsightPanel';
import { StructuredGoalCalendar } from '@/components/workspace/StructuredGoalCalendar';

type CameraStatus = 'loading' | 'streaming' | 'error' | 'disabled';

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

  // Component State
  const [burnoutProb, setBurnoutProb] = useState(0);
  const [workspace, setWorkspace] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('disabled');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);
  const [engagementState, setEngagementState] = useState<string>('ACTIVE_WORK');
  const [lastFocusedWindow, setLastFocusedWindow] = useState<string>('');
  const loggedCompletionRef = useRef<number | null>(null);
  const lastBurnoutMinuteRef = useRef<number | null>(null);

  // Compute workspace keywords for frontend-side matching
  const workspaceKeywords = parseKeywords(workspace?.focus_keywords);
  // Extract the raw intent string for the AI backend
  const sessionIntent = getIntentString(workspace?.focus_keywords);

  // If keywords are defined, disable tab-visibility enforcement (trust camera/gaze)
  const { enforcementTriggered, setEnforcementTriggered } = useTabVisibility({
    disabled: workspaceKeywords.length > 0,
  });

  // Compute if detection should run
  const isDetectionEnabled = !isManualOverride;

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
  const { currentTabTitle, isFocused: isTabFocused } = useAdaptiveFocus({
    keywords: workspaceKeywords,
    enabled: isDetectionEnabled,
    sessionIntent,
    onDistracted: (reason?: string, appName?: string) => {
      const store = useTimerStore.getState();
      const currentWsId = store.activeWorkspaceId;
      const currentState = currentWsId !== null ? store.workspaces[currentWsId]?.currentState : 'IDLE';

      if (isDetectionEnabled && currentState === 'FOCUS_RUNNING') {
        const trimmedReason = reason?.trim();
        const isErrorOrEmpty = !trimmedReason ||
          trimmedReason.toLowerCase().includes("evaluation failed") ||
          trimmedReason.toLowerCase().includes("rate limit");

        const appLabel = appName ? appName.replace(/\.(exe|app)$/i, '') : "an application";
        const displayReason = isErrorOrEmpty
          ? `You switched to ${appLabel} which does not match your session intent.`
          : trimmedReason;

        toast.warning("Distraction Detected!", {
          description: `${displayReason} Timer paused.`,
          duration: 5000,
        });
        store.incrementDistraction();
        store.pauseFocus(displayReason);
      }
    },
    onFocused: () => {
      console.log('Tab is now focused:', currentTabTitle);
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

  const { isIdle, idleTime } = useIdleDetection({
    idleTimeout: 60000,
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
    fetch(`${API_BASE}/workspaces`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then((workspaces: any[]) => {
        const ws = workspaces.find((w: any) => String(w.id) === String(wsId));
        setWorkspace(ws || null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [wsId]);

  // Initialize timer
  useEffect(() => {
    if (workspace && wsId) {
      useTimerStore.getState().setActiveWorkspace(wsId, workspace.work_duration || 25, workspace.break_duration || 5);
      initTimer(workspace.work_duration || 25, workspace.break_duration || 5);
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

  // Track max elapsed time to prevent it reading 0 on reset
  useEffect(() => {
    if (timerState.currentState.includes('FOCUS')) {
      const elapsed = Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60);
      if (elapsed > maxElapsedRef.current) {
         maxElapsedRef.current = elapsed;
      }
    }
  }, [timerState.timeRemaining, timerState.currentState, timerState.focusDuration]);

  // Log session completion & save metrics
  useEffect(() => {
    const prev = previousStateRef.current;
    const current = timerState.currentState;
    const isFocus = prev === 'FOCUS_RUNNING' || prev === 'FOCUS_PAUSED';
    const isEnded = current === 'IDLE' || current === 'SESSION_COMPLETED';

    if (isFocus && isEnded && workspace && wsId) {
      const completed = current === 'SESSION_COMPLETED';
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

  const handleDismissEnforcement = useCallback(() => setEnforcementTriggered(false), [setEnforcementTriggered]);

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" /></div>;
  if (!workspace) return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-muted-foreground">Workspace not found</p><Link to="/" className="text-white hover:underline text-sm">Go back</Link></div>;

  const totalDuration = timerState.currentState.includes('BREAK') ? timerState.breakDuration : timerState.focusDuration;
  const isCameraBlocked = cameraStatus === 'error';

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
            <p className="text-xs text-muted-foreground capitalize">{workspace.mode || 'structured'} mode · {workspace.work_duration || 45}m focus</p>
          </div>
        </div>

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
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={columnVariants} className="lg:col-span-2 flex flex-col items-center w-full">
            <div className="mb-8 flex flex-col items-center w-full">
              <TimerRing timeRemaining={timerState.timeRemaining} totalDuration={totalDuration} state={timerState.currentState} />
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
          <BurnoutGauge burnoutProbability={burnoutProb} currentState={timerState.currentState} />
          {(timerState.currentState === 'SESSION_COMPLETED' || timerState.sessionCount > 0) && (
            <SessionStats sessionCount={timerState.sessionCount} distractionCount={timerState.distractionCount} focusMinutes={focusMinutes} workDuration={workspace.work_duration || 45} />
          )}

          {workspace?.mode?.toLowerCase().includes('structured') && workspace?.id && (
            <StructuredGoalCalendar 
              workspaceId={workspace.id} 
              mode={workspace.mode} 
              sessionCount={timerState.sessionCount} 
            />
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

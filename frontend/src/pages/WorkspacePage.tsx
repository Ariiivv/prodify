import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CameraOff, AlertTriangle, Webcam } from 'lucide-react';
import { useTimerStore, initTimer, useTimer } from '@/lib/timerStore';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { API_BASE } from '@/lib/config';
import { toast } from 'sonner';

import WebcamStream from '@/components/workspace/WebcamStream';
import TimerRing from '@/components/timer/TimerRing';
import TimerControls from '@/components/timer/TimerControls';
import BurnoutGauge from '@/components/timer/BurnoutGauge';
import SessionStats from '@/components/timer/SessionStats';
import EnforcementModal from '@/components/timer/EnforcementModal';
import AiCoachPanel from '@/components/chat/AiCoachPanel';

type CameraStatus = 'loading' | 'streaming' | 'error' | 'disabled';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const wsId = id ? parseInt(id) : null;
  const timerState = useTimer();
  const { enforcementTriggered, setEnforcementTriggered } = useTabVisibility();

  // Component State
  const [burnoutProb, setBurnoutProb] = useState(0);
  const [workspace, setWorkspace] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('disabled');
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null);

  // Compute if detection should run (whitelist bypass removed — camera always tries to mount when not manually overridden)
  const isDetectionEnabled = !isManualOverride;

  // Distraction Handler: Triggers Toast + Increments Distraction Count + Pauses Timer
  const handleDistraction = useCallback(() => {
    toast.error("Focus lost!", {
      description: "You've been distracted. The timer has been paused. 🚀",
      duration: 3000,
    });
    const store = useTimerStore.getState();
    store.incrementDistraction();
    store.pauseFocus("Distraction detected");
  }, []);

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
    fetch(`${API_BASE}/workspaces`)
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
      useTimerStore.getState().setActiveWorkspace(wsId, workspace.work_duration || 45, workspace.break_duration || 5);
      initTimer(workspace.work_duration || 45, workspace.break_duration || 5);
    }
  }, [workspace, wsId]);

  // Burnout Logic
  useEffect(() => {
    if (timerState.currentState === 'IDLE' || timerState.currentState === 'SESSION_COMPLETED') {
      setBurnoutProb(0);
      return;
    }
    const totalDuration = timerState.focusDuration;
    const elapsed = totalDuration - timerState.timeRemaining;
    const elapsedRatio = totalDuration > 0 ? elapsed / totalDuration : 0;
    const distractionFactor = timerState.distractionCount * 0.05;
    const prob = Math.min(0.95, elapsedRatio * 0.7 + distractionFactor + (Math.random() * 0.05));
    setBurnoutProb(prob);
  }, [timerState.timeRemaining, timerState.currentState, timerState.distractionCount, timerState.focusDuration]);

  // Save session
  useEffect(() => {
    if (timerState.currentState === 'SESSION_COMPLETED' && workspace && wsId) {
      fetch(`${API_BASE}/api/ml/burnout-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId,
          duration_minutes: workspace.work_duration || 45,
          distraction_count: timerState.distractionCount,
          completed: true,
          burnout_score: burnoutProb,
        }),
      }).catch(() => {});
    }
  }, [timerState.currentState]);

  const focusMinutes = (timerState.currentState === 'IDLE' || timerState.currentState === 'SESSION_COMPLETED')
    ? 0
    : Math.max(0, Math.floor((timerState.focusDuration - timerState.timeRemaining) / 60));

  const handleDismissEnforcement = useCallback(() => setEnforcementTriggered(false), [setEnforcementTriggered]);

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!workspace) return <div className="flex flex-col items-center justify-center min-h-screen gap-4"><p className="text-muted-foreground">Workspace not found</p><Link to="/" className="text-primary hover:underline text-sm">Go back</Link></div>;

  const totalDuration = timerState.currentState.includes('BREAK') ? timerState.breakDuration : timerState.focusDuration;

  const isCameraBlocked = cameraStatus === 'error';

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
      {/* Camera Status Banner */}
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

      {/* Header */}
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

        {/* Tracking Toggle */}
        <button 
          onClick={() => setIsManualOverride(!isManualOverride)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isManualOverride ? 'bg-amber-500/20 text-amber-500' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {isManualOverride ? "Tracking Paused (Manual)" : "Tracking Active"}
        </button>
      </motion.div>

      {/* Main Layout: Timer + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Timer Column */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 flex flex-col items-center">
          <div className="mb-8">
            <TimerRing timeRemaining={timerState.timeRemaining} totalDuration={totalDuration} state={timerState.currentState} />
          </div>
          <TimerControls state={timerState.currentState} />
        </motion.div>

        {/* Sidebar */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
          {/* Camera Preview Card — Visible WebcamStream UI */}
          {isDetectionEnabled ? (
            <div className="rounded-xl border border-border/40 overflow-hidden bg-card">
              {/* Card header */}
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
              {/* Camera body — shows the WebcamStream fallback or a placeholder */}
              <div className="p-3">
                <WebcamStream 
                  onDistractionDetected={handleDistraction} 
                  onStatus={handleCameraStatus}
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
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Tracking disabled card */
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

          {/* Idle Status Card */}
          {isDetectionEnabled && (
            <div className="rounded-xl border border-border/40 p-3 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">User Activity</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isIdle
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-emerald-500/15 text-emerald-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isIdle ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} />
                  {isIdle ? 'Away' : 'Active'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isIdle
                  ? 'No keyboard/mouse activity detected'
                  : `Last activity ${Math.max(0, Math.floor(idleTime / 1000))}s ago`
                }
              </p>
            </div>
          )}

          <BurnoutGauge burnoutProbability={burnoutProb} currentState={timerState.currentState} />
          <SessionStats sessionCount={timerState.sessionCount} distractionCount={timerState.distractionCount} focusMinutes={focusMinutes} workDuration={workspace.work_duration || 45} />
        </motion.div>
      </div>

      <EnforcementModal show={enforcementTriggered} onDismiss={handleDismissEnforcement} />
      {(() => {
        const minutes = Math.floor(timerState.timeRemaining / 60).toString().padStart(2, '0');
        const seconds = (timerState.timeRemaining % 60).toString().padStart(2, '0');
        const timerString = `${minutes}:${seconds}`;
        return (
          <AiCoachPanel
            focusMinutes={focusMinutes}
            distractionCount={timerState.distractionCount}
            burnoutProbability={burnoutProb}
            currentState={timerState.currentState}
            sessionCount={timerState.sessionCount}
            workspaceName={workspace.name}
            idleSeconds={Math.floor(idleTime / 1000)}
            timeRemainingString={timerString}
          />
        );
      })()}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTimerStore, initTimer, useTimer } from '@/lib/timerStore';
import { useTabVisibility } from '@/hooks/useTabVisibility';
import { API_BASE } from '@/lib/config';
import { toast } from 'sonner';

import WebcamStream from '@/components/workspace/WebcamStream';
import TimerRing from '@/components/timer/TimerRing';
import TimerControls from '@/components/timer/TimerControls';
import BurnoutGauge from '@/components/timer/BurnoutGauge';
import SessionStats from '@/components/timer/SessionStats';
import EnforcementModal from '@/components/timer/EnforcementModal';
import AiCoachPanel from '@/components/chat/AiCoachPanel';

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

  // Logic: Helper to check if current site is a work site
  const isWorkSite = useCallback(() => {
    const whitelist = ['github.com', 'stackoverflow.com', 'docs.python.org', 'localhost'];
    return whitelist.some(site => window.location.hostname.includes(site));
  }, []);

  // Compute if detection should run
  const isDetectionEnabled = !isManualOverride && !isWorkSite();

  // Distraction Handler: Triggers Toast + Pauses Timer
  const handleDistraction = () => {
    toast.error("Focus lost!", {
      description: "You've been distracted. The timer has been paused. 🚀",
      duration: 3000,
    });
    useTimerStore.getState().pauseFocus("Distraction detected");
  };

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

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-5xl mx-auto">
      {/* Tracker Component */}
      <WebcamStream 
        onDistractionDetected={handleDistraction} 
        isEnabled={isDetectionEnabled} 
      />

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

      {/* Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 flex flex-col items-center">
          <div className="mb-8">
            <TimerRing timeRemaining={timerState.timeRemaining} totalDuration={totalDuration} state={timerState.currentState} />
          </div>
          <TimerControls state={timerState.currentState} />
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-5">
          <BurnoutGauge burnoutProbability={burnoutProb} currentState={timerState.currentState} />
          <SessionStats sessionCount={timerState.sessionCount} distractionCount={timerState.distractionCount} focusMinutes={focusMinutes} workDuration={workspace.work_duration || 45} />
        </motion.div>
      </div>

      <EnforcementModal show={enforcementTriggered} onDismiss={handleDismissEnforcement} />
      <AiCoachPanel focusMinutes={focusMinutes} distractionCount={timerState.distractionCount} burnoutProbability={burnoutProb} currentState={timerState.currentState} sessionCount={timerState.sessionCount} workspaceName={workspace.name} />
    </div>
  );
}
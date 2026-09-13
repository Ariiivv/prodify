import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Brain, Eye, RotateCcw, Loader2, AlertTriangle, Moon } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import ReactMarkdown from 'react-markdown';

interface CoachInsightPanelProps {
  /** Current vision engagement state from the backend (e.g. ACTIVE_WORK, FOCUSED_THINKING, FACE_ABSENT, EYES_CLOSED) */
  engagementState?: string;
  /** Whether the user is currently in a focus session */
  isSessionActive?: boolean;
  /** Current hour of the day (0-23) for late-night/fatigue warnings */
  currentHour?: number;
  /** Peak distraction hour from ML analytics (e.g. 14 for 2 PM) */
  peakDistractionHour?: number;
  /** Workspace name for context */
  workspaceName?: string;
  /** Last focused window title for "Resume Context" */
  lastFocusedWindow?: string;
  /** Last focused app name */
  lastFocusedApp?: string;
}

type InsightMode = 'idle' | 'deep_work' | 'distracted' | 'fatigue_warning' | 'loading';

export default function CoachInsightPanel({
  engagementState = 'ACTIVE_WORK',
  isSessionActive = false,
  currentHour = new Date().getHours(),
  peakDistractionHour,
  workspaceName = 'Default',
  lastFocusedWindow = '',
  lastFocusedApp = '',
}: CoachInsightPanelProps) {
  const [insightMode, setInsightMode] = useState<InsightMode>('idle');
  const [coachMessage, setCoachMessage] = useState<string>('');
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [showFatigueWarning, setShowFatigueWarning] = useState(false);
  const prevEngagementRef = useRef(engagementState);

  // Determine the insight mode from engagement state
  useEffect(() => {
    if (!isSessionActive) {
      setInsightMode('idle');
      return;
    }

    if (engagementState === 'FOCUSED_THINKING') {
      setInsightMode('deep_work');
    } else if (engagementState === 'FACE_ABSENT' || engagementState === 'EYES_CLOSED') {
      setInsightMode('distracted');
    } else {
      setInsightMode('idle');
    }

    prevEngagementRef.current = engagementState;
  }, [engagementState, isSessionActive]);

  // Fatigue / late-night warning based on Peak Distraction Hour
  useEffect(() => {
    const isLateNight = currentHour >= 22 || currentHour <= 4;
    const isInPeakDistractionWindow = peakDistractionHour !== undefined && 
      Math.abs(currentHour - peakDistractionHour) <= 1;

    setShowFatigueWarning(isSessionActive && (isLateNight || isInPeakDistractionWindow));
  }, [currentHour, peakDistractionHour, isSessionActive]);

  // Resume context: ask the AI Coach what the user was working on
  const handleResumeContext = useCallback(async () => {
    setIsLoadingResume(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai-coach/chat`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: `I just got distracted and lost my flow. My last focused window was "${lastFocusedWindow}" in ${lastFocusedApp || 'an application'}. What was I working on and how should I resume? Be concise.`,
          context: {
            workspaceName,
            currentState: 'FOCUS_PAUSED',
            focusMinutes: 0,
            distractionCount: 1,
          },
        }),
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      setCoachMessage(data.response || 'Resume your work by reopening your last focused window.');
    } catch {
      setCoachMessage(
        lastFocusedWindow
          ? `Resume by going back to **${lastFocusedWindow}** in ${lastFocusedApp || 'your editor'}. Pick up where you left off.`
          : 'Reopen your editor or workspace to resume. Start with the last thing you remember.'
      );
    } finally {
      setIsLoadingResume(false);
    }
  }, [lastFocusedWindow, lastFocusedApp, workspaceName]);

  // Reset coach message when mode changes away from distracted
  useEffect(() => {
    if (insightMode !== 'distracted') {
      setCoachMessage('');
    }
  }, [insightMode]);

  // Config for each mode
  const modeConfig: Record<InsightMode, { icon: typeof Zap; label: string; gradient: string; glowColor: string; borderColor: string; badgeBg: string; badgeText: string }> = {
    idle: {
      icon: Zap,
      label: 'Coach Ready',
      gradient: 'from-slate-500/10 to-slate-600/5',
      glowColor: 'shadow-slate-500/5',
      borderColor: 'border-white/[0.07]',
      badgeBg: 'bg-slate-500/15',
      badgeText: 'text-slate-400',
    },
    deep_work: {
      icon: Brain,
      label: 'Deep Work Detected',
      gradient: 'from-emerald-500/15 to-cyan-500/10',
      glowColor: 'shadow-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-400',
    },
    distracted: {
      icon: Eye,
      label: 'Focus Lost',
      gradient: 'from-amber-500/15 to-rose-500/10',
      glowColor: 'shadow-amber-500/10',
      borderColor: 'border-amber-500/25',
      badgeBg: 'bg-amber-500/15',
      badgeText: 'text-amber-400',
    },
    fatigue_warning: {
      icon: Moon,
      label: 'Fatigue Warning',
      gradient: 'from-orange-500/15 to-red-500/10',
      glowColor: 'shadow-orange-500/10',
      borderColor: 'border-orange-500/25',
      badgeBg: 'bg-orange-500/15',
      badgeText: 'text-orange-400',
    },
    loading: {
      icon: Loader2,
      label: 'Analyzing...',
      gradient: 'from-indigo-500/10 to-violet-500/5',
      glowColor: 'shadow-indigo-500/5',
      borderColor: 'border-indigo-500/20',
      badgeBg: 'bg-indigo-500/15',
      badgeText: 'text-indigo-400',
    },
  };

  const displayMode = showFatigueWarning && insightMode !== 'distracted' ? 'fatigue_warning' : insightMode;
  const config = modeConfig[displayMode];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      className={`rounded-2xl border ${config.borderColor} bg-white/[0.02] backdrop-blur-xl overflow-hidden shadow-lg ${config.glowColor} transition-colors duration-500`}
    >
      {/* Header */}
      <div className={`px-4 py-3 bg-gradient-to-r ${config.gradient}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg ${config.badgeBg} flex items-center justify-center`}>
              <Icon className={`w-3.5 h-3.5 ${config.badgeText} ${displayMode === 'deep_work' ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <span className={`text-xs font-semibold ${config.badgeText} tracking-wide`}>{config.label}</span>
            </div>
          </div>
          {isSessionActive && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${config.badgeBg} text-[9px] font-semibold ${config.badgeText} uppercase tracking-wider`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                displayMode === 'deep_work' ? 'bg-emerald-400 animate-pulse' : 
                displayMode === 'distracted' ? 'bg-amber-400' :
                displayMode === 'fatigue_warning' ? 'bg-orange-400 animate-pulse' :
                'bg-slate-400'
              }`} />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <AnimatePresence mode="wait">
          {/* Deep Work Mode */}
          {displayMode === 'deep_work' && (
            <motion.div
              key="deep_work"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-2"
            >
              <p className="text-sm text-emerald-300 font-medium">🧠 Deep Work Detected</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Optimizing session timer — distraction detection temporarily dampened. Your flow state is protected.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1 rounded-full bg-emerald-500/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
                    animate={{ width: ['30%', '80%', '60%', '90%', '70%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                </div>
                <span className="text-[10px] text-emerald-400 font-medium">Flow Active</span>
              </div>
            </motion.div>
          )}

          {/* Distracted Mode */}
          {displayMode === 'distracted' && (
            <motion.div
              key="distracted"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-3"
            >
              <p className="text-sm text-amber-300 font-medium">
                {engagementState === 'FACE_ABSENT' ? '👤 You walked away' : '😴 Eyes closed detected'}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {engagementState === 'FACE_ABSENT'
                  ? 'Your face is no longer visible. Timer has been paused.'
                  : 'Prolonged eye closure detected. Need a break?'}
              </p>

              {/* Resume Context Button */}
              <button
                onClick={handleResumeContext}
                disabled={isLoadingResume}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium hover:from-amber-500/25 hover:to-orange-500/20 transition-all disabled:opacity-50"
              >
                {isLoadingResume ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Asking Coach...</>
                ) : (
                  <><RotateCcw className="w-3.5 h-3.5" /> Resume Context</>
                )}
              </button>

              {/* Coach resume message */}
              {coachMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"
                >
                  <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown>{coachMessage}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Fatigue Warning */}
          {displayMode === 'fatigue_warning' && (
            <motion.div
              key="fatigue"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                </motion.div>
                <p className="text-sm text-orange-300 font-medium">Fatigue Zone</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {currentHour >= 22 || currentHour <= 4
                  ? "It's late — your cognitive performance drops significantly after 10 PM. Consider wrapping up."
                  : `You're in your peak distraction window (around ${peakDistractionHour ?? currentHour}:00). Stay sharp or take a strategic break.`}
              </p>
              {/* Pulsing vitality bar */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-muted-foreground">Vitality</span>
                <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ width: '65%' }}
                  />
                </div>
                <span className="text-[10px] text-orange-400 font-semibold">Low</span>
              </div>
            </motion.div>
          )}

          {/* Idle Mode */}
          {displayMode === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isSessionActive
                  ? 'Monitoring your focus. The coach will react to your engagement state in real time.'
                  : 'Start a focus session to activate real-time coaching insights.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

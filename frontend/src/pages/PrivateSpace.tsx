import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Lock,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Volume2,
  Send,
  Shield,
  Layers,
  Clock,
  Check,
  Maximize2,
  Trophy,
  Flame,
  X,
  Compass,
} from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { audioEngine } from '@/lib/audio';

// Detect if running inside desktop Tauri app
const IS_TAURI = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

interface SlotState {
  total_duration_mins: number | null;
  focus_mins: number;
  break_mins: number;
  task_context: string | null;
  allowed_apps: string[] | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ActiveSessionData {
  id: number;
  task_context: string;
  total_duration_mins: number;
  focus_mins: number;
  break_mins: number;
  allowed_apps: string[];
  completed_cycles: number;
  status: string;
}

export default function PrivateSpace() {
  // Session State
  const [session, setSession] = useState<ActiveSessionData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [slots, setSlots] = useState<SlotState>({
    total_duration_mins: null,
    focus_mins: 25,
    break_mins: 5,
    task_context: null,
    allowed_apps: null,
  });
  const [missingSlots, setMissingSlots] = useState<string[]>([]);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: "Welcome to Prod Private Space. I'm your Antigravity Focus Engine. Tell me your marathon plan (e.g. '7 hours on project work and IKS assignment with 25/5 sessions, apps: VS Code, Kitty, LibreOffice, Firefox').",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Active Marathon Timer State
  const [currentCycle, setCurrentCycle] = useState(1);
  const [totalCycles, setTotalCycles] = useState(14);
  const [phase, setPhase] = useState<'FOCUS' | 'BREAK'>('FOCUS');
  const [timeRemaining, setTimeRemaining] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);

  // Guard & Security State
  const [guardWarning, setGuardWarning] = useState<string | null>(null);
  const [currentActiveApp, setCurrentActiveApp] = useState<string>('Prodify');
  const [guardAllowed, setGuardAllowed] = useState(true);

  // Victory / Completion State
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load existing session if present on mount
  useEffect(() => {
    async function loadCurrent() {
      try {
        const res = await fetch(`${API_BASE}/api/private-space/session/current`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.session && data.session.status === 'active') {
            const s = data.session;
            setSession(s);
            setIsReady(true);
            setSlots({
              total_duration_mins: s.total_duration_mins,
              focus_mins: s.focus_mins,
              break_mins: s.break_mins,
              task_context: s.task_context,
              allowed_apps: s.allowed_apps,
            });
            const cycles = Math.max(1, Math.floor(s.total_duration_mins / (s.focus_mins + s.break_mins)));
            setTotalCycles(cycles);
            setCurrentCycle((s.completed_cycles || 0) + 1);
            setTimeRemaining(s.focus_mins * 60);
          }
        }
      } catch (err) {
        console.warn('Failed to load current private space session:', err);
      }
    }
    loadCurrent();
  }, []);

  // Audio Context Pre-Unlock
  const handleUnlockAudio = () => {
    audioEngine.unlockAudioContext();
    audioEngine.playRockyFinalBell();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    setAudioUnlocked(true);
  };

  // Chat message submit (Clarification slot-filling)
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const payload = {
        message: text,
        current_state: slots,
        session_id: session?.id,
      };

      const res = await fetch(`${API_BASE}/api/private-space/chat`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      // Update slot state
      if (data.slots) {
        setSlots({
          total_duration_mins: data.slots.total_duration_mins,
          focus_mins: data.slots.focus_mins || 25,
          break_mins: data.slots.break_mins || 5,
          task_context: data.slots.task_context,
          allowed_apps: data.slots.allowed_apps,
        });
      }
      setMissingSlots(data.missing_slots || []);

      // Append AI response
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: data.reply || 'Understood.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // If all slots are ready, launch the workspace!
      if (data.is_ready && data.session) {
        setSession(data.session);
        setIsReady(true);
        const focusM = data.session.focus_mins || 25;
        const breakM = data.session.break_mins || 5;
        const totalM = data.session.total_duration_mins || 420;
        const calcCycles = Math.max(1, Math.floor(totalM / (focusM + breakM)));
        setTotalCycles(calcCycles);
        setCurrentCycle(1);
        setPhase('FOCUS');
        setTimeRemaining(focusM * 60);
        setIsRunning(true);
        audioEngine.playChime();
      }
    } catch (err: any) {
      console.error('Private space chat error:', err);
      const errMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: "I'm having trouble connecting to the Antigravity backend. Please make sure the backend is running.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  // Timer Tick Hook
  useEffect(() => {
    if (!isRunning || !isReady) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Phase complete! Transition between FOCUS and BREAK
          handlePhaseTransition();
          return 0;
        }
        return prev - 1;
      });

      if (phase === 'FOCUS') {
        setTotalSecondsElapsed((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isReady, phase, currentCycle, totalCycles, session]);

  // Phase Transition Logic (Focus -> Break -> Next Cycle or Complete)
  const handlePhaseTransition = useCallback(async () => {
    if (!session) return;

    if (phase === 'FOCUS') {
      audioEngine.playChime();
      // Switch to break
      setPhase('BREAK');
      setTimeRemaining((session.break_mins || 5) * 60);

      // Persist completed cycle to backend
      try {
        await fetch(`${API_BASE}/api/private-space/cycle`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            session_id: session.id,
            completed_cycles: currentCycle,
          }),
        });
      } catch (err) {
        console.warn('Failed to sync cycle to backend:', err);
      }
    } else {
      // Break is over -> increment cycle or finish
      if (currentCycle >= totalCycles) {
        // Marathon 100% complete!
        handleSessionVictory();
      } else {
        audioEngine.playClick();
        setCurrentCycle((c) => c + 1);
        setPhase('FOCUS');
        setTimeRemaining((session.focus_mins || 25) * 60);
      }
    }
  }, [phase, currentCycle, totalCycles, session]);

  // Session Victory / Final Bell Handler
  const handleSessionVictory = async () => {
    setIsRunning(false);
    setShowVictoryModal(true);

    // 1. Play the Rocky final bell audio
    audioEngine.playRockyFinalBell();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    // 2. Window Focus & Fullscreen API
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      if (IS_TAURI) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setFocus();
      }
    } catch (e) {
      console.warn('Focus/Fullscreen trigger note:', e);
    }

    // 3. Mark completed on backend
    if (session?.id) {
      try {
        await fetch(`${API_BASE}/api/private-space/complete`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            session_id: session.id,
            completed_cycles: totalCycles,
          }),
        });
      } catch (err) {
        console.warn('Failed to call completion endpoint:', err);
      }
    }
  };

  // Local App Guard Polling Hook (Runs during active focus phase)
  useEffect(() => {
    if (!isReady || !session || !isRunning || phase !== 'FOCUS') {
      setGuardWarning(null);
      return;
    }

    const checkGuard = async () => {
      let windowTitle = '';
      let processName = '';

      if (IS_TAURI) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const active = await invoke<{ title: string; processName: string } | null>('get_active_window');
          if (active) {
            windowTitle = active.title;
            processName = active.processName;
            setCurrentActiveApp(processName);
          }
        } catch (e) {
          // Tauri invocation fallback
        }
      }

      try {
        const res = await fetch(`${API_BASE}/api/private-space/guard`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            session_id: session.id,
            current_app: processName,
            window_title: windowTitle,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setGuardAllowed(data.allowed);
          if (!data.allowed) {
            setGuardWarning(data.warning || 'Application not allowed during this focus block!');
            audioEngine.playDistractionAlert();
          } else {
            setGuardWarning(null);
          }
        }
      } catch (e) {
        // Local network fallback
      }
    };

    const interval = setInterval(checkGuard, 2500);
    return () => clearInterval(interval);
  }, [isReady, session, isRunning, phase]);

  // Format MM:SS helper
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate overall marathon progress (0 to 100%)
  const totalMins = session?.total_duration_mins || 420;
  const elapsedMins = (totalSecondsElapsed / 60);
  const marathonProgressPct = Math.min(100, Math.round((elapsedMins / totalMins) * 100));

  return (
    <div className="relative min-h-screen bg-[#07070b] text-zinc-100 overflow-x-hidden selection:bg-[#d97757]/30">
      {/* Hidden audio element for rocky_final_bell.mp3 */}
      <audio ref={audioRef} src="/assets/rocky_final_bell.mp3" preload="auto" />

      {/* ── Antigravity Cosmic Ambient Background ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-950/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[30rem] h-[30rem] bg-violet-950/20 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/3 w-[28rem] h-[28rem] bg-[#d97757]/10 rounded-full blur-[130px]" />
        {/* Subtle grid mesh */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #faf9f5 1px, transparent 0)`,
            backgroundSize: '36px 36px',
          }}
        />
      </div>

      {/* ── Top Navigation Bar ── */}
      <header className="relative z-20 border-b border-zinc-800/80 bg-[#07070b]/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-400 hover:text-white transition-all text-xs font-medium cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Prodify</span>
          </Link>

          <div className="flex items-center gap-2 pl-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-violet-500/30 flex items-center justify-center text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.15)]">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-tight text-white uppercase font-mono">Prod Private Space</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 font-mono">
                  Antigravity Engine
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Test Pre-Unlock Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUnlockAudio}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
              audioUnlocked
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
            title="Pre-unlock browser audio context so the Victory Bell rings automatically"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{audioUnlocked ? 'Bell Armed ✓' : 'Test Final Bell'}</span>
          </button>
        </div>
      </header>

      {/* ── App Guard Warning Banner ── */}
      <AnimatePresence>
        {guardWarning && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-30 bg-rose-950/80 border-b border-rose-500/50 backdrop-blur-md px-6 py-2.5 flex items-center justify-between text-rose-200 text-xs shadow-lg"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
              <span className="font-semibold font-mono tracking-tight">{guardWarning}</span>
            </div>
            <span className="text-[11px] text-rose-300/80 font-mono">Prod Guard Active</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 py-6">
        {/* ── STATE 1: Clarification Phase (Floating Chat & Command Orb) ── */}
        {!isReady ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center max-w-2xl mx-auto pt-6 pb-12"
          >
            {/* Cosmic Command Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/40 border border-violet-500/30 text-violet-300 text-xs font-mono mb-3 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                <span>Conversational Focus Setup</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Antigravity Personal Workspace
              </h1>
              <p className="text-sm text-zinc-400 mt-2 max-w-lg mx-auto leading-relaxed">
                Enter your marathon goal below. The engine requires duration, Pomodoro intervals, task context, and a strict list of allowed apps before launching.
              </p>
            </div>

            {/* ── Live Status Pills Indicator ── */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {/* Duration Pill */}
              <div
                className={`flex flex-col p-2.5 rounded-xl border text-xs transition-all ${
                  slots.total_duration_mins
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-70">Duration</span>
                <span className="font-semibold font-mono flex items-center gap-1 mt-0.5">
                  {slots.total_duration_mins ? `${Math.round(slots.total_duration_mins / 60)}h (${slots.total_duration_mins}m)` : 'Pending...'}
                  {slots.total_duration_mins && <Check className="w-3 h-3 text-emerald-400" />}
                </span>
              </div>

              {/* Cycle Split Pill */}
              <div
                className={`flex flex-col p-2.5 rounded-xl border text-xs transition-all ${
                  slots.focus_mins && slots.break_mins
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-70">Cycle</span>
                <span className="font-semibold font-mono flex items-center gap-1 mt-0.5">
                  {slots.focus_mins}/{slots.break_mins} split
                  <Check className="w-3 h-3 text-emerald-400" />
                </span>
              </div>

              {/* Task Context Pill */}
              <div
                className={`flex flex-col p-2.5 rounded-xl border text-xs transition-all ${
                  slots.task_context
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-70">Tasks</span>
                <span className="font-semibold truncate mt-0.5" title={slots.task_context || 'Pending'}>
                  {slots.task_context ? `${slots.task_context.slice(0, 16)}...` : 'Pending...'}
                  {slots.task_context && <Check className="w-3 h-3 inline ml-1 text-emerald-400" />}
                </span>
              </div>

              {/* Allowed Apps Pill */}
              <div
                className={`flex flex-col p-2.5 rounded-xl border text-xs transition-all ${
                  slots.allowed_apps && slots.allowed_apps.length > 0
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
                }`}
              >
                <span className="text-[10px] uppercase font-mono tracking-wider opacity-70">Allowed Apps</span>
                <span className="font-semibold font-mono truncate mt-0.5" title={slots.allowed_apps ? slots.allowed_apps.join(', ') : 'Pending'}>
                  {slots.allowed_apps && slots.allowed_apps.length > 0 ? `${slots.allowed_apps.length} apps` : 'Pending...'}
                  {slots.allowed_apps && slots.allowed_apps.length > 0 && <Check className="w-3 h-3 inline ml-1 text-emerald-400" />}
                </span>
              </div>
            </div>

            {/* ── Floating Chat Terminal Window ── */}
            <div className="w-full bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl flex flex-col h-[400px]">
              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-[#d97757] text-white rounded-br-none shadow-md'
                          : 'bg-zinc-800/90 text-zinc-200 border border-zinc-700/60 rounded-bl-none'
                      }`}
                    >
                      {m.text}
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-1 px-1 font-mono">{m.timestamp}</span>
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400 italic py-1">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                    <span>Analyzing slot criteria...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Quick Prompts to Test / Seed */}
              <div className="flex items-center gap-2 overflow-x-auto py-2 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                <span className="text-[10px] uppercase font-mono text-zinc-500 shrink-0">Try:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      'I have project work and my IKS assignment, studying for 7 hours today with 25/5 sessions, only allow apps related to coding or editing'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 truncate max-w-[260px] shrink-0 border border-zinc-700/50 cursor-pointer"
                  title="Test Vague Apps Prompt (Triggers Clarification Rule)"
                >
                  ⚡ Test Clarification (Vague Apps)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage('Allowed apps: VS Code, kitty terminal, libreoffice, and firefox')
                  }
                  className="px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 truncate shrink-0 border border-zinc-700/50 cursor-pointer"
                >
                  ✓ Clarify Apps (Code, Kitty, LibreOffice, Firefox)
                </button>
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 pt-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Describe your marathon plan..."
                  disabled={isSending}
                  className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isSending || !inputText.trim()}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          /* ── STATE 2: Active Antigravity Workspace (Spawned Phase) ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
          >
            {/* ── MODULE 1: Master Marathon Progress Bar ── */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse" />
                  <h2 className="text-sm font-bold font-mono text-white uppercase tracking-wider">
                    Master Marathon Progress
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-zinc-400">
                    <span className="text-white font-bold">{(elapsedMins / 60).toFixed(1)}</span> /{' '}
                    {(totalMins / 60).toFixed(1)} Hours Completed
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 font-bold">
                    Cycle {currentCycle} of {totalCycles}
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="relative w-full h-3.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-violet-600 via-indigo-500 to-[#d97757] rounded-full shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${marathonProgressPct}%` }}
                  transition={{ ease: 'easeOut', duration: 0.5 }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono mt-2">
                <span>0.0h Start</span>
                <span>{marathonProgressPct}% Marathon Conquered</span>
                <span>{(totalMins / 60).toFixed(1)}h Target</span>
              </div>
            </div>

            {/* ── Main Workspace Grid (Modules 2 & 3) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ── MODULE 2: Floating Pomodoro Ring & Controls (7 Cols) ── */}
              <div className="lg:col-span-7 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl flex flex-col items-center justify-center text-center">
                {/* Active Mode Pill */}
                <div className="mb-6">
                  <span
                    className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider font-mono border transition-all ${
                      phase === 'FOCUS'
                        ? 'bg-[#d97757]/15 border-[#d97757]/40 text-[#d97757] shadow-[0_0_15px_rgba(217,119,87,0.2)]'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                    {phase === 'FOCUS' ? 'Deep Focus Interval' : 'Restorative Break'}
                  </span>
                </div>

                {/* Circular SVG Timer Ring */}
                <div className="relative w-64 h-64 flex items-center justify-center mb-6">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      className="stroke-zinc-800/60"
                      strokeWidth="6"
                      fill="transparent"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="42"
                      stroke={phase === 'FOCUS' ? '#d97757' : '#10b981'}
                      strokeWidth="6"
                      strokeDasharray={264}
                      strokeDashoffset={
                        264 -
                        (264 * (timeRemaining / ((phase === 'FOCUS' ? session.focus_mins : session.break_mins) * 60)))
                      }
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-300"
                    />
                  </svg>

                  {/* High Contrast Digital Display inside Ring */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-mono font-extrabold tracking-tighter text-white">
                      {formatTime(timeRemaining)}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono mt-1">
                      Cycle {currentCycle} / {totalCycles}
                    </span>
                  </div>
                </div>

                {/* Timer Controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      audioEngine.playClick();
                      setIsRunning(!isRunning);
                    }}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg cursor-pointer ${
                      isRunning
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700'
                        : 'bg-[#d97757] hover:bg-[#c86b4c] text-white shadow-[#d97757]/30'
                    }`}
                  >
                    {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>{isRunning ? 'Pause' : 'Resume'}</span>
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.playClick();
                      handlePhaseTransition();
                    }}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono transition-all cursor-pointer"
                    title="Skip current block"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>Skip</span>
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.playClick();
                      setTimeRemaining((phase === 'FOCUS' ? session.focus_mins : session.break_mins) * 60);
                    }}
                    className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                    title="Reset current block"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ── MODULE 3: Whitelisted Apps & Context Card (5 Cols) ── */}
              <div className="lg:col-span-5 space-y-4">
                {/* Active Context Card */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center gap-2 mb-2 text-violet-400">
                    <Compass className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-300">
                      Active Marathon Target
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-100 font-medium leading-snug">
                    {session.task_context}
                  </p>
                </div>

                {/* Whitelisted Allowed Apps */}
                <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Shield className="w-4 h-4" />
                      <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-zinc-300">
                        Whitelisted App Guard
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                      Strict Enforcement
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                    Only the following approved applications are allowed during deep focus blocks:
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {session.allowed_apps.map((app) => (
                      <span
                        key={app}
                        className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="capitalize">{app}</span>
                      </span>
                    ))}
                  </div>

                  {/* Guard status display */}
                  <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Active Window:</span>
                    <span className={`font-mono font-semibold ${guardAllowed ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentActiveApp || 'Prodify'}
                    </span>
                  </div>
                </div>

                {/* Collapsed Assistant Drawer Button */}
                <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span>Antigravity Assistant Connected</span>
                  </div>
                  <button
                    onClick={() => setIsReady(false)}
                    className="text-xs text-zinc-400 hover:text-white font-mono hover:underline cursor-pointer"
                  >
                    Reconfigure
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── STATE 3: "The Final Bell" Victory Modal (Completion) ── */}
      <AnimatePresence>
        {showVictoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-3xl p-6 sm:p-8 text-center shadow-[0_0_50px_rgba(217,119,87,0.3)] overflow-hidden"
            >
              {/* Background celebration glow */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#d97757]/20 rounded-full blur-3xl pointer-events-none" />

              {/* Championship Icon */}
              <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-tr from-[#d97757] to-amber-500 flex items-center justify-center text-white shadow-xl shadow-[#d97757]/30 animate-bounce">
                <Trophy className="w-10 h-10" />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold mb-2">
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span>CHAMPIONSHIP FOCUS ACHIEVED</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
                THE FINAL BELL RINGS!
              </h2>

              <p className="text-sm text-zinc-300 max-w-md mx-auto mb-6 leading-relaxed">
                You went the full 15 rounds. The 7-hour deep focus marathon has been conquered with flawless discipline.
              </p>

              {/* Stats Summary Matrix */}
              <div className="grid grid-cols-3 gap-2 bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 mb-6">
                <div>
                  <span className="text-[10px] uppercase font-mono text-zinc-500 block">Total Hours</span>
                  <span className="text-lg font-bold font-mono text-white">{(totalMins / 60).toFixed(1)}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-zinc-500 block">Completed</span>
                  <span className="text-lg font-bold font-mono text-[#d97757]">{totalCycles} Cycles</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-zinc-500 block">Integrity</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">100% Locked</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowVictoryModal(false);
                    setIsReady(false);
                    setSession(null);
                  }}
                  className="flex-1 px-5 py-3 rounded-xl bg-[#d97757] hover:bg-[#c86b4c] text-white font-semibold text-xs tracking-wide transition-all shadow-lg cursor-pointer"
                >
                  Start New Marathon
                </button>
                <Link
                  to="/"
                  className="flex-1 px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs tracking-wide transition-all border border-zinc-700 flex items-center justify-center cursor-pointer"
                >
                  Return to Dashboard
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

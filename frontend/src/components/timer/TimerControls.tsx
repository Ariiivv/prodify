import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  startFocus, pauseFocus, resumeFocus,
  startBreak, pauseBreak, resumeBreak, resetTimer
} from '@/lib/timerStore';
import { audioEngine } from '@/lib/audio';

import { toast } from 'sonner';

interface TimerControlsProps {
  state: string;
  timeRemaining?: number;
  totalDuration?: number;
  canStartFocus?: boolean;
  onStartFocusBlocked?: () => void;
}

export default function TimerControls({ state, timeRemaining, totalDuration, canStartFocus = true, onStartFocusBlocked }: TimerControlsProps) {
  useEffect(() => {
    if (state === 'SESSION_COMPLETED') {
      audioEngine.playChime();
    }
  }, [state]);

  const hasNotStarted = timeRemaining !== undefined && totalDuration !== undefined 
    ? timeRemaining === totalDuration 
    : false;

  const handleAction = (action: () => void) => {
    audioEngine.playClick();
    action();
  };

  const handleStartFocus = () => {
    if (!canStartFocus) {
      if (onStartFocusBlocked) onStartFocusBlocked();
      else toast.error("Cannot start focus right now.");
      return;
    }
    handleAction(state === 'IDLE' ? startFocus : resumeFocus);
  };

  const handlePauseFocus = () => {
    audioEngine.playClick();
    pauseFocus('Manual');
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3"
      >
        {(state === 'IDLE' || (state === 'FOCUS_PAUSED' && hasNotStarted)) && (
          <Button
            onClick={handleStartFocus}
            size="lg"
            className="bg-primary hover:bg-primary/90 text-black px-8 py-6 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Focus
          </Button>
        )}

        {state === 'FOCUS_RUNNING' && (
          <>
            <Button
              onClick={handlePauseFocus}
              size="lg"
              className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 px-6 py-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-muted-foreground hover:text-foreground px-4 py-6 rounded-2xl"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}

        {state === 'FOCUS_PAUSED' && !hasNotStarted && (
          <>
            <Button
              onClick={handleStartFocus}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-black px-8 py-6 rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-muted-foreground hover:text-foreground px-4 py-6 rounded-2xl"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}

        {state === 'SESSION_COMPLETED' && (
          <>
            <Button
              onClick={() => handleAction(startBreak)}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-black px-8 py-6 rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Coffee className="w-5 h-5 mr-2" />
              Start Break
            </Button>
            <Button
              onClick={handleStartFocus}
              size="lg"
              variant="outline"
              className="border border-[#2a2a2a] text-white bg-transparent hover:bg-[#1a1a1a] px-6 py-6 rounded-2xl"
            >
              <Zap className="w-5 h-5 mr-2" />
              New Focus
            </Button>
          </>
        )}

        {state === 'BREAK_RUNNING' && (
          <>
            <Button
              onClick={() => handleAction(pauseBreak)}
              size="lg"
              className="bg-[#2a2a2a] text-white border border-[#2a2a2a] hover:bg-[#1a1a1a] px-6 py-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause Break
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-muted-foreground hover:text-foreground px-4 py-6 rounded-2xl"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}

        {state === 'BREAK_PAUSED' && (
          <>
            <Button
              onClick={() => handleAction(resumeBreak)}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-black px-8 py-6 rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume Break
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-muted-foreground hover:text-foreground px-4 py-6 rounded-2xl"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
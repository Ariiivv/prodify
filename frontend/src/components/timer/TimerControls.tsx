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
            className="bg-[#d97757] hover:bg-[#c86b4c] text-[#faf9f5] px-8 py-6 text-base font-medium rounded-xl border border-[#d97757] shadow-none transition-colors"
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
              className="bg-[#262624] text-[#d4a24c] border border-[#3d3d3a] hover:bg-[#30302e] px-6 py-6 rounded-xl transition-colors font-medium shadow-none"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-[#a3a299] hover:text-[#faf9f5] hover:bg-[#30302e] px-4 py-6 rounded-xl transition-colors"
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
              className="bg-[#d97757] hover:bg-[#c86b4c] text-[#faf9f5] px-8 py-6 rounded-xl border border-[#d97757] shadow-none transition-colors font-medium"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-[#a3a299] hover:text-[#faf9f5] hover:bg-[#30302e] px-4 py-6 rounded-xl transition-colors"
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
              className="bg-[#d97757] hover:bg-[#c86b4c] text-[#faf9f5] px-8 py-6 rounded-xl border border-[#d97757] shadow-none transition-colors font-medium"
            >
              <Coffee className="w-5 h-5 mr-2" />
              Start Break
            </Button>
            <Button
              onClick={handleStartFocus}
              size="lg"
              variant="outline"
              className="border border-[#3d3d3a] text-[#faf9f5] bg-[#262624] hover:bg-[#30302e] px-6 py-6 rounded-xl transition-colors font-medium shadow-none"
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
              className="bg-[#262624] text-[#7fa37a] border border-[#3d3d3a] hover:bg-[#30302e] px-6 py-6 rounded-xl transition-colors font-medium shadow-none"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause Break
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-[#a3a299] hover:text-[#faf9f5] hover:bg-[#30302e] px-4 py-6 rounded-xl transition-colors"
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
              className="bg-[#d97757] hover:bg-[#c86b4c] text-[#faf9f5] px-8 py-6 rounded-xl border border-[#d97757] shadow-none transition-colors font-medium"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume Break
            </Button>
            <Button
              onClick={() => handleAction(resetTimer)}
              variant="ghost"
              size="lg"
              className="text-[#a3a299] hover:text-[#faf9f5] hover:bg-[#30302e] px-4 py-6 rounded-xl transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
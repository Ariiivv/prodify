import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  startFocus, pauseFocus, resumeFocus,
  startBreak, pauseBreak, resumeBreak, resetTimer
} from '@/lib/timerStore';

interface TimerControlsProps {
  state: string;
}

export default function TimerControls({ state }: TimerControlsProps) {
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
        {state === 'IDLE' && (
          <Button
            onClick={startFocus}
            size="lg"
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white px-8 py-6 text-base font-semibold rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Focus
          </Button>
        )}

        {state === 'FOCUS_RUNNING' && (
          <>
            <Button
              onClick={() => pauseFocus('Manual')}
              size="lg"
              className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 px-6 py-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause
            </Button>
            <Button
              onClick={resetTimer}
              variant="ghost"
              size="lg"
              className="text-muted-foreground hover:text-foreground px-4 py-6 rounded-2xl"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
          </>
        )}

        {state === 'FOCUS_PAUSED' && (
          <>
            <Button
              onClick={resumeFocus}
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white px-8 py-6 rounded-2xl shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume
            </Button>
            <Button
              onClick={resetTimer}
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
              onClick={startBreak}
              size="lg"
              className="bg-gradient-to-r from-green-500 to-accent hover:from-green-400 hover:to-accent/80 text-white px-8 py-6 rounded-2xl shadow-lg shadow-green-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Coffee className="w-5 h-5 mr-2" />
              Start Break
            </Button>
            <Button
              onClick={startFocus}
              size="lg"
              variant="outline"
              className="border-primary/30 text-primary hover:bg-primary/10 px-6 py-6 rounded-2xl"
            >
              <Zap className="w-5 h-5 mr-2" />
              New Focus
            </Button>
          </>
        )}

        {state === 'BREAK_RUNNING' && (
          <>
            <Button
              onClick={pauseBreak}
              size="lg"
              className="bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 px-6 py-6 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Pause className="w-5 h-5 mr-2" />
              Pause Break
            </Button>
            <Button
              onClick={resetTimer}
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
              onClick={resumeBreak}
              size="lg"
              className="bg-gradient-to-r from-green-500 to-accent hover:from-green-400 hover:to-accent/80 text-white px-8 py-6 rounded-2xl shadow-lg shadow-green-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume Break
            </Button>
            <Button
              onClick={resetTimer}
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
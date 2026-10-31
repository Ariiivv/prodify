import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, X, CheckCircle, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TourStep {
  selector: string;
  title: string;
  description: string;
  badge?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

const DEFAULT_STEPS: TourStep[] = [
  {
    selector: '[data-tour="hero-metrics"]',
    title: 'Focus Command Strip',
    badge: 'Real-Time Telemetry',
    description: 'Tracks your daily quota, rolling 7-day momentum, and deep work purity across all active workspaces. Your true productivity pulse at a glance.',
    position: 'bottom',
  },
  {
    selector: '[data-tour="new-workspace"]',
    title: 'Adaptive Workspaces',
    badge: 'Intent Driven',
    description: 'Create focused workspaces for your goals. Set sprint deadlines, target hours, and declare your focus intent so Prodify AI can protect your flow.',
    position: 'bottom',
  },
  {
    selector: '[data-tour="workspace-cards"]',
    title: 'Live Workspace Cockpit',
    badge: '7-Day Continuity',
    description: 'Each card displays your daily session count, remaining time, and 7-day consistency chain. Click any workspace to enter the distraction-shielded timer cockpit.',
    position: 'top',
  },
  {
    selector: '[data-tour="sidebar-report"]',
    title: 'Global Analytics & Reports',
    badge: 'Deep Analytics',
    description: 'Inspect your completed focus sessions, distraction slip logs, and chronological flow history across all workspaces.',
    position: 'bottom',
  },
  {
    selector: '[data-tour="recent-activity"], [data-tour="ai-coach"]',
    title: 'Activity Telemetry & AI Flow',
    badge: 'Behavioral Intel',
    description: 'Review your chronological focus timeline, streak integrity, and recent session velocity. Inside any active workspace, your AI Coach stands ready with personalized focus diagnostics.',
    position: 'left',
  },
];

interface SpotlightTourProps {
  isOpen?: boolean;
  onClose?: () => void;
  steps?: TourStep[];
}

export const SpotlightTour: React.FC<SpotlightTourProps> = ({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  steps = DEFAULT_STEPS,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-trigger on first visit if not yet completed
  useEffect(() => {
    if (isControlled) return;
    const completed = localStorage.getItem('prodify_tour_completed');
    if (!completed) {
      const timer = setTimeout(() => {
        setInternalIsOpen(true);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [isControlled]);

  // Listen for manual restart event (e.g. from Settings page)
  useEffect(() => {
    const handleRestart = () => {
      setCurrentStepIndex(0);
      setInternalIsOpen(true);
    };
    window.addEventListener('prodify-restart-tour', handleRestart);
    return () => window.removeEventListener('prodify-restart-tour', handleRestart);
  }, []);

  const step = steps[currentStepIndex];

  const updateTargetRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Short delay for scroll settling
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      }, 150);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;
    updateTargetRect();

    const handleResize = () => updateTargetRect();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isOpen, currentStepIndex, updateTargetRect]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('prodify_tour_completed', 'true');
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalIsOpen(false);
    }
    setCurrentStepIndex(0);
  };

  if (!isOpen) return null;

  // Calculate card positioning based on target element
  const padding = 8;
  const cardWidth = 340;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let cardStyle: React.CSSProperties = {
    position: 'fixed',
    width: `${cardWidth}px`,
    zIndex: 9999,
  };

  if (targetRect) {
    const spaceBelow = viewportHeight - (targetRect.bottom + padding);
    const spaceAbove = targetRect.top - padding;

    // Prefer bottom, otherwise top
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      cardStyle.top = Math.min(viewportHeight - 240, targetRect.bottom + padding + 12);
    } else {
      cardStyle.top = Math.max(20, targetRect.top - padding - 230);
    }

    // Horizontal centering relative to target
    const targetCenterX = targetRect.left + targetRect.width / 2;
    let leftPos = targetCenterX - cardWidth / 2;
    // Bound within viewport
    leftPos = Math.max(16, Math.min(viewportWidth - cardWidth - 16, leftPos));
    cardStyle.left = leftPos;
  } else {
    // Fallback center of screen
    cardStyle.top = '50%';
    cardStyle.left = '50%';
    cardStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9990] pointer-events-auto">
        {/* SVG Mask Backdrop with transparent cutout over target */}
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none transition-all duration-300"
          style={{ width: '100vw', height: '100vh' }}
        >
          <defs>
            <mask id="spotlight-mask">
              {/* White fills everything (opaque mask) */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {/* Black cutout reveals the target element */}
              {targetRect && (
                <rect
                  x={targetRect.left - padding}
                  y={targetRect.top - padding}
                  width={targetRect.width + padding * 2}
                  height={targetRect.height + padding * 2}
                  rx="14"
                  ry="14"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          {/* Shaded backdrop applied with the cutout mask */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.78)"
            mask="url(#spotlight-mask)"
            className="backdrop-blur-[2px]"
          />
        </svg>

        {/* Glowing border highlight around the target element */}
        {targetRect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="fixed pointer-events-none z-[9992] rounded-2xl border-2 border-blue-400 shadow-[0_0_24px_rgba(96,165,250,0.6)]"
            style={{
              top: targetRect.top - padding,
              left: targetRect.left - padding,
              width: targetRect.width + padding * 2,
              height: targetRect.height + padding * 2,
            }}
          />
        )}

        {/* Floating Glassmorphic Guide Card */}
        <motion.div
          ref={cardRef}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={cardStyle}
          className="bg-zinc-950/95 border border-blue-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-2xl text-white"
        >
          {/* Card Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Compass className="w-3.5 h-3.5" />
              </span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-blue-400">
                STEP {currentStepIndex + 1} OF {steps.length}
              </span>
            </div>

            <button
              onClick={handleComplete}
              aria-label="Close tour"
              className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Badge & Title */}
          <div className="mb-2">
            {step?.badge && (
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 mb-1.5">
                {step.badge}
              </span>
            )}
            <h3 className="text-base font-bold text-white tracking-tight">
              {step?.title}
            </h3>
          </div>

          {/* Description */}
          <p className="text-xs text-zinc-300 leading-relaxed font-body mb-5">
            {step?.description}
          </p>

          {/* Progress Dots & Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
            {/* Step indicator dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === currentStepIndex
                      ? 'w-5 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
                      : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
                  }`}
                  aria-label={`Jump to step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              {currentStepIndex > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="h-8 px-2.5 text-xs bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Back
                </Button>
              )}

              <Button
                size="sm"
                onClick={handleNext}
                className="h-8 px-3.5 text-xs bg-blue-500 hover:bg-blue-400 text-black font-bold shadow-md shadow-blue-500/20 cursor-pointer"
              >
                {currentStepIndex === steps.length - 1 ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 mr-1" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

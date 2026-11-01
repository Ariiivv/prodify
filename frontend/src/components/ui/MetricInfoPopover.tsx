import React, { useState, useRef } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Info, HelpCircle } from 'lucide-react';

interface MetricInfoPopoverProps {
  title: string;
  description: string;
  formula?: string;
  benchmark?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export const MetricInfoPopover: React.FC<MetricInfoPopoverProps> = ({
  title,
  description,
  formula,
  benchmark,
  align,
  side = 'top',
  className = '',
  isOpen,
  onToggle,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [computedAlign, setComputedAlign] = useState<'start' | 'center' | 'end'>(align || 'center');

  const updateAlignment = () => {
    if (align) {
      setComputedAlign(align);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
      // If trigger is within 340px of right edge or in right 40% of viewport, anchor to end (expand inward)
      if (windowWidth - rect.right < 340 || rect.left > windowWidth * 0.6) {
        setComputedAlign('end');
      } else if (rect.left < 340) {
        setComputedAlign('start');
      } else {
        setComputedAlign('center');
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      updateAlignment();
    }
    onToggle?.(open);
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          onClick={updateAlignment}
          aria-label={`Learn about ${title}`}
          className={`inline-flex items-center justify-center text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded-full hover:bg-white/5 cursor-pointer ${className}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={computedAlign}
        side={side}
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions={true}
        className="w-80 max-w-[calc(100vw-32px)] bg-zinc-900 border border-zinc-700 text-zinc-100 p-4 rounded-xl shadow-2xl backdrop-blur-xl z-[9999]"
      >
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
            <div className="w-5 h-5 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <HelpCircle className="w-3.5 h-3.5" />
            </div>
            <h4 className="font-bold text-white text-sm tracking-tight">{title}</h4>
          </div>

          <p className="text-zinc-300 leading-relaxed font-body">
            {description}
          </p>

          {formula && (
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-mono font-semibold block mb-1">
                Calculation Formula
              </span>
              <code className="text-[11px] font-mono text-emerald-300 block break-words">
                {formula}
              </code>
            </div>
          )}

          {benchmark && (
            <div className="flex items-start gap-1.5 pt-1 text-[11px] text-zinc-400 font-mono border-t border-zinc-800/60">
              <span className="text-blue-400 font-bold shrink-0">Benchmark:</span>
              <span>{benchmark}</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

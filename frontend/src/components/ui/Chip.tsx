import React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'lime' | 'muted' | 'outline';
  isLive?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Signature Osmo-style inline word chip.
 * Displays key values and dynamic numbers inside sentences and headings.
 * Fills:
 *  - neutral: bg-black/5 text-ink
 *  - lime: bg-lime text-black font-semibold (ALWAYS black text on lime)
 *  - muted: bg-line/60 text-muted
 */
export const Chip: React.FC<ChipProps> = ({
  variant = 'neutral',
  isLive = false,
  pulse = false,
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    neutral: 'bg-zinc-800 text-zinc-100 border border-zinc-700',
    lime: 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30',
    muted: 'bg-zinc-900 text-zinc-400 border border-zinc-800',
    outline: 'bg-zinc-900 text-zinc-100 border border-zinc-800',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-inherit font-mono text-[0.85em] font-medium leading-none tabular-nums align-baseline transition-colors select-none ${variantStyles} ${className}`}
      {...props}
    >
      {(isLive || pulse) && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/40 opacity-75 duration-1000" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-black" />
        </span>
      )}
      {children}
    </span>
  );
};

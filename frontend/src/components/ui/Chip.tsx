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
    neutral: 'bg-black/5 text-ink border border-black/5',
    lime: 'bg-lime text-black font-semibold border border-black/10',
    muted: 'bg-line/60 text-muted border border-line',
    outline: 'bg-white text-ink border border-line',
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

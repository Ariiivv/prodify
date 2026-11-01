import React from 'react';

export interface ScoreBadgeProps {
  score: number | string;
  maxScore?: number | string;
  label?: string;
  sublabel?: string;
  tier?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Awwwards-style boxed score badge.
 * A crisp bordered box featuring a prominent numeric score, '/100' or sub-unit,
 * and clean minimal typography.
 */
export const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  maxScore = '100',
  label,
  sublabel,
  tier,
  className = '',
  size = 'md',
}) => {
  const sizeConfig = {
    sm: {
      container: 'p-2.5 min-w-[80px]',
      number: 'text-xl',
      denom: 'text-[10px]',
      label: 'text-[10px]',
    },
    md: {
      container: 'p-3.5 min-w-[100px]',
      number: 'text-2xl',
      denom: 'text-xs',
      label: 'text-xs',
    },
    lg: {
      container: 'p-4 min-w-[120px]',
      number: 'text-3xl',
      denom: 'text-sm',
      label: 'text-xs',
    },
  }[size];

  return (
    <div
      className={`inline-flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-100 transition-all hover:border-zinc-700 ${sizeConfig.container} ${className}`}
    >
      {label && (
        <span className={`font-mono text-muted uppercase tracking-wider mb-1 ${sizeConfig.label}`}>
          {label}
        </span>
      )}

      <div className="flex items-baseline gap-1 font-mono leading-none">
        <span className={`font-bold tabular-nums text-ink ${sizeConfig.number}`}>
          {score}
        </span>
        {maxScore !== undefined && maxScore !== null && (
          <span className={`text-muted font-normal ${sizeConfig.denom}`}>
            /{maxScore}
          </span>
        )}
      </div>

      {(tier || sublabel) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {tier && (
            <span className="inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-mono font-medium text-ink">
              {tier}
            </span>
          )}
          {sublabel && (
            <span className="text-[10px] text-muted font-mono truncate">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

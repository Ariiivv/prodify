import React from 'react';

export type WorkspaceCategory = 'mastery' | 'sprint' | 'quick_work' | 'casual' | 'quick_flow' | string;

export interface StatChipProps {
  category?: WorkspaceCategory;
  label?: string;
  count?: number;
  isActive?: boolean;
  isLive?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Wandr-style small colored pill tag.
 * Used for workspace type distinction (Mastery, Sprint, Quick work)
 * and concise contextual metadata.
 */
export const StatChip: React.FC<StatChipProps> = ({
  category = 'mastery',
  label,
  count,
  isActive = false,
  isLive = false,
  icon,
  className = '',
}) => {
  const normalized = category.toLowerCase();

  // Category specific styles adhering to "warm paper + one lime" palette
  const getStyles = () => {
    if (isLive) {
      return 'bg-emerald-400 text-black font-semibold';
    }
    if (isActive) {
      return 'bg-white text-black border-white font-semibold';
    }
    switch (normalized) {
      case 'sprint':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'quick_work':
      case 'casual':
      case 'quick_flow':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'mastery':
      default:
        return 'bg-zinc-800 text-zinc-200 border-zinc-700';
    }
  };

  const getDisplayLabel = () => {
    if (label) return label;
    switch (normalized) {
      case 'sprint':
        return 'Sprint';
      case 'quick_work':
      case 'casual':
      case 'quick_flow':
        return 'Quick work';
      case 'mastery':
      default:
        return 'Mastery';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono border transition-all select-none ${getStyles()} ${className}`}
    >
      {isLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-black" />
        </span>
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="capitalize">{getDisplayLabel()}</span>
      {count !== undefined && (
        <span className="opacity-70 tabular-nums">({count})</span>
      )}
    </span>
  );
};

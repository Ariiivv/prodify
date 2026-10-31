import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useCacheStore } from '@/store/cacheStore';
import { toLocalISODate } from '@/lib/dateUtils';
import {
  format,
  parseISO,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

export interface CalendarDay {
  date: string;
  status: 'red' | 'yellow' | 'green' | 'golden' | null;
  actual_minutes?: number;
  target_minutes?: number;
}

interface StructuredGoalCalendarProps {
  workspaceId: number;
  mode?: string;
  sessionCount?: number;
  calendar?: CalendarDay[];
  selectedDate?: string;
  onSelectDate?: (date: string, dayData?: CalendarDay) => void;
  showLegend?: boolean;
  createdDate?: string;
  sprintStartDate?: string;
  sprintDeadlineDate?: string;
}

function formatMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes || 0));
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function getDayStatusVisual(
  dayData: CalendarDay | undefined,
  inMonth: boolean,
  isFuture: boolean,
  isPast: boolean,
  isToday: boolean = false,
  inSprintTrack: boolean = false,
  isPreCreation: boolean = false
) {
  if (!inMonth) {
    return {
      cell: 'text-transparent bg-transparent border border-transparent pointer-events-none',
      label: '',
    };
  }

  // Pre-creation dates: workspace did not exist yet -> neutral, never red
  if (isPreCreation) {
    return {
      cell: 'text-zinc-600 bg-transparent border border-transparent hover:border-zinc-800 opacity-40',
      label: 'Pre-creation (Prior to workspace)',
    };
  }

  const actual = dayData?.actual_minutes ?? 0;
  const target = dayData?.target_minutes ?? 0;

  // 1. Golden (>= 1.5x target)
  if (dayData?.status === 'golden' || (target > 0 && actual >= 1.5 * target)) {
    return {
      cell: 'bg-amber-400/30 text-amber-200 border border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)]',
      label: 'Exceeded Goal (>=1.5x)',
    };
  }

  // 2. Green (1.0x to < 1.5x target)
  if (dayData?.status === 'green' || (target > 0 && actual >= target)) {
    return {
      cell: 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
      label: 'Goal Met',
    };
  }

  // 3. TODAY: If not yet met, render Blue/Indigo Pulsing Border - NEVER RED before the day ends!
  if (isToday) {
    return {
      cell: 'bg-blue-500/15 text-blue-200 border-2 border-blue-500/80 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.35)] font-bold',
      label: actual > 0 ? `In Progress Today (${formatMinutes(actual)} / ${formatMinutes(target)})` : 'In Progress Today',
    };
  }

  // 4. Future dates: inside sprint track vs normal upcoming
  if (isFuture) {
    if (inSprintTrack) {
      return {
        cell: 'bg-zinc-800/90 border border-zinc-600/50 text-zinc-200 font-semibold shadow-sm',
        label: 'Sprint Window Track (Upcoming)',
      };
    }
    return {
      cell: 'text-zinc-600 bg-transparent border border-transparent hover:border-zinc-800',
      label: 'Upcoming',
    };
  }

  // Past dates:
  // 5. Yellow (0.5x to < 1.0x target)
  if (dayData?.status === 'yellow' || (target > 0 && actual >= 0.5 * target)) {
    return {
      cell: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      label: 'Partial (0.5x–1.0x)',
    };
  }

  // 6. Red (< 0.5x target with actual > 0)
  if (dayData?.status === 'red' || (actual > 0 && target > 0 && actual < 0.5 * target)) {
    return {
      cell: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      label: 'Under Target (<0.5x)',
    };
  }

  // 7. Inactive / 0 minutes logged
  return {
    cell: 'bg-[#181818] text-zinc-500 border border-[#262626]',
    label: 'Inactive (0m logged)',
  };
}

export const StructuredGoalCalendar: React.FC<StructuredGoalCalendarProps> = ({
  workspaceId,
  sessionCount,
  calendar: calendarProp,
  selectedDate,
  onSelectDate,
  showLegend = false,
  createdDate,
  sprintStartDate,
  sprintDeadlineDate,
}) => {
  const [fetchedCalendar, setFetchedCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(!calendarProp);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (calendarProp) {
      setFetchedCalendar(calendarProp);
      setLoading(false);
      return;
    }

    let isMounted = true;
    useCacheStore.getState().fetchWorkspaceMetrics(workspaceId).then(data => {
      if (isMounted) {
        if (data?.calendar) setFetchedCalendar(data.calendar);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => { isMounted = false; };
  }, [workspaceId, sessionCount, calendarProp]);

  const calendar = calendarProp ?? fetchedCalendar;

  const dayByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    calendar.forEach((day) => map.set(day.date, day));
    return map;
  }, [calendar]);

  const today = startOfDay(new Date());
  // Viewing the current month keeps "today" anchored; browsing history
  // switches the grid to that month while keeping today highlighted.
  const viewingToday = isSameMonth(currentDate, today);
  const viewAnchor = viewingToday ? today : currentDate;
  const monthStart = startOfMonth(viewAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(viewAnchor), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const nextMonth = () => setCurrentDate((d) => addMonths(d, 1));
  const prevMonth = () => setCurrentDate((d) => subMonths(d, 1));

  if (loading) {
    return (
      <div className="w-full h-48 bg-[#202024] border border-[#27272a] rounded-xl animate-pulse my-4" />
    );
  }

  return (
    <div className="w-full flex flex-col my-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} aria-label="Previous month" className="text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors p-1">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="flex items-center gap-1.5 text-[10px] text-prodify-muted uppercase tracking-wider font-bold">
          {format(viewAnchor, 'MMMM yyyy')}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="What do the calendar colors mean?"
                  className="text-zinc-500 hover:text-[#f4f4f5] transition-colors pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-[#202024] border-[#27272a] text-xs max-w-[260px] text-[#f4f4f5]">
                <p className="font-bold text-[#f4f4f5] mb-1.5">Daily goal progress</p>
                <div className="space-y-1.5 text-[#a1a1aa]">
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500/30 border border-sky-500" /> Today — In progress</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#27272a] border border-zinc-600" /> Sprint window track</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#18181b] border border-[#27272a]" /> Inactive — 0m logged</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/30 border border-amber-500/60" /> Partial effort — under target</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/30 border border-emerald-500/60" /> Goal Met — reached daily target</p>
                </div>
                <p className="text-[#a1a1aa]/80 mt-1.5 text-[11px]">Click any date to inspect breakdown.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          disabled={!isAfter(startOfMonth(today), startOfMonth(viewAnchor))}
          className="text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors p-1 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="w-full bg-[#202024]/80 border border-[#27272a] p-4 shadow-sm rounded-xl backdrop-blur-md">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <div key={label} className="text-center text-[10px] font-bold uppercase tracking-wider text-[#888]">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, viewAnchor);
            const isFuture = isAfter(day, today);
            const isPast = isBefore(day, today);
            const isTodayCell = isSameDay(day, today);
            const dayData = dayByDate.get(dateStr);
            
            const localCreatedDate = toLocalISODate(createdDate || sprintStartDate);
            const localSprintDeadline = toLocalISODate(sprintDeadlineDate);
            const isPreCreation = Boolean(localCreatedDate && dateStr < localCreatedDate);

            const inSprintTrack = Boolean(
              localSprintDeadline &&
              isFuture &&
              dateStr <= localSprintDeadline &&
              (!localCreatedDate || dateStr >= localCreatedDate)
            );

            const visual = getDayStatusVisual(dayData, inMonth, isFuture, isPast, isTodayCell, inSprintTrack, isPreCreation);
            const actual = dayData?.actual_minutes ?? 0;
            const target = dayData?.target_minutes ?? 0;
            const isSelected = selectedDate === dateStr;
            const detail = target > 0
              ? `${formatMinutes(actual)} of ${formatMinutes(target)}`
              : `${formatMinutes(actual)} logged`;

            return (
              <TooltipProvider key={dateStr} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={!inMonth}
                      onClick={() => inMonth && onSelectDate?.(dateStr, dayData)}
                      className={`aspect-square flex items-center justify-center text-[11px] font-mono font-bold rounded-[3px] transition-all ${visual.cell} ${isTodayCell && inMonth ? 'ring-1 ring-blue-400' : ''} ${isSelected && inMonth ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-zinc-950 font-extrabold scale-105 z-10' : ''} ${inMonth ? 'cursor-pointer hover:border-zinc-500' : 'cursor-default'}`}
                    >
                      {inMonth ? format(day, 'd') : ''}
                    </button>
                  </TooltipTrigger>
                  {inMonth && (
                    <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs">
                      <p className="font-bold text-white">{visual.label}</p>
                      <p className="text-[#bbb]">{detail}</p>
                      <p className="text-[#888]">{format(parseISO(dateStr), 'MMM d, yyyy')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-blue-400 bg-blue-500/20 animate-pulse" />
            Today (In Progress)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-800 border border-zinc-600" />
            Sprint Track
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#181818] border border-[#262626]" />
            Inactive
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500/40 border border-rose-500" />
            &lt;0.5x (Red)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500/40 border border-amber-500" />
            0.5–1x (Yellow)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500/40 border border-emerald-500" />
            1–1.5x (Green)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)] border border-amber-400" />
            1.5x+ (Golden)
          </span>
        </div>
      )}
    </div>
  );
};

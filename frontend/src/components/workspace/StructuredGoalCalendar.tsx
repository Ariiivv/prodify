import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
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
}

export function getDayStatusVisual(
  dayData: CalendarDay | undefined,
  inMonth: boolean,
  isFuture: boolean,
  isPast: boolean
) {
  if (!inMonth) {
    return {
      cell: 'text-transparent bg-transparent border border-transparent pointer-events-none',
      label: '',
    };
  }

  if (isFuture) {
    return {
      cell: 'text-zinc-600 bg-transparent border border-transparent hover:border-zinc-800',
      label: 'Upcoming',
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
  if (dayData?.status === 'green' || (target > 0 && actual >= target) || (target <= 0 && actual > 0)) {
    return {
      cell: 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
      label: 'Goal Met',
    };
  }

  // 3. Yellow (0.5x to < 1.0x target)
  if (dayData?.status === 'yellow' || (target > 0 && actual >= 0.5 * target)) {
    return {
      cell: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      label: 'Partial (0.5x–1.0x)',
    };
  }

  // 4. Red (< 0.5x target with actual > 0)
  if (dayData?.status === 'red' || (actual > 0 && target > 0 && actual < 0.5 * target)) {
    return {
      cell: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      label: 'Under Target (<0.5x)',
    };
  }

  // 5. Inactive / 0 minutes logged: Neutral dark
  return {
    cell: 'bg-[#181818] text-zinc-500 border border-[#262626]',
    label: 'Inactive (0m logged)',
  };
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

export const StructuredGoalCalendar: React.FC<StructuredGoalCalendarProps> = ({
  workspaceId,
  sessionCount,
  calendar: calendarProp,
  selectedDate,
  onSelectDate,
  showLegend = false,
}) => {
  const [fetchedCalendar, setFetchedCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(!calendarProp);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (calendarProp) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchCalendar = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/metrics/workspace/${workspaceId}`, {
          headers: getAuthHeaders(),
          cache: 'no-store',
        });
        if (response.ok && isMounted) {
          const data = await response.json();
          setFetchedCalendar(data.calendar || []);
        }
      } catch (error) {
        console.error('Failed to fetch calendar:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCalendar();
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
      <div className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-xl animate-pulse my-4" />
    );
  }

  return (
    <div className="w-full flex flex-col my-4">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} aria-label="Previous month" className="text-[#888] hover:text-white transition-colors p-1">
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
                  className="text-[#666] hover:text-white transition-colors pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs max-w-[240px]">
                <p className="font-bold text-white mb-1.5">Daily goal progress</p>
                <div className="space-y-1.5 text-[#bbb]">
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#181818] border border-[#262626]" /> Inactive — 0m logged</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500" /> Partial effort — under target</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500" /> Goal Met — reached daily target</p>
                </div>
                <p className="text-[#888] mt-1.5 text-[11px]">Click any date to inspect breakdown.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          disabled={!isAfter(startOfMonth(today), startOfMonth(viewAnchor))}
          className="text-[#888] hover:text-white transition-colors p-1 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="w-full bg-zinc-950 border border-zinc-800 p-4 shadow-xl rounded-xl">
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
            const dayData = dayByDate.get(dateStr);
            const visual = getDayStatusVisual(dayData, inMonth, isFuture, isPast);
            const actual = dayData?.actual_minutes ?? 0;
            const target = dayData?.target_minutes ?? 0;
            const isTodayCell = isSameDay(day, today);
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
                      className={`aspect-square flex items-center justify-center text-[11px] font-mono font-bold rounded-[3px] transition-all ${visual.cell} ${isTodayCell && inMonth ? 'ring-1 ring-white/50' : ''} ${isSelected && inMonth ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-zinc-950 font-extrabold scale-105 z-10' : ''} ${inMonth ? 'cursor-pointer hover:border-zinc-500' : 'cursor-default'}`}
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

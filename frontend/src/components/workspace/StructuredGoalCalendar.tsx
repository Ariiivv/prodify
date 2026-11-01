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
      cell: 'text-transparent bg-[#09090b] pointer-events-none cursor-default',
      label: '',
      status: null,
    };
  }

  // Pre-creation dates: workspace did not exist yet -> neutral, never red
  if (isPreCreation) {
    return {
      cell: 'bg-[#0d0d10] text-zinc-600 opacity-40',
      label: 'Pre-creation (Prior to workspace)',
      status: 'pre-creation',
    };
  }

  const actual = dayData?.actual_minutes ?? 0;
  const target = dayData?.target_minutes ?? 0;

  // 1. Golden (>= 1.5x target exceeded)
  if (dayData?.status === 'golden' || (target > 0 && actual >= 1.5 * target)) {
    return {
      cell: 'bg-amber-400 text-zinc-950 font-bold hover:bg-amber-300',
      label: 'Exceeded Goal (1.5x+)',
      status: 'golden',
    };
  }

  // 2. Green (1.0x to < 1.5x target met)
  if (dayData?.status === 'green' || (target > 0 && actual >= target)) {
    return {
      cell: 'bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400',
      label: 'Goal Met (1.0x–1.5x)',
      status: 'green',
    };
  }

  // 3. TODAY: If not yet met, render clean matte cell with high-contrast text - NEVER RED before the day ends!
  if (isToday) {
    if (target > 0 && actual >= 0.5 * target) {
      return {
        cell: 'bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 font-semibold',
        label: `In Progress Today (${formatMinutes(actual)} / ${formatMinutes(target)})`,
        status: 'yellow',
      };
    }
    return {
      cell: 'bg-zinc-900/90 text-white font-semibold hover:bg-zinc-800/90',
      label: actual > 0 ? `In Progress Today (${formatMinutes(actual)} / ${formatMinutes(target)})` : 'In Progress Today',
      status: 'today',
    };
  }

  // 4. Future dates: inside sprint track vs normal upcoming
  if (isFuture) {
    if (inSprintTrack) {
      return {
        cell: 'bg-zinc-800/60 text-zinc-300 font-medium hover:bg-zinc-800/80',
        label: 'Sprint Window Track (Upcoming)',
        status: 'sprint',
      };
    }
    return {
      cell: 'bg-[#0d0d10] text-zinc-400 hover:bg-zinc-900',
      label: 'Upcoming',
      status: 'future',
    };
  }

  // Past dates:
  // 5. Yellow (0.5x to < 1.0x target)
  if (dayData?.status === 'yellow' || (target > 0 && actual >= 0.5 * target)) {
    return {
      cell: 'bg-amber-500/25 text-amber-100 hover:bg-amber-500/35 font-medium',
      label: 'Partial Effort (0.5x–1.0x)',
      status: 'yellow',
    };
  }

  // 6. Red (< 0.5x target with actual > 0, or status === 'red')
  if (dayData?.status === 'red' || (actual > 0 && target > 0 && actual < 0.5 * target)) {
    return {
      cell: 'bg-rose-950/70 text-rose-200 hover:bg-rose-900/80 font-medium',
      label: 'Under Target (<0.5x)',
      status: 'red',
    };
  }

  // 7. Inactive / 0 minutes logged
  return {
    cell: 'bg-[#0d0d10] text-zinc-400 hover:bg-zinc-900',
    label: 'Inactive (0m logged)',
    status: 'inactive',
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
      <div className="w-full h-40 bg-zinc-900/60 border border-zinc-800/80 rounded-xl animate-pulse my-2" />
    );
  }

  return (
    <div className="w-full flex flex-col mt-2 mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={prevMonth} aria-label="Previous month" className="text-zinc-400 hover:text-zinc-100 transition-colors p-1">
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
                  className="text-zinc-500 hover:text-zinc-100 transition-colors pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-zinc-900 border border-zinc-700 text-xs max-w-[260px] text-zinc-100 shadow-2xl">
                <p className="font-bold text-zinc-100 mb-1.5">Daily goal progress</p>
                <div className="space-y-1.5 text-zinc-400">
                  <p className="flex items-center gap-2"><span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-sm bg-zinc-900 border border-zinc-700"><span className="w-1.5 h-0.5 rounded-full bg-zinc-300" /></span> Today — In progress</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-800/60 border border-zinc-700" /> Sprint window track</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#0d0d10] border border-zinc-800" /> Inactive — 0m logged</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-950/70 border border-rose-800/80" /> Under target (&lt;0.5x)</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500/25 border border-amber-500/50" /> Partial effort (0.5–1x)</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-400" /> Goal Met (1–1.5x)</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 border border-amber-300" /> Exceeded Goal (1.5x+)</p>
                </div>
                <p className="text-zinc-400/80 mt-1.5 text-[11px]">Click any date to inspect breakdown.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          disabled={!isAfter(startOfMonth(today), startOfMonth(viewAnchor))}
          className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="w-full bg-zinc-900/60 border border-zinc-800/80 p-3 shadow-sm rounded-xl backdrop-blur-md">
        <div className="grid grid-cols-7 gap-1 mb-1.5 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
            <div key={label} className="text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 bg-transparent rounded-lg">
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
                      className={`w-full aspect-square flex items-center justify-center relative transition-colors rounded-md ${
                        !inMonth
                          ? 'bg-[#09090b] text-transparent cursor-default pointer-events-none'
                          : `${visual.cell} cursor-pointer`
                      } ${isSelected ? 'ring-2 ring-inset ring-white z-10' : ''}`}
                    >
                      <span className="text-xs font-mono font-medium">
                        {inMonth ? format(day, 'd') : ''}
                      </span>
                      {/* Clean Today indicator: subtle matte bar */}
                      {inMonth && isTodayCell && (
                        <span
                          className={`absolute bottom-1 w-2 h-0.5 rounded-full ${
                            visual.status === 'green' || visual.status === 'golden'
                              ? 'bg-zinc-950/80'
                              : 'bg-zinc-300'
                          }`}
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  {inMonth && (
                    <TooltipContent side="top" className="bg-zinc-900 border border-zinc-700 text-xs shadow-2xl">
                      <p className="font-bold text-white">{visual.label}</p>
                      <p className="text-zinc-300">{detail}</p>
                      <p className="text-zinc-500">{format(parseISO(dateStr), 'MMM d, yyyy')}</p>
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
            <span className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-sm bg-zinc-900 border border-zinc-700">
              <span className="w-1.5 h-0.5 rounded-full bg-zinc-300" />
            </span>
            Today (In Progress)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-800/60 border border-zinc-700" />
            Sprint Track
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0d0d10] border border-zinc-800" />
            Inactive
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-950/70 border border-rose-800/80" />
            &lt;0.5x (Red)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/25 border border-amber-500/50" />
            0.5–1x (Yellow)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-400" />
            1–1.5x (Green)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 border border-amber-300" />
            1.5x+ (Golden)
          </span>
        </div>
      )}
    </div>
  );
};

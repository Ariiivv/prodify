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
}

const STATUS_STYLES: Record<string, { cell: string; label: string }> = {
  golden: {
    cell: 'bg-[#e8ff47] text-black shadow-[0_0_8px_rgba(232,255,71,0.4)]',
    label: 'Exceeded goal',
  },
  green: {
    cell: 'bg-green-400 text-black',
    label: 'Met goal',
  },
  yellow: {
    cell: 'bg-amber-400 text-black',
    label: 'Under goal',
  },
  red: {
    cell: 'bg-red-500 text-white',
    label: 'Missed goal',
  },
};

function statusClass(status: CalendarDay['status'] | undefined, inMonth: boolean, isFuture: boolean, isPast: boolean) {
  if (!inMonth) {
    // Out-of-month padding: invisible, keep grid alignment.
    return 'text-transparent bg-transparent border border-transparent pointer-events-none';
  }
  if (status && STATUS_STYLES[status]) {
    return STATUS_STYLES[status].cell;
  }
  // In-month day with no outcome yet — past (no data) or future (upcoming):
  // plain dim number, NO box/border.
  if (isFuture) {
    return 'text-[#444] bg-transparent';
  }
  if (isPast) {
    return 'text-[#555] bg-transparent';
  }
  return 'text-[#888] bg-transparent';
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
      <div className="w-full h-48 bg-[#111111] border border-[#2a2a2a] rounded-none animate-pulse my-4" />
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
              <TooltipContent side="top" className="bg-[#1a1a1a] border-[#333] text-xs max-w-[230px]">
                <p className="font-bold text-white mb-1.5">Daily goal progress</p>
                <div className="space-y-1 text-[#bbb]">
                  <p><span className="inline-block w-2.5 h-2.5 bg-red-500 mr-1.5 align-middle" />Missed — under half the daily target</p>
                  <p><span className="inline-block w-2.5 h-2.5 bg-amber-400 mr-1.5 align-middle" />Under — at least half, target not met</p>
                  <p><span className="inline-block w-2.5 h-2.5 bg-green-400 mr-1.5 align-middle" />Met — daily target reached</p>
                  <p><span className="inline-block w-2.5 h-2.5 bg-[#e8ff47] mr-1.5 align-middle" />Exceeded — 150%+ of target</p>
                </div>
                <p className="text-[#888] mt-1.5">Hover any finished day for its logged time.</p>
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
      <div className="w-full bg-[#111111] border border-[#2a2a2a] p-4 shadow-xl">
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
            const status = dayData?.status ?? null;
            const style = status ? STATUS_STYLES[status] : null;
            const actual = dayData?.actual_minutes ?? 0;
            const target = dayData?.target_minutes ?? 0;
            const label = isFuture
              ? 'Upcoming'
              : style?.label || (inMonth ? (isPast ? 'No data' : 'No activity yet') : '');
            const isTodayCell = isSameDay(day, today);
            // Only real outcome days (past/today, in-month, with a status)
            // get borders, colors and hover stats. Everything else is a
            // plain number (past, no data) or invisible (padding/future).
            const interactive = inMonth && !isFuture && !!style;
            const detail = target > 0
              ? `${formatMinutes(actual)} of ${formatMinutes(target)}`
              : `${formatMinutes(actual)} logged`;

            return (
              <TooltipProvider key={dateStr} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`aspect-square flex items-center justify-center text-[11px] font-mono font-bold rounded-[3px] ${statusClass(status, inMonth, isFuture, isPast)} ${isTodayCell && inMonth ? 'ring-1 ring-white/40' : ''} ${interactive ? 'cursor-default' : ''}`}
                    >
                      {inMonth ? format(day, 'd') : ''}
                    </div>
                  </TooltipTrigger>
                  {interactive && (
                    <TooltipContent side="top" className="bg-[#1a1a1a] border-[#333] text-xs">
                      <p className="font-bold text-white">{label}</p>
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
    </div>
  );
};

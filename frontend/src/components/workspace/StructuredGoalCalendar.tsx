import React, { useEffect, useState, useMemo } from 'react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarDay {
  date: string;
  status: 'red' | 'yellow' | 'green' | 'golden' | null;
}

interface StructuredGoalCalendarProps {
  workspaceId: number;
  mode: string;
  sessionCount: number;
  onTodayGoalFetch?: (targetMinutes: number) => void;
}

export const StructuredGoalCalendar: React.FC<StructuredGoalCalendarProps> = ({ workspaceId, mode, sessionCount }) => {
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!mode || !mode.toLowerCase().includes('structured')) {
      setLoading(false);
      return;
    }

    const fetchCalendar = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/metrics/workspace/${workspaceId}`, { headers: getAuthHeaders() });
        if (response.ok) {
          const data = await response.json();
          setCalendar(data.calendar || []);
        }
      } catch (error) {
        console.error('Failed to fetch calendar:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendar();
  }, [workspaceId, mode, sessionCount]);

  const calendarMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    calendar.forEach(d => map.set(d.date.split('T')[0], d));
    return map;
  }, [calendar]);

  if (loading || !mode || !mode.toLowerCase().includes('structured') || calendar.length === 0) {
    return null;
  }

  // Calculate calendar grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="w-full flex flex-col items-center gap-2 my-2">
      <div className="w-full max-w-[260px] bg-[#111111] border border-[#2a2a2a] p-3 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-3">
          <button onClick={prevMonth} className="text-muted-foreground hover:text-white transition-colors p-0.5">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-[11px] font-bold text-white tracking-wide uppercase">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button onClick={nextMonth} className="text-muted-foreground hover:text-white transition-colors p-0.5">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-[9px] font-semibold text-muted-foreground/60 uppercase">{d}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1 text-center">
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = calendarMap.get(dateStr);
            const isSameMnth = isSameMonth(day, monthStart);
            const isTdy = isSameDay(day, new Date());
            
            let tooltip = dateStr;
            let bgColor = "bg-transparent";
            let textColor = isSameMnth ? "text-prodify-muted" : "text-transparent";
            let border = isSameMnth ? "border border-transparent" : "";

            if (dayData && dayData.status) {
               textColor = "text-white";
               const status = dayData.status;
               
               if (status === 'golden') {
                 bgColor = "bg-prodify-accent";
                 textColor = "text-white drop-shadow-md";
                 tooltip += " (Exceeded)";
               } else if (status === 'green') {
                 bgColor = "bg-prodify-success";
                 textColor = "text-white drop-shadow-md";
                 tooltip += " (Met)";
               } else if (status === 'yellow') {
                 bgColor = "bg-prodify-warning";
                 textColor = "text-white drop-shadow-md";
                 tooltip += " (Under)";
               } else if (status === 'red') {
                 bgColor = "bg-prodify-danger";
                 tooltip += " (Missed)";
               }
            } else if (dayData && dayData.status === null) {
               bgColor = "bg-transparent";
               border = "border border-prodify-border";
               tooltip += " (Upcoming/No Goal)";
            } else if (!isSameMnth) {
               bgColor = "bg-transparent opacity-0 pointer-events-none";
               border = "";
               textColor = "text-transparent";
            }
            
            const ring = isTdy ? "ring-1 ring-white ring-offset-1 ring-offset-[#111111]" : "";

            return (
              <div 
                key={day.toString()} 
                title={tooltip}
                className={`w-6 h-6 mx-auto flex items-center justify-center rounded-[3px] text-[10px] font-bold transition-colors cursor-default ${bgColor} ${textColor} ${border} ${ring}`}
              >
                {format(day, 'd')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

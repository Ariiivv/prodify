import re

with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\frontend\src\components\workspace\WorkspaceCard.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add new imports
if 'import { format, subDays }' not in code:
    code = code.replace("import { Layers, Timer, ArrowRight, Flame, MoreVertical, Pencil, Trash2 } from 'lucide-react';", 
                        "import { Layers, Timer, ArrowRight, Flame, MoreVertical, Pencil, Trash2 } from 'lucide-react';\nimport { format, subDays } from 'date-fns';\nimport { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';")
    code = code.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")

# 2. Add RecentLog interface and current_streak to Workspace
if 'current_streak?: number;' not in code:
    code = code.replace('daily_target_minutes?: number;', 'daily_target_minutes?: number;\n  current_streak?: number;')
    code = code.replace('interface WorkspaceCardProps', '''
interface RecentLog {
  date: string;
  target_met: boolean;
  minutes_logged: number;
  target_minutes_required: number;
}

interface WorkspaceCardProps''')

# 3. Add states and useEffect inside WorkspaceCard component
if 'const [recentLogs' not in code:
    insertion = '''
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/analytics/workspace/${workspace.id}/recent`, {
          headers: getAuthHeaders()
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setRecentLogs(data);
        }
      } catch (err) {
        console.error('Failed to fetch recent logs', err);
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    };
    fetchLogs();
    return () => { isMounted = false; };
  }, [workspace.id]);

  const today = new Date();
  const last7Days = Array.from({length: 7}).map((_, i) => format(subDays(today, 6 - i), 'yyyy-MM-dd'));

  const renderConsistencyChain = () => {
    if (isLoadingLogs) {
      return (
        <div className="flex items-center gap-1.5 mt-3 mb-1">
          {Array.from({length: 7}).map((_, i) => (
             <div key={i} className="w-2.5 h-2.5 rounded-full border border-[#333333] bg-transparent animate-pulse" />
          ))}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 mt-3 mb-1">
        {last7Days.map(dateStr => {
          const log = recentLogs.find(l => l.date === dateStr);
          let state = 'missed';
          if (log?.target_met) state = 'met';
          else if (log && log.minutes_logged > 0) state = 'partial';
          
          let className = "w-2.5 h-2.5 rounded-full transition-all duration-300 ";
          if (state === 'met') className += "bg-[#e8ff47] shadow-[0_0_8px_#e8ff47]";
          else if (state === 'partial') className += "bg-amber-400/80";
          else className += "border border-[#333333] bg-transparent";

          const tooltipText = log 
            ? `${format(new Date(dateStr), 'MMM d')}: ${log.minutes_logged}m / ${log.target_minutes_required}m` 
            : `${format(new Date(dateStr), 'MMM d')}: No activity`;
          
          return (
            <TooltipProvider key={dateStr} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={className} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-[#111111] border-[#2a2a2a] text-white">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };
'''
    # Find the top of the component
    code = code.replace('const [isDeleting, setIsDeleting] = useState(false);', 'const [isDeleting, setIsDeleting] = useState(false);\n' + insertion)

# 4. Add Streak badge next to the title
if '🔥' not in code:
    code = code.replace('<h3 className="text-sm font-bold text-white mb-1">{workspace.name}</h3>', '''
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-white">{workspace.name}</h3>
            {(workspace.current_streak || 0) > 0 && (
              <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded-sm border border-orange-400/20 shadow-[0_0_8px_rgba(251,146,60,0.2)]">
                🔥 {workspace.current_streak}d
              </span>
            )}
          </div>
''')

# 5. Inject renderConsistencyChain
if 'renderConsistencyChain()' not in code:
    code = code.replace('{isSprint ? (', '{renderConsistencyChain()}\n            <div className="mt-2" />\n            {isSprint ? (')

with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\frontend\src\components\workspace\WorkspaceCard.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated WorkspaceCard.tsx successfully!")

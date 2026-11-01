import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Layers, ArrowRight, MoreVertical, Pencil, Trash2, Flame } from 'lucide-react';
import { format, subDays, parseISO, isSameDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toLocalISODate, getTodayLocalISODate } from '@/lib/dateUtils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useCacheStore } from '@/store/cacheStore';
import { EditWorkspaceModal } from './EditWorkspaceModal';

interface Workspace {
  id: number;
  name: string;
  mode?: string;
  category?: string;
  work_duration?: number;
  target_hours?: number;
  daily_target_minutes?: number;
  current_streak?: number;
  deadline?: string;
  focus_keywords?: string;
  description?: string;
}

interface WorkspaceMetrics {
  pace: {
    score: number;
    label: string;
    consistency: number;
    volume: number;
    quality: number;
  };
  deep_work_ratio: number | null;
  calendar: { date: string; status: 'red' | 'yellow' | 'green' | 'golden' | null; actual_minutes?: number; target_minutes?: number }[];
  workspace_streak_current: number;
  workspace_streak_longest: number;
}

export interface WorkspaceMatrixItem {
  id: number;
  name: string;
  category: string;
  created_at: string;
  allowed_intent_whitelist: string;
  today_logged_minutes: number;
  daily_target_minutes: number;
  today_cleared: boolean;
  card_status_label: string;
  card_status_tone: 'success' | 'progress' | 'neutral' | 'danger';
  raw_daily_target_minutes?: number;
  seven_day_chain: {
    date: string;
    day_name?: string;
    status: 'cleared' | 'partial' | 'missed' | 'untracked' | 'paused';
    minutes_logged: number;
    target_minutes: number;
  }[];
  top_distracting_os_apps: string[];
}

interface WorkspaceCardProps {
  workspace: Workspace;
  index?: number;
  onDeleted?: (workspaceId: number) => void;
  onUpdated?: (updatedWs: any) => void;
  totalMinutesLogged?: number;
  matrixItem?: WorkspaceMatrixItem;
}

const WorkspaceCard = React.memo(function WorkspaceCard({ 
  workspace, 
  index = 0, 
  onDeleted, 
  onUpdated,
  totalMinutesLogged = 0,
  matrixItem
}: WorkspaceCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const cachedMetrics = useCacheStore(state => state.workspaceMetrics[workspace.id]?.data);
  const perfMatrixItem = useCacheStore(state =>
    state.dashboard.performanceMatrix?.workspaces_matrix?.find((w: any) => w.id === workspace.id)
  );
  const resolvedMatrix = matrixItem || perfMatrixItem;

  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(cachedMetrics || null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(!cachedMetrics && !resolvedMatrix);

  useEffect(() => {
    // If unified performance matrix data is available, skip separate fetch
    if (resolvedMatrix) {
      setIsLoadingMetrics(false);
      return;
    }
    // If dashboard is fetching or already has cached workspaces, prevent redundant N-requests storm
    const { dashboard, isDashboardFetching } = useCacheStore.getState();
    if (isDashboardFetching || dashboard.lastFetched > 0) {
      setIsLoadingMetrics(false);
      return;
    }
    let isMounted = true;
    useCacheStore.getState().fetchWorkspaceMetrics(workspace.id).then(data => {
      if (isMounted) {
        if (data) setMetrics(data);
        setIsLoadingMetrics(false);
      }
    });
    return () => { isMounted = false; };
  }, [workspace.id, resolvedMatrix]);

  const today = new Date();
  const todayStr = getTodayLocalISODate();
  const last7Days = Array.from({length: 7}).map((_, i) => format(subDays(today, 6 - i), 'yyyy-MM-dd'));
  const localCreatedDate = toLocalISODate((workspace as any).created_at || (resolvedMatrix as any)?.created_at);

  const renderConsistencyChain = () => {
    if (resolvedMatrix?.seven_day_chain) {
      return (
        <div className="flex items-center gap-1.5">
          {resolvedMatrix.seven_day_chain.map((day) => {
            const isToday = day.date === todayStr;
            const isPreCreation = Boolean(localCreatedDate && day.date < localCreatedDate);
            const isPausedWorkspace = (workspace as any).status === 'paused' || resolvedMatrix?.status === 'paused';
            let className = "w-2.5 h-2.5 rounded-[3px] transition-all duration-300 ";
            if (isPreCreation) {
              className += "border border-zinc-800 bg-transparent opacity-40";
            } else if (day.status === 'cleared') {
              className += "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
            } else if (isToday) {
              className += "border border-zinc-600 bg-zinc-800";
            } else if (day.status === 'missed') {
              className += "bg-rose-500/80";
            } else {
              className += "border border-zinc-800 bg-zinc-900/60";
            }

            const statusDisplay = isPreCreation ? 'Prior to creation' :
              day.status === 'cleared' ? 'Cleared' :
              isToday ? (isPausedWorkspace ? 'Paused' : 'In Progress Today') :
              day.status === 'missed' ? 'Missed Quota' :
              isPausedWorkspace ? 'Paused' : 'Untracked';
            
            const tooltipText = isToday 
              ? `Today: ${day.status === 'cleared' ? 'Cleared' : (isPausedWorkspace ? 'Paused' : 'In Progress')} (${day.minutes_logged}m / ${day.target_minutes}m)`
              : `${day.day_name || day.date}: ${statusDisplay} (${day.minutes_logged}m / ${day.target_minutes}m)`;

            return (
              <TooltipProvider key={day.date} delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={className} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs bg-zinc-950 border-zinc-800 text-white">
                    {tooltipText}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      );
    }

    if (isLoadingMetrics || !metrics) {
      return (
        <div className="flex items-center gap-1">
          {Array.from({length: 7}).map((_, i) => (
             <div key={i} className="w-2.5 h-2.5 rounded-full border border-zinc-800 bg-transparent animate-pulse" />
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        {last7Days.map(dateStr => {
          const isToday = dateStr === todayStr;
          const isPreCreation = Boolean(localCreatedDate && dateStr < localCreatedDate);
          const dayLog = metrics.calendar?.find((c) => c.date === dateStr);
          let className = "w-2.5 h-2.5 rounded-[3px] transition-all duration-300 ";
          
          const isPausedWorkspace = (workspace as any).status === 'paused';
          const rawHabitTarget = workspace.daily_target_minutes || 60;
          const isClearedToday = dayLog && (dayLog.actual_minutes ?? 0) >= rawHabitTarget;

          if (isPreCreation) {
            className += "border border-zinc-800 bg-transparent opacity-40";
          } else if (dayLog?.status === 'golden' || dayLog?.status === 'green' || isClearedToday) {
            className += "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]";
          } else if (isToday) {
            className += "border border-zinc-600 bg-zinc-800";
          } else if (dayLog?.status === 'red') {
            className += "bg-rose-500/80";
          } else {
            className += "border border-zinc-800 bg-zinc-900/60";
          }

          const statusDisplay = isToday 
            ? (dayLog?.status === 'golden' || dayLog?.status === 'green' || isClearedToday ? 'Cleared' : (isPausedWorkspace ? 'Paused' : 'In Progress Today'))
            : (dayLog?.status ? dayLog.status.charAt(0).toUpperCase() + dayLog.status.slice(1) : (isPausedWorkspace ? 'Paused' : 'Untracked'));
          const tooltipText = isToday
            ? `Today: ${statusDisplay}`
            : `${format(parseISO(dateStr), 'MMM d')}: ${statusDisplay}`;
          
          return (
            <TooltipProvider key={dateStr} delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={className} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs bg-zinc-950 border-zinc-800 text-white">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  };

  const confirmDelete = async (keepMetrics: boolean) => {
    try {
      await useCacheStore.getState().deleteWorkspace(workspace.id, keepMetrics);
      onDeleted?.(workspace.id);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleting(true);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditModalOpen(true);
  };

  const isSprint = workspace.category === 'sprint';
  const isQuickWork = workspace.category === 'casual' || workspace.category === 'quick_work';
  const totalHoursLogged = (totalMinutesLogged / 60).toFixed(1);
  const currentStreak = resolvedMatrix ? ((resolvedMatrix as any).current_streak ?? workspace.current_streak ?? 0) : (metrics ? metrics.workspace_streak_current : (workspace.current_streak || 0));

  const todayLogged = resolvedMatrix ? resolvedMatrix.today_logged_minutes : 0;
  const dailyTarget = resolvedMatrix ? resolvedMatrix.daily_target_minutes : (workspace.daily_target_minutes || (isSprint ? 60 : 60));
  const todayCleared = resolvedMatrix ? resolvedMatrix.today_cleared : false;
  const statusLabel = resolvedMatrix?.card_status_label || (todayLogged > 0 ? `${todayLogged}m left today` : 'Ready to Start');
  const statusTone = resolvedMatrix?.card_status_tone || 'neutral';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        whileHover={{ y: -2, transition: { duration: 0.15 } }}
        onClick={() => navigate(`/workspace/${workspace.id}`)}
        className="relative flex flex-col rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-900/80 hover:border-zinc-700/80 backdrop-blur-md p-5 cursor-pointer overflow-hidden group h-full shadow-sm transition-all duration-150"
      >
        <div className="relative z-10 flex flex-col h-full flex-grow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-800 border border-zinc-700/50 text-zinc-100 shadow-inner">
              <Layers className="w-4 h-4 text-zinc-200" />
            </div>
            <div className="flex items-center gap-1">
              <ArrowRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={handleDeleteClick}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-all opacity-0 group-hover:opacity-100"
                title="Delete workspace"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <button
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-xl text-zinc-100">
                  <DropdownMenuItem onClick={handleEdit} className="cursor-pointer rounded-lg hover:bg-zinc-800 focus:bg-zinc-800 focus:text-white">
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteClick} className="cursor-pointer rounded-lg text-rose-400 hover:text-rose-300 focus:text-rose-300 hover:bg-zinc-800 focus:bg-zinc-800">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">{workspace.name}</h3>
            {currentStreak > 0 && (
              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" /> {currentStreak}d
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-400 line-clamp-2 mb-5 flex-grow">
            {workspace.focus_keywords || workspace.description || `${workspace.mode || 'structured'} track`}
          </p>
          
          <div className="mt-auto pt-2">
              {renderConsistencyChain()}
              <div className="mt-2" />
              
              <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400 uppercase tracking-wider text-[10px] font-mono font-semibold">Total Logged</span>
                <span className="text-zinc-100 font-mono font-bold">{totalHoursLogged}h</span>
              </div>
              
              {/* Today's Quota Progress */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono font-semibold">Today's Quota</span>
                  <span className={`text-[11px] font-mono font-bold ${
                    statusTone === 'success' || statusTone === 'green' ? 'text-emerald-400' :
                    statusTone === 'progress' || statusTone === 'amber' || statusTone === 'blue' ? 'text-amber-400' :
                    statusTone === 'danger' || statusTone === 'red' ? 'text-rose-400' : 'text-zinc-400'
                  }`}>
                    {statusLabel}
                  </span>
                </div>
                {dailyTarget > 0 ? (
                  <>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          todayCleared ? 'bg-emerald-400' :
                          todayLogged > 0 ? 'bg-zinc-300' : 'bg-transparent'
                        }`}
                        style={{ width: `${Math.min(100, Math.round((todayLogged / dailyTarget) * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                      <span>{todayLogged}m / {dailyTarget}m Today</span>
                      <span>{Math.round((todayLogged / dailyTarget) * 100)}%</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-zinc-400 font-mono">
                    <span>{todayLogged > 0 ? `${todayLogged}m logged today` : 'Flexible flow'}</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-zinc-800/80">
                <div className="flex items-center gap-1.5">
                  <span className={`${
                    isSprint ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' :
                    isQuickWork ? 'text-zinc-300 bg-zinc-800/80 border-zinc-700/50' :
                    'text-zinc-200 bg-zinc-800/80 border-zinc-700/50'
                  } px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold tracking-wide uppercase border`}>
                    {isSprint ? 'Sprint' : isQuickWork ? 'Quick Work' : 'Mastery'}
                  </span>
                  {((workspace as any).status === 'paused' || resolvedMatrix?.status === 'paused') && (
                    <span className="text-zinc-400 bg-zinc-800/80 border border-zinc-700/60 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium">
                      Paused
                    </span>
                  )}
                </div>
                
                <button className="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-100 transition-colors flex items-center gap-1">
                  Continue <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isDeleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); setIsDeleting(false); }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm z-50 p-6 flex flex-col gap-4 rounded-xl shadow-2xl"
              style={{ backgroundColor: '#09090b', border: '1px solid #27272a' }}
            >
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Delete Workspace?</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Your focus data helps the AI coach guide you better. Keep it?</p>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => confirmDelete(true)}
                  className="w-full py-2.5 text-sm font-semibold text-black transition-colors rounded-xl"
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  Keep Data
                </button>
                <button
                  onClick={() => confirmDelete(false)}
                  className="w-full py-2.5 text-sm font-semibold text-red-400 hover:text-red-300 transition-colors rounded-xl"
                  style={{ border: '1px solid #27272a', backgroundColor: '#09090b' }}
                >
                  Delete Everything
                </button>
                <button
                  onClick={() => setIsDeleting(false)}
                  className="w-full py-2 text-sm text-gray-500 hover:text-white transition-colors mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <EditWorkspaceModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        workspace={workspace}
        onSaved={(updated) => {
          setIsEditModalOpen(false);
          onUpdated?.(updated);
        }}
      />
    </>
  );
});

export default WorkspaceCard;

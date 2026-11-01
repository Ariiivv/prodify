import { useEffect, useMemo, useRef } from 'react';
import { Activity, Clock3, Keyboard, MousePointer2, ShieldCheck } from 'lucide-react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useIdleDetection } from '@/hooks/useIdleDetection';

interface InputActivityMonitorProps {
  isActive: boolean;
  category?: string;
  workspaceId?: number | null;
  windowTitle?: string;
  appName?: string;
  intent?: string;
  isContextAligned: boolean;
  onInactivityDetected?: (reason: string) => void;
}

const BASE_THRESHOLDS: Record<string, number> = {
  mastery: 120,
  sprint: 90,
  quick_work: 180,
  casual: 180,
  quick_flow: 180,
};

const PASSIVE_TERMS = ['video', 'lecture', 'course', 'documentation', 'docs', 'research', 'paper', 'reader', 'reading', 'tutorial', 'reference', 'presentation'];

function formatIdle(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function InputActivityMonitor({
  isActive,
  category = 'mastery',
  workspaceId,
  windowTitle = '',
  appName = '',
  intent = '',
  isContextAligned,
  onInactivityDetected,
}: InputActivityMonitorProps) {
  const reportedIdleRef = useRef(false);
  const lastSentAtRef = useRef(0);

  const passiveContext = useMemo(() => {
    const context = `${windowTitle} ${appName}`.toLowerCase();
    return isContextAligned && PASSIVE_TERMS.some(term => context.includes(term));
  }, [appName, isContextAligned, windowTitle]);

  const thresholdSeconds = (BASE_THRESHOLDS[category.toLowerCase()] ?? BASE_THRESHOLDS.mastery) * (passiveContext ? 3 : 1);
  const { idleTime, keystrokes, clicks } = useIdleDetection({
    enabled: isActive,
    idleTimeout: thresholdSeconds * 1000,
  });
  const idleSeconds = isActive ? Math.floor(idleTime / 1000) : 0;
  const inputState = !isActive ? 'Standby' : idleSeconds >= thresholdSeconds ? 'Needs attention' : idleSeconds >= 10 ? 'Reading / thinking' : 'Active';

  useEffect(() => {
    if (!isActive) reportedIdleRef.current = false;
  }, [isActive]);

  useEffect(() => {
    if (!isActive || idleSeconds < thresholdSeconds || reportedIdleRef.current) return;
    reportedIdleRef.current = true;
    onInactivityDetected?.(`User inactive for ${formatIdle(idleSeconds)} — input activity threshold exceeded`);
  }, [idleSeconds, isActive, onInactivityDetected, thresholdSeconds]);

  useEffect(() => {
    const currentTime = Date.now();
    if (!isActive || !workspaceId || currentTime - lastSentAtRef.current < 10000) return;
    lastSentAtRef.current = currentTime;
    void fetch(`${API_BASE}/api/telemetry/input-activity`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        workspace_id: workspaceId,
        window_title: windowTitle,
        app_name: appName,
        intent,
        idle_seconds: idleSeconds,
        keystrokes,
        clicks,
      }),
    }).catch(() => {});
  }, [appName, clicks, idleSeconds, intent, isActive, keystrokes, windowTitle, workspaceId]);

  return (
    <div className="space-y-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${inputState === 'Needs attention' ? 'bg-amber-400' : isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="text-sm font-medium text-zinc-100">{inputState}</span>
        </div>
        <span className="font-mono text-xs text-zinc-400">Idle {formatIdle(idleSeconds)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"><Keyboard className="mb-1 h-3.5 w-3.5 text-sky-400" /><span className="text-zinc-400">Keys </span><span className="text-zinc-100">{keystrokes}</span></div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"><MousePointer2 className="mb-1 h-3.5 w-3.5 text-violet-400" /><span className="text-zinc-400">Clicks </span><span className="text-zinc-100">{clicks}</span></div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2"><Clock3 className="mb-1 h-3.5 w-3.5 text-amber-400" /><span className="text-zinc-400">Limit </span><span className="text-zinc-100">{formatIdle(thresholdSeconds)}</span></div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        {passiveContext ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> : <Activity className="h-3.5 w-3.5 text-sky-400" />}
        <span>{passiveContext ? 'Passive aligned activity allowance active' : isContextAligned ? 'Window aligns with your intent' : 'Waiting for an aligned window'}</span>
      </div>
    </div>
  );
}

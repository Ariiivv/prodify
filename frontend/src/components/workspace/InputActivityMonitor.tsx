import { useEffect, useRef } from 'react';
import { API_BASE, getAuthHeaders } from '@/lib/config';
import { useIdleDetection } from '@/hooks/useIdleDetection';

interface InputActivityMonitorProps {
  isActive: boolean;
  workspaceId?: number | null;
  windowTitle?: string;
  appName?: string;
  intent?: string;
  idleAllowanceSeconds?: number;
  isClassifying?: boolean;
  isPausedForInactivity?: boolean;
  isDistracted?: boolean;
  onInactivityDetected?: (reason: string) => void;
}

function formatIdle(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function InputActivityMonitor({
  isActive,
  workspaceId,
  windowTitle = '',
  appName = '',
  intent = '',
  idleAllowanceSeconds = 300,
  isClassifying = false,
  isPausedForInactivity = false,
  isDistracted = false,
  onInactivityDetected,
}: InputActivityMonitorProps) {
  const reportedIdleRef = useRef(false);
  const lastSentAtRef = useRef(0);

  const thresholdSeconds = Math.max(60, Math.min(1200, idleAllowanceSeconds));

  const { idleTime, keystrokes, clicks } = useIdleDetection({
    enabled: isActive,
    idleTimeout: thresholdSeconds * 1000,
  });

  const idleSeconds = isActive ? Math.floor(idleTime / 1000) : 0;

  // Single source of truth: monitor and banner can never contradict
  let statusText = 'Standby';
  let dotColor = 'bg-[#3d3d3a]';

  if (isPausedForInactivity) {
    statusText = 'Paused (idle)';
    dotColor = 'bg-[#d4a24c]'; // warm warning
  } else if (isDistracted) {
    statusText = 'Attention shifted';
    dotColor = 'bg-[#c96a5f]'; // bad
  } else if (!isActive) {
    statusText = 'Standby';
    dotColor = 'bg-[#3d3d3a]';
  } else if (isClassifying) {
    statusText = 'Analyzing';
    dotColor = 'bg-[#a3a299]';
  } else if (idleSeconds >= 25) {
    statusText = 'Reading';
    dotColor = 'bg-[#7fa37a]'; // sage
  } else {
    statusText = 'Active';
    dotColor = 'bg-[#7fa37a]'; // sage
  }

  useEffect(() => {
    if (!isActive) reportedIdleRef.current = false;
  }, [isActive]);

  // NEVER pause while classification is pending. Only pause when idle time exceeds resolved allowance.
  useEffect(() => {
    if (isClassifying || !isActive || idleSeconds < thresholdSeconds || reportedIdleRef.current) return;
    reportedIdleRef.current = true;
    onInactivityDetected?.(`User inactive for ${formatIdle(idleSeconds)} — allowance exceeded`);
  }, [idleSeconds, isActive, isClassifying, onInactivityDetected, thresholdSeconds]);

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
    <div className="flex items-center justify-between text-xs bg-[#262624] border border-[#3d3d3a] rounded-xl px-3 py-2 w-full overflow-hidden">
      {/* State & live idle counter */}
      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
        <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
        <span className="font-medium text-[#faf9f5] truncate text-xs">{statusText}</span>
        {isActive && idleSeconds > 0 && (
          <span className="text-[#a3a299] tabular-nums font-sans text-[11px]">
            ({formatIdle(idleSeconds)})
          </span>
        )}
      </div>

      {/* Compact row: Keys, Clicks, Limit with auto tag */}
      <div className="flex items-center gap-2 text-[11px] text-[#a3a299] tabular-nums font-sans shrink-0">
        <div className="flex items-center gap-1">
          <span>Keys</span>
          <span className="font-medium text-[#faf9f5]">{keystrokes}</span>
        </div>
        <span className="text-[#3d3d3a]">·</span>
        <div className="flex items-center gap-1">
          <span>Clicks</span>
          <span className="font-medium text-[#faf9f5]">{clicks}</span>
        </div>
        <span className="text-[#3d3d3a]">·</span>
        <div className="flex items-center gap-1 shrink-0">
          <span>Limit</span>
          <span className="font-medium text-[#faf9f5]">{formatIdle(thresholdSeconds)}</span>
          <span className="text-[9px] uppercase font-sans text-[#a3a299] bg-[#30302e] border border-[#3d3d3a] px-1 py-0.5 rounded leading-none shrink-0 inline-block">
            auto
          </span>
        </div>
      </div>
    </div>
  );
}

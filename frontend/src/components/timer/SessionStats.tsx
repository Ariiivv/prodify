import { Zap, AlertCircle, Clock, Trophy } from 'lucide-react';

interface SessionStatsProps {
  sessionCount: number;
  distractionCount: number;
  focusMinutes: number;
  workDuration: number;
  onDistractionClick?: () => void;
}

export default function SessionStats({ sessionCount, distractionCount, focusMinutes, workDuration, onDistractionClick }: SessionStatsProps) {
  const stats = [
    { label: 'Completed Sessions', value: sessionCount, icon: Trophy, color: 'text-primary' },
    { label: 'Current Focus Time', value: `${focusMinutes}m`, icon: Clock, color: 'text-accent' },
    { label: 'Current Distractions', value: distractionCount, icon: AlertCircle, color: distractionCount > 3 ? 'text-destructive' : 'text-amber-400' },
    { label: 'Time Per Session', value: `${workDuration}m`, icon: Zap, color: 'text-green-400' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => {
        const isDistraction = label === 'Current Distractions';
        const Wrapper = isDistraction && onDistractionClick ? 'button' : 'div';
        const wrapperProps = isDistraction && onDistractionClick 
          ? { onClick: onDistractionClick, className: "rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 backdrop-blur-sm p-4 text-left transition-colors cursor-pointer" } 
          : { className: "rounded-xl border border-border bg-card shadow-sm p-4" };
          
        return (
          <Wrapper key={label} {...(wrapperProps as any)}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span className={`text-xs ${isDistraction ? 'text-red-400' : 'text-muted-foreground'}`}>{label}</span>
            </div>
            <span className={`text-xl font-bold ${isDistraction ? 'text-red-500' : 'text-foreground'}`}>{value}</span>
          </Wrapper>
        );
      })}
    </div>
  );
}

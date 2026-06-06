import { Zap, AlertCircle, Clock, Trophy } from 'lucide-react';

interface SessionStatsProps {
  sessionCount: number;
  distractionCount: number;
  focusMinutes: number;
  workDuration: number;
}

export default function SessionStats({ sessionCount, distractionCount, focusMinutes, workDuration }: SessionStatsProps) {
  const stats = [
    { label: 'Sessions', value: sessionCount, icon: Trophy, color: 'text-primary' },
    { label: 'Focus', value: `${focusMinutes}m`, icon: Clock, color: 'text-accent' },
    { label: 'Distractions', value: distractionCount, icon: AlertCircle, color: distractionCount > 3 ? 'text-destructive' : 'text-amber-400' },
    { label: 'Duration', value: `${workDuration}m`, icon: Zap, color: 'text-green-400' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <span className="text-xl font-bold text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
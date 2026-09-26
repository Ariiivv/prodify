import re

with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\frontend\src\pages\HomePage.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add globalStats state
if 'const [globalStats' not in code:
    code = code.replace('const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});', 
'''const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});
  const [globalStats, setGlobalStats] = useState<{current_global_streak: number, longest_global_streak: number, ten_day_rolling_score: number} | null>(null);''')

# 2. Fetch global stats
if 'api/analytics/global' not in code:
    insertion = '''
      // Fetch global analytics stats
      const statsRes = await fetch(`${API_BASE}/api/analytics/global`, { headers }).catch(() => null);
      if (statsRes && statsRes.ok) {
        setGlobalStats(await statsRes.json());
      }
'''
    code = code.replace('const wsRes = await fetch(`${API_BASE}/workspaces`, { headers });', 
                        'const wsRes = await fetch(`${API_BASE}/workspaces`, { headers });\n' + insertion)

# 3. Focus Command Strip: Update Alignment block and add Streak Badge
if '10d Form' not in code:
    old_alignment = '''<div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🎯</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Intent Alignment</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">{alignmentScore}% on-task</span>
            </div>
          </div>'''
    
    new_alignment_and_streak = '''<div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🎯</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Alignment & Form</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">
                {alignmentScore}% <span className="text-[#888888] text-[10px]">today</span>
                {' · '}
                ⚡ {globalStats ? Math.round(globalStats.ten_day_rolling_score * 100) : 0}% <span className="text-[#888888] text-[10px]">10d</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl hidden sm:block">🔥</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-prodify-muted uppercase tracking-wider font-semibold">Global Streak</span>
              <span className="text-white font-mono font-bold text-sm sm:text-base">
                {globalStats?.current_global_streak || 0} Day{globalStats?.current_global_streak !== 1 && 's'}
              </span>
              <span className="text-[10px] text-[#e8ff47]">Best: {globalStats?.longest_global_streak || 0}d</span>
            </div>
          </div>'''
    code = code.replace(old_alignment, new_alignment_and_streak)
    code = code.replace('className="grid grid-cols-2 md:flex md:flex-row', 'className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-row flex-wrap')

with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\frontend\src\pages\HomePage.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated HomePage.tsx successfully!")

import os
import re

filepath = 'frontend/src/pages/HomePage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

new_fetch_data = '''
  const fetchData = useCallback(async () => {
    try {
      let headers = getAuthHeaders();
      // If token isn't ready for some reason, wait a beat
      if (!headers.Authorization) {
        await new Promise(r => setTimeout(r, 500));
        headers = getAuthHeaders();
      }

      const res = await fetch(\\/api/analytics/dashboard-aggregate\, { 
        headers,
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces);
        setGlobalStats(data.global_stats);
        setGoalPlans(data.goal_plans);
        // We could also pass recent_logs down to WorkspaceCard to avoid N+1 there,
        // but for now we just store it in a way that WorkspaceCard could use it if we want to.
        // Actually, let's pass it by modifying WorkspaceCard next.
        // We'll need a state for it if we want to pass it.
        // Since we are changing HomePage, let's just add setRecentLogs.
        // Wait, HomePage doesn't have a state for recentLogs yet. Let's just create a ref or state.
      } else {
        setDataWarnings(prev => Array.from(new Set([...prev, "Failed to load dashboard data"])));
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setIsLoading(false);
    }
  }, []);
'''

# We need to replace the entire fetchData block.
# Let's find it.
import re

pattern = re.compile(r'const fetchData = useCallback\(async \(\) => \{.*?\}, \[\]\);', re.DOTALL)
content = pattern.sub(new_fetch_data.strip(), content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

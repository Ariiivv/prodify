import os
import re

filepath = 'frontend/src/components/workspace/WorkspaceCard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Props Interface
content = content.replace(
    'totalMinutesLogged?: number;',
    'totalMinutesLogged?: number;\n  recentLogs?: any[];'
)

# 2. Update Component Signature
content = content.replace(
    'totalMinutesLogged = 0 }: WorkspaceCardProps) {',
    'totalMinutesLogged = 0, recentLogs }: WorkspaceCardProps) {'
)

# 3. Update useEffect for fetching logs
old_effect = '''  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(${API_BASE}/api/analytics/workspace//recent, { headers: getAuthHeaders() });
        if (res.ok) {
          setLogs(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch workspace logs', err);
      }
    };
    fetchLogs();
  }, [workspace.id]);'''

new_effect = '''  useEffect(() => {
    if (recentLogs) {
      setLogs(recentLogs);
      return;
    }
    const fetchLogs = async () => {
      try {
        const res = await fetch(${API_BASE}/api/analytics/workspace//recent, { headers: getAuthHeaders() });
        if (res.ok) {
          setLogs(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch workspace logs', err);
      }
    };
    fetchLogs();
  }, [workspace.id, recentLogs]);'''

content = content.replace(old_effect, new_effect)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

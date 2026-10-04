import os
import re

filepath = 'src/components/workspace/WorkspaceCard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);',
    'const [fetchedLogs, setFetchedLogs] = useState<RecentLog[]>([]);'
)

content = content.replace(
    'setRecentLogs(data);',
    'setFetchedLogs(data);'
)

content = content.replace(
    'const log = recentLogs.find(l => l.date === dateStr);',
    'const activeLogs = recentLogs || fetchedLogs;\n          const log = activeLogs.find(l => l.date === dateStr);'
)

# And in useEffect, we should skip fetching if recentLogs prop is provided.
old_effect = '''  useEffect(() => {
    let isMounted = true;
    const fetchLogs = async () => {'''

new_effect = '''  useEffect(() => {
    let isMounted = true;
    if (recentLogs) {
        setIsLoadingLogs(false);
        return;
    }
    const fetchLogs = async () => {'''
content = content.replace(old_effect, new_effect)

# Update useEffect dependency
content = content.replace(
    '}, [workspace.id]);',
    '}, [workspace.id, recentLogs]);'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

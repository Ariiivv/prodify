import os

filepath = 'frontend/src/pages/HomePage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'goalPlan={goalPlans[ws.id]}',
    'goalPlan={goalPlans[ws.id]}\n                      recentLogs={recentLogs[ws.id]}'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

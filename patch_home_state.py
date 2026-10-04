import os
import re

filepath = 'frontend/src/pages/HomePage.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});',
    'const [goalPlans, setGoalPlans] = useState<Record<number, GoalPlan>>({});\n  const [recentLogs, setRecentLogs] = useState<Record<number, any[]>>({});'
)

content = content.replace(
    'setGoalPlans(data.goal_plans);',
    'setGoalPlans(data.goal_plans);\n        setRecentLogs(data.recent_logs);'
)

content = content.replace(
    '<WorkspaceCard \n                    key={ws.id} \n                    workspace={ws} \n                    index={index} \n                    onDeleted={fetchData}\n                    goalPlan={goalPlans[ws.id]}\n                  />',
    '<WorkspaceCard \n                    key={ws.id} \n                    workspace={ws} \n                    index={index} \n                    onDeleted={fetchData}\n                    goalPlan={goalPlans[ws.id]}\n                    recentLogs={recentLogs[ws.id]}\n                  />'
)

# Wait, the render block might be slightly different. Let's find out how it is rendered.

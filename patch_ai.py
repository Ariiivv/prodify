import os
import re

filepath = 'frontend/src/components/chat/AiCoachPanel.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update React.memo for AiCoachPanel
content = content.replace(
    'export default function AiCoachPanel({',
    'import React from "react";\n\nconst AiCoachPanel = React.memo(function AiCoachPanel({'
)

# 2. Add export default AiCoachPanel at the end
# The last line should be closing the component } -> });\nexport default AiCoachPanel;
# But AiCoachPanel has export default function AiCoachPanel at the top? I already replaced it.
# Now I just need to close the React.memo at the bottom.
content = re.sub(r'\}\(AiCoachPanel\);?\s*$', '', content) # just in case
content = re.sub(r'\}\s*$', '});\n\nexport default AiCoachPanel;', content)

# 3. Fix payload mismatch
old_payload = '''      const payload = {
        message: text,
        context: {
          distractionCount: localDistractionCount + distractionCount,
          timeLeft: timeRemainingString,
          workspaceName: workspaceName || 'Default',
          workspaceMode: currentState?.includes('BREAK') ? 'Break' : 'Structured',
          focusMinutes,
          burnoutProbability,
          currentState,
          sessionCount,
          idleSeconds,
          focusDuration: workDuration,
          breakDuration,
          targetHours,
          themeColor,
          currentTabTitle,
          focusKeywords,
        },
      };'''

new_payload = '''      const payload = {
        message: text,
        workspace_name: workspaceName || 'Default',
        workspace_mode: currentState?.includes('BREAK') ? 'Break' : 'Structured',
        context: {
          distractionCount: localDistractionCount + distractionCount,
          timeLeft: timeRemainingString,
          workspaceName: workspaceName || 'Default',
          workspaceMode: currentState?.includes('BREAK') ? 'Break' : 'Structured',
          focusMinutes,
          burnoutProbability,
          currentState,
          sessionCount,
          idleSeconds,
          focusDuration: workDuration,
          breakDuration,
          targetHours,
          themeColor,
          currentTabTitle,
          focusKeywords,
        },
      };'''

content = content.replace(old_payload, new_payload)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

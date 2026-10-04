import os

path = 'frontend/src/components/workspace/CreateWorkspaceDialog.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add states
if 'const [themeColor, setThemeColor]' not in content:
    content = content.replace(
        'const [cameraEnabled, setCameraEnabled] = useState(false);',
        "const [cameraEnabled, setCameraEnabled] = useState(false);\n  const [themeColor, setThemeColor] = useState<string>('#3b82f6');\n  const THEME_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];"
    )

# Add payload
if 'theme_color: themeColor' not in content:
    content = content.replace(
        'current_goal: goalDescription.trim() || null,',
        "current_goal: goalDescription.trim() || null,\n        theme_color: themeColor,"
    )

# Add UI
theme_ui = """
                {/* Theme Color */}
                <div className="pt-2">
                  <label className="text-sm font-bold text-white block">Theme Color</label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Choose an accent color for this workspace.
                  </p>
                  <div className="flex gap-3">
                    {THEME_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setThemeColor(color)}
                        className={`w-8 h-8 rounded-full transition-transform ${themeColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-950 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
"""

if 'Theme Color' not in content:
    content = content.replace(
        '{/* Focus Keywords */}',
        f"{theme_ui}\n\n                {{/* Focus Keywords */}}"
    )

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Dialog patched.")

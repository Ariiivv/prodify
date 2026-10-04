path = 'backend/app/api/workspaces.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'theme_color' not in content:
    content = content.replace(
        'current_goal: Optional[str] = Field(default=None, max_length=2000)',
        "current_goal: Optional[str] = Field(default=None, max_length=2000)\n    theme_color: Optional[str] = Field(default='#3b82f6', max_length=20)"
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("workspaces.py patched.")

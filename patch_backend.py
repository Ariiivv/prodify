import os

# 1. Update schemas.py
path = 'backend/app/models/schemas.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'theme_color' not in content:
    content = content.replace(
        'current_goal = Column(String, nullable=True)',
        "current_goal = Column(String, nullable=True)\n    theme_color = Column(String, nullable=True, default='#3b82f6')"
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# 2. Update crud.py
path = 'backend/app/models/crud.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'theme_color' not in content:
    # Update create_workspace
    content = content.replace(
        'focus_keywords: Optional[str] = None,',
        "focus_keywords: Optional[str] = None,\n    theme_color: Optional[str] = '#3b82f6',"
    )
    content = content.replace(
        'focus_keywords=focus_keywords,',
        "focus_keywords=focus_keywords,\n        theme_color=theme_color,"
    )
    
    # Update update_workspace
    content = content.replace(
        'focus_keywords: Optional[str] = None,',
        "focus_keywords: Optional[str] = None,\n    theme_color: Optional[str] = '#3b82f6',"
    )
    content = content.replace(
        'workspace.focus_keywords = focus_keywords',
        "workspace.focus_keywords = focus_keywords\n    if theme_color is not None:\n        workspace.theme_color = theme_color"
    )
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Backend schema patched.")

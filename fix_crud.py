with open('backend/app/models/crud.py', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('def evaluate_global_streak(db: Session, log_date: date):\n    from datetime import timedelta\n    workspaces = db.query(models.Workspace).all()', 'def evaluate_global_streak(db: Session, user_id: str, log_date: date):\n    from datetime import timedelta\n    workspaces = db.query(models.Workspace).filter(models.Workspace.user_id == user_id).all()')
c = c.replace('stats = db.query(models.UserStats).filter(models.UserStats.id == 1).first()\n        if not stats:\n            stats = models.UserStats(id=1, current_global_streak=0, longest_global_streak=0)', 'stats = db.query(models.UserStats).filter(models.UserStats.user_id == user_id).first()\n        if not stats:\n            stats = models.UserStats(user_id=user_id, current_global_streak=0, longest_global_streak=0)')
with open('backend/app/models/crud.py', 'w', encoding='utf-8') as f:
    f.write(c)

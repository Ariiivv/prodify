import os

filepath = 'backend/app/api/analytics.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

dashboard_code = '''
@router.get("/dashboard-aggregate")
def get_dashboard_aggregate(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    from app.services.goal_optimizer import calculate_daily_plan
    
    # 1. Global Stats
    stats = db.query(models.UserStats).filter(models.UserStats.user_id == current_user.id).first()
    cutoff_global = date.today() - timedelta(days=10)
    global_logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= cutoff_global
    ).all()
    score = sum(log.intent_score for log in global_logs) / len(global_logs) if global_logs else 0.0
    global_stats = {
        "current_global_streak": stats.current_global_streak if stats else 0,
        "longest_global_streak": stats.longest_global_streak if stats else 0,
        "ten_day_rolling_score": round(score, 1)
    }

    # 2. Workspaces
    workspaces_qs = db.query(models.Workspace).filter(models.Workspace.user_id == current_user.id).order_by(models.Workspace.created_at.desc()).all()
    
    # Convert SQLAlchemy workspaces to dict matching WorkspaceOut
    workspaces = []
    for w in workspaces_qs:
        wd = {
            "id": w.id,
            "user_id": w.user_id,
            "name": w.name,
            "mode": w.mode,
            "category": w.category,
            "target_hours": w.target_hours,
            "deadline": w.deadline.isoformat() if w.deadline else None,
            "daily_target_minutes": w.daily_target_minutes,
            "work_duration": w.work_duration,
            "break_duration": w.break_duration,
            "long_break_duration": w.long_break_duration,
            "long_break_interval": w.long_break_interval,
            "focus_keywords": w.focus_keywords,
            "camera_enabled": w.camera_enabled
        }
        workspaces.append(wd)
        
    # 3. Goal Plans & Recent Logs
    goal_plans = {}
    recent_logs = {}
    cutoff_recent = date.today() - timedelta(days=7)
    
    all_recent_logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= cutoff_recent
    ).order_by(models.DailyWorkspaceLog.date.asc()).all()
    
    logs_by_ws = {}
    for log in all_recent_logs:
        logs_by_ws.setdefault(log.workspace_id, []).append({
            "date": log.date.isoformat(),
            "target_met": log.target_met,
            "minutes_logged": log.minutes_logged,
            "target_minutes_required": log.target_minutes_required
        })
    
    for w in workspaces_qs:
        recent_logs[w.id] = logs_by_ws.get(w.id, [])
        if w.category == 'sprint' and w.target_hours and w.target_hours > 0 and w.deadline:
            try:
                plan = calculate_daily_plan(
                    target_hours=w.target_hours,
                    deadline=w.deadline.isoformat(),
                    db=db,
                    workspace_name=w.name
                )
                goal_plans[w.id] = plan
            except Exception:
                pass
                
    return {
        "global_stats": global_stats,
        "workspaces": workspaces,
        "goal_plans": goal_plans,
        "recent_logs": recent_logs
    }
'''

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content + '\n' + dashboard_code)

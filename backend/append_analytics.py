new_endpoints = '''
@router.get("/global")
def get_global_stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    stats = db.query(models.UserStats).filter(models.UserStats.id == 1).first()
    cutoff = date.today() - timedelta(days=10)
    
    logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= cutoff
    ).all()
    
    score = sum(log.intent_score for log in logs) / len(logs) if logs else 0.0
    
    return {
        "current_global_streak": stats.current_global_streak if stats else 0,
        "longest_global_streak": stats.longest_global_streak if stats else 0,
        "ten_day_rolling_score": round(score, 1)
    }

@router.get("/workspace/{workspace_id}/recent")
def get_workspace_recent(workspace_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=7)
    
    logs = db.query(models.DailyWorkspaceLog).filter(
        models.DailyWorkspaceLog.workspace_id == workspace_id,
        models.DailyWorkspaceLog.date >= cutoff
    ).order_by(models.DailyWorkspaceLog.date.asc()).all()
    
    return [
        {
            "date": log.date.isoformat(),
            "target_met": log.target_met,
            "minutes_logged": log.minutes_logged,
            "target_minutes_required": log.target_minutes_required
        }
        for log in logs
    ]

@router.get("/calendar")
def get_calendar(year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import date, timedelta
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year+1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month+1, 1) - timedelta(days=1)
        
    logs = db.query(models.DailyWorkspaceLog).join(models.Workspace).filter(
        models.Workspace.user_id == current_user.id,
        models.DailyWorkspaceLog.date >= start_date,
        models.DailyWorkspaceLog.date <= end_date
    ).all()
    
    result = {}
    for log in logs:
        ds = log.date.isoformat()
        if ds not in result:
            result[ds] = {"total_logged": 0, "perfect_day": True, "workspaces_active": 0}
        
        result[ds]["total_logged"] += log.minutes_logged
        result[ds]["workspaces_active"] += 1
        if not log.target_met:
            result[ds]["perfect_day"] = False
            
    return result
'''
with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\backend\app\api\analytics.py', 'a') as f:
    f.write('\n' + new_endpoints)

new_code = '''
def update_or_create_daily_log(db: Session, workspace_id: int, log_date: date, session_minutes: int, intent_score: float) -> models.DailyWorkspaceLog:
    from datetime import timedelta
    workspace = get_workspace(db, workspace_id)
    if not workspace:
        raise ValueError(f"Workspace with id {workspace_id} not found")

    target_req = workspace.daily_target_minutes if workspace.category == "mastery" else 60

    log = db.query(models.DailyWorkspaceLog).filter(
        models.DailyWorkspaceLog.workspace_id == workspace_id,
        models.DailyWorkspaceLog.date == log_date
    ).first()

    if not log:
        log = models.DailyWorkspaceLog(
            workspace_id=workspace_id,
            date=log_date,
            category=workspace.category,
            target_minutes_required=target_req,
            minutes_logged=0,
            intent_score=0.0,
            target_met=False
        )
        db.add(log)
        db.commit()
        db.refresh(log)

    log.minutes_logged += session_minutes
    if log.intent_score == 0.0:
        log.intent_score = intent_score
    else:
        log.intent_score = (log.intent_score + intent_score) / 2.0

    if not log.target_met and log.minutes_logged >= log.target_minutes_required:
        log.target_met = True
        
        yesterday = log_date - timedelta(days=1)
        prev_log = db.query(models.DailyWorkspaceLog).filter(
            models.DailyWorkspaceLog.workspace_id == workspace_id,
            models.DailyWorkspaceLog.date == yesterday
        ).first()

        if prev_log and prev_log.target_met:
            workspace.current_streak += 1
        else:
            workspace.current_streak = 1
            
        if workspace.current_streak > workspace.longest_streak:
            workspace.longest_streak = workspace.current_streak

    db.commit()
    db.refresh(log)
    return log

def evaluate_global_streak(db: Session, log_date: date):
    from datetime import timedelta
    workspaces = db.query(models.Workspace).all()
    if not workspaces:
        return

    all_met = True
    for ws in workspaces:
        # Check if they have a log and if target_met is True
        log = db.query(models.DailyWorkspaceLog).filter(
            models.DailyWorkspaceLog.workspace_id == ws.id,
            models.DailyWorkspaceLog.date == log_date
        ).first()
        if not log or not log.target_met:
            all_met = False
            break

    if all_met:
        stats = db.query(models.UserStats).filter(models.UserStats.id == 1).first()
        if not stats:
            stats = models.UserStats(id=1, current_global_streak=0, longest_global_streak=0)
            db.add(stats)
            db.commit()
            db.refresh(stats)

        yesterday = log_date - timedelta(days=1)
        if stats.last_global_perfect_date == yesterday:
            stats.current_global_streak += 1
        elif stats.last_global_perfect_date != log_date:
            stats.current_global_streak = 1

        if stats.current_global_streak > stats.longest_global_streak:
            stats.longest_global_streak = stats.current_global_streak

        stats.last_global_perfect_date = log_date
        db.commit()
'''
with open(r'c:\Users\ariva\Desktop\Projects\prodifyy\backend\app\models\crud.py', 'a') as f:
    f.write('\n' + new_code)

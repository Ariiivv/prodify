import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import schemas as models
from app.services.activity_parser import parse_activity

logger = logging.getLogger("prodify_ml_pattern_engine")

OS_SYSTEM_UTILITIES = {
    "snippingtool.exe",
    "screenclippinghost.exe",
    "shellexperiencehost.exe",
    "searchhost.exe",
    "startmenuexperiencehost.exe",
    "applicationframehost.exe",
    "taskmgr.exe",
    "explorer.exe",
    "textinputhost.exe",
    "systemsettings.exe",
    "lockapp.exe",
    "explorer",
    "snippingtool",
    "searchhost",
    "taskmgr",
    "textinputhost",
    "systemsettings",
    "lockapp",
    "screenclippinghost",
    "windows explorer",
}


def is_os_utility(val: Any) -> bool:
    if not val:
        return False
    s = str(val).lower().strip()
    if s in OS_SYSTEM_UTILITIES:
        return True
    base = s.replace(".exe", "")
    if base in OS_SYSTEM_UTILITIES:
        return True
    return any(u in s for u in ("shellexperiencehost", "snippingtool", "searchhost", "textinputhost"))


def _default_dossier(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "sample_size": 0,
        "attention_decay_wall": {
            "predicted_minute": 25.0,
            "confidence": "baseline",
            "historical_median": 25.0,
            "p25": 20.0,
            "p75": 30.0,
        },
        "circadian_vulnerability": {
            "peak_distraction_hour": 15,
            "safest_focus_hour": 10,
            "hour_importance": 0.33,
            "session_fatigue_importance": 0.33,
            "track_day_importance": 0.34,
        },
        "category_benchmarks": {
            "mastery": {
                "total_sessions": 0,
                "total_focus_minutes": 0.0,
                "purity_pct": 100.0,
                "top_trigger_app": "None",
            },
            "sprint": {
                "total_sessions": 0,
                "total_focus_minutes": 0.0,
                "purity_pct": 100.0,
                "top_trigger_app": "None",
            },
            "quick_work": {
                "total_sessions": 0,
                "total_focus_minutes": 0.0,
                "purity_pct": 100.0,
                "top_trigger_app": "None",
            },
        },
        "top_distraction_triggers": [],
    }


def mine_user_telemetry_dossier(db: Session, user_id: str) -> dict:
    """
    Scikit-Learn ML Middle-Man Engine:
    Mines granular telemetry coordinates and activity logs strictly scoped to user_id.
    - Component A: Attention Decay Wall (RandomForestRegressor on minute_into_session)
    - Component B: Circadian Vulnerability (RandomForestClassifier on clock_hour, session_index, track_day)
    - Component C: 3-Category Benchmarks (mastery, sprint, quick_work) & Top Trigger Apps
    """
    try:
        workspaces = db.query(models.Workspace).filter(models.Workspace.user_id == user_id).all()
        if not workspaces:
            return _default_dossier(user_id)

        workspace_ids = [w.id for w in workspaces]
        sessions = (
            db.query(models.Session)
            .filter(
                models.Session.workspace_id.in_(workspace_ids),
                models.Session.session_type == "FOCUS",
                models.Session.status == "COMPLETED",
            )
            .all()
        )

        telemetry_logs = (
            db.query(models.TelemetryLog)
            .filter(
                models.TelemetryLog.workspace_id.in_(workspace_ids),
                models.TelemetryLog.metric_type == "WINDOW_DISTRACTION",
            )
            .order_by(models.TelemetryLog.timestamp.desc())
            .limit(1000)
            .all()
        )

        activity_logs = (
            db.query(models.ActivityLog)
            .filter(models.ActivityLog.workspace_id.in_(workspace_ids))
            .order_by(models.ActivityLog.timestamp.desc())
            .limit(1000)
            .all()
        )

        total_sample_size = len(telemetry_logs) + len(activity_logs)

        # -------------------------------------------------------------------
        # Component A: Attention Decay Wall (Regression)
        # -------------------------------------------------------------------
        valid_decay_records = []
        for t in telemetry_logs:
            if t.minute_into_session is not None and t.minute_into_session > 0:
                trig = t.trigger_app or ""
                if not is_os_utility(trig):
                    h = t.clock_hour if t.clock_hour is not None else 14
                    s_idx = t.session_index_today or 1
                    t_day = t.track_day_number or 1
                    valid_decay_records.append((h, s_idx, t_day, float(t.minute_into_session)))

        if len(valid_decay_records) >= 8:
            X_reg = [[r[0], r[1], r[2]] for r in valid_decay_records]
            y_reg = [r[3] for r in valid_decay_records]
            hist_median = float(np.median(y_reg))
            p25 = float(np.percentile(y_reg, 25))
            p75 = float(np.percentile(y_reg, 75))
            try:
                rf_reg = RandomForestRegressor(n_estimators=30, max_depth=4, random_state=42)
                rf_reg.fit(X_reg, y_reg)
                latest_day = max(r[2] for r in valid_decay_records)
                pred = float(rf_reg.predict([[14, 1, latest_day]])[0])
                pred_minute = round(max(5.0, min(120.0, pred)), 1)
                confidence = "high" if len(valid_decay_records) >= 20 else "medium"
            except Exception as ex:
                logger.warning(f"[ML PATTERNS] RandomForestRegressor fit failed: {ex}")
                pred_minute = round(hist_median, 1)
                confidence = "medium"
        elif valid_decay_records:
            y_vals = [r[3] for r in valid_decay_records]
            hist_median = float(np.median(y_vals))
            pred_minute = round(hist_median, 1)
            p25 = round(float(np.percentile(y_vals, 25)), 1)
            p75 = round(float(np.percentile(y_vals, 75)), 1)
            confidence = "low"
        else:
            hist_median = 25.0
            pred_minute = 25.0
            p25 = 20.0
            p75 = 30.0
            confidence = "baseline"

        # -------------------------------------------------------------------
        # Component B: Circadian Vulnerability & Feature Importance (Classification)
        # -------------------------------------------------------------------
        X_clf = []
        y_clf = []
        hour_distractions: Dict[int, int] = {h: 0 for h in range(24)}
        hour_totals: Dict[int, int] = {h: 0 for h in range(24)}

        for a in activity_logs:
            h = a.clock_hour if a.clock_hour is not None else (a.timestamp.hour if a.timestamp else 14)
            s_idx = a.session_index_today or 1
            t_day = a.track_day_number or 1
            is_dist = 0 if a.is_focused == 1 else 1

            X_clf.append([h, s_idx, t_day])
            y_clf.append(is_dist)

            if 0 <= h < 24:
                hour_totals[h] += 1
                if is_dist == 1:
                    hour_distractions[h] += 1

        hour_rates = {}
        for h in range(24):
            if hour_totals[h] >= 2:
                hour_rates[h] = hour_distractions[h] / hour_totals[h]

        if hour_rates:
            peak_hour = max(hour_rates, key=hour_rates.get)
            safest_hour = min(hour_rates, key=hour_rates.get)
        else:
            peak_hour = 15
            safest_hour = 10

        if len(X_clf) >= 10 and len(set(y_clf)) > 1:
            try:
                clf = RandomForestClassifier(n_estimators=30, max_depth=4, random_state=42)
                clf.fit(X_clf, y_clf)
                importances = clf.feature_importances_
                hour_imp = round(float(importances[0]), 3)
                fatigue_imp = round(float(importances[1]), 3)
                track_imp = round(float(importances[2]), 3)
            except Exception as ex:
                logger.warning(f"[ML PATTERNS] RandomForestClassifier fit failed: {ex}")
                hour_imp, fatigue_imp, track_imp = 0.33, 0.33, 0.34
        else:
            hour_imp, fatigue_imp, track_imp = 0.33, 0.33, 0.34

        # -------------------------------------------------------------------
        # Component C: 3-Category Breakdown & Trigger Apps
        # -------------------------------------------------------------------
        category_benchmarks = {}
        for cat in ("mastery", "sprint", "quick_work"):
            match_cats = {cat}
            if cat == "quick_work":
                match_cats.add("casual")
                match_cats.add("quick_flow")

            cat_ws_ids = {
                w.id for w in workspaces if (w.category or "mastery").lower() in match_cats
            }

            cat_sessions = [s for s in sessions if s.workspace_id in cat_ws_ids]
            total_sess = len(cat_sessions)
            total_focus_secs = sum(s.duration or 0 for s in cat_sessions)
            total_focus_mins = round(total_focus_secs / 60.0, 1)

            cat_activities = [a for a in activity_logs if a.workspace_id in cat_ws_ids]
            tot_act = len(cat_activities)
            foc_act = sum(1 for a in cat_activities if a.is_focused == 1)
            purity = round((foc_act / tot_act) * 100, 1) if tot_act > 0 else 100.0

            cat_triggers: Dict[str, int] = {}
            for t in telemetry_logs:
                if t.workspace_id in cat_ws_ids and t.trigger_app:
                    tr = t.trigger_app.strip()
                    if not is_os_utility(tr):
                        cat_triggers[tr] = cat_triggers.get(tr, 0) + 1
            top_cat_trig = max(cat_triggers, key=cat_triggers.get) if cat_triggers else "None"

            category_benchmarks[cat] = {
                "total_sessions": total_sess,
                "total_focus_minutes": total_focus_mins,
                "purity_pct": purity,
                "top_trigger_app": top_cat_trig,
            }

        # Overall top distraction triggers
        trigger_counts: Dict[str, int] = {}
        for t in telemetry_logs:
            tr = (t.trigger_app or "").strip()
            if tr and not is_os_utility(tr):
                trigger_counts[tr] = trigger_counts.get(tr, 0) + 1

        for a in activity_logs:
            if a.is_focused == 0:
                display_name = a.clean_app_name or a.platform_name or a.app_name or ""
                if not is_os_utility(display_name):
                    display_name = display_name.strip()
                    if display_name:
                        trigger_counts[display_name] = trigger_counts.get(display_name, 0) + 1

        total_trigs = sum(trigger_counts.values())
        top_distraction_triggers = []
        for app, cnt in sorted(trigger_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
            pct = round((cnt / total_trigs) * 100, 1) if total_trigs > 0 else 0.0
            top_distraction_triggers.append({"app": app, "count": cnt, "pct": pct})

        return {
            "user_id": user_id,
            "sample_size": total_sample_size,
            "attention_decay_wall": {
                "predicted_minute": pred_minute,
                "confidence": confidence,
                "historical_median": round(hist_median, 1),
                "p25": round(p25, 1),
                "p75": round(p75, 1),
            },
            "circadian_vulnerability": {
                "peak_distraction_hour": peak_hour,
                "safest_focus_hour": safest_hour,
                "hour_importance": hour_imp,
                "session_fatigue_importance": fatigue_imp,
                "track_day_importance": track_imp,
            },
            "category_benchmarks": category_benchmarks,
            "top_distraction_triggers": top_distraction_triggers,
        }

    except Exception as exc:
        logger.error(f"[ML PATTERNS] Failed to mine user telemetry dossier: {exc}", exc_info=True)
        return _default_dossier(user_id)


def predict_realtime_burnout(
    db: Session,
    user_id: str,
    current_hour: int = 14,
    current_focus_minutes: int = 0,
    distraction_count: int = 0,
) -> dict:
    """
    Computes real-time tab switch and cognitive burnout probability
    informed by the user's empirical Scikit-Learn attention decay wall and circadian profile.
    """
    dossier = mine_user_telemetry_dossier(db, user_id)
    wall_min = dossier["attention_decay_wall"]["predicted_minute"]
    peak_h = dossier["circadian_vulnerability"]["peak_distraction_hour"]
    safest_h = dossier["circadian_vulnerability"]["safest_focus_hour"]
    top_trig = (
        dossier["top_distraction_triggers"][0]["app"]
        if dossier["top_distraction_triggers"]
        else None
    )

    # 1. Decay wall proximity
    decay_ratio = current_focus_minutes / max(10.0, wall_min)
    base_prob = 0.20 * min(2.0, decay_ratio)

    # 2. Cumulative session fatigue / distraction switches
    base_prob += min(0.35, distraction_count * 0.04)

    # 3. Circadian vulnerability
    if current_hour == peak_h:
        base_prob += 0.18
    elif abs(current_hour - peak_h) <= 1:
        base_prob += 0.08
    elif current_hour == safest_h:
        base_prob -= 0.10

    # 4. Late night / early morning cognitive tax
    if current_hour >= 23 or current_hour < 5:
        base_prob += 0.12
    elif 14 <= current_hour <= 16:
        base_prob += 0.05

    final_prob = round(max(0.05, min(0.95, base_prob)), 2)
    risk = "High" if final_prob >= 0.65 else ("Moderate" if final_prob >= 0.35 else "Low")

    return {
        "tab_switch_probability": final_prob,
        "burnout_risk": risk,
        "predicted_decay_minute": wall_min,
        "top_trigger_app": top_trig,
        "peak_distraction_hour": peak_h,
        "safest_focus_hour": safest_h,
    }

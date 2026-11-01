"""
verify_cascade_deletion.py
===========================
Standalone verification script testing hard cascade deletion of workspaces
and complete orphan prevention across all dependent tables.
"""

import sys
import warnings
import logging
from datetime import datetime, date, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("prodify_backend").setLevel(logging.WARNING)
logging.getLogger("prodify_metrics_engine").setLevel(logging.WARNING)

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import text
from app.models.connection import SessionLocal, engine
from app.models import schemas as models
from app.models import crud
from app.services.intent_classifier import clear_intent_cache
from app.services.metrics_engine import compute_home_metrics, compute_report_analytics, get_local_date

TEST_USER_ID = "cascade_test_user"
TEST_USER_EMAIL = "cascade_test_user@example.com"
TEST_USER_USERNAME = "cascade_test_user"

# All dependent models that hold a workspace_id foreign key
DEPENDENT_TABLES = [
    ("sessions", models.Session),
    ("telemetry_logs", models.TelemetryLog),
    ("activity_logs", models.ActivityLog),
    ("daily_workspace_logs", models.DailyWorkspaceLog),
    ("workspace_metrics", models.WorkspaceMetrics),
    ("workspace_chat_history", models.WorkspaceChatHistory),
    ("coaching_interactions", models.CoachingInteraction),
]


def print_counts_table(title: str, counts_a: dict, counts_b: dict):
    print(f"\n{title}")
    header_table = "Table"
    header_a = "Workspace A"
    header_b = "Workspace B"
    max_len = max(len(t) for t, _ in DEPENDENT_TABLES) + 2
    col_width_tbl = max(max_len, len(header_table) + 2)
    col_width_a = 15
    col_width_b = 15

    separator = f"+{'-' * col_width_tbl}+{'-' * col_width_a}+{'-' * col_width_b}+"
    print(separator)
    print(f"| {header_table.ljust(col_width_tbl - 2)} | {header_a.rjust(col_width_a - 2)} | {header_b.rjust(col_width_b - 2)} |")
    print(separator)
    for table_name, _ in DEPENDENT_TABLES:
        cnt_a = counts_a.get(table_name, 0)
        cnt_b = counts_b.get(table_name, 0)
        print(f"| {table_name.ljust(col_width_tbl - 2)} | {str(cnt_a).rjust(col_width_a - 2)} | {str(cnt_b).rjust(col_width_b - 2)} |")
    print(separator)


def get_child_counts(db, ws_id: int) -> dict:
    counts = {}
    for table_name, model in DEPENDENT_TABLES:
        cnt = db.query(model).filter(model.workspace_id == ws_id).count()
        counts[table_name] = cnt
    return counts


def purge_test_user(db):
    """Safely cleans up only the test user and its associated workspaces/stats."""
    workspaces = db.query(models.Workspace).filter(models.Workspace.user_id == TEST_USER_ID).all()
    for ws in workspaces:
        try:
            clear_intent_cache(ws.id)
            crud.delete_workspace(db=db, workspace_id=ws.id, keep_metrics=False)
        except Exception:
            pass

    db.query(models.UserStats).filter(models.UserStats.user_id == TEST_USER_ID).delete(synchronize_session=False)
    db.query(models.User).filter(models.User.id == TEST_USER_ID).delete(synchronize_session=False)
    db.commit()


def run_verification():
    print("=" * 70)
    print("Cascade deletion and orphan verification")
    print("=" * 70)

    db = SessionLocal()

    # Enforce SQLite foreign keys if running on SQLite
    if engine.url.drivername.startswith("sqlite"):
        db.execute(text("PRAGMA foreign_keys = ON;"))
        db.commit()

    all_passed = True
    ws_a_id = None
    ws_b_id = None

    try:
        # Pre-cleanup to ensure a pristine test sandbox
        purge_test_user(db)

        # 1. Setup Test User
        test_user = models.User(
            id=TEST_USER_ID,
            username=TEST_USER_USERNAME,
            email=TEST_USER_EMAIL,
            auth_provider="email",
        )
        db.add(test_user)
        db.flush()

        today = get_local_date(datetime.utcnow())

        # Set a non-zero current global streak for the user
        user_stats = models.UserStats(
            user_id=test_user.id,
            current_global_streak=5,
            longest_global_streak=5,
            momentum_score=85.0,
            last_evaluated_date=today,
            last_global_perfect_date=today,
        )
        db.add(user_stats)
        db.flush()

        # Create two workspaces, A and B
        ws_a = models.Workspace(
            user_id=test_user.id,
            name="Cascade Test Workspace A",
            mode="pomodoro",
            category="mastery",
            daily_target_minutes=60,
            work_duration=25,
            break_duration=5,
            status="active",
        )
        ws_b = models.Workspace(
            user_id=test_user.id,
            name="Cascade Test Workspace B",
            mode="pomodoro",
            category="mastery",
            daily_target_minutes=60,
            work_duration=25,
            break_duration=5,
            status="active",
        )
        db.add(ws_a)
        db.add(ws_b)
        db.flush()

        ws_a_id = ws_a.id
        ws_b_id = ws_b.id

        # Insert at least one row in EVERY dependent table for each workspace
        for ws in [ws_a, ws_b]:
            session = models.Session(
                user_id=test_user.id,
                workspace_id=ws.id,
                start_time=datetime.utcnow() - timedelta(minutes=60),
                end_time=datetime.utcnow(),
                duration=3600,
                session_type="FOCUS",
                status="COMPLETED",
                burnout_score=0.1,
                distraction_count=1,
                distracted_seconds=60.0,
                session_index_today=1,
                track_day_number=1,
                timezone="UTC",
            )
            db.add(session)
            db.flush()

            telemetry = models.TelemetryLog(
                workspace_id=ws.id,
                session_id=session.id,
                timestamp=datetime.utcnow(),
                metric_type="TAB_SWITCH",
                value=1.0,
                distraction_type="TAB_SWITCH",
                reason="tab_switch",
            )
            db.add(telemetry)

            activity = models.ActivityLog(
                workspace_id=ws.id,
                session_id=session.id,
                timestamp=datetime.utcnow(),
                app_name="TestIDE.exe",
                window_title="main.py - Prodify",
                is_focused=1,
                similarity_score=0.92,
            )
            db.add(activity)

            daily_log = models.DailyWorkspaceLog(
                workspace_id=ws.id,
                date=today,
                category="mastery",
                target_minutes_required=60,
                minutes_logged=60,
                intent_score=0.95,
                target_met=True,
            )
            db.add(daily_log)

            metrics = models.WorkspaceMetrics(
                workspace_id=ws.id,
                workspace_name=ws.name,
                session_date=today,
                focus_minutes=60,
                distraction_count=1,
                burnout_score=0.1,
                time_of_day="morning",
                mode="pomodoro",
                completed=1,
            )
            db.add(metrics)

            chat = models.WorkspaceChatHistory(
                workspace_id=ws.id,
                role="user",
                content="Cascade deletion test message",
                timestamp=datetime.utcnow(),
            )
            db.add(chat)

            coaching = models.CoachingInteraction(
                workspace_id=ws.id,
                user_message="Are my sessions tracked?",
                ai_response="Yes, tracking is active.",
                burnout_score_at_time=0.1,
                focus_minutes_at_time=60.0,
                timestamp=datetime.utcnow(),
            )
            db.add(coaching)

        db.commit()

        print(f"\n[STAGE 1] SETUP COMPLETE")
        print(f"Test User: {test_user.id} (Initial Global Streak: {user_stats.current_global_streak})")
        print(f"Workspace A: ID {ws_a_id} ('{ws_a.name}')")
        print(f"Workspace B: ID {ws_b_id} ('{ws_b.name}')")

        # 2. Before Deletion: Print initial counts
        counts_before_a = get_child_counts(db, ws_a_id)
        counts_before_b = get_child_counts(db, ws_b_id)
        print_counts_table("STAGE 2: BEFORE DELETION (Child Row Counts)", counts_before_a, counts_before_b)

        init_pop_pass = all(v >= 1 for v in counts_before_a.values()) and all(v >= 1 for v in counts_before_b.values())
        print(f"[CHECK 1] Initial child records populated for both workspaces: {'PASS' if init_pop_pass else 'FAIL'}")
        if not init_pop_pass:
            all_passed = False

        # 3. Delete Workspace A
        print(f"\nSTAGE 3: DELETING WORKSPACE A (ID {ws_a_id})")
        print(f"Calling crud.delete_workspace(workspace_id={ws_a_id}, keep_metrics=False)...")
        clear_intent_cache(ws_a_id)
        crud.delete_workspace(db=db, workspace_id=ws_a_id, keep_metrics=False)

        counts_after_a_a = get_child_counts(db, ws_a_id)
        counts_after_a_b = get_child_counts(db, ws_b_id)
        print_counts_table("STAGE 3 COUNTS: AFTER DELETING WORKSPACE A", counts_after_a_a, counts_after_a_b)

        ws_a_purged = all(v == 0 for v in counts_after_a_a.values())
        ws_b_untouched = all(counts_after_a_b[k] == counts_before_b[k] for k in counts_before_b)
        ws_a_row_deleted = db.query(models.Workspace).filter(models.Workspace.id == ws_a_id).first() is None

        print(f"[CHECK 2] Workspace A child records cascade deleted (all 0): {'PASS' if ws_a_purged else 'FAIL'}")
        print(f"[CHECK 3] Workspace B child records untouched: {'PASS' if ws_b_untouched else 'FAIL'}")
        print(f"[CHECK 4] Workspace A parent row deleted: {'PASS' if ws_a_row_deleted else 'FAIL'}")

        if not (ws_a_purged and ws_b_untouched and ws_a_row_deleted):
            all_passed = False

        # 4. Delete Workspace B
        print(f"\nSTAGE 4: DELETING WORKSPACE B (ID {ws_b_id})")
        print(f"Calling crud.delete_workspace(workspace_id={ws_b_id}, keep_metrics=False)...")
        clear_intent_cache(ws_b_id)
        crud.delete_workspace(db=db, workspace_id=ws_b_id, keep_metrics=False)

        counts_after_b_a = get_child_counts(db, ws_a_id)
        counts_after_b_b = get_child_counts(db, ws_b_id)
        print_counts_table("STAGE 4 COUNTS: AFTER DELETING WORKSPACE B", counts_after_b_a, counts_after_b_b)

        ws_b_purged = all(v == 0 for v in counts_after_b_b.values())
        ws_b_row_deleted = db.query(models.Workspace).filter(models.Workspace.id == ws_b_id).first() is None

        # Re-query user stats to verify global streak recalculation
        db.expire_all()
        current_stats = db.query(models.UserStats).filter(models.UserStats.user_id == test_user.id).first()
        final_streak = current_stats.current_global_streak if current_stats else 0
        streak_reset = (final_streak == 0)

        print(f"[CHECK 5] Workspace B child records cascade deleted (all 0): {'PASS' if ws_b_purged else 'FAIL'}")
        print(f"[CHECK 6] Workspace B parent row deleted: {'PASS' if ws_b_row_deleted else 'FAIL'}")
        print(f"[CHECK 7] User current global streak reset to 0: {'PASS' if streak_reset else 'FAIL'} (Streak: {final_streak})")

        if not (ws_b_purged and ws_b_row_deleted and streak_reset):
            all_passed = False

        # 5. Ghost-metric Check
        print("\nSTAGE 5: GHOST-METRIC CHECK (Metrics Engine & Endpoints)")
        home_metrics = compute_home_metrics(db, test_user)
        report_analytics = compute_report_analytics(db, test_user, days=30)

        hm_workspaces_zero = (home_metrics.get("total_workspaces") == 0)
        hm_streak_zero = (home_metrics.get("current_streak") == 0)
        hm_cal_empty = (len(home_metrics.get("calendar", [])) == 0)

        rep_hours_zero = (report_analytics.get("summary", {}).get("total_focus_hours", 0.0) == 0.0)
        rep_series_empty = (len(report_analytics.get("daily_series", [])) == 0)
        rep_table_empty = (len(report_analytics.get("workspaces_table", [])) == 0)
        rep_distractions_empty = (
            len(report_analytics.get("distractions_breakdown", {}).get("top_platforms", [])) == 0
            and len(report_analytics.get("distractions_breakdown", {}).get("recent_distraction_items", [])) == 0
        )

        print(f" - Home Metrics total_workspaces == 0: {'PASS' if hm_workspaces_zero else 'FAIL'}")
        print(f" - Home Metrics current_streak == 0: {'PASS' if hm_streak_zero else 'FAIL'}")
        print(f" - Home Metrics calendar entries empty: {'PASS' if hm_cal_empty else 'FAIL'}")
        print(f" - Analytics Report total_focus_hours == 0: {'PASS' if rep_hours_zero else 'FAIL'}")
        print(f" - Analytics Report daily_series empty: {'PASS' if rep_series_empty else 'FAIL'}")
        print(f" - Analytics Report workspaces_table empty: {'PASS' if rep_table_empty else 'FAIL'}")
        print(f" - Analytics Report distractions_breakdown empty: {'PASS' if rep_distractions_empty else 'FAIL'}")

        # Also test via TestClient against the HTTP endpoints
        test_client_pass = True
        try:
            from fastapi.testclient import TestClient
            from main import app
            from app.api.auth import get_current_user
            from app.models.connection import get_db

            app.dependency_overrides[get_current_user] = lambda: test_user
            app.dependency_overrides[get_db] = lambda: db
            client = TestClient(app)

            res_home = client.get("/api/metrics/home")
            res_report = client.get("/api/analytics/report?days=30")

            if res_home.status_code != 200 or res_report.status_code != 200:
                test_client_pass = False
            else:
                data_h = res_home.json()
                data_r = res_report.json()
                if data_h.get("total_workspaces") != 0 or data_r.get("summary", {}).get("total_focus_hours") != 0.0:
                    test_client_pass = False

            app.dependency_overrides.clear()
        except Exception as e:
            test_client_pass = False
            print(f"TestClient exception: {e}")

        print(f" - TestClient /api/metrics/home & /api/analytics/report HTTP 200 clean: {'PASS' if test_client_pass else 'FAIL'}")

        ghost_metrics_pass = (
            hm_workspaces_zero
            and hm_streak_zero
            and hm_cal_empty
            and rep_hours_zero
            and rep_series_empty
            and rep_table_empty
            and rep_distractions_empty
            and test_client_pass
        )
        print(f"[CHECK 8] Ghost-metric verification: {'PASS' if ghost_metrics_pass else 'FAIL'}")

        if not ghost_metrics_pass:
            all_passed = False

    except Exception as e:
        print(f"\n[ERROR] An unexpected exception occurred during verification: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
    finally:
        # 6. Cleanup: Remove the test user and all test data
        print("\n" + "=" * 70)
        print("STAGE 6: CLEANUP")
        try:
            purge_test_user(db)
            print("Test user and all associated testing artifacts purged successfully.")
        except Exception as ce:
            print(f"Warning during final cleanup: {ce}")
        finally:
            db.close()
        print("=" * 70)

    print(f"\nOVERALL: {'PASS' if all_passed else 'FAIL'}\n")
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(run_verification())

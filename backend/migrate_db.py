import logging
from app.models.connection import engine
from app.models.schemas import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prodify_migrate")

def migrate():
    logger.info("Starting database migration/initialization...")
    # This creates all tables defined in schemas.py that don't yet exist in the DB
    try:
        Base.metadata.create_all(engine)
        logger.info("Successfully created all database tables defined in schemas.py.")

        # Attempt to add new columns (will throw an error if they already exist, which is fine)
        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR"))
                conn.execute(text("ALTER TABLE users ADD COLUMN age INTEGER"))
                conn.commit()
        except Exception as e:
            logger.info("Columns full_name/age may already exist. Skipping.")

        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN category VARCHAR"))
                # default migration
                conn.execute(text("UPDATE workspaces SET category = 'sprint' WHERE deadline IS NOT NULL"))
                conn.execute(text("UPDATE workspaces SET category = 'mastery' WHERE deadline IS NULL"))
                conn.commit()
                logger.info("Successfully added and backfilled 'category' column to workspaces.")
        except Exception as e:
            logger.info(f"Column category may already exist or error: {e}. Skipping.")

        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN long_break_duration INTEGER NOT NULL DEFAULT 15"))
                conn.execute(text("ALTER TABLE workspaces ADD COLUMN long_break_interval INTEGER NOT NULL DEFAULT 4"))
                conn.commit()
                logger.info("Successfully added long_break columns to workspaces.")
        except Exception as e:
            logger.info(f"Columns long_break may already exist or error: {e}. Skipping.")

        # ML Granular Coordinates and Activity/Telemetry columns
        migrations = [
            ("activity_logs", "session_id", "INTEGER"),
            ("activity_logs", "track_day_number", "INTEGER"),
            ("activity_logs", "session_index_today", "INTEGER"),
            ("activity_logs", "minute_into_session", "FLOAT"),
            ("activity_logs", "clock_hour", "INTEGER"),
            ("activity_logs", "clean_app_name", "VARCHAR"),
            ("activity_logs", "platform_name", "VARCHAR"),
            ("activity_logs", "content_title", "VARCHAR"),
            ("activity_logs", "ai_summary", "VARCHAR"),
            ("activity_logs", "ai_reason", "VARCHAR"),
            ("sessions", "session_index_today", "INTEGER NOT NULL DEFAULT 1"),
            ("sessions", "track_day_number", "INTEGER NOT NULL DEFAULT 1"),
            ("telemetry_logs", "track_day_number", "INTEGER"),
            ("telemetry_logs", "session_index_today", "INTEGER"),
            ("telemetry_logs", "minute_into_session", "FLOAT"),
            ("telemetry_logs", "clock_hour", "INTEGER"),
            ("telemetry_logs", "trigger_app", "VARCHAR"),
        ]

        with engine.connect() as conn:
            from sqlalchemy import text
            is_postgres = engine.dialect.name == "postgresql"
            for table, col, col_type in migrations:
                try:
                    if is_postgres:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type};"))
                    else:
                        cols_info = conn.execute(text(f"PRAGMA table_info({table});")).fetchall()
                        existing_cols = [c[1] for c in cols_info]
                        if col not in existing_cols:
                            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type};"))
                    conn.commit()
                    logger.info(f"Verified/added column {col} to {table}.")
                except Exception as ex:
                    logger.debug(f"Column {col} on {table} migration note: {ex}")

    except Exception as e:
        logger.error(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate()
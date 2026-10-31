import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .schemas import Base
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("prodify_backend")

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

# PostgreSQL connection pool protection and offline SQLite fallback
if SQLALCHEMY_DATABASE_URL.startswith("postgresql"):
    engine_kwargs = {
        "pool_size": 4,
        "max_overflow": 2,
        "pool_timeout": 30,
        "pool_recycle": 300,
        "pool_pre_ping": True,
    }
    try:
        engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
        with engine.connect() as test_conn:
            test_conn.execute(text("SELECT 1"))
        logger.info("Connected to PostgreSQL database successfully.")
    except Exception as e:
        logger.warning(f"PostgreSQL connection failed ({e}). Falling back to local offline SQLite database.")
        data_dir = Path(__file__).resolve().parent.parent.parent / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        sqlite_path = (data_dir / "prodify.db").as_posix()
        engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import time

def create_db_and_tables():
    max_retries = 5
    migrations = [
        # ActivityLog columns
        ("activity_logs", "clean_app_name", "VARCHAR"),
        ("activity_logs", "platform_name", "VARCHAR"),
        ("activity_logs", "content_title", "VARCHAR"),
        ("activity_logs", "ai_summary", "VARCHAR"),
        ("activity_logs", "ai_reason", "VARCHAR"),
        ("activity_logs", "session_id", "INTEGER"),
        ("activity_logs", "track_day_number", "INTEGER"),
        ("activity_logs", "session_index_today", "INTEGER"),
        ("activity_logs", "minute_into_session", "FLOAT"),
        ("activity_logs", "clock_hour", "INTEGER"),
        # Session columns
        ("sessions", "session_index_today", "INTEGER NOT NULL DEFAULT 1"),
        ("sessions", "track_day_number", "INTEGER NOT NULL DEFAULT 1"),
        # TelemetryLog columns
        ("telemetry_logs", "track_day_number", "INTEGER"),
        ("telemetry_logs", "session_index_today", "INTEGER"),
        ("telemetry_logs", "minute_into_session", "FLOAT"),
        ("telemetry_logs", "clock_hour", "INTEGER"),
        ("telemetry_logs", "trigger_app", "VARCHAR"),
    ]

    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(engine)
            # Safe schema upgrades for new columns across tables
            with engine.connect() as conn:
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
                        logger.info(f"Verified/added column {col} to {table} table.")
                    except Exception as col_err:
                        logger.debug(f"Column {col} on {table} check note: {col_err}")
            logger.info("Database tables and new columns verified/created via metadata.")
            return
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.error("Failed to connect to the database after multiple attempts. Application will continue booting, but DB functionality may be degraded.")

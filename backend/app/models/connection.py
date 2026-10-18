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

# Supabase typically needs standard connect args, not SQLite's check_same_thread
engine = create_engine(SQLALCHEMY_DATABASE_URL)
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
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(engine)
            # Safe schema upgrades for new columns on ActivityLog
            with engine.connect() as conn:
                for col in ["clean_app_name", "platform_name", "content_title", "ai_summary", "ai_reason"]:
                    try:
                        conn.execute(text(f"ALTER TABLE activity_logs ADD COLUMN {col} VARCHAR;"))
                        conn.commit()
                        logger.info(f"Added column {col} to activity_logs table.")
                    except Exception:
                        pass  # Column already exists
            logger.info("Database tables verified/created via metadata.")
            return
        except Exception as e:
            logger.warning(f"Database connection attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                logger.error("Failed to connect to the database after multiple attempts. Application will continue booting, but DB functionality may be degraded.")

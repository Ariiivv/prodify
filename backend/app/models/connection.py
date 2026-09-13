from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from .schemas import Base
import logging

logger = logging.getLogger("prodify_backend")

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATABASE_PATH = BACKEND_DIR / "data" / "prodify.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DATABASE_PATH.as_posix()}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_db_and_tables():
    Base.metadata.create_all(engine)
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            existing_columns = {row[1] for row in result}
            if existing_columns and "auth_provider" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN auth_provider VARCHAR DEFAULT 'email' NOT NULL"))
                logger.info("Migrated users table: added auth_provider column")
            if existing_columns and "google_id" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR"))
                logger.info("Migrated users table: added google_id column")
            if existing_columns and "avatar_url" not in existing_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR"))
                logger.info("Migrated users table: added avatar_url column")
            session_columns = {row[1] for row in conn.execute(text("PRAGMA table_info(sessions)")).fetchall()}
            if session_columns and "burnout_score" not in session_columns:
                conn.execute(text("ALTER TABLE sessions ADD COLUMN burnout_score FLOAT DEFAULT 0 NOT NULL"))
                logger.info("Migrated sessions table: added burnout_score column")
            conn.commit()
    except Exception as e:
        logger.warning(f"Schema migration check note: {e}")

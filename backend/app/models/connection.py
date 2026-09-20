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

def create_db_and_tables():
    # Let SQLAlchemy's metadata handle creation
    Base.metadata.create_all(engine)
    logger.info("Database tables verified/created via metadata.")

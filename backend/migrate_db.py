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

    except Exception as e:
        logger.error(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate()
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
    except Exception as e:
        logger.error(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate()
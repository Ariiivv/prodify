from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.schemas import Base
from app.models import crud

engine = create_engine("sqlite:///./data/prodify.db")
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

dev_user = crud.get_user_by_email(db, email="dev@prodify.local")
if dev_user:
    print("Dev user username:", getattr(dev_user, 'username', None))


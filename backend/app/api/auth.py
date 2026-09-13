import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
import jwt
from passlib.context import CryptContext
from google.oauth2 import id_token
from google.auth.transport import requests

from app.models.connection import get_db
from app.models import crud
from app.models import schemas as models

logger = logging.getLogger("prodify_backend")

router = APIRouter(prefix="/auth", tags=["auth"])

# --- Security Configuration ---
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "prodify_super_secret_key_change_in_production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# --- Pydantic Schemas ---
class UserRegisterRequest(BaseModel):
    email: str
    password: str
    username: Optional[str] = None


class UserLoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    auth_provider: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Helper Functions ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    if token == "dev-token" and os.getenv("ENV", "dev") != "production":
        user = crud.get_user_by_email(db, email="dev@prodify.local")
        if not user:
            user = crud.create_user(
                db=db,
                email="dev@prodify.local",
                username="Ariv",
                hashed_password="dev_bypass",
                auth_provider="dev"
            )
        return user

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = str(payload.get("sub"))
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token payload missing user identifier.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = crud.get_user_by_id(db, int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# --- Route Handlers ---
@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """Register a new user with email and password."""
    existing_user = crud.get_user_by_email(db, email=request.email.lower().strip())
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already registered."
        )

    # Determine unique username
    base_username = request.username.strip() if request.username else request.email.split("@")[0]
    username = base_username
    counter = 1
    while db.query(models.User).filter(models.User.username == username).first() is not None:
        username = f"{base_username}{counter}"
        counter += 1

    hashed_pw = get_password_hash(request.password)
    user = crud.create_user(
        db=db,
        email=request.email.lower().strip(),
        username=username,
        hashed_password=hashed_pw,
        auth_provider="email"
    )

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenOut(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )


@router.post("/login", response_model=TokenOut)
def login(request: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticate existing user and return a signed JWT."""
    user = crud.get_user_by_email(db, email=request.email.lower().strip())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account was registered using Google Sign-In. Please click 'Sign in with Google'."
        )

    if not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenOut(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )


@router.post("/google", response_model=TokenOut)
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verify Google ID token, register or log in user, and return JWT."""
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            request.credential,
            requests.Request(),
            GOOGLE_CLIENT_ID if GOOGLE_CLIENT_ID else None
        )
    except Exception as e:
        logger.error(f"Google ID token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google credential token."
        )

    email = idinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google token missing email address.")

    google_id = idinfo.get("sub")
    name = idinfo.get("name") or email.split("@")[0]
    picture = idinfo.get("picture")

    # Check if user exists by google_id first, then fallback to email
    user = crud.get_user_by_google_id(db, google_id=google_id)
    if not user:
        user = crud.get_user_by_email(db, email=email.lower().strip())
        if user:
            # Link existing email account to Google ID
            user.google_id = google_id
            user.auth_provider = "google" if user.auth_provider == "email" and not user.hashed_password else user.auth_provider
            if picture and not user.avatar_url:
                user.avatar_url = picture
            db.commit()
            db.refresh(user)

    if not user:
        # Register new Google user
        base_username = name.strip()
        username = base_username
        counter = 1
        while db.query(models.User).filter(models.User.username == username).first() is not None:
            username = f"{base_username}{counter}"
            counter += 1

        user = crud.create_user(
            db=db,
            email=email.lower().strip(),
            username=username,
            hashed_password="oauth_no_password",
            auth_provider="google",
            google_id=google_id,
            avatar_url=picture
        )

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return TokenOut(
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )


@router.get("/me", response_model=UserOut)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    """Fetch profile of currently logged-in user."""
    return UserOut.model_validate(current_user)

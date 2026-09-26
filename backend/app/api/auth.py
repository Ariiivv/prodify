import os
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
import jwt

from app.models.connection import get_db
from app.models import crud
from app.models import schemas as models

logger = logging.getLogger("prodify_backend")

router = APIRouter(prefix="/auth", tags=["auth"])

# --- Security Configuration ---
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# --- Pydantic Schemas ---
class UserOut(BaseModel):
    id: str
    username: str
    email: str
    auth_provider: str
    avatar_url: Optional[str] = None
    full_name: Optional[str] = None
    age: Optional[int] = None

    class Config:
        from_attributes = True


# --- Helper Functions ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    if token == "dev-token" and os.getenv("ENV", "dev") != "production":
        user = crud.get_user_by_email(db, email="dev@prodify.local")
        if not user:
            user = crud.create_user(
                db=db,
                id="dev-user",
                email="dev@prodify.local",
                username="Ariv",
                hashed_password="dev_bypass",
                auth_provider="dev"
            )
        return user

    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPABASE_JWT_SECRET environment variable is missing in the backend."
        )

    try:
        # Supabase JWT secrets are base64 encoded
        decoded_secret = SUPABASE_JWT_SECRET
        if SUPABASE_JWT_SECRET and SUPABASE_JWT_SECRET.endswith("==") or len(SUPABASE_JWT_SECRET) > 40:
            import base64
            try:
                decoded_secret = base64.b64decode(SUPABASE_JWT_SECRET)
            except Exception:
                pass
        unverified_header = jwt.get_unverified_header(token)
        token_alg = unverified_header.get("alg", "HS256")
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        
        if token_alg != "HS256":
            # For ES256/RS256, fetch the public key from the issuer's JWKS
            iss = unverified_payload.get("iss")
            if not iss:
                raise ValueError("Token missing issuer for public key verification")
            from jwt import PyJWKClient
            jwks_url = f"{iss}/.well-known/jwks.json"
            jwks_client = PyJWKClient(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[token_alg],
                audience="authenticated",
                options={"verify_aud": False}
            )
        else:
            # Fallback for traditional symmetric HS256 tokens
            payload = jwt.decode(
                token, 
                decoded_secret, 
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_aud": False}
            )
        user_id: str = str(payload.get("sub"))
        email: str = payload.get("email", "")
        if not user_id:
            raise ValueError("Token missing sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        with open("jwt_debug.txt", "a") as f:
            f.write(f"Final error: {e}\n")
        
        logger.error(f"JWT Verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = crud.get_user_by_id(db, user_id)
    if user is None:
        # Auto-provision user from Supabase token
        if not email:
            email = f"{user_id}@supabase.local"
        username = payload.get("user_metadata", {}).get("username") or email.split("@")[0]
        full_name = payload.get("user_metadata", {}).get("full_name") or payload.get("name")
        avatar_url = payload.get("user_metadata", {}).get("avatar_url") or payload.get("picture")
        
        user = crud.create_user(
            db=db,
            id=user_id,
            email=email.lower().strip(),
            username=username,
            hashed_password="supabase_managed",
            auth_provider="supabase",
            full_name=full_name,
            avatar_url=avatar_url
        )
        
    return user


# --- Route Handlers ---
@router.get("/me", response_model=UserOut)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    """Fetch profile of currently logged-in user."""
    return UserOut.model_validate(current_user)

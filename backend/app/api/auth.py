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

from fastapi.responses import HTMLResponse
from fastapi import Request

@router.get("/desktop-callback")
def desktop_callback(request: Request):
    """
    Intermediate landing page for Tauri OAuth flow.
    Reads auth parameters from the URL and redirects to the deep link prodify://auth/callback
    """
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Signed in to Prodify</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #111111; color: #ffffff; text-align: center; }
            .card { background: #1a1a1a; padding: 2.5rem; border-radius: 12px; border: 1px solid #2a2a2a; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { margin-top: 0; color: #e8ff47; font-size: 1.4rem; }
            p { margin-bottom: 0.5rem; font-size: 0.95rem; }
        </style>
        <script>
            window.onload = function() {
                const hash = window.location.hash;
                const search = window.location.search;
                // Supabase can return implicit flow in hash, or PKCE in search
                const params = search || hash;
                window.location.href = "prodify://auth/callback" + params;
            }
        </script>
    </head>
    <body>
        <div class="card">
            <h1>Signed in successfully!</h1>
            <p>Redirecting you back to the Prodify app...</p>
            <p style="color: #888; font-size: 0.85em; margin-top: 1.5rem;">If the app doesn't open automatically, you can safely close this tab.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

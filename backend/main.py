import logging
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
from contextlib import asynccontextmanager
import os
from pathlib import Path

from dotenv import load_dotenv
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai_coach, auth, telemetry, workspaces, analytics, users, metrics, friends
from app.models.connection import create_db_and_tables

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prodify_backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize persistent storage and shared focus services before serving."""
    create_db_and_tables()

    logger.info("Prodify backend startup completed")
    yield
    logger.info("Prodify backend shutdown completed")


app = FastAPI(title="Prodify API (Tauri Edition)", lifespan=lifespan)

# Configure CORS for local development and production
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost"
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Prodify Backend is running smoothly."}

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(workspaces.router, prefix="/workspaces")
app.include_router(telemetry.router, prefix="/api")
app.include_router(ai_coach.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(metrics.router, prefix="/api")
app.include_router(friends.router, prefix="/api")
app.include_router(friends.router, prefix="")

@app.get("/api/leaderboard/global")
@app.get("/leaderboard/global")
def get_global_leaderboard_alias(
    limit: int = 50,
    db = Depends(friends.get_db),
    current_user = Depends(friends.get_current_user),
):
    return friends.get_global_leaderboard(limit=limit, db=db, current_user=current_user)


import logging
from contextlib import asynccontextmanager
import os
from pathlib import Path

from dotenv import load_dotenv
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai_coach, auth, telemetry, workspaces, analytics
from app.models.connection import create_db_and_tables

# Vision engine is optional — mediapipe/cv2 may not be installed on WSL/headless
try:
    from app.services.vision_engine import FocusTracker
    _VISION_AVAILABLE = True
except ImportError as e:
    _VISION_AVAILABLE = False
    FocusTracker = None  # type: ignore[assignment,misc]

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prodify_backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize persistent storage and shared focus services before serving."""
    create_db_and_tables()

    if _VISION_AVAILABLE:
        try:
            tracker = FocusTracker()
            app.state.focus_tracker = tracker
            telemetry.set_tracker(tracker)
            logger.info("Vision engine initialized successfully")
        except Exception as exc:
            logger.warning("Vision engine failed to initialize: %s — running without vision", exc)
            app.state.focus_tracker = None
    else:
        logger.warning("Vision engine unavailable (mediapipe/cv2 not installed) — running without vision")
        app.state.focus_tracker = None

    logger.info("Prodify backend startup completed")
    yield
    logger.info("Prodify backend shutdown completed")


app = FastAPI(title="Prodify API (Tauri Edition)", lifespan=lifespan)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Prodify Backend is running smoothly."}

app.include_router(auth.router, prefix="/api")
app.include_router(workspaces.router, prefix="/workspaces")
app.include_router(telemetry.router, prefix="/api")
app.include_router(ai_coach.router, prefix="/api")
app.include_router(analytics.router, prefix="/analytics")


@app.websocket("/vision")
async def vision_socket(websocket: WebSocket):
    """Receive browser camera frames and stream focus classifications back."""
    await websocket.accept()
    tracker = getattr(app.state, "focus_tracker", None)
    if tracker is None:
        await websocket.send_json({"status": "focused", "error": "Vision engine is not available on this server."})
        await websocket.close(code=1011, reason="Vision unavailable")
        return
    try:
        while True:
            payload = await websocket.receive_json()
            image = payload.get("image")
            if not isinstance(image, str) or not image:
                await websocket.send_json({"status": "focused", "error": "Frame payload is missing an image."})
                continue
            await websocket.send_json(tracker.process_frame(image))
    except WebSocketDisconnect:
        logger.info("Vision client disconnected")


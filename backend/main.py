import logging
import json
import traceback
import vision
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from dotenv import load_dotenv

# Local Imports
from database.connection import create_db_and_tables, get_db
from database import models
import crud
from routers import ai_coach, telemetry
from vision import FocusTracker

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prodify_backend")

load_dotenv()

app = FastAPI(title="Prodify API")

# --- DEBUGGER: Log Pydantic/422 Errors ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"❌ 422 Error: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    logger.info("🚀 Prodify API Started")

# --- Vision Engine WebSocket ---
tracker = FocusTracker(distraction_timeout=5.0)

@app.websocket("/vision")
async def vision_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("🔌 Vision WebSocket connection accepted")

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            try:
                result = tracker.process_frame(payload.get('image', ''))
                # Only send when status changes OR every 10th frame to reduce bandwidth
                await websocket.send_json(result)
            except Exception as e:
                logger.error("❌ Vision processing error:")
                logger.error(traceback.format_exc())
                await websocket.send_json({"status": "error", "error": "Processing failed"})
                # Don't break — keep streaming; one bad frame shouldn't kill the session

    except WebSocketDisconnect:
        logger.info("🔌 Vision stream disconnected")
    except Exception as e:
        logger.error(f"❌ WebSocket unexpected error: {e}")
    finally:
        # No cleanup needed on tracker — it's lightweight and per-connection stateless
        logger.info("🔌 Vision WebSocket closed")

# --- Schemas & Routes (Unchanged) ---
class WorkspaceCreate(BaseModel):
    user_id: Optional[int] = 1
    name: str
    mode: str
    target_hours: Optional[float] = None
    deadline: Optional[date] = None
    work_duration: Optional[int] = 45
    break_duration: Optional[int] = 5
    focus_keywords: Optional[str] = None

class WorkspaceOut(BaseModel):
    id: int
    user_id: int
    name: str
    mode: str
    target_hours: Optional[float] = None
    deadline: Optional[date] = None
    work_duration: int
    break_duration: int
    focus_keywords: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

@app.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(workspace: WorkspaceCreate, db: Session = Depends(get_db)):
    return crud.create_workspace(db=db, **workspace.dict())

@app.get("/workspaces", response_model=list[WorkspaceOut])
def read_workspaces(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_workspaces(db, skip=skip, limit=limit)

@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: int, db: Session = Depends(get_db)):
    db_workspace = crud.delete_workspace(db, workspace_id=workspace_id)
    if not db_workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"message": "Workspace deleted successfully"}

# Include Routers
app.include_router(ai_coach.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")

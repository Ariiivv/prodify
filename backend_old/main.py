from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, datetime
import json
import vision  # This assumes you are about to create/update vision.py
from database.connection import create_db_and_tables, get_db, SessionLocal
from database import models
import crud

# Import routers
from dotenv import load_dotenv
from routers import ai_coach
from routers import ml_predictions
from routers import telemetry

load_dotenv()

app = FastAPI(title="Prodify API")

# Add this block to allow React to talk to FastAPI
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
    
    # Get a database session
    db = next(get_db())
    # Check if user already exists
    if not db.query(models.User).filter(models.User.id == 1).first():
        default_user = models.User(
            id=1, 
            email="default@prodify.app", 
            username="DefaultUser",
            hashed_password="hashed_placeholder"
        )
        db.add(default_user)
        db.commit()
        print("✅ Default User seeded successfully!")
    
    print("✅ Prodify API & Database Started Successfully!")

# --- WEBSOCKET BRIDGE ---
@app.websocket("/ws/vision")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive base64 frame from React
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            # Process frame using the vision module
            # We wrap this in a try-except to prevent the socket from crashing
            try:
                result = vision.process_frame(payload.get('image', ''))
                await websocket.send_json(result)
            except Exception as e:
                await websocket.send_json({"error": str(e)})
                
    except WebSocketDisconnect:
        print("Vision stream disconnected")

# --- SCHEMAS ---
class WorkspaceCreate(BaseModel):
    user_id: Optional[int] = 1
    name: str
    mode: str
    target_hours: Optional[float] = None
    deadline: Optional[date] = None
    work_duration: Optional[int] = 45
    break_duration: Optional[int] = 5

class WorkspaceOut(BaseModel):
    id: int
    user_id: int
    name: str
    mode: str
    target_hours: Optional[float] = None
    deadline: Optional[date] = None
    work_duration: int
    break_duration: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- API ROUTES ---
@app.get("/")
async def read_root():
    return {"message": "Prodify Backend is running!"}

@app.post("/workspaces", response_model=WorkspaceOut, status_code=201)
def create_workspace(workspace: WorkspaceCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == workspace.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return crud.create_workspace(
        db=db, user_id=workspace.user_id, name=workspace.name,
        mode=workspace.mode, target_hours=workspace.target_hours, deadline=workspace.deadline,
        work_duration=workspace.work_duration, break_duration=workspace.break_duration
    )

@app.get("/workspaces", response_model=list[WorkspaceOut])
def read_workspaces(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_workspaces(db, skip=skip, limit=limit)

@app.put("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def update_workspace(workspace_id: int, workspace: WorkspaceCreate, db: Session = Depends(get_db)):
    existing_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not existing_workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return crud.update_workspace(
        db=db, workspace_id=workspace_id, user_id=workspace.user_id,
        name=workspace.name, mode=workspace.mode,
        target_hours=workspace.target_hours, deadline=workspace.deadline,
        work_duration=workspace.work_duration, break_duration=workspace.break_duration
    )

@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: int, db: Session = Depends(get_db)):
    existing_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not existing_workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    db.delete(existing_workspace)
    db.commit()
    return {"message": "Workspace deleted successfully"}

@app.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
def read_workspace(workspace_id: int, db: Session = Depends(get_db)):
    workspace = crud.get_workspace(db, workspace_id=workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace

@app.post("/workspaces/{workspace_id}/share", response_model=WorkspaceOut)
def share_workspace(workspace_id: int, user_id: int, db: Session = Depends(get_db)):
    existing_workspace = db.query(models.Workspace).filter(models.Workspace.id == workspace_id).first()
    if not existing_workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    existing_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    return crud.share_workspace(db=db, workspace_id=workspace_id, user_id=user_id)

app.include_router(ml_predictions.router, prefix="/api")
app.include_router(ai_coach.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
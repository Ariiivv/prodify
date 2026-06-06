from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Float, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspaces = relationship("Workspace", back_populates="owner")

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    mode = Column(String, nullable=False) # e.g., "Structured Goal Mode", "Flexible Tracking Mode"
    target_hours = Column(Float, nullable=True) # For Structured Goal Mode
    deadline = Column(Date, nullable=True) # For Structured Goal Mode
    work_duration = Column(Integer, nullable=False, default=45) # in minutes
    break_duration = Column(Integer, nullable=False, default=5)  # in minutes
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="workspaces")
    sessions = relationship("Session", back_populates="workspace")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True) # in seconds
    session_type = Column(String, nullable=False) # e.g., "FOCUS", "BREAK"
    status = Column(String, nullable=False) # e.g., "COMPLETED", "PAUSED", "ABORTED"
    pause_reason = Column(String, nullable=True) # For FOCUS_PAUSED

    workspace = relationship("Workspace", back_populates="sessions")
    telemetry_logs = relationship("TelemetryLog", back_populates="session")

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metric_type = Column(String, nullable=False) # e.g., "PERCLOS", "TAB_SWITCH"
    value = Column(Float, nullable=True) # e.g., PERCLOS score, duration of distraction
    distraction_type = Column(String, nullable=True) # e.g., "TAB_SWITCH", "FATIGUE_EYE_CLOSURE"
    reason = Column(String, nullable=True)          # e.g., "camera_absence", "tab_switch", "manual_override"
    metadata_json = Column(String, nullable=True)   # JSON blob for extra context (perclos_score, grace_duration, etc.)

    workspace = relationship("Workspace")
    session = relationship("Session", back_populates="telemetry_logs")

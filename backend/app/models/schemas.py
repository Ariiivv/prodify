from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    auth_provider = Column(String, default="email", nullable=False)
    google_id = Column(String, unique=True, index=True, nullable=True)
    avatar_url = Column(String, nullable=True)
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
    focus_keywords = Column(String, nullable=True) # JSON array of focus keywords for adaptive tracking
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="workspaces")
    sessions = relationship("Session", back_populates="workspace")
    chat_history = relationship("WorkspaceChatHistory", back_populates="workspace", cascade="all, delete-orphan")

class WorkspaceChatHistory(Base):
    __tablename__ = "workspace_chat_history"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False) # 'user' or 'assistant'
    content = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="chat_history")

class WorkspaceMetrics(Base):
    __tablename__ = "workspace_metrics"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False) # NOT a foreign key
    workspace_name = Column(String, nullable=False)
    workspace_intent = Column(String, nullable=True)
    session_date = Column(Date, nullable=False)
    focus_minutes = Column(Integer, nullable=False)
    distraction_count = Column(Integer, nullable=False)
    burnout_score = Column(Float, nullable=False)
    time_of_day = Column(String, nullable=False) # 'morning', 'afternoon', 'evening', 'night'
    mode = Column(String, nullable=False)
    completed = Column(Integer, nullable=False) # boolean as 1/0

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
    burnout_score = Column(Float, nullable=False, default=0.0)

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

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    app_name = Column(String, nullable=False)
    window_title = Column(String, nullable=False)
    intent = Column(String, nullable=True)
    is_focused = Column(Integer, nullable=False)  # 1 for focused, 0 for distracted
    reason = Column(String, nullable=True)

    workspace = relationship("Workspace")

class CoachingInteraction(Base):
    __tablename__ = "coaching_interactions"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, nullable=False)
    user_message = Column(String, nullable=False)
    ai_response = Column(String, nullable=False)
    burnout_score_at_time = Column(Float, nullable=False)
    focus_minutes_at_time = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

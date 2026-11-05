from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Date, Boolean, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, synonym
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    auth_provider = Column(String, default="email", nullable=False)
    google_id = Column(String, unique=True, index=True, nullable=True)
    avatar_url = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    age = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspaces = relationship("Workspace", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    mode = Column(String, nullable=False, default="pomodoro") # e.g., "Structured Goal Mode", "Flexible Tracking Mode"
    category = Column(String, nullable=False, default="mastery") # 'mastery', 'sprint', or 'quick_work'
    target_hours = Column(Float, nullable=True) # For Structured Goal Mode
    deadline = Column(Date, nullable=True) # For Structured Goal Mode
    daily_target_minutes = Column(Integer, nullable=True, default=60) # For Mastery Mode
    work_duration = Column(Integer, nullable=False, default=45) # in minutes
    break_duration = Column(Integer, nullable=False, default=5)  # in minutes
    long_break_duration = Column(Integer, nullable=False, default=15) # in minutes
    long_break_interval = Column(Integer, nullable=False, default=4) # number of sessions before long break
    focus_keywords = Column(String, nullable=True) # JSON array of focus keywords for adaptive tracking
    current_streak = Column(Integer, nullable=False, default=0)
    longest_streak = Column(Integer, nullable=False, default=0)
    current_goal = Column(String, nullable=True)
    theme_color = Column(String, nullable=True, default='#3b82f6')
    status = Column(String, nullable=False, default="active") # 'active', 'paused', 'completed'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    title = synonym("name")
    daily_target = synonym("daily_target_minutes")

    owner = relationship("User", back_populates="workspaces")
    sessions = relationship("Session", back_populates="workspace", cascade="all, delete-orphan")
    chat_history = relationship("WorkspaceChatHistory", back_populates="workspace", cascade="all, delete-orphan")

class WorkspaceChatHistory(Base):
    __tablename__ = "workspace_chat_history"

    id = Column(Integer, primary_key=True, index=True)
    # Historical metrics may outlive a deleted workspace when keep_metrics=True.
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False) # 'user' or 'assistant'
    content = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="chat_history")

class WorkspaceMetrics(Base):
    __tablename__ = "workspace_metrics"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True)
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
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration = Column(Integer, nullable=True) # in seconds
    session_type = Column(String, nullable=False) # e.g., "FOCUS", "BREAK"
    status = Column(String, nullable=False) # e.g., "COMPLETED", "PAUSED", "ABORTED"
    pause_reason = Column(String, nullable=True) # For FOCUS_PAUSED
    burnout_score = Column(Float, nullable=False, default=0.0)
    distraction_count = Column(Integer, nullable=False, default=0)
    distracted_seconds = Column(Float, nullable=False, default=0.0)
    timezone = Column(String, nullable=True)  # IANA timezone string, e.g. "America/New_York"
    session_index_today = Column(Integer, nullable=False, default=1)
    track_day_number = Column(Integer, nullable=False, default=1)

    user = relationship("User", back_populates="sessions")
    workspace = relationship("Workspace", back_populates="sessions")
    telemetry_logs = relationship("TelemetryLog", back_populates="session", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="session", cascade="all, delete-orphan")

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    metric_type = Column(String, nullable=False) # e.g., "PERCLOS", "TAB_SWITCH"
    value = Column(Float, nullable=True) # e.g., PERCLOS score, duration of distraction
    distraction_type = Column(String, nullable=True) # e.g., "TAB_SWITCH", "FATIGUE_EYE_CLOSURE"
    reason = Column(String, nullable=True)          # e.g., "input_inactivity", "tab_switch", "manual_override"
    metadata_json = Column(String, nullable=True)   # JSON blob for extra context (perclos_score, grace_duration, etc.)
    track_day_number = Column(Integer, nullable=True)
    session_index_today = Column(Integer, nullable=True)
    minute_into_session = Column(Float, nullable=True)
    clock_hour = Column(Integer, nullable=True)
    trigger_app = Column(String, nullable=True)

    workspace = relationship("Workspace")
    session = relationship("Session", back_populates="telemetry_logs")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    app_name = Column(String, nullable=False)
    window_title = Column(String, nullable=False)
    intent = Column(String, nullable=True)
    is_focused = Column(Integer, nullable=False)  # 1 for focused, 0 for distracted
    similarity_score = Column(Float, nullable=True, default=0.0)
    reason = Column(String, nullable=True)
    clean_app_name = Column(String, nullable=True)
    platform_name = Column(String, nullable=True)
    content_title = Column(String, nullable=True)
    ai_summary = Column(String, nullable=True)
    ai_reason = Column(String, nullable=True)
    track_day_number = Column(Integer, nullable=True)
    session_index_today = Column(Integer, nullable=True)
    minute_into_session = Column(Float, nullable=True)
    clock_hour = Column(Integer, nullable=True)

    workspace = relationship("Workspace")
    session = relationship("Session", back_populates="activity_logs")

class CoachingInteraction(Base):
    __tablename__ = "coaching_interactions"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_message = Column(String, nullable=False)
    ai_response = Column(String, nullable=False)
    burnout_score_at_time = Column(Float, nullable=False)
    focus_minutes_at_time = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class DailyWorkspaceLog(Base):
    __tablename__ = "daily_workspace_logs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    category = Column(String, nullable=True) # snapshot
    target_minutes_required = Column(Integer, nullable=False, default=0)
    minutes_logged = Column(Integer, nullable=False, default=0)
    intent_score = Column(Float, nullable=False, default=0.0)
    target_met = Column(Boolean, nullable=False, default=False)

    target_minutes = synonym("target_minutes_required")
    quota_met = synonym("target_met")

    __table_args__ = (UniqueConstraint('workspace_id', 'date', name='uq_workspace_date'),)
    workspace = relationship("Workspace")

class UserStats(Base):
    __tablename__ = "user_stats"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    current_global_streak = Column(Integer, nullable=False, default=0)
    longest_global_streak = Column(Integer, nullable=False, default=0)
    momentum_score = Column(Float, nullable=False, default=0.0)
    last_evaluated_date = Column(Date, nullable=True)
    last_global_perfect_date = Column(Date, nullable=True)

    best_global_streak = synonym("longest_global_streak")

class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending") # 'pending', 'accepted', 'blocked'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FriendMessage(Base):
    __tablename__ = "friend_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

DirectMessage = FriendMessage

class PrivateFocusSession(Base):
    __tablename__ = "private_focus_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    task_context = Column(String, nullable=False)  # e.g., "Coding project, IKS assignment, editing"
    total_duration_mins = Column(Integer, nullable=False, default=420)  # e.g., 420 for 7 hours
    focus_mins = Column(Integer, nullable=False, default=25)
    break_mins = Column(Integer, nullable=False, default=5)
    allowed_apps = Column(String, nullable=False)  # JSON-encoded string array: e.g. '["code", "kitty", "libreoffice", "firefox"]'
    completed_cycles = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="clarifying")  # "clarifying", "active", "paused", "completed"
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


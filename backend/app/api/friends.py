import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.connection import get_db
from app.models import schemas as models
from app.api.auth import get_current_user
from app.services.metrics_engine import compute_home_metrics

logger = logging.getLogger("prodify_friends")
router = APIRouter(prefix="/friends", tags=["friends"])


class FriendRequestPayload(BaseModel):
    target_user_id: str


class RespondFriendshipPayload(BaseModel):
    action: str  # "accept" or "decline"


class ProfileUpdatePayload(BaseModel):
    display_name: Optional[str] = None
    username: Optional[str] = None


class SendMessagePayload(BaseModel):
    content: str


def _get_display_name(user: models.User) -> str:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    if user.username and user.username.strip():
        return user.username.strip()
    if user.email and "@" in user.email:
        return user.email.split("@")[0]
    return "Prodify User"


@router.patch("/profile")
def update_user_profile(
    payload: ProfileUpdatePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Update the user's friendly display name (for AI coach) and/or unique @username handle.
    Enforces case-insensitive uniqueness on the username handle.
    """
    if payload.username is not None:
        clean_user = payload.username.strip().lstrip("@")
        if len(clean_user) < 3 or len(clean_user) > 30:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username handle must be between 3 and 30 characters.",
            )
        import re
        if not re.match(r"^[a-zA-Z0-9_.]+$", clean_user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username handle can only contain letters, numbers, underscores, and dots.",
            )
        existing = (
            db.query(models.User)
            .filter(
                models.User.id != current_user.id,
                models.User.username.ilike(clean_user),
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Username handle '@{clean_user}' is already taken. Please choose another.",
            )
        current_user.username = clean_user

    if payload.display_name is not None:
        clean_display = payload.display_name.strip()
        if len(clean_display) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Display name cannot be empty.",
            )
        current_user.full_name = clean_display

    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "message": "Profile updated successfully.",
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "full_name": current_user.full_name,
            "display_name": _get_display_name(current_user),
        },
    }


@router.get("/search")
def search_users(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Search registered users by username, full_name, or email (case-insensitive).
    Excludes the current user. Returns up to 15 matching profiles with mutual friendship status.
    """
    query_str = f"%{q.strip()}%"
    matching_users = (
        db.query(models.User)
        .filter(
            models.User.id != current_user.id,
            or_(
                models.User.username.ilike(query_str),
                models.User.full_name.ilike(query_str),
                models.User.email.ilike(query_str),
            ),
        )
        .limit(15)
        .all()
    )

    if not matching_users:
        return {"users": []}

    target_ids = [u.id for u in matching_users]
    friendships = (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(
                    models.Friendship.requester_id == current_user.id,
                    models.Friendship.addressee_id.in_(target_ids),
                ),
                and_(
                    models.Friendship.requester_id.in_(target_ids),
                    models.Friendship.addressee_id == current_user.id,
                ),
            )
        )
        .all()
    )

    # Map friendships by peer ID
    friendship_map = {}
    for f in friendships:
        peer_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
        friendship_map[peer_id] = f

    results = []
    for u in matching_users:
        f = friendship_map.get(u.id)
        if not f:
            f_status = "none"
            f_id = None
        elif f.status == "accepted":
            f_status = "accepted"
            f_id = f.id
        elif f.status == "pending":
            if f.requester_id == current_user.id:
                f_status = "pending_sent"
            else:
                f_status = "pending_received"
            f_id = f.id
        else:
            f_status = f.status
            f_id = f.id

        results.append(
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "display_name": _get_display_name(u),
                "avatar_url": u.avatar_url,
                "friendship_status": f_status,
                "friendship_id": f_id,
            }
        )

    return {"users": results}


@router.post("/request")
def send_friend_request(
    payload: FriendRequestPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Send a friend request to a target user.
    If an inverse pending request exists from the target, automatically accepts it.
    """
    target_id = payload.target_user_id.strip()
    if target_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a friend request to yourself.",
        )

    target_user = db.query(models.User).filter(models.User.id == target_id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found.",
        )

    existing = (
        db.query(models.Friendship)
        .filter(
            or_(
                and_(
                    models.Friendship.requester_id == current_user.id,
                    models.Friendship.addressee_id == target_id,
                ),
                and_(
                    models.Friendship.requester_id == target_id,
                    models.Friendship.addressee_id == current_user.id,
                ),
            )
        )
        .first()
    )

    if existing:
        if existing.status == "accepted":
            return {
                "success": True,
                "message": "You are already study partners!",
                "status": "accepted",
                "friendship_id": existing.id,
            }
        if existing.status == "pending":
            if existing.requester_id == current_user.id:
                return {
                    "success": True,
                    "message": "Friend request already sent.",
                    "status": "pending_sent",
                    "friendship_id": existing.id,
                }
            # Inverse pending: Target invited current user -> auto-accept
            existing.status = "accepted"
            existing.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            logger.info(
                f"[FRIENDS] Mutual connection auto-accepted between {current_user.id} and {target_id}"
            )
            return {
                "success": True,
                "message": f"Connected with {_get_display_name(target_user)}!",
                "status": "accepted",
                "friendship_id": existing.id,
            }

    # Create new pending request
    new_friendship = models.Friendship(
        requester_id=current_user.id,
        addressee_id=target_id,
        status="pending",
    )
    db.add(new_friendship)
    db.commit()
    db.refresh(new_friendship)
    logger.info(f"[FRIENDS] Friend request created: {current_user.id} -> {target_id}")

    return {
        "success": True,
        "message": f"Friend request sent to {_get_display_name(target_user)}.",
        "status": "pending_sent",
        "friendship_id": new_friendship.id,
    }


@router.post("/{friendship_id}/respond")
def respond_friend_request(
    friendship_id: int,
    payload: RespondFriendshipPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Accept or decline an incoming friend request. Only the addressee can respond.
    """
    friendship = db.query(models.Friendship).filter(models.Friendship.id == friendship_id).first()
    if not friendship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found.",
        )

    if friendship.addressee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the recipient can respond to this request.",
        )

    action = payload.action.lower().strip()
    if action == "accept":
        friendship.status = "accepted"
        friendship.updated_at = datetime.utcnow()
        db.commit()
        return {"success": True, "message": "Friend request accepted!"}
    elif action == "decline":
        db.delete(friendship)
        db.commit()
        return {"success": True, "message": "Friend request declined."}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Must be 'accept' or 'decline'.",
        )


@router.delete("/{friendship_id}")
def remove_friendship(
    friendship_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Remove or cancel a friendship connection. Either party can initiate this.
    """
    friendship = db.query(models.Friendship).filter(models.Friendship.id == friendship_id).first()
    if not friendship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friendship connection not found.",
        )

    if current_user.id not in (friendship.requester_id, friendship.addressee_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a participant in this friendship.",
        )

    db.delete(friendship)
    db.commit()
    return {"success": True, "message": "Connection removed."}


@router.get("/requests")
def get_friend_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get incoming and outgoing pending friend requests with user profiles.
    """
    incoming = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.addressee_id == current_user.id,
            models.Friendship.status == "pending",
        )
        .all()
    )

    outgoing = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.status == "pending",
        )
        .all()
    )

    incoming_list = []
    for f in incoming:
        u = db.query(models.User).filter(models.User.id == f.requester_id).first()
        if u:
            incoming_list.append(
                {
                    "friendship_id": f.id,
                    "user_id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "display_name": _get_display_name(u),
                    "avatar_url": u.avatar_url,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
            )

    outgoing_list = []
    for f in outgoing:
        u = db.query(models.User).filter(models.User.id == f.addressee_id).first()
        if u:
            outgoing_list.append(
                {
                    "friendship_id": f.id,
                    "user_id": u.id,
                    "username": u.username,
                    "full_name": u.full_name,
                    "display_name": _get_display_name(u),
                    "avatar_url": u.avatar_url,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
            )

    return {"incoming": incoming_list, "outgoing": outgoing_list}


@router.get("/leaderboard")
def get_friends_leaderboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Privacy-First Social Streak Leaderboard:
    Compares current_user and all accepted study partners.
    STRICT PRIVACY: NEVER reveals private workspace titles, tabs, or distraction logs.
    Only shares display name, global streak, momentum score/tier, deep work ratio,
    and anonymized track category counts (Mastery, Sprint, Quick Work).
    """
    f1 = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.requester_id == current_user.id,
            models.Friendship.status == "accepted",
        )
        .all()
    )

    f2 = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.addressee_id == current_user.id,
            models.Friendship.status == "accepted",
        )
        .all()
    )

    friend_id_to_friendship = {}
    for f in f1:
        friend_id_to_friendship[f.addressee_id] = f.id
    for f in f2:
        friend_id_to_friendship[f.requester_id] = f.id

    friend_users = []
    if friend_id_to_friendship:
        friend_users = (
            db.query(models.User)
            .filter(models.User.id.in_(list(friend_id_to_friendship.keys())))
            .all()
        )

    all_users = [current_user] + friend_users
    leaderboard_entries = []

    for u in all_users:
        is_self = u.id == current_user.id
        try:
            home_metrics = compute_home_metrics(db, u)
        except Exception as mex:
            logger.warning(f"[FRIENDS] Failed to compute metrics for user {u.id}: {mex}")
            home_metrics = {}

        # Query workspaces to count active categories (strictly anonymized)
        workspaces = (
            db.query(models.Workspace)
            .filter(models.Workspace.user_id == u.id)
            .all()
        )

        mastery_count = sum(
            1 for w in workspaces if (w.category or "").lower() == "mastery" and w.status == "active"
        )
        sprint_count = sum(
            1 for w in workspaces if (w.category or "").lower() == "sprint" and w.status == "active"
        )
        quick_work_count = sum(
            1
            for w in workspaces
            if (w.category or "").lower() in ("quick_work", "casual", "quick_flow")
            and w.status == "active"
        )

        cat_parts = []
        if mastery_count > 0:
            cat_parts.append(f"{mastery_count} Mastery")
        if sprint_count > 0:
            cat_parts.append(f"{sprint_count} Sprint")
        if quick_work_count > 0:
            cat_parts.append(f"{quick_work_count} Quick Work")
        active_tracks_summary = " · ".join(cat_parts) if cat_parts else "0 Active Tracks"

        current_streak = home_metrics.get("current_streak", 0)
        longest_streak = home_metrics.get("longest_streak", 0)
        momentum_data = home_metrics.get("momentum", {})
        momentum_score = momentum_data.get("score", 0)
        momentum_label = momentum_data.get("label", "Calibrating")
        deep_work_ratio = home_metrics.get("deep_work_ratio_aggregate")

        # Compute live_status: "focusing" (activity <= 3m), "online" (activity or active session <= 15m), else "offline"
        latest_act = (
            db.query(models.ActivityLog.timestamp)
            .join(models.Workspace, models.Workspace.id == models.ActivityLog.workspace_id)
            .filter(models.Workspace.user_id == u.id)
            .order_by(models.ActivityLog.timestamp.desc())
            .first()
        )
        
        latest_sess = (
            db.query(models.Session)
            .join(models.Workspace, models.Workspace.id == models.Session.workspace_id)
            .filter(models.Workspace.user_id == u.id)
            .order_by(models.Session.start_time.desc())
            .first()
        )

        now = datetime.utcnow()
        most_recent_activity_dt = None
        if latest_act and latest_act[0]:
            most_recent_activity_dt = latest_act[0]
        if latest_sess:
            sess_time = latest_sess.end_time or latest_sess.start_time
            if sess_time and (most_recent_activity_dt is None or sess_time > most_recent_activity_dt):
                most_recent_activity_dt = sess_time

        live_status = "offline"
        if is_self:
            if latest_sess and latest_sess.end_time is None and most_recent_activity_dt and (now - most_recent_activity_dt).total_seconds() <= 180:
                live_status = "focusing"
            else:
                live_status = "online"
        elif most_recent_activity_dt:
            diff_secs = (now - most_recent_activity_dt).total_seconds()
            if latest_sess and latest_sess.end_time is None and diff_secs <= 180:
                live_status = "focusing"
            elif diff_secs <= 180:
                live_status = "focusing"
            elif diff_secs <= 900:
                live_status = "online"
            else:
                live_status = "offline"

        leaderboard_entries.append(
            {
                "user_id": u.id,
                "display_name": _get_display_name(u),
                "username": u.username,
                "avatar_url": u.avatar_url,
                "is_self": is_self,
                "friendship_id": friend_id_to_friendship.get(u.id),
                "live_status": live_status,
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "momentum_score": momentum_score,
                "momentum_label": momentum_label,
                "deep_work_ratio": deep_work_ratio,
                "active_tracks_summary": active_tracks_summary,
                "mastery_count": mastery_count,
                "sprint_count": sprint_count,
                "quick_work_count": quick_work_count,
                "total_workspaces": len(workspaces),
            }
        )

    # Rank by current_streak DESC, then momentum_score DESC
    leaderboard_entries.sort(
        key=lambda x: (x["current_streak"], x["momentum_score"]),
        reverse=True,
    )

    for rank, entry in enumerate(leaderboard_entries, start=1):
        entry["rank"] = rank

    return {
        "total_friends": len(friend_users),
        "leaderboard": leaderboard_entries,
    }


@router.get("/leaderboard/global")
def get_global_leaderboard(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Global Worldwide Leaderboard:
    Completely independent of personal friend connections.
    Ranks top registered users across the entire platform by current_streak DESC, then momentum_score DESC.
    Includes mutual friendship status relative to current_user (none, accepted, pending_sent, pending_received, self).
    """
    users = db.query(models.User).limit(limit).all()
    if not any(u.id == current_user.id for u in users):
        users.append(current_user)

    # Fetch all friendships involving current_user for fast status lookup
    friendships = (
        db.query(models.Friendship)
        .filter(
            or_(
                models.Friendship.requester_id == current_user.id,
                models.Friendship.addressee_id == current_user.id,
            )
        )
        .all()
    )
    friendship_map = {}
    for f in friendships:
        peer_id = f.addressee_id if f.requester_id == current_user.id else f.requester_id
        friendship_map[peer_id] = f

    leaderboard_entries = []
    now = datetime.utcnow()

    for u in users:
        is_self = u.id == current_user.id
        try:
            home_metrics = compute_home_metrics(db, u)
        except Exception as mex:
            logger.warning(f"[GLOBAL_LEADERBOARD] Metrics calculation failed for {u.id}: {mex}")
            home_metrics = {}

        workspaces = (
            db.query(models.Workspace)
            .filter(models.Workspace.user_id == u.id)
            .all()
        )

        mastery_count = sum(
            1 for w in workspaces if (w.category or "").lower() == "mastery" and w.status == "active"
        )
        sprint_count = sum(
            1 for w in workspaces if (w.category or "").lower() == "sprint" and w.status == "active"
        )
        quick_work_count = sum(
            1
            for w in workspaces
            if (w.category or "").lower() in ("quick_work", "casual", "quick_flow")
            and w.status == "active"
        )

        cat_parts = []
        if mastery_count > 0:
            cat_parts.append(f"{mastery_count} Mastery")
        if sprint_count > 0:
            cat_parts.append(f"{sprint_count} Sprint")
        if quick_work_count > 0:
            cat_parts.append(f"{quick_work_count} Quick Work")
        active_tracks_summary = " · ".join(cat_parts) if cat_parts else "0 Active Tracks"

        current_streak = home_metrics.get("current_streak", 0)
        longest_streak = home_metrics.get("longest_streak", 0)
        momentum_data = home_metrics.get("momentum", {})
        momentum_score = momentum_data.get("score", 0)
        momentum_label = momentum_data.get("label", "Calibrating")
        deep_work_ratio = home_metrics.get("deep_work_ratio_aggregate")

        # Live status computation
        latest_act = (
            db.query(models.ActivityLog.timestamp)
            .join(models.Workspace, models.Workspace.id == models.ActivityLog.workspace_id)
            .filter(models.Workspace.user_id == u.id)
            .order_by(models.ActivityLog.timestamp.desc())
            .first()
        )
        latest_sess = (
            db.query(models.Session)
            .join(models.Workspace, models.Workspace.id == models.Session.workspace_id)
            .filter(models.Workspace.user_id == u.id)
            .order_by(models.Session.start_time.desc())
            .first()
        )

        most_recent_activity_dt = None
        if latest_act and latest_act[0]:
            most_recent_activity_dt = latest_act[0]
        if latest_sess:
            sess_time = latest_sess.end_time or latest_sess.start_time
            if sess_time and (most_recent_activity_dt is None or sess_time > most_recent_activity_dt):
                most_recent_activity_dt = sess_time

        live_status = "offline"
        if is_self:
            if latest_sess and latest_sess.end_time is None and most_recent_activity_dt and (now - most_recent_activity_dt).total_seconds() <= 180:
                live_status = "focusing"
            else:
                live_status = "online"
        elif most_recent_activity_dt:
            diff_secs = (now - most_recent_activity_dt).total_seconds()
            if latest_sess and latest_sess.end_time is None and diff_secs <= 180:
                live_status = "focusing"
            elif diff_secs <= 180:
                live_status = "focusing"
            elif diff_secs <= 900:
                live_status = "online"
            else:
                live_status = "offline"

        f = friendship_map.get(u.id)
        if is_self:
            friendship_status = "self"
            friendship_id = None
        elif not f:
            friendship_status = "none"
            friendship_id = None
        elif f.status == "accepted":
            friendship_status = "accepted"
            friendship_id = f.id
        elif f.status == "pending":
            friendship_status = "pending_sent" if f.requester_id == current_user.id else "pending_received"
            friendship_id = f.id
        else:
            friendship_status = f.status
            friendship_id = f.id

        leaderboard_entries.append(
            {
                "user_id": u.id,
                "display_name": _get_display_name(u),
                "username": u.username,
                "avatar_url": u.avatar_url,
                "is_self": is_self,
                "friendship_id": friendship_id,
                "friendship_status": friendship_status,
                "live_status": live_status,
                "current_streak": current_streak,
                "longest_streak": longest_streak,
                "momentum_score": momentum_score,
                "momentum_label": momentum_label,
                "deep_work_ratio": deep_work_ratio,
                "active_tracks_summary": active_tracks_summary,
                "mastery_count": mastery_count,
                "sprint_count": sprint_count,
                "quick_work_count": quick_work_count,
                "total_workspaces": len(workspaces),
            }
        )

    leaderboard_entries.sort(
        key=lambda x: (x["current_streak"], x["momentum_score"]),
        reverse=True,
    )

    for rank, entry in enumerate(leaderboard_entries, start=1):
        entry["rank"] = rank

    return {
        "total_global_users": len(leaderboard_entries),
        "leaderboard": leaderboard_entries,
    }


@router.get("/{friend_id}/messages")
def get_friend_messages(
    friend_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get the last 100 chat messages exchanged between current user and an accepted friend.
    """
    is_friend = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "accepted",
            or_(
                and_(models.Friendship.requester_id == current_user.id, models.Friendship.addressee_id == friend_id),
                and_(models.Friendship.requester_id == friend_id, models.Friendship.addressee_id == current_user.id),
            ),
        )
        .first()
    )
    if not is_friend:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view messages with accepted study partners.",
        )

    messages = (
        db.query(models.FriendMessage)
        .filter(
            or_(
                and_(models.FriendMessage.sender_id == current_user.id, models.FriendMessage.receiver_id == friend_id),
                and_(models.FriendMessage.sender_id == friend_id, models.FriendMessage.receiver_id == current_user.id),
            )
        )
        .order_by(models.FriendMessage.created_at.asc())
        .limit(100)
        .all()
    )

    friend_user = db.query(models.User).filter(models.User.id == friend_id).first()
    friend_name = _get_display_name(friend_user) if friend_user else "Friend"

    return {
        "friend_id": friend_id,
        "friend_name": friend_name,
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "receiver_id": m.receiver_id,
                "content": m.content,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "is_self": m.sender_id == current_user.id,
            }
            for m in messages
        ],
    }


@router.post("/{friend_id}/messages")
def send_friend_message(
    friend_id: str,
    payload: SendMessagePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Send a direct message to an accepted study partner.
    """
    clean_text = payload.content.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message content cannot be empty.",
        )

    if len(clean_text) > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot exceed 1000 characters.",
        )

    is_friend = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.status == "accepted",
            or_(
                and_(models.Friendship.requester_id == current_user.id, models.Friendship.addressee_id == friend_id),
                and_(models.Friendship.requester_id == friend_id, models.Friendship.addressee_id == current_user.id),
            ),
        )
        .first()
    )
    if not is_friend:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only send messages to accepted study partners.",
        )

    msg = models.FriendMessage(
        sender_id=current_user.id,
        receiver_id=friend_id,
        content=clean_text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return {
        "success": True,
        "message": {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": msg.content,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "is_self": True,
        },
    }

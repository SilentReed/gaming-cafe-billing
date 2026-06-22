from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy.orm import Session as DBSession

from app.models.session import Session


def pause_session(db: DBSession, session: Session):
    """Pause an active session."""
    if session.status != "active":
        raise ValueError("Session is not active")
    session.paused_at = now_cst()
    session.status = "paused"


def resume_session(db: DBSession, session: Session):
    """Resume a paused session."""
    if session.status != "paused":
        raise ValueError("Session is not paused")
    if session.paused_at:
        paused_seconds = (now_cst() - session.paused_at).total_seconds()
        session.total_paused += paused_seconds
    session.paused_at = None
    session.status = "active"


def end_session(db: DBSession, session: Session):
    """End a session."""
    if session.status not in ("active", "paused"):
        raise ValueError("Session is not active or paused")
    now = now_cst()
    if session.status == "paused" and session.paused_at:
        paused_seconds = (now - session.paused_at).total_seconds()
        session.total_paused += paused_seconds
    session.end_time = now
    session.status = "ended"


def get_elapsed_seconds(session: Session, now: datetime | None = None) -> float:
    """Get elapsed seconds excluding paused time."""
    now = now or now_cst()
    if session.status == "ended" and session.end_time:
        end = session.end_time
    else:
        end = now

    elapsed = (end - session.start_time).total_seconds()

    if session.paused_at and session.status == "paused":
        paused = (now - session.paused_at).total_seconds()
    else:
        paused = 0

    return elapsed - session.total_paused - paused


def get_countdown_remaining(session: Session, now: datetime | None = None) -> float:
    """Get remaining seconds for countdown mode."""
    if session.billing_mode != "countdown" or not session.duration_limit:
        return 0
    elapsed = get_elapsed_seconds(session, now)
    limit_seconds = session.duration_limit * 60
    return max(0, limit_seconds - elapsed)

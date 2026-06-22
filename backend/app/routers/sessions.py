from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import get_current_user
from app.config import settings
from app.models.console import Console
from app.models.member import Member
from app.models.session import Session
from app.models.user import User
from app.schemas.session import SessionStart, SessionOut, ActiveSessionDetail
from app.schemas.bill import SessionEndRequest
from app.services.billing import generate_bill
from app.services.timing import pause_session, resume_session, end_session, get_elapsed_seconds, get_countdown_remaining

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionOut])
def list_sessions(
    status: str | None = None,
    db: DBSession = Depends(get_db),
):
    query = db.query(Session)
    if status:
        query = query.filter(Session.status == status)
    return query.order_by(Session.id.desc()).limit(200).all()


@router.get("/active")
def active_sessions(db: DBSession = Depends(get_db)):
    sessions = (
        db.query(Session)
        .filter(Session.status.in_(["active", "paused"]))
        .order_by(Session.id.desc())
        .all()
    )
    result = []
    for s in sessions:
        console = db.query(Console).filter(Console.id == s.console_id).first()
        member = db.query(Member).filter(Member.id == s.member_id).first() if s.member_id else None
        elapsed = get_elapsed_seconds(s)
        duration_min = elapsed / 60.0
        current_cost = console.hourly_rate * (duration_min / 60.0) if console else 0
        countdown = get_countdown_remaining(s) if s.billing_mode == "countdown" else None
        result.append(ActiveSessionDetail(
            id=s.id,
            console_id=s.console_id,
            console_name=console.name if console else "Unknown",
            console_type=console.console_type if console else "Unknown",
            member_id=s.member_id,
            member_name=member.name if member else None,
            billing_mode=s.billing_mode,
            start_time=s.start_time,
            elapsed_min=round(duration_min, 1),
            current_cost=round(current_cost, 2),
            duration_limit=s.duration_limit,
            total_paused=s.total_paused,
            is_paused=s.status == "paused",
            paused_at=s.paused_at,
            countdown_expired=countdown <= 0 if countdown is not None else False,
            status=s.status,
        ))
    return result


@router.post("", response_model=SessionOut)
def start_session(body: SessionStart, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    console = db.query(Console).filter(Console.id == body.console_id).first()
    if not console:
        raise HTTPException(status_code=404, detail="Console not found")
    if console.status != "idle":
        raise HTTPException(status_code=400, detail=f"Console is not idle (current: {console.status})")

    member = None
    if body.member_id:
        member = db.query(Member).filter(Member.id == body.member_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        if member.status != "active":
            raise HTTPException(status_code=400, detail="Member account is not active")
        min_balance = settings.MIN_BALANCE_THRESHOLD
        if member.balance < min_balance:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance: {member.balance:.2f} (minimum: {min_balance})",
            )

    if body.billing_mode == "countdown":
        if not body.duration_limit or body.duration_limit <= 0:
            raise HTTPException(status_code=400, detail="Countdown mode requires duration_limit > 0")

    session = Session(
        console_id=body.console_id,
        member_id=body.member_id,
        billing_mode=body.billing_mode,
        duration_limit=body.duration_limit,
        operator_id=user.id,
    )
    db.add(session)
    console.status = "in_use"
    db.commit()
    db.refresh(session)
    return session


@router.put("/{session_id}/pause")
def pause(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pause_session(db, session)
    db.commit()
    return {"message": "Session paused"}


@router.put("/{session_id}/resume")
def resume(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    resume_session(db, session)
    db.commit()
    return {"message": "Session resumed"}


@router.put("/{session_id}/end")
def end(session_id: int, body: SessionEndRequest = SessionEndRequest(), db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "ended":
        raise HTTPException(status_code=400, detail="Session already ended")

    console = db.query(Console).filter(Console.id == session.console_id).first()
    member = db.query(Member).filter(Member.id == session.member_id).first() if session.member_id else None

    # If balance payment but no member on session, use provided member_id
    if body.payment_method == "balance" and not member and body.member_id:
        member = db.query(Member).filter(Member.id == body.member_id, Member.status == "active").first()

    end_session(db, session)
    bill = generate_bill(db, session, console, member, payment_method=body.payment_method)
    console.status = "idle"

    # Audit log
    import json
    from app.models.audit_log import AuditLog
    log = AuditLog(
        action="end_session",
        target_type="session",
        target_id=session.id,
        target_name=f"会话#{session.id} ({console.name if console else 'Unknown'})",
        before_data=json.dumps({
            "session_id": session.id, "bill_id": bill.id, "console_id": session.console_id,
            "console_name": console.name if console else "", "final_amount": bill.final_amount,
            "payment_method": body.payment_method, "member_id": session.member_id,
        }, ensure_ascii=False),
        description=f"结束会话#{session.id} {console.name if console else ''} ¥{bill.final_amount:.2f}",
    )
    db.add(log)

    db.commit()

    return {
        "message": "Session ended",
        "bill_id": bill.id,
        "final_amount": bill.final_amount,
        "bonus_amount": bill.bonus_amount,
        "duration_min": bill.duration_min,
        "payment_method": bill.payment_method,
    }


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


class SessionExtendRequest(BaseModel):
    additional_minutes: float


@router.put("/{session_id}/extend")
def extend_session(session_id: int, body: SessionExtendRequest, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in ("active", "paused"):
        raise HTTPException(status_code=400, detail="Session is not active")
    if session.billing_mode != "countdown":
        raise HTTPException(status_code=400, detail="Only countdown sessions can be extended")

    session.duration_limit = (session.duration_limit or 0) + body.additional_minutes
    db.commit()
    return {
        "message": f"Extended by {body.additional_minutes} minutes",
        "duration_limit": session.duration_limit,
    }

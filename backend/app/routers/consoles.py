from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.console import Console
from app.models.member import Member
from app.models.session import Session as SessionModel
from app.schemas.console import ConsoleCreate, ConsoleUpdate, ConsoleOut, ConsoleStatusUpdate

router = APIRouter(prefix="/consoles", tags=["consoles"])


@router.get("", response_model=list[ConsoleOut])
def list_consoles(db: Session = Depends(get_db)):
    return db.query(Console).order_by(Console.id).all()


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    consoles = db.query(Console).order_by(Console.id).all()
    today_bills = db.execute(
        __import__("sqlalchemy").text(
            "SELECT COUNT(*), COALESCE(SUM(final_amount), 0), COALESCE(SUM(bonus_amount), 0) FROM bills "
            "WHERE date(ended_at) = date('now', '+8 hours') AND status != 'refunded'"
        )
    ).fetchone()
    today_recharges = db.execute(
        __import__("sqlalchemy").text(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions "
            "WHERE type = 'recharge' AND date(created_at) = date('now', '+8 hours')"
        )
    ).fetchone()

    # Auto-end expired countdown sessions (stop billing, generate unpaid bill)
    expired_countdowns = []
    from app.services.timing import get_countdown_remaining, get_elapsed_seconds
    from app.services.timing import end_session as end_session_fn
    from app.services.billing import generate_bill

    active_countdown = (
        db.query(SessionModel)
        .filter(SessionModel.status.in_(["active", "paused"]), SessionModel.billing_mode == "countdown")
        .all()
    )
    for s in active_countdown:
        remaining = get_countdown_remaining(s)
        if remaining <= 0:
            console = db.query(Console).filter(Console.id == s.console_id).first()
            member = db.query(Member).filter(Member.id == s.member_id).first() if s.member_id else None

            end_session_fn(db, s)
            bill = generate_bill(db, s, console, member, payment_method="balance" if member else "cash")
            bill.status = "unpaid"
            if console:
                console.status = "idle"

            expired_countdowns.append({
                "session_id": s.id,
                "console_name": console.name if console else "Unknown",
                "final_amount": bill.final_amount,
            })
    db.commit()

    result = []
    for c in consoles:
        item = {
            "id": c.id,
            "name": c.name,
            "console_type": c.console_type,
            "hourly_rate": c.hourly_rate,
            "status": c.status,
            "zone": c.zone,
            "session": None,
        }
        if c.status == "in_use":
            session = (
                db.query(SessionModel)
                .filter(SessionModel.console_id == c.id, SessionModel.status.in_(["active", "paused"]))
                .first()
            )
            if session:
                elapsed = get_elapsed_seconds(session)
                duration_min = elapsed / 60.0
                current_cost = c.hourly_rate * (duration_min / 60.0)
                remaining = get_countdown_remaining(session)
                item["session"] = {
                    "id": session.id,
                    "billing_mode": session.billing_mode,
                    "elapsed_min": round(duration_min, 1),
                    "current_cost": round(current_cost, 2),
                    "started_at": session.start_time.isoformat(),
                    "duration_limit": session.duration_limit,
                    "total_paused": session.total_paused,
                    "is_paused": session.status == "paused",
                    "paused_at": session.paused_at.isoformat() if session.paused_at else None,
                    "countdown_expired": remaining <= 0 if session.billing_mode == "countdown" else False,
                }
        result.append(item)

    in_use = sum(1 for c in consoles if c.status == "in_use")
    return {
        "consoles": result,
        "summary": {
            "total": len(consoles),
            "in_use": in_use,
            "idle": sum(1 for c in consoles if c.status == "idle"),
            "maintenance": sum(1 for c in consoles if c.status == "maintenance"),
            "offline": sum(1 for c in consoles if c.status == "offline"),
            "today_revenue": today_bills[1],
            "actual_revenue": round(today_bills[1] - today_bills[2], 2),
            "today_sessions": today_bills[0],
            "today_recharges": today_recharges[0],
        },
        "auto_ended": expired_countdowns,
    }


@router.get("/{console_id}", response_model=ConsoleOut)
def get_console(console_id: int, db: Session = Depends(get_db)):
    console = db.query(Console).filter(Console.id == console_id).first()
    if not console:
        raise HTTPException(status_code=404, detail="Console not found")
    return console


@router.post("", response_model=ConsoleOut)
def create_console(body: ConsoleCreate, db: Session = Depends(get_db)):
    console = Console(**body.model_dump())
    db.add(console)
    db.commit()
    db.refresh(console)
    return console


@router.put("/{console_id}", response_model=ConsoleOut)
def update_console(console_id: int, body: ConsoleUpdate, db: Session = Depends(get_db)):
    console = db.query(Console).filter(Console.id == console_id).first()
    if not console:
        raise HTTPException(status_code=404, detail="Console not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(console, k, v)
    db.commit()
    db.refresh(console)
    return console


@router.delete("/{console_id}")
def delete_console(console_id: int, db: Session = Depends(get_db)):
    import json
    from app.models.audit_log import AuditLog

    console = db.query(Console).filter(Console.id == console_id).first()
    if not console:
        raise HTTPException(status_code=404, detail="Console not found")

    snapshot = json.dumps({
        "id": console.id, "name": console.name, "console_type": console.console_type,
        "hourly_rate": console.hourly_rate, "zone": console.zone,
    }, ensure_ascii=False)

    db.delete(console)

    log = AuditLog(
        action="delete_console",
        target_type="console",
        target_id=console.id,
        target_name=console.name,
        before_data=snapshot,
        description=f"删除主机 {console.name}",
    )
    db.add(log)
    db.commit()
    return {"message": "Console deleted"}


@router.put("/{console_id}/status")
def update_status(console_id: int, body: ConsoleStatusUpdate, db: Session = Depends(get_db)):
    import json
    from app.models.audit_log import AuditLog

    console = db.query(Console).filter(Console.id == console_id).first()
    if not console:
        raise HTTPException(status_code=404, detail="Console not found")

    old_status = console.status
    console.status = body.status

    if body.status == "offline" and old_status != "offline":
        log = AuditLog(
            action="offline_console",
            target_type="console",
            target_id=console.id,
            target_name=console.name,
            before_data=json.dumps({"status": old_status}),
            description=f"下线主机 {console.name}",
        )
        db.add(log)
    elif body.status == "idle" and old_status == "offline":
        log = AuditLog(
            action="online_console",
            target_type="console",
            target_id=console.id,
            target_name=console.name,
            before_data=json.dumps({"status": old_status}),
            description=f"上线主机 {console.name}",
        )
        db.add(log)

    db.commit()
    return {"message": f"Console status updated to {body.status}"}

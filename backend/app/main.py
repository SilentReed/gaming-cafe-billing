from pathlib import Path
import json

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import engine, Base
from app.routers import auth, consoles, members, sessions, bills, promotions, reports
from app.deps import require_admin, get_current_user
from app.database import get_db
from app.config import settings
from app.models.audit_log import AuditLog
from app.models.membership_tier import MembershipTier
from app.models.bonus_rule import BonusRule

app = FastAPI(title="Gaming Cafe Billing System", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(consoles.router, prefix="/api/v1")
app.include_router(members.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")
app.include_router(promotions.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")


class SystemConfig(BaseModel):
    recharge_bonus_rate: float


@app.get("/api/v1/system/config")
def get_config(user=Depends(require_admin)):
    return {"recharge_bonus_rate": settings.RECHARGE_BONUS_RATE}


@app.put("/api/v1/system/config")
def update_config(body: SystemConfig, user=Depends(require_admin)):
    settings.RECHARGE_BONUS_RATE = body.recharge_bonus_rate
    return {"message": "Config updated", "recharge_bonus_rate": settings.RECHARGE_BONUS_RATE}


@app.get("/api/v1/audit-logs")
def list_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(limit).all()
    undoable_actions = {"delete_member", "delete_console", "refund_bill", "recharge", "end_session"}
    return [
        {
            "id": l.id,
            "username": l.username,
            "action": l.action,
            "target_type": l.target_type,
            "target_id": l.target_id,
            "target_name": l.target_name,
            "description": l.description,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "undone": l.undone_at is not None,
            "undone_at": l.undone_at.isoformat() if l.undone_at else None,
            "can_undo": l.before_data is not None and l.action in undoable_actions and l.undone_at is None,
        }
        for l in logs
    ]


@app.post("/api/v1/audit-logs/{log_id}/undo")
def undo_audit_log(log_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from app.models.member import Member
    from app.models.console import Console
    from app.models.session import Session
    from app.models.bill import Bill
    from app.models.transaction import Transaction
    from app.services.billing import create_transaction

    log = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    if not log.before_data:
        raise HTTPException(status_code=400, detail="This action cannot be undone")
    if log.undone_at:
        raise HTTPException(status_code=400, detail="This action has already been undone")

    data = json.loads(log.before_data)

    from datetime import datetime as _dt
    log.undone_at = _dt.utcnow()

    if log.action == "delete_member":
        member = db.query(Member).filter(Member.id == log.target_id).first()
        if member:
            member.status = "active"
            db.commit()
            return {"message": f"会员 {log.target_name} 已恢复"}
        else:
            db.execute(text(
                "INSERT INTO members (id, member_code, name, phone, tier, balance, total_recharged, total_bonus, total_spent, total_hours, status) "
                "VALUES (:id, :member_code, :name, :phone, :tier, :balance, :total_recharged, :total_bonus, :total_spent, :total_hours, 'active')"
            ), data)
            db.commit()
            return {"message": f"会员 {log.target_name} 已恢复"}

    elif log.action == "delete_console":
        console = db.query(Console).filter(Console.id == log.target_id).first()
        if console:
            console.status = "idle"
            db.commit()
            return {"message": f"主机 {log.target_name} 已恢复"}
        else:
            db.execute(text(
                "INSERT INTO consoles (id, name, console_type, hourly_rate, status, zone) "
                "VALUES (:id, :name, :console_type, :hourly_rate, 'idle', :zone)"
            ), data)
            db.commit()
            return {"message": f"主机 {log.target_name} 已恢复"}

    elif log.action == "refund_bill":
        bill = db.query(Bill).filter(Bill.id == log.target_id).first()
        if not bill:
            raise HTTPException(status_code=404, detail="账单不存在（可能已被其他操作撤回）")
        if bill.status != "refunded":
            raise HTTPException(status_code=400, detail="账单非退款状态，无法撤回")

        bill.status = data.get("status", "paid")

        if bill.member_id:
            member = db.query(Member).filter(Member.id == bill.member_id).first()
            if member:
                member.balance -= bill.final_amount
                member.total_spent += (bill.final_amount - bill.bonus_amount)
                member.total_bonus += bill.bonus_amount
                create_transaction(
                    db, member.id, "deduction", -bill.final_amount,
                    reference_id=bill.id,
                    description=f"撤回退款 账单#{bill.id}",
                    balance_after=member.balance,
                )
        db.commit()
        return {"message": f"账单#{bill.id} 退款已撤回"}

    elif log.action == "recharge":
        member = db.query(Member).filter(Member.id == log.target_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="会员不存在")

        tx_id = data.get("transaction_id")
        amount = data.get("amount", 0)
        bonus = data.get("bonus", 0)
        total_credit = data.get("total_credit", 0)

        member.balance -= total_credit
        member.total_recharged -= amount
        member.total_bonus -= bonus

        create_transaction(
            db, member.id, "recharge_undo", -total_credit,
            reference_id=tx_id,
            description=f"撤回充值 ¥{amount:.0f}" + (f"+赠费¥{bonus:.0f}" if bonus > 0 else ""),
            balance_after=member.balance,
        )
        db.commit()
        return {"message": f"充值 ¥{amount:.0f} 已撤回，余额 ¥{member.balance:.2f}"}

    elif log.action == "end_session":
        session_id = data.get("session_id")
        bill_id = data.get("bill_id")
        console_id = data.get("console_id")

        session = db.query(Session).filter(Session.id == session_id).first()
        bill = db.query(Bill).filter(Bill.id == bill_id).first()
        console = db.query(Console).filter(Console.id == console_id).first()

        if not session or not bill:
            raise HTTPException(status_code=404, detail="会话或账单不存在")
        if session.status != "ended":
            raise HTTPException(status_code=400, detail="会话非结束状态，无法撤回")

        # Reverse the bill payment
        if bill.member_id:
            member = db.query(Member).filter(Member.id == bill.member_id).first()
            if member:
                if bill.payment_method == "balance":
                    member.balance += bill.final_amount
                member.total_spent -= (bill.final_amount - bill.bonus_amount)
                member.total_bonus -= bill.bonus_amount
                create_transaction(
                    db, member.id, "session_undo", bill.final_amount,
                    reference_id=bill.id,
                    description=f"撤回会话#{session_id} 结算",
                    balance_after=member.balance,
                )

        # Delete the bill
        db.delete(bill)

        # Restore session
        session.status = "active"
        session.end_time = None

        # Restore console
        if console:
            console.status = "in_use"

        db.commit()
        return {"message": f"会话#{session_id} 已恢复，费用 ¥{bill.final_amount:.2f} 已撤回"}

    raise HTTPException(status_code=400, detail="未知操作类型")


class TierUpdate(BaseModel):
    tier_name: str | None = None
    discount_rate: float | None = None
    min_recharge: float | None = None
    color: str | None = None


@app.get("/api/v1/tiers")
def list_tiers(db: Session = Depends(get_db)):
    tiers = db.query(MembershipTier).order_by(MembershipTier.min_recharge).all()
    return [
        {"id": t.id, "tier_code": t.tier_code, "tier_name": t.tier_name,
         "discount_rate": t.discount_rate, "min_recharge": t.min_recharge, "color": t.color}
        for t in tiers
    ]


@app.put("/api/v1/tiers/{tier_code}")
def update_tier(tier_code: str, body: TierUpdate, db: Session = Depends(get_db)):
    tier = db.query(MembershipTier).filter(MembershipTier.tier_code == tier_code).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tier, k, v)
    db.commit()
    db.refresh(tier)
    return {"message": "Tier updated", "tier_code": tier.tier_code, "tier_name": tier.tier_name,
            "discount_rate": tier.discount_rate, "min_recharge": tier.min_recharge}


class BonusRuleCreate(BaseModel):
    name: str
    min_amount: float = 0
    bonus_type: str = "fixed"  # fixed | percent
    bonus_value: float = 0


class BonusRuleUpdate(BaseModel):
    name: str | None = None
    min_amount: float | None = None
    bonus_type: str | None = None
    bonus_value: float | None = None
    is_active: bool | None = None


@app.get("/api/v1/bonus-rules")
def list_bonus_rules(db: Session = Depends(get_db)):
    rules = db.query(BonusRule).order_by(BonusRule.min_amount.desc()).all()
    return [
        {"id": r.id, "name": r.name, "min_amount": r.min_amount,
         "bonus_type": r.bonus_type, "bonus_value": r.bonus_value, "is_active": r.is_active}
        for r in rules
    ]


@app.post("/api/v1/bonus-rules")
def create_bonus_rule(body: BonusRuleCreate, db: Session = Depends(get_db)):
    rule = BonusRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "name": rule.name, "min_amount": rule.min_amount,
            "bonus_type": rule.bonus_type, "bonus_value": rule.bonus_value, "is_active": rule.is_active}


@app.put("/api/v1/bonus-rules/{rule_id}")
def update_bonus_rule(rule_id: int, body: BonusRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(BonusRule).filter(BonusRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "name": rule.name, "min_amount": rule.min_amount,
            "bonus_type": rule.bonus_type, "bonus_value": rule.bonus_value, "is_active": rule.is_active}


@app.delete("/api/v1/bonus-rules/{rule_id}")
def delete_bonus_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(BonusRule).filter(BonusRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted"}


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="static-js")
    app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="static-css")
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static-assets")

    @app.get("/", response_class=HTMLResponse)
    async def serve_index():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return HTMLResponse("<h1>Frontend not found</h1>")

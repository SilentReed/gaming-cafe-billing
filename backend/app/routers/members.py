import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.deps import get_current_user
from app.models.member import Member
from app.models.transaction import Transaction
from app.schemas.member import (
    MemberCreate,
    MemberUpdate,
    MemberTierUpdate,
    MemberRecharge,
    MemberOut,
    TransactionOut,
)
from app.services.billing import create_transaction, check_auto_tier_upgrade

router = APIRouter(prefix="/members", tags=["members"])


def _generate_member_code(db: Session) -> str:
    last = db.execute(text("SELECT member_code FROM members WHERE status != 'deleted' ORDER BY id DESC LIMIT 1")).fetchone()
    if last:
        try:
            num = int(last[0][1:]) + 1
        except (ValueError, IndexError):
            num = db.query(Member).count() + 1
    else:
        num = 1
    return f"M{num:05d}"


@router.get("", response_model=list[MemberOut])
def list_members(
    q: str | None = Query(None, description="Search by name, phone, or code"),
    db: Session = Depends(get_db),
):
    query = db.query(Member).filter(Member.status != "deleted")
    if q:
        query = query.filter(
            (Member.name.contains(q))
            | (Member.phone.contains(q))
            | (Member.member_code.contains(q))
        )
    return query.order_by(Member.id.desc()).all()


@router.post("", response_model=MemberOut)
def create_member(body: MemberCreate, db: Session = Depends(get_db)):
    if body.phone:
        existing = db.query(Member).filter(Member.phone == body.phone).first()
        if existing:
            raise HTTPException(status_code=400, detail="Phone already registered")

    member = Member(
        member_code=_generate_member_code(db),
        name=body.name,
        phone=body.phone,
        tier=body.tier,
    )
    db.add(member)
    db.flush()

    if body.initial_recharge > 0:
        member.balance = body.initial_recharge
        member.total_recharged = body.initial_recharge
        create_transaction(
            db, member.id, "recharge", body.initial_recharge,
            description="Initial recharge",
        )
        check_auto_tier_upgrade(db, member)

    db.commit()
    db.refresh(member)
    return member


@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


@router.delete("/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db), user=None):
    from app.deps import get_current_user as _get_current_user
    from fastapi import Request
    from app.models.audit_log import AuditLog
    import json

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    snapshot = json.dumps({
        "id": member.id, "member_code": member.member_code, "name": member.name,
        "phone": member.phone, "tier": member.tier, "balance": member.balance,
        "total_recharged": member.total_recharged, "total_bonus": member.total_bonus,
        "total_spent": member.total_spent, "total_hours": member.total_hours,
    }, ensure_ascii=False)

    member.status = "deleted"

    log = AuditLog(
        action="delete_member",
        target_type="member",
        target_id=member.id,
        target_name=member.name,
        before_data=snapshot,
        description=f"删除会员 {member.name} ({member.member_code})",
    )
    db.add(log)
    db.commit()
    return {"message": "Member deleted"}


@router.put("/{member_id}", response_model=MemberOut)
def update_member(member_id: int, body: MemberUpdate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(member, k, v)
    db.commit()
    db.refresh(member)
    return member


@router.put("/{member_id}/tier", response_model=MemberOut)
def update_tier(member_id: int, body: MemberTierUpdate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.tier = body.tier
    db.commit()
    db.refresh(member)
    return member


@router.post("/{member_id}/recharge", response_model=TransactionOut)
def recharge(member_id: int, body: MemberRecharge, db: Session = Depends(get_db)):
    from app.config import settings
    from app.models.bonus_rule import BonusRule
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.status != "active":
        raise HTTPException(status_code=400, detail="Member account is not active")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Calculate bonus: custom rate > matching rule > global setting
    bonus = 0
    bonus_desc = ""
    if body.bonus_rate is not None and body.bonus_rate >= 0:
        bonus = round(body.amount * body.bonus_rate, 2)
        bonus_desc = f"自定义{body.bonus_rate*100:.0f}%"
    else:
        rules = db.query(BonusRule).filter(BonusRule.is_active == True).order_by(BonusRule.min_amount.desc()).all()
        for rule in rules:
            if body.amount >= rule.min_amount:
                if rule.bonus_type == "fixed":
                    bonus = rule.bonus_value
                    bonus_desc = rule.name
                elif rule.bonus_type == "percent":
                    bonus = round(body.amount * rule.bonus_value, 2)
                    bonus_desc = rule.name
                break
        if bonus == 0 and settings.RECHARGE_BONUS_RATE > 0:
            bonus = round(body.amount * settings.RECHARGE_BONUS_RATE, 2)
            bonus_desc = f"系统默认{settings.RECHARGE_BONUS_RATE*100:.0f}%"

    total_credit = body.amount + bonus

    member.balance += total_credit
    member.total_recharged += body.amount
    member.total_bonus += bonus
    tx = create_transaction(
        db, member.id, "recharge", total_credit,
        description=f"充值¥{body.amount:.0f}" + (f" +赠费¥{bonus:.0f}({bonus_desc})" if bonus > 0 else "") + f" ({body.payment_method})",
        balance_after=member.balance,
    )
    check_auto_tier_upgrade(db, member)

    # Audit log
    from app.models.audit_log import AuditLog
    log = AuditLog(
        action="recharge",
        target_type="member",
        target_id=member.id,
        target_name=member.name,
        before_data=json.dumps({"transaction_id": tx.id, "amount": body.amount, "bonus": bonus, "total_credit": total_credit, "payment_method": body.payment_method}, ensure_ascii=False),
        description=f"充值¥{body.amount:.0f}" + (f" +赠费¥{bonus:.0f}" if bonus > 0 else ""),
    )
    db.add(log)

    db.commit()
    db.refresh(tx)
    return tx


@router.get("/{member_id}/transactions")
def member_transactions(member_id: int, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.member_id == member_id)
    total = query.count()
    offset = (page - 1) * page_size
    items = query.order_by(Transaction.id.desc()).offset(offset).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": t.id, "member_id": t.member_id, "type": t.type,
                "amount": t.amount, "balance_after": t.balance_after,
                "reference_id": t.reference_id, "description": t.description,
                "created_at": t.created_at,
            }
            for t in items
        ],
    }


@router.get("/{member_id}/sessions")
def member_sessions(member_id: int, db: Session = Depends(get_db)):
    from app.models.session import Session

    sessions = (
        db.query(Session)
        .filter(Session.member_id == member_id)
        .order_by(Session.id.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": s.id,
            "console_id": s.console_id,
            "billing_mode": s.billing_mode,
            "start_time": s.start_time.isoformat(),
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "status": s.status,
        }
        for s in sessions
    ]

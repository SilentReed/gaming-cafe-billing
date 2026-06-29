from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import text

from app.database import get_db
from app.deps import get_current_user, require_active_merchant, get_current_merchant_id
from app.models.shift import Shift
from app.models.user import User

router = APIRouter(prefix="/shifts", tags=["shifts"])


class ShiftStart(BaseModel):
    opening_cash: float = 0


class ShiftClose(BaseModel):
    actual_cash: float = 0
    notes: str = ""


@router.get("/current")
def get_current_shift(
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Get the current open shift for the logged-in user."""
    query = db.query(Shift).filter(
        Shift.user_id == user.id,
        Shift.status == "open",
    )
    if merchant_id is not None:
        query = query.filter(Shift.merchant_id == merchant_id)
    shift = query.first()
    if not shift:
        return {"shift": None}
    return {"shift": _shift_dict(shift)}


@router.post("/start")
def start_shift(
    body: ShiftStart,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Start a new shift."""
    # Check if already has open shift
    existing = db.query(Shift).filter(
        Shift.user_id == user.id,
        Shift.status == "open",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already have an open shift")

    shift = Shift(
        merchant_id=merchant_id,
        user_id=user.id,
        username=user.username,
        opening_cash=body.opening_cash,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _shift_dict(shift)


@router.post("/{shift_id}/close")
def close_shift(
    shift_id: int,
    body: ShiftClose,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Close a shift and calculate totals."""
    query = db.query(Shift).filter(Shift.id == shift_id, Shift.user_id == user.id)
    if merchant_id is not None:
        query = query.filter(Shift.merchant_id == merchant_id)
    shift = query.first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.status != "open":
        raise HTTPException(status_code=400, detail="Shift already closed")

    # Calculate totals from bills during this shift
    from app.models.bill import Bill
    from app.models.transaction import Transaction
    from app.models.session import Session as SessionModel

    bills = db.query(Bill).filter(
        Bill.created_at >= shift.started_at,
        Bill.status != "refunded",
    )
    if merchant_id is not None:
        bills = bills.filter(Bill.merchant_id == merchant_id)
    bills = bills.all()

    shift.total_sessions = len(bills)
    shift.total_revenue = sum(b.final_amount for b in bills)
    shift.cash_collected = sum(b.final_amount for b in bills if b.payment_method == "cash")
    shift.balance_collected = sum(b.final_amount for b in bills if b.payment_method == "balance")
    shift.wechat_collected = sum(b.final_amount for b in bills if b.payment_method == "wechat")
    shift.alipay_collected = sum(b.final_amount for b in bills if b.payment_method == "alipay")

    # Recharges during shift
    recharges = db.query(Transaction).filter(
        Transaction.type == "recharge",
        Transaction.created_at >= shift.started_at,
    )
    if merchant_id is not None:
        recharges = recharges.filter(Transaction.merchant_id == merchant_id)
    shift.total_recharges = sum(t.amount for t in recharges.all())

    # Refunds during shift
    refunds = db.query(Bill).filter(
        Bill.status == "refunded",
        Bill.created_at >= shift.started_at,
    )
    if merchant_id is not None:
        refunds = refunds.filter(Bill.merchant_id == merchant_id)
    shift.total_refunds = sum(b.final_amount for b in refunds.all())

    # Cash reconciliation
    shift.expected_cash = shift.opening_cash + shift.cash_collected + shift.total_recharges
    shift.actual_cash = body.actual_cash
    shift.cash_diff = body.actual_cash - shift.expected_cash
    shift.notes = body.notes
    shift.ended_at = datetime.utcnow()
    shift.status = "closed"

    db.commit()
    db.refresh(shift)
    return _shift_dict(shift)


@router.get("/history")
def shift_history(
    limit: int = 20,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Get shift history."""
    query = db.query(Shift).filter(Shift.user_id == user.id)
    if merchant_id is not None:
        query = query.filter(Shift.merchant_id == merchant_id)
    shifts = query.order_by(Shift.id.desc()).limit(limit).all()
    return [_shift_dict(s) for s in shifts]


def _shift_dict(shift: Shift) -> dict:
    return {
        "id": shift.id,
        "username": shift.username,
        "status": shift.status,
        "started_at": shift.started_at.isoformat() if shift.started_at else None,
        "ended_at": shift.ended_at.isoformat() if shift.ended_at else None,
        "opening_cash": shift.opening_cash,
        "total_sessions": shift.total_sessions,
        "total_revenue": shift.total_revenue,
        "total_recharges": shift.total_recharges,
        "total_refunds": shift.total_refunds,
        "cash_collected": shift.cash_collected,
        "balance_collected": shift.balance_collected,
        "wechat_collected": shift.wechat_collected,
        "alipay_collected": shift.alipay_collected,
        "expected_cash": shift.expected_cash,
        "actual_cash": shift.actual_cash,
        "cash_diff": shift.cash_diff,
        "notes": shift.notes,
    }

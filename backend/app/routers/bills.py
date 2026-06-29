from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.deps import get_current_user, get_current_merchant_id
from app.models.bill import Bill
from app.models.member import Member
from app.models.transaction import Transaction
from app.schemas.bill import BillOut, BillRefund
from app.services.billing import create_transaction, deduct_from_balance

router = APIRouter(prefix="/bills", tags=["bills"])

CST = timezone(timedelta(hours=8))

def utc_to_local(dt):
    if not dt:
        return None
    return dt.replace(tzinfo=timezone.utc).astimezone(CST).strftime("%Y-%m-%d %H:%M:%S")


@router.get("")
def list_bills(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    console_type: str | None = Query(None),
    member_id: int | None = Query(None),
    member_name: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Bill)
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    if start_date:
        query = query.filter(Bill.started_at >= start_date)
    if end_date:
        query = query.filter(Bill.started_at <= end_date + " 23:59:59")
    if console_type:
        query = query.filter(Bill.console_type == console_type)
    if member_id:
        query = query.filter(Bill.member_id == member_id)

    total = query.count()
    offset = (page - 1) * page_size
    bills = query.order_by(Bill.id.desc()).offset(offset).limit(page_size).all()

    # If member_name filter, do post-filter
    if member_name:
        bills = [b for b in bills if b.member_id and db.query(Member).filter(Member.id == b.member_id, Member.name.contains(member_name)).first()]

    result = []
    for b in bills:
        member = db.query(Member).filter(Member.id == b.member_id).first() if b.member_id else None
        result.append({
            "id": b.id,
            "session_id": b.session_id,
            "member_id": b.member_id,
            "member_name": member.name if member else None,
            "member_phone": member.phone if member else None,
            "member_code": member.member_code if member else None,
            "console_type": b.console_type,
            "billing_mode": b.billing_mode,
            "started_at": b.started_at.strftime("%Y-%m-%d %H:%M:%S") if b.started_at else None,
            "ended_at": b.ended_at.strftime("%Y-%m-%d %H:%M:%S") if b.ended_at else None,
            "duration_min": b.duration_min,
            "original_amount": b.original_amount,
            "discount_rate": b.discount_rate,
            "discount_amount": b.discount_amount,
            "final_amount": b.final_amount,
            "bonus_amount": b.bonus_amount,
            "payment_method": b.payment_method,
            "status": b.status,
        })
    return {"total": total, "page": page, "page_size": page_size, "items": result}


@router.get("/today")
def today_summary(db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    import sqlalchemy as sa

    where_clause = "WHERE date(ended_at) = date('now') AND status != 'refunded'"
    params = {}
    if merchant_id is not None:
        where_clause += " AND merchant_id = :merchant_id"
        params["merchant_id"] = merchant_id

    row = db.execute(
        sa.text(
            "SELECT COUNT(*), COALESCE(SUM(final_amount), 0), COALESCE(SUM(bonus_amount), 0), COALESCE(SUM(duration_min), 0) "
            f"FROM bills {where_clause}"
        ),
        params,
    ).fetchone()
    return {
        "count": row[0],
        "revenue": row[1],
        "actual_revenue": round(row[1] - row[2], 2),
        "bonus_amount": row[2],
        "total_minutes": row[3],
    }


@router.get("/unpaid")
def unpaid_bills(db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    query = db.query(Bill).filter(Bill.status == "unpaid")
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    bills = query.order_by(Bill.id.desc()).all()
    result = []
    for b in bills:
        member = db.query(Member).filter(Member.id == b.member_id).first() if b.member_id else None
        result.append({
            "id": b.id,
            "member_name": member.name if member else None,
            "member_phone": member.phone if member else None,
            "console_type": b.console_type,
            "final_amount": b.final_amount,
            "started_at": b.started_at.strftime("%Y-%m-%d %H:%M:%S") if b.started_at else None,
            "ended_at": b.ended_at.strftime("%Y-%m-%d %H:%M:%S") if b.ended_at else None,
            "payment_method": b.payment_method,
        })
    return result


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(bill_id: int, db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    query = db.query(Bill).filter(Bill.id == bill_id)
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    bill = query.first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill


class BillSettle(BaseModel):
    payment_method: str = "cash"


@router.put("/{bill_id}/settle")
def settle_bill(bill_id: int, body: BillSettle, db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    query = db.query(Bill).filter(Bill.id == bill_id)
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    bill = query.first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status != "unpaid":
        raise HTTPException(status_code=400, detail="Bill is not unpaid")

    bill.status = "paid"
    bill.payment_method = body.payment_method

    if bill.member_id and body.payment_method == "balance":
        member = db.query(Member).filter(Member.id == bill.member_id).first()
        if member:
            actual, unpaid = deduct_from_balance(db, member.id, bill.final_amount, bill.id, bill.merchant_id)
            create_transaction(db, member.id, "deduction", -actual, reference_id=bill.id, description=f"Settle bill #{bill.id}", balance_after=member.balance, merchant_id=bill.merchant_id)
            bill.status = "paid" if unpaid == 0 else "unpaid"

    db.commit()
    return {"message": "Bill settled", "bill_id": bill.id, "status": bill.status}


@router.post("/{bill_id}/refund")
def refund_bill(bill_id: int, body: BillRefund, db: DBSession = Depends(get_db), user=Depends(get_current_user), merchant_id: int | None = Depends(get_current_merchant_id)):
    import json
    from app.models.audit_log import AuditLog

    query = db.query(Bill).filter(Bill.id == bill_id)
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    bill = query.first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == "refunded":
        raise HTTPException(status_code=400, detail="Bill already refunded")

    old_status = bill.status
    bill.status = "refunded"

    if bill.member_id:
        member = db.query(Member).filter(Member.id == bill.member_id).first()
        if member:
            member.balance += bill.final_amount
            member.total_spent -= (bill.final_amount - bill.bonus_amount)
            member.total_bonus -= bill.bonus_amount
            create_transaction(
                db,
                member.id,
                "refund",
                bill.final_amount,
                reference_id=bill.id,
                description=f"Refund for bill #{bill.id}: {body.reason}",
                balance_after=member.balance,
                merchant_id=merchant_id,
            )

    log = AuditLog(
        action="refund_bill",
        target_type="bill",
        target_id=bill.id,
        target_name=f"账单#{bill.id}",
        before_data=json.dumps({"status": old_status, "member_id": bill.member_id, "final_amount": bill.final_amount, "bonus_amount": bill.bonus_amount}),
        description=f"退款账单#{bill.id} ¥{bill.final_amount:.2f}: {body.reason}",
        merchant_id=merchant_id,
    )
    db.add(log)
    db.commit()
    return {"message": "Bill refunded", "refund_amount": bill.final_amount}

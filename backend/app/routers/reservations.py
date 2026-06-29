from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import get_current_user, require_merchant_or_admin, get_current_merchant_id
from app.models.reservation import Reservation
from app.models.member import Member
from app.models.console import Console

router = APIRouter(prefix="/reservations", tags=["reservations"])


class ReservationCreate(BaseModel):
    member_id: int | None = None
    console_id: int | None = None
    guest_name: str | None = None
    guest_phone: str | None = None
    console_type: str | None = None
    reserved_at: datetime
    duration_hours: float = 1
    notes: str = ""


@router.get("")
def list_reservations(
    date: str | None = None,
    status: str | None = None,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Reservation)
    if merchant_id is not None:
        query = query.filter(Reservation.merchant_id == merchant_id)
    if status:
        query = query.filter(Reservation.status == status)
    if date:
        query = query.filter(Reservation.reserved_at >= date, Reservation.reserved_at < date + " 23:59:59")
    reservations = query.order_by(Reservation.reserved_at).limit(100).all()

    result = []
    for r in reservations:
        member = db.query(Member).filter(Member.id == r.member_id).first() if r.member_id else None
        console = db.query(Console).filter(Console.id == r.console_id).first() if r.console_id else None
        result.append({
            "id": r.id,
            "member_name": member.name if member else r.guest_name,
            "member_phone": member.phone if member else r.guest_phone,
            "console_name": console.name if console else None,
            "console_type": r.console_type or (console.console_type if console else None),
            "reserved_at": r.reserved_at.isoformat(),
            "duration_hours": r.duration_hours,
            "status": r.status,
            "notes": r.notes,
        })
    return result


@router.post("")
def create_reservation(
    body: ReservationCreate,
    db: DBSession = Depends(get_db),
    user=Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    # Validate member if provided
    if body.member_id:
        member = db.query(Member).filter(Member.id == body.member_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

    # Check console availability if specific console
    if body.console_id:
        console = db.query(Console).filter(Console.id == body.console_id).first()
        if not console:
            raise HTTPException(status_code=404, detail="Console not found")
        # Check for overlapping reservations
        overlap = db.query(Reservation).filter(
            Reservation.console_id == body.console_id,
            Reservation.status.in_(["pending", "confirmed"]),
            Reservation.reserved_at < body.reserved_at + timedelta(hours=body.duration_hours),
            Reservation.reserved_at + timedelta(hours=1) > body.reserved_at,
        ).first()
        if overlap:
            raise HTTPException(status_code=400, detail="Console already reserved for this time")

    reservation = Reservation(
        merchant_id=merchant_id,
        member_id=body.member_id,
        console_id=body.console_id,
        guest_name=body.guest_name,
        guest_phone=body.guest_phone,
        console_type=body.console_type,
        reserved_at=body.reserved_at,
        duration_hours=body.duration_hours,
        notes=body.notes,
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return {"id": reservation.id, "status": reservation.status}


@router.put("/{reservation_id}/status")
def update_reservation_status(
    reservation_id: int,
    body: dict,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Reservation).filter(Reservation.id == reservation_id)
    if merchant_id is not None:
        query = query.filter(Reservation.merchant_id == merchant_id)
    reservation = query.first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    new_status = body.get("status")
    if new_status not in ("confirmed", "arrived", "cancelled", "no_show"):
        raise HTTPException(status_code=400, detail="Invalid status")
    reservation.status = new_status
    db.commit()
    return {"id": reservation.id, "status": reservation.status}

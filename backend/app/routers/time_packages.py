from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import get_current_user, require_merchant_or_admin, get_current_merchant_id
from app.models.time_package import TimePackage
from app.models.member_package import MemberPackage
from app.models.member import Member
from app.schemas.time_package import (
    TimePackageCreate, TimePackageUpdate, TimePackageOut,
    PackagePurchase, MemberPackageOut,
)
from app.services.billing import create_transaction, deduct_from_balance

router = APIRouter(prefix="/time-packages", tags=["time-packages"])


@router.get("", response_model=list[TimePackageOut])
def list_packages(
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(TimePackage).filter(TimePackage.is_active == True)
    if merchant_id is not None:
        query = query.filter(TimePackage.merchant_id == merchant_id)
    return query.order_by(TimePackage.price).all()


@router.post("", response_model=TimePackageOut)
def create_package(
    body: TimePackageCreate,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    pkg = TimePackage(**body.model_dump(), merchant_id=merchant_id)
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.put("/{pkg_id}", response_model=TimePackageOut)
def update_package(
    pkg_id: int,
    body: TimePackageUpdate,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(TimePackage).filter(TimePackage.id == pkg_id)
    if merchant_id is not None:
        query = query.filter(TimePackage.merchant_id == merchant_id)
    pkg = query.first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(pkg, k, v)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.delete("/{pkg_id}")
def delete_package(
    pkg_id: int,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(TimePackage).filter(TimePackage.id == pkg_id)
    if merchant_id is not None:
        query = query.filter(TimePackage.merchant_id == merchant_id)
    pkg = query.first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    pkg.is_active = False
    db.commit()
    return {"message": "Package deactivated"}


@router.post("/purchase")
def purchase_package(
    body: PackagePurchase,
    db: DBSession = Depends(get_db),
    user=Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Purchase a time package for the current user's session."""
    # This endpoint requires a member_id in the request context
    # For now, we'll need the member_id to be passed or looked up
    raise HTTPException(status_code=501, detail="Use /members/{id}/purchase-package instead")


@router.get("/member/{member_id}", response_model=list[MemberPackageOut])
def get_member_packages(
    member_id: int,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Get all active packages for a member."""
    query = db.query(MemberPackage).filter(
        MemberPackage.member_id == member_id,
        MemberPackage.status == "active",
        MemberPackage.remaining_hours > 0,
    )
    if merchant_id is not None:
        query = query.filter(MemberPackage.merchant_id == merchant_id)
    return query.order_by(MemberPackage.expires_at).all()

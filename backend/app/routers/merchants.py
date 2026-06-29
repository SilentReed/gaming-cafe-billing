from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.deps import require_admin
from app.models.merchant import Merchant
from app.models.user import User
from app.utils.auth import hash_password

router = APIRouter(prefix="/merchants", tags=["merchants"])


class MerchantCreate(BaseModel):
    name: str
    contact: str = ""
    phone: str = ""
    address: str = ""


class MerchantUpdate(BaseModel):
    name: str | None = None
    contact: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None
    expires_at: Optional[str] = None  # ISO格式日期或null


class MerchantUserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: str = "staff"  # merchant | staff


@router.get("")
def list_merchants(db: Session = Depends(get_db), user=Depends(require_admin)):
    merchants = db.query(Merchant).order_by(Merchant.id.desc()).all()
    result = []
    for m in merchants:
        user_count = db.query(User).filter(User.merchant_id == m.id, User.is_active == True).count()
        # 检查是否过期
        is_expired = m.expires_at and m.expires_at < datetime.utcnow()
        result.append({
            "id": m.id, "name": m.name, "contact": m.contact,
            "phone": m.phone, "address": m.address,
            "is_active": m.is_active, "user_count": user_count,
            "expires_at": m.expires_at.isoformat() if m.expires_at else None,
            "is_expired": is_expired,
        })
    return result


@router.post("")
def create_merchant(body: MerchantCreate, db: Session = Depends(get_db), user=Depends(require_admin)):
    merchant = Merchant(name=body.name, contact=body.contact, phone=body.phone, address=body.address)
    db.add(merchant)
    db.commit()
    db.refresh(merchant)
    return {"id": merchant.id, "name": merchant.name, "contact": merchant.contact,
            "phone": merchant.phone, "address": merchant.address, "is_active": merchant.is_active}


@router.put("/{merchant_id}")
def update_merchant(merchant_id: int, body: MerchantUpdate, db: Session = Depends(get_db), user=Depends(require_admin)):
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    
    # 处理基本字段
    for k, v in body.model_dump(exclude_unset=True).items():
        if k == 'expires_at':
            # 处理日期字段
            if v is None:
                merchant.expires_at = None
            elif isinstance(v, str) and v:
                try:
                    merchant.expires_at = datetime.fromisoformat(v.replace('Z', '+00:00'))
                except ValueError:
                    raise HTTPException(status_code=400, detail="日期格式错误，请使用ISO格式")
            continue
        setattr(merchant, k, v)
    
    db.commit()
    db.refresh(merchant)
    return {
        "id": merchant.id, "name": merchant.name, "is_active": merchant.is_active,
        "expires_at": merchant.expires_at.isoformat() if merchant.expires_at else None
    }


@router.delete("/{merchant_id}")
def delete_merchant(merchant_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    # Safety check: active sessions and unpaid bills
    from app.models.session import Session as SessionModel
    from app.models.bill import Bill
    active = db.query(SessionModel).filter(
        SessionModel.merchant_id == merchant_id,
        SessionModel.status.in_(["active", "paused"])
    ).count()
    if active > 0:
        raise HTTPException(status_code=400, detail=f"该商户有 {active} 个活跃会话，请先结束所有会话")
    unpaid = db.query(Bill).filter(
        Bill.merchant_id == merchant_id,
        Bill.status == "unpaid"
    ).count()
    if unpaid > 0:
        raise HTTPException(status_code=400, detail=f"该商户有 {unpaid} 个未结账单，请先结清")
    # Disable merchant and its users
    merchant.is_active = False
    db.query(User).filter(User.merchant_id == merchant_id).update({"is_active": False})
    db.commit()
    return {"message": f"商户 {merchant.name} 已禁用"}


@router.get("/{merchant_id}/users")
def list_merchant_users(merchant_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    users = db.query(User).filter(User.merchant_id == merchant_id, User.is_active == True).all()
    return [
        {"id": u.id, "username": u.username, "name": u.name, "role": u.role}
        for u in users
    ]


@router.post("/{merchant_id}/users")
def create_merchant_user(merchant_id: int, body: MerchantUserCreate, db: Session = Depends(get_db), user=Depends(require_admin)):
    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        name=body.name,
        merchant_id=merchant_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"id": new_user.id, "username": new_user.username, "name": new_user.name, "role": new_user.role}

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.deps import get_current_user, require_admin, require_merchant_or_admin
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)
from app.models.user import User
from app.models.merchant import Merchant
from app.schemas.auth import LoginRequest, LoginResponse, UserOut, UserCreate, UserUpdate
from app.utils.auth import verify_password, create_access_token, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    
    # 检查商户是否过期
    merchant_expired = False
    if user.merchant_id and user.role != 'admin':
        merchant = db.query(Merchant).filter(Merchant.id == user.merchant_id).first()
        if merchant and merchant.expires_at and merchant.expires_at < datetime.utcnow():
            merchant_expired = True
    
    token = create_access_token(user.id)
    return LoginResponse(
        access_token=token, user_id=user.id, username=user.username,
        role=user.role, merchant_id=user.merchant_id,
        merchant_expired=merchant_expired
    )


@router.post("/logout")
def logout(user: User = Depends(get_current_user)):
    """登出当前账户"""
    from app.models.audit_log import AuditLog
    from app.database import get_db
    from sqlalchemy.orm import Session as DBSession
    # We need db for audit log, but logout is simple
    return {"message": f"用户 {user.username} 已登出"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    result = UserOut.model_validate(user)
    # 添加商户信息
    if user.merchant:
        result.merchant_name = user.merchant.name
        result.enabled_features = user.merchant.enabled_features
    return result


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), user: User = Depends(require_merchant_or_admin)):
    if user.role == "admin":
        return db.query(User).order_by(User.id).all()
    return db.query(User).filter(User.merchant_id == user.merchant_id).order_by(User.id).all()


@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db), user: User = Depends(require_merchant_or_admin)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    merchant_id = body.merchant_id
    if user.role == "merchant":
        merchant_id = user.merchant_id
    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role if user.role == "admin" else "staff",
        merchant_id=merchant_id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), user: User = Depends(require_merchant_or_admin)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "merchant" and target.merchant_id != user.merchant_id:
        raise HTTPException(status_code=403, detail="无权操作其他商户的用户")
    if body.name is not None:
        target.name = body.name
    if body.role is not None and user.role == "admin":
        target.role = body.role
    if body.merchant_id is not None and user.role == "admin":
        target.merchant_id = body.merchant_id
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password:
        target.password_hash = hash_password(body.password)
    db.commit()
    db.refresh(target)
    return target


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(require_merchant_or_admin)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    if user.role == "merchant" and target.merchant_id != user.merchant_id:
        raise HTTPException(status_code=403, detail="无权操作其他商户的用户")
    db.delete(target)
    db.commit()
    return {"message": "用户已删除"}

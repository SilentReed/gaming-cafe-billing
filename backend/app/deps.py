from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from datetime import datetime

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.merchant import Merchant

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_merchant_or_admin(user: User = Depends(get_current_user)) -> User:
    """允许超管和商户管理员访问"""
    if user.role not in ("admin", "merchant"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin or merchant access required")
    return user


def require_active_merchant(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """要求商户未过期（超管不受限）"""
    if user.role == "admin":
        return user
    
    if user.merchant_id:
        merchant = db.query(Merchant).filter(Merchant.id == user.merchant_id).first()
        if merchant and merchant.expires_at and merchant.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="商户授权已过期，请联系平台管理员续费"
            )
    return user


def get_current_merchant_id(request: Request, user: User = Depends(get_current_user)) -> int | None:
    """返回当前用户的 merchant_id，超管可通过 X-Merchant-Id header 切换"""
    if user.role == "admin":
        # Check X-Merchant-Id header from frontend switcher
        header_val = request.headers.get("x-merchant-id")
        if header_val:
            try:
                return int(header_val)
            except ValueError:
                pass
        return None  # None = see all merchants
    return user.merchant_id

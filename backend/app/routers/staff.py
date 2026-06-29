"""
员工账户管理 API
- 商户管理员：管理本商户员工
- 超管：查看所有员工
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone

from ..database import get_db
from ..models.user import User
from ..models.merchant import Merchant
from ..deps import get_current_user, require_admin, get_current_merchant_id

router = APIRouter(prefix="/staff", tags=["员工管理"])


class StaffCreate(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "staff"  # staff / merchant
    phone: Optional[str] = None


class StaffUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


def get_user_merchant_id(current_user: User) -> int:
    """获取当前用户的商户ID"""
    if not current_user.merchant_id:
        raise HTTPException(status_code=403, detail="未绑定商户")
    return current_user.merchant_id


@router.get("")
def list_staff(merchant_id: Optional[int] = None, 
               current_user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    """获取员工列表"""
    query = db.query(User)
    
    if current_user.role == "admin":
        # 超管：可查看所有或指定商户
        if merchant_id:
            query = query.filter(User.merchant_id == merchant_id)
    else:
        # 商户/员工：只能看本商户
        mid = get_user_merchant_id(current_user)
        query = query.filter(User.merchant_id == mid)
    
    users = query.order_by(User.role.desc(), User.username).all()
    
    return [{
        "id": u.id,
        "username": u.username,
        "display_name": u.name or u.username,
        "role": u.role,
        "role_name": {"admin": "超管", "merchant": "商户管理员", "staff": "员工"}.get(u.role, u.role),
        "phone": u.phone,
        "merchant_id": u.merchant_id,
        "merchant_name": u.merchant.name if u.merchant else None,
        "is_active": u.is_active if hasattr(u, 'is_active') else True,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users]


@router.post("")
def create_staff(data: StaffCreate,
                current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """创建员工账户"""
    # 权限检查
    if current_user.role == "staff":
        raise HTTPException(status_code=403, detail="员工无权创建账户")
    
    # 确定商户ID
    if current_user.role == "admin":
        # 超管创建时需要指定merchant_id（通过查询参数或从上下文获取）
        raise HTTPException(status_code=400, detail="超管请在商户管理中创建员工")
    
    merchant_id = get_user_merchant_id(current_user)
    
    # 检查用户名唯一
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 只能创建staff或merchant角色
    if data.role not in ["staff", "merchant"]:
        raise HTTPException(status_code=400, detail="只能创建员工或商户管理员账户")
    
    # 商户管理员不能创建同级账户
    if current_user.role == "merchant" and data.role == "merchant":
        raise HTTPException(status_code=403, detail="只能创建员工账户")
    
    from ..utils.auth import get_password_hash
    
    user = User(
        username=data.username,
        hashed_password=get_password_hash(data.password),
        display_name=data.display_name,
        role=data.role,
        phone=data.phone,
        merchant_id=merchant_id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return {"message": "员工创建成功", "user_id": user.id}


@router.get("/{staff_id}")
def get_staff(staff_id: int,
             current_user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    """获取员工详情"""
    user = db.query(User).filter(User.id == staff_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    # 权限检查
    if current_user.role != "admin":
        mid = get_user_merchant_id(current_user)
        if user.merchant_id != mid:
            raise HTTPException(status_code=403, detail="无权查看其他商户员工")
    
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.name or user.username,
        "role": user.role,
        "phone": user.phone,
        "merchant_id": user.merchant_id,
        "last_login": user.last_login.isoformat() if user.last_login else None
    }


@router.put("/{staff_id}")
def update_staff(staff_id: int, data: StaffUpdate,
                current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """更新员工信息"""
    user = db.query(User).filter(User.id == staff_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    # 权限检查
    if current_user.role == "staff":
        raise HTTPException(status_code=403, detail="员工无权修改账户")
    
    if current_user.role == "merchant":
        mid = get_user_merchant_id(current_user)
        if user.merchant_id != mid:
            raise HTTPException(status_code=403, detail="无权修改其他商户员工")
        # 商户不能修改角色为admin
        if data.role == "admin":
            raise HTTPException(status_code=403, detail="无权设置管理员角色")
    
    # 更新字段
    if data.display_name is not None:
        user.name = data.display_name
    if data.role is not None:
        user.role = data.role
    if data.phone is not None:
        user.phone = data.phone
    if data.password:
        from ..utils.auth import hash_password
        user.password_hash = hash_password(data.password)
    
    db.commit()
    return {"message": "员工信息已更新"}


@router.delete("/{staff_id}")
def delete_staff(staff_id: int,
                current_user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """删除/禁用员工"""
    user = db.query(User).filter(User.id == staff_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="员工不存在")
    
    # 权限检查
    if current_user.role == "staff":
        raise HTTPException(status_code=403, detail="员工无权删除账户")
    
    if current_user.role == "merchant":
        mid = get_user_merchant_id(current_user)
        if user.merchant_id != mid:
            raise HTTPException(status_code=403, detail="无权删除其他商户员工")
        if user.role != "staff":
            raise HTTPException(status_code=403, detail="只能删除员工账户")
    
    # 不能删除自己
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账户")
    
    # 软删除（标记为不活跃）或真删除
    db.delete(user)
    db.commit()
    
    return {"message": "员工已删除"}

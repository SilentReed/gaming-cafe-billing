from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, JSON
from sqlalchemy.orm import relationship
from app.database import Base


class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    contact = Column(String, default="")
    phone = Column(String, default="")
    address = Column(String, default="")
    code = Column(String(50), default="")
    contact_name = Column(String(50), default="")
    
    # 计费配置
    default_rate = Column(Float, default=10.0)
    min_charge_minutes = Column(Integer, default=30)
    rounding_minutes = Column(Integer, default=15)
    free_minutes = Column(Integer, default=0)
    
    # 功能开关（超管控制）
    enabled_features = Column(JSON, default=lambda: [
        "dashboard", "members", "bills", "packages", 
        "reports", "products", "shifts", "staff", "console-settings"
    ])
    
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime, nullable=True)  # 授权到期时间，null表示永不过期
    created_at = Column(DateTime, default=now_cst)
    
    # 关系
    staff = relationship("User", back_populates="merchant")

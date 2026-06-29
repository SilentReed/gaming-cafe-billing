from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="staff")  # admin | merchant | staff
    name = Column(String, nullable=False)
    merchant_id = Column(Integer, ForeignKey("merchants.id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    phone = Column(String, nullable=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_cst)
    
    # 关系
    merchant = relationship("Merchant", back_populates="staff", foreign_keys=[merchant_id])

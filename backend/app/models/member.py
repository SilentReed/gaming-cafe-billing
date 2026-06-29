from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime

from app.database import Base


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    member_code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=True)
    tier = Column(String, nullable=False, default="basic")  # basic | silver | gold | diamond
    balance = Column(Float, nullable=False, default=0)
    total_recharged = Column(Float, nullable=False, default=0)
    total_bonus = Column(Float, nullable=False, default=0)
    total_spent = Column(Float, nullable=False, default=0)
    total_hours = Column(Float, nullable=False, default=0)
    points = Column(Integer, nullable=False, default=0)  # loyalty points
    status = Column(String, nullable=False, default="active")  # active | frozen | deleted
    created_at = Column(DateTime, default=now_cst)
    updated_at = Column(DateTime, default=now_cst, onupdate=now_cst)

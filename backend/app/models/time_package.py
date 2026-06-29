"""Time package model for prepaid hour bundles."""
from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.database import Base


class TimePackage(Base):
    __tablename__ = "time_packages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    name = Column(String, nullable=False)           # e.g. "10小时套餐"
    hours = Column(Float, nullable=False)            # total hours in package
    price = Column(Float, nullable=False)            # package price
    bonus_hours = Column(Float, nullable=False, default=0)  # extra hours given free
    valid_days = Column(Integer, nullable=False, default=90)  # days until expiry
    console_types = Column(String, default="")       # comma-separated; empty = all
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=now_cst)

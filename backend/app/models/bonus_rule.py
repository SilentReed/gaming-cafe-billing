from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.database import Base


class BonusRule(Base):
    __tablename__ = "bonus_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    min_amount = Column(Float, nullable=False, default=0)  # minimum recharge amount to trigger
    bonus_type = Column(String, nullable=False, default="fixed")  # fixed | percent
    bonus_value = Column(Float, nullable=False, default=0)  # fixed: bonus amount; percent: bonus rate (0.1=10%)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=now_cst)

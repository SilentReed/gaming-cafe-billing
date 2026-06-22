from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime

from app.database import Base


class MembershipTier(Base):
    __tablename__ = "membership_tiers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tier_code = Column(String, unique=True, nullable=False)
    tier_name = Column(String, nullable=False)
    discount_rate = Column(Float, nullable=False, default=1.0)
    min_recharge = Column(Float, nullable=False, default=0)
    color = Column(String, default="#999999")
    created_at = Column(DateTime, default=now_cst)

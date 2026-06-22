from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey

from app.database import Base


class Bill(Base):
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    console_id = Column(Integer, ForeignKey("consoles.id"), nullable=False)
    console_type = Column(String, nullable=False)  # denormalized for reporting
    billing_mode = Column(String, nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    duration_min = Column(Float, nullable=False)
    original_amount = Column(Float, nullable=False)
    discount_rate = Column(Float, nullable=False, default=1.0)
    discount_amount = Column(Float, nullable=False, default=0)
    promotion_id = Column(Integer, ForeignKey("promotions.id"), nullable=True)
    final_amount = Column(Float, nullable=False)
    bonus_amount = Column(Float, nullable=False, default=0)
    payment_method = Column(String, nullable=False, default="balance")
    paid_at = Column(DateTime, default=now_cst)
    status = Column(String, nullable=False, default="paid")  # paid | unpaid | refunded
    created_at = Column(DateTime, default=now_cst)

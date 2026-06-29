"""Shift (交班) model for cashier handover tracking."""
from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text

from app.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    username = Column(String, nullable=False)
    started_at = Column(DateTime, default=now_cst)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="open")  # open | closed

    # Stats at shift start
    opening_cash = Column(Float, default=0)          # cash on hand at start

    # Stats accumulated during shift
    total_sessions = Column(Integer, default=0)
    total_revenue = Column(Float, default=0)
    total_recharges = Column(Float, default=0)
    total_refunds = Column(Float, default=0)
    cash_collected = Column(Float, default=0)        # cash payments
    balance_collected = Column(Float, default=0)     # balance payments
    wechat_collected = Column(Float, default=0)
    alipay_collected = Column(Float, default=0)

    # At shift close
    expected_cash = Column(Float, nullable=True)     # system expected cash
    actual_cash = Column(Float, nullable=True)       # counted cash
    cash_diff = Column(Float, nullable=True)         # actual - expected
    notes = Column(Text, default="")

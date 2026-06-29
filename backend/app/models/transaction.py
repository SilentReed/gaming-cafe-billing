from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey

from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    type = Column(String, nullable=False)  # recharge | deduction | refund | adjustment
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    reference_id = Column(Integer, nullable=True)  # bill_id for deductions
    description = Column(String, default="")
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=now_cst)

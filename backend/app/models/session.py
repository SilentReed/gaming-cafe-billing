from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey

from app.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    console_id = Column(Integer, ForeignKey("consoles.id"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    billing_mode = Column(String, nullable=False)  # count_up | countdown
    start_time = Column(DateTime, nullable=False, default=now_cst)
    end_time = Column(DateTime, nullable=True)
    paused_at = Column(DateTime, nullable=True)
    total_paused = Column(Float, nullable=False, default=0)  # accumulated paused seconds
    duration_limit = Column(Float, nullable=True)  # countdown: prepaid minutes
    status = Column(String, nullable=False, default="active")  # active | paused | ended
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(String, default="")
    created_at = Column(DateTime, default=now_cst)
    updated_at = Column(DateTime, default=now_cst, onupdate=now_cst)

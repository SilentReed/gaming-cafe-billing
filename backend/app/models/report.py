from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, Float, String, DateTime

from app.database import Base


class DailyReport(Base):
    __tablename__ = "daily_reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    report_date = Column(String, unique=True, nullable=False)  # YYYY-MM-DD
    total_sessions = Column(Integer, nullable=False, default=0)
    total_hours = Column(Float, nullable=False, default=0)
    total_revenue = Column(Float, nullable=False, default=0)
    cash_revenue = Column(Float, nullable=False, default=0)
    balance_revenue = Column(Float, nullable=False, default=0)
    recharges = Column(Float, nullable=False, default=0)
    new_members = Column(Integer, nullable=False, default=0)
    peak_hour = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_cst)

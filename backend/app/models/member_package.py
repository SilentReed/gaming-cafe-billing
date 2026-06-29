"""Member time package purchase record."""
from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey

from app.database import Base


class MemberPackage(Base):
    __tablename__ = "member_packages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("time_packages.id"), nullable=False)
    total_hours = Column(Float, nullable=False)      # total hours (including bonus)
    used_hours = Column(Float, nullable=False, default=0)
    remaining_hours = Column(Float, nullable=False)  # total_hours - used_hours
    purchased_at = Column(DateTime, default=now_cst)
    expires_at = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default="active")  # active | expired | used_up

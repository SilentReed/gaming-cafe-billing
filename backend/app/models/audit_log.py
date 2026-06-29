from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(Integer, nullable=True)
    target_name = Column(String, nullable=True)
    before_data = Column(Text, nullable=True)
    description = Column(String, default="")
    undone_at = Column(DateTime, nullable=True)
    merchant_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=now_cst)

from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, DateTime

from app.database import Base


class Console(Base):
    __tablename__ = "consoles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    name = Column(String, nullable=False)
    console_type = Column(String, nullable=False)  # PS5, Xbox, Switch, PC
    hourly_rate = Column(Float, nullable=False, default=0)
    status = Column(String, nullable=False, default="idle")  # idle | in_use | maintenance | offline
    zone = Column(String, default="")
    created_at = Column(DateTime, default=now_cst)
    updated_at = Column(DateTime, default=now_cst, onupdate=now_cst)

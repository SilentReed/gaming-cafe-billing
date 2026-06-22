from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.database import Base


class Promotion(Base):
    __tablename__ = "promotions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    type = Column(String, nullable=False)  # discount_rate | fixed_price | buy_hours
    value = Column(Float, nullable=False)
    console_types = Column(String, default="")  # comma-separated; empty = all
    min_hours = Column(Float, default=0)
    bonus_hours = Column(Float, default=0)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=now_cst)

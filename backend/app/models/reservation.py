from app.utils.time_utils import now_cst
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from app.database import Base


class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    console_id = Column(Integer, ForeignKey("consoles.id"), nullable=True)
    guest_name = Column(String, nullable=True)       # for non-members
    guest_phone = Column(String, nullable=True)
    console_type = Column(String, nullable=True)      # preferred type if no specific console
    reserved_at = Column(DateTime, nullable=False)    # start time
    duration_hours = Column(Float, nullable=False, default=1)
    status = Column(String, nullable=False, default="pending")  # pending | confirmed | arrived | cancelled | no_show
    notes = Column(String, default="")
    created_at = Column(DateTime, default=now_cst)

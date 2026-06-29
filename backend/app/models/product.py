from app.utils.time_utils import now_cst
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, default="beverage")  # beverage | snack | accessory
    price = Column(Float, nullable=False)
    cost = Column(Float, default=0)  # cost price for profit calculation
    stock = Column(Integer, default=-1)  # -1 = unlimited
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=now_cst)

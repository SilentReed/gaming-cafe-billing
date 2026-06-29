from app.utils.time_utils import now_cst
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    merchant_id = Column(Integer, nullable=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    total_amount = Column(Float, nullable=False, default=0)
    payment_method = Column(String, nullable=False, default="balance")
    status = Column(String, nullable=False, default="paid")  # paid | unpaid | cancelled
    created_at = Column(DateTime, default=now_cst)


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String, nullable=False)  # denormalized
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Float, nullable=False)
    subtotal = Column(Float, nullable=False)

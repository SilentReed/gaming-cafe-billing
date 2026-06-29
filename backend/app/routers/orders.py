from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import get_current_user, get_current_merchant_id
from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.member import Member
from app.services.billing import create_transaction

router = APIRouter(prefix="/orders", tags=["orders"])


class OrderItemInput(BaseModel):
    product_id: int
    quantity: int = 1


class OrderCreate(BaseModel):
    session_id: int | None = None
    member_id: int | None = None
    items: list[OrderItemInput]
    payment_method: str = "balance"


@router.post("")
def create_order(
    body: OrderCreate,
    db: DBSession = Depends(get_db),
    user=Depends(get_current_user),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Create a new order with items."""
    total = 0
    order_items = []

    for item in body.items:
        product = db.query(Product).filter(Product.id == item.product_id, Product.is_active == True).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        if product.stock >= 0 and product.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.name}")

        subtotal = product.price * item.quantity
        total += subtotal
        order_items.append(OrderItem(
            product_id=product.id,
            product_name=product.name,
            quantity=item.quantity,
            unit_price=product.price,
            subtotal=subtotal,
        ))

        # Deduct stock
        if product.stock >= 0:
            product.stock -= item.quantity

    order = Order(
        merchant_id=merchant_id,
        session_id=body.session_id,
        member_id=body.member_id,
        total_amount=total,
        payment_method=body.payment_method,
        status="paid",
    )
    db.add(order)
    db.flush()

    for oi in order_items:
        oi.order_id = order.id
        db.add(oi)

    # Handle payment
    if body.payment_method == "balance" and body.member_id:
        member = db.query(Member).filter(Member.id == body.member_id).first()
        if member and member.balance >= total:
            member.balance -= total
            member.total_spent += total
            create_transaction(db, member.id, "deduction", -total,
                              reference_id=order.id,
                              description=f"Order #{order.id} ({len(order_items)} items)",
                              balance_after=member.balance, merchant_id=merchant_id)

    db.commit()
    return {"order_id": order.id, "total": total, "items": len(order_items)}


@router.get("")
def list_orders(
    limit: int = 50,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Order)
    if merchant_id is not None:
        query = query.filter(Order.merchant_id == merchant_id)
    orders = query.order_by(Order.id.desc()).limit(limit).all()

    result = []
    for o in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == o.id).all()
        result.append({
            "id": o.id,
            "session_id": o.session_id,
            "member_id": o.member_id,
            "total_amount": o.total_amount,
            "payment_method": o.payment_method,
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "items": [{"name": i.product_name, "qty": i.quantity, "price": i.unit_price} for i in items],
        })
    return result

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import get_current_user, require_merchant_or_admin, get_current_merchant_id
from app.models.product import Product

router = APIRouter(prefix="/products", tags=["products"])


class ProductCreate(BaseModel):
    name: str
    category: str = "beverage"
    price: float
    cost: float = 0
    stock: int = -1


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    price: float | None = None
    cost: float | None = None
    stock: int | None = None
    is_active: bool | None = None


@router.get("")
def list_products(
    category: str | None = None,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Product).filter(Product.is_active == True)
    if merchant_id is not None:
        query = query.filter(Product.merchant_id == merchant_id)
    if category:
        query = query.filter(Product.category == category)
    return [
        {"id": p.id, "name": p.name, "category": p.category, "price": p.price, "stock": p.stock}
        for p in query.order_by(Product.category, Product.name).all()
    ]


@router.post("")
def create_product(
    body: ProductCreate,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    product = Product(**body.model_dump(), merchant_id=merchant_id)
    db.add(product)
    db.commit()
    db.refresh(product)
    return {"id": product.id, "name": product.name, "price": product.price}


@router.put("/{product_id}")
def update_product(
    product_id: int,
    body: ProductUpdate,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Product).filter(Product.id == product_id)
    if merchant_id is not None:
        query = query.filter(Product.merchant_id == merchant_id)
    product = query.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    db.commit()
    return {"id": product.id, "name": product.name, "price": product.price}


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    db: DBSession = Depends(get_db),
    user=Depends(require_merchant_or_admin),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    query = db.query(Product).filter(Product.id == product_id)
    if merchant_id is not None:
        query = query.filter(Product.merchant_id == merchant_id)
    product = query.first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    db.commit()
    return {"message": "Product deactivated"}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import require_admin
from app.models.promotion import Promotion
from app.schemas.promotion import PromotionCreate, PromotionUpdate, PromotionOut

router = APIRouter(prefix="/promotions", tags=["promotions"])


@router.get("", response_model=list[PromotionOut])
def list_promotions(db: DBSession = Depends(get_db)):
    return db.query(Promotion).order_by(Promotion.id.desc()).all()


@router.post("", response_model=PromotionOut)
def create_promotion(body: PromotionCreate, db: DBSession = Depends(get_db), user=Depends(require_admin)):
    promo = Promotion(**body.model_dump())
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.put("/{promo_id}", response_model=PromotionOut)
def update_promotion(promo_id: int, body: PromotionUpdate, db: DBSession = Depends(get_db), user=Depends(require_admin)):
    promo = db.query(Promotion).filter(Promotion.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(promo, k, v)
    db.commit()
    db.refresh(promo)
    return promo


@router.delete("/{promo_id}")
def delete_promotion(promo_id: int, db: DBSession = Depends(get_db), user=Depends(require_admin)):
    promo = db.query(Promotion).filter(Promotion.id == promo_id).first()
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found")
    promo.is_active = False
    db.commit()
    return {"message": "Promotion deactivated"}

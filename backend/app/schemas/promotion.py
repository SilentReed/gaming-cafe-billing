from datetime import datetime
from pydantic import BaseModel


class PromotionCreate(BaseModel):
    name: str
    description: str = ""
    type: str  # discount_rate | fixed_price | buy_hours
    value: float
    console_types: str = ""
    min_hours: float = 0
    bonus_hours: float = 0
    start_time: datetime
    end_time: datetime


class PromotionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    value: float | None = None
    console_types: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_active: bool | None = None


class PromotionOut(BaseModel):
    id: int
    name: str
    description: str
    type: str
    value: float
    console_types: str
    min_hours: float
    bonus_hours: float
    start_time: datetime
    end_time: datetime
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

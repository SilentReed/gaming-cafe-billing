from datetime import datetime
from pydantic import BaseModel


class BillOut(BaseModel):
    id: int
    session_id: int
    member_id: int | None
    console_id: int
    console_type: str
    billing_mode: str
    started_at: datetime
    ended_at: datetime
    duration_min: float
    original_amount: float
    discount_rate: float
    discount_amount: float

    final_amount: float
    bonus_amount: float
    payment_method: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BillRefund(BaseModel):
    reason: str = ""


class SessionEndRequest(BaseModel):
    payment_method: str = "balance"  # balance | cash | wechat | alipay
    member_id: int | None = None  # for walk-in balance payment

from datetime import datetime
from pydantic import BaseModel


class MemberCreate(BaseModel):
    name: str
    phone: str
    tier: str = "basic"
    initial_recharge: float = 0


class MemberUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    status: str | None = None


class MemberTierUpdate(BaseModel):
    tier: str


class MemberRecharge(BaseModel):
    amount: float
    payment_method: str = "cash"
    bonus_rate: float | None = None  # override global setting per recharge


class MemberOut(BaseModel):
    id: int
    member_code: str
    name: str
    phone: str | None
    tier: str
    balance: float
    total_recharged: float
    total_bonus: float
    total_spent: float
    total_hours: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionOut(BaseModel):
    id: int
    member_id: int
    type: str
    amount: float
    balance_after: float
    reference_id: int | None
    description: str
    created_at: datetime

    model_config = {"from_attributes": True}

from datetime import datetime
from pydantic import BaseModel


class TimePackageCreate(BaseModel):
    name: str
    hours: float
    price: float
    bonus_hours: float = 0
    valid_days: int = 90
    console_types: str = ""


class TimePackageUpdate(BaseModel):
    name: str | None = None
    hours: float | None = None
    price: float | None = None
    bonus_hours: float | None = None
    valid_days: int | None = None
    console_types: str | None = None
    is_active: bool | None = None


class TimePackageOut(BaseModel):
    id: int
    name: str
    hours: float
    price: float
    bonus_hours: float
    valid_days: int
    console_types: str
    is_active: bool
    merchant_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PackagePurchase(BaseModel):
    package_id: int
    payment_method: str = "balance"  # balance | cash | wechat | alipay


class MemberPackageOut(BaseModel):
    id: int
    member_id: int
    package_id: int
    total_hours: float
    used_hours: float
    remaining_hours: float
    purchased_at: datetime
    expires_at: datetime
    status: str

    model_config = {"from_attributes": True}

from datetime import datetime
from pydantic import BaseModel


class SessionStart(BaseModel):
    console_id: int
    member_id: int | None = None
    billing_mode: str  # count_up | countdown
    duration_limit: float | None = None  # minutes, for countdown mode


class SessionOut(BaseModel):
    id: int
    console_id: int
    member_id: int | None
    billing_mode: str
    start_time: datetime
    end_time: datetime | None
    paused_at: datetime | None
    total_paused: float
    duration_limit: float | None
    status: str
    operator_id: int | None

    model_config = {"from_attributes": True}


class ActiveSessionDetail(BaseModel):
    id: int
    console_id: int
    console_name: str
    console_type: str
    member_id: int | None
    member_name: str | None
    billing_mode: str
    start_time: datetime
    elapsed_min: float
    current_cost: float
    duration_limit: float | None
    total_paused: float
    is_paused: bool
    paused_at: datetime | None
    countdown_expired: bool
    status: str

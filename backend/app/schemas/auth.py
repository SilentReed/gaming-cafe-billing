from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    role: str
    merchant_id: int | None = None
    merchant_expired: bool = False  # 商户是否已过期


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    name: str
    merchant_id: int | None = None
    is_active: bool = True
    merchant_name: str | None = None
    enabled_features: list[str] | None = None
    
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: str = "staff"
    merchant_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    merchant_id: int | None = None
    is_active: bool | None = None
    password: str | None = None

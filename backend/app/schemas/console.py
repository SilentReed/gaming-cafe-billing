from pydantic import BaseModel


class ConsoleCreate(BaseModel):
    name: str
    console_type: str
    hourly_rate: float
    zone: str = ""


class ConsoleUpdate(BaseModel):
    name: str | None = None
    console_type: str | None = None
    hourly_rate: float | None = None
    zone: str | None = None


class ConsoleStatusUpdate(BaseModel):
    status: str


class ConsoleOut(BaseModel):
    id: int
    name: str
    console_type: str
    hourly_rate: float
    status: str
    zone: str

    model_config = {"from_attributes": True}

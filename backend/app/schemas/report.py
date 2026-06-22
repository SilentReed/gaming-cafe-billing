from pydantic import BaseModel


class DailyReportOut(BaseModel):
    report_date: str
    total_sessions: int
    total_hours: float
    total_revenue: float
    cash_revenue: float
    balance_revenue: float
    recharges: float
    new_members: int
    peak_hour: int | None


class DashboardSummary(BaseModel):
    total_consoles: int
    in_use: int
    idle: int
    maintenance: int
    offline: int
    today_revenue: float
    today_sessions: int
    today_recharges: float


class ConsoleDashboardItem(BaseModel):
    id: int
    name: str
    console_type: str
    hourly_rate: float
    status: str
    zone: str
    session: dict | None = None

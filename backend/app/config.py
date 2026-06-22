from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Gaming Cafe Billing System"
    DATABASE_URL: str = "sqlite:///./gaming_cafe.db"
    SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours
    ALGORITHM: str = "HS256"
    MIN_BALANCE_THRESHOLD: float = 5.0  # minimum balance to start a session (元)
    MIN_CHARGE_MINUTES: int = 1  # minimum billing unit in minutes
    AUTO_END_CHECK_INTERVAL: int = 30  # seconds between countdown auto-end checks
    BUSINESS_HOURS_START: int = 9  # 24h format
    BUSINESS_HOURS_END: int = 2  # 24h format, next day (2 = 2:00 AM)
    RECHARGE_BONUS_RATE: float = 0.0  # bonus rate: 0.1 = 10% extra on recharge

    class Config:
        env_file = ".env"


settings = Settings()

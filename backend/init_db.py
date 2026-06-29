"""Initialize database with schema and seed data."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine, Base, SessionLocal
from app.models import *
from app.utils.auth import hash_password


def init():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Seed default merchant
    existing_merchant = db.query(Merchant).first()
    if not existing_merchant:
        default_merchant = Merchant(name="默认商户", contact="管理员", phone="00000000000")
        db.add(default_merchant)
        db.flush()
        merchant_id = default_merchant.id
    else:
        merchant_id = existing_merchant.id

    # Seed admin user
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        db.add(User(
            username="admin",
            password_hash=hash_password("admin123"),
            role="admin",
            name="超级管理员",
        ))

    # Seed membership tiers
    existing = db.query(MembershipTier).count()
    if existing == 0:
        tiers = [
            ("basic", "普通会员", 1.0, 0, "#999999"),
            ("silver", "银卡会员", 0.95, 500, "#C0C0C0"),
            ("gold", "金卡会员", 0.90, 2000, "#FFD700"),
            ("diamond", "钻石会员", 0.85, 5000, "#B9F2FF"),
        ]
        for code, name, rate, min_recharge, color in tiers:
            db.add(MembershipTier(
                tier_code=code,
                tier_name=name,
                discount_rate=rate,
                min_recharge=min_recharge,
                color=color,
            ))

    # Seed sample consoles
    existing_consoles = db.query(Console).filter(Console.merchant_id == merchant_id).count()
    if existing_consoles == 0:
        consoles = [
            ("PS5-01", "PS5", 30, "普通区"),
            ("PS5-02", "PS5", 30, "普通区"),
            ("Xbox-01", "Xbox", 28, "普通区"),
            ("Switch-01", "Switch", 25, "普通区"),
            ("PC-01", "PC", 20, "普通区"),
            ("PS5-VIP-01", "PS5", 50, "VIP区"),
        ]
        for name, ctype, rate, zone in consoles:
            db.add(Console(name=name, console_type=ctype, hourly_rate=rate, zone=zone, merchant_id=merchant_id))

    db.commit()
    db.close()
    print("Database initialized successfully.")


if __name__ == "__main__":
    init()

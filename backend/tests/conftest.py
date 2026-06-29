"""Pytest configuration and shared fixtures."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403
from app.utils.auth import hash_password, create_access_token

TEST_DATABASE_URL = "sqlite:///./test_gaming_cafe.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Create all tables once for the test session."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_gaming_cafe.db"):
        os.remove("./test_gaming_cafe.db")


@pytest.fixture(autouse=True)
def db():
    """Provide a clean database session for each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestSession(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db):
    """FastAPI test client with overridden DB dependency."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db):
    """Create an admin user and return (user, token)."""
    from app.models.user import User
    user = User(
        username="testadmin",
        password_hash=hash_password("testpass"),
        role="admin",
        name="Test Admin",
    )
    db.add(user)
    db.flush()
    token = create_access_token(user.id)
    return user, token


@pytest.fixture
def merchant_user(db):
    """Create a merchant user with a merchant, return (user, token, merchant_id)."""
    from app.models.user import User
    from app.models.merchant import Merchant
    merchant = Merchant(name="Test Merchant")
    db.add(merchant)
    db.flush()
    user = User(
        username="testmerchant",
        password_hash=hash_password("testpass"),
        role="merchant",
        name="Test Merchant Admin",
        merchant_id=merchant.id,
    )
    db.add(user)
    db.flush()
    token = create_access_token(user.id)
    return user, token, merchant.id


@pytest.fixture
def sample_console(db, merchant_user):
    """Create a sample console for testing."""
    from app.models.console import Console
    _, _, merchant_id = merchant_user
    console = Console(
        name="PS5-TEST",
        console_type="PS5",
        hourly_rate=30.0,
        zone="Test Zone",
        merchant_id=merchant_id,
    )
    db.add(console)
    db.flush()
    return console


@pytest.fixture
def sample_member(db, merchant_user):
    """Create a sample member for testing."""
    from app.models.member import Member
    _, _, merchant_id = merchant_user
    member = Member(
        member_code="M99999",
        name="Test Member",
        phone="13800000000",
        tier="basic",
        balance=100.0,
        total_recharged=100.0,
        merchant_id=merchant_id,
    )
    db.add(member)
    db.flush()
    return member

"""Tests for core billing logic."""
import pytest
from datetime import datetime, timedelta

from app.services.billing import (
    check_auto_tier_upgrade,
    calculate_usage_duration,
    calculate_bill_amount,
    generate_bill,
    create_transaction,
    deduct_from_balance,
)
from app.models.member import Member
from app.models.session import Session
from app.models.console import Console
from app.models.bill import Bill
from app.models.membership_tier import MembershipTier
from app.utils.time_utils import now_cst


class TestCalculateUsageDuration:
    """Test usage duration calculation."""

    def test_basic_duration(self, db):
        """30 minutes usage should return 30."""
        now = now_cst()
        session = Session(
            console_id=1,
            billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            end_time=now,
            total_paused=0,
            status="ended",
        )
        duration = calculate_usage_duration(session, now)
        assert abs(duration - 30.0) < 0.1

    def test_duration_with_pause(self, db):
        """30 min total, 10 min paused = 20 min billed."""
        now = now_cst()
        session = Session(
            console_id=1,
            billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            end_time=now,
            total_paused=600,  # 10 minutes in seconds
            status="ended",
        )
        duration = calculate_usage_duration(session, now)
        assert abs(duration - 20.0) < 0.1

    def test_minimum_charge(self, db):
        """Very short session should still charge minimum."""
        now = now_cst()
        session = Session(
            console_id=1,
            billing_mode="count_up",
            start_time=now - timedelta(seconds=5),
            end_time=now,
            total_paused=0,
            status="ended",
        )
        duration = calculate_usage_duration(session, now)
        assert duration >= 1  # MIN_CHARGE_MINUTES = 1


class TestCalculateBillAmount:
    """Test bill amount calculation."""

    def test_count_up_basic(self):
        """30 min at 30/hour = 15."""
        original, rate, discount, final = calculate_bill_amount(
            hourly_rate=30.0,
            duration_min=30.0,
            billing_mode="count_up",
        )
        assert abs(original - 15.0) < 0.01
        assert abs(final - 15.0) < 0.01
        assert rate == 1.0
        assert discount == 0.0

    def test_count_up_with_tier_discount(self):
        """30 min at 30/hour, 95% tier discount = 14.25."""
        original, rate, discount, final = calculate_bill_amount(
            hourly_rate=30.0,
            duration_min=30.0,
            billing_mode="count_up",
            discount_rate=0.95,
        )
        assert abs(original - 15.0) < 0.01
        assert abs(final - 14.25) < 0.01
        assert abs(rate - 0.95) < 0.01

    def test_countdown_within_limit(self):
        """60 min prepaid, used 30 min → charge prepaid amount."""
        original, rate, discount, final = calculate_bill_amount(
            hourly_rate=30.0,
            duration_min=30.0,
            billing_mode="countdown",
            duration_limit=60.0,
        )
        # Should charge for 60 min prepaid (or less if discount applies)
        assert final <= 30.0  # Can't exceed 1 hour at 30/hour

    def test_countdown_overtime(self):
        """60 min prepaid, used 90 min → prepaid + overtime at full rate."""
        original, rate, discount, final = calculate_bill_amount(
            hourly_rate=30.0,
            duration_min=90.0,
            billing_mode="countdown",
            duration_limit=60.0,
        )
        # 60 min prepaid + 30 min overtime at full rate
        expected = 30.0 + 15.0  # prepaid + overtime
        assert abs(final - expected) < 0.01



class TestDeductFromBalance:
    """Test balance deduction logic."""

    def test_full_deduction(self, db, sample_member):
        """Deduct less than balance → full deduction."""
        sample_member.balance = 100.0
        actual, remaining = deduct_from_balance(db, sample_member.id, 50.0, None)
        assert actual == 50.0
        assert remaining == 0.0
        assert abs(sample_member.balance - 50.0) < 0.01

    def test_partial_deduction(self, db, sample_member):
        """Deduct more than balance → partial deduction."""
        sample_member.balance = 30.0
        actual, remaining = deduct_from_balance(db, sample_member.id, 50.0, None)
        assert actual == 30.0
        assert remaining == 20.0
        assert abs(sample_member.balance - 0.0) < 0.01


class TestCreateTransaction:
    """Test transaction record creation."""

    def test_creates_transaction(self, db, sample_member):
        """Should create a transaction record."""
        tx = create_transaction(
            db, sample_member.id, "recharge", 100.0,
            description="Test recharge",
        )
        assert tx.member_id == sample_member.id
        assert tx.type == "recharge"
        assert tx.amount == 100.0

    def test_sets_merchant_id(self, db, sample_member, merchant_user):
        """Should set merchant_id on transaction."""
        _, _, merchant_id = merchant_user
        tx = create_transaction(
            db, sample_member.id, "recharge", 50.0,
            merchant_id=merchant_id,
        )
        assert tx.merchant_id == merchant_id


class TestCheckAutoTierUpgrade:
    """Test automatic tier upgrade logic."""

    def test_upgrades_to_silver(self, db, sample_member):
        """Total recharged >= 500 → silver tier."""
        from app.models.membership_tier import MembershipTier
        # Ensure tiers exist
        if not db.query(MembershipTier).first():
            for code, name, rate, min_r, color in [
                ("basic", "普通会员", 1.0, 0, "#999"),
                ("silver", "银卡会员", 0.95, 500, "#C0C0C0"),
                ("gold", "金卡会员", 0.90, 2000, "#FFD700"),
            ]:
                db.add(MembershipTier(tier_code=code, tier_name=name, discount_rate=rate, min_recharge=min_r, color=color))
            db.flush()

        sample_member.total_recharged = 600.0
        sample_member.tier = "basic"
        check_auto_tier_upgrade(db, sample_member)
        assert sample_member.tier == "silver"

    def test_sets_highest_qualified_tier(self, db, sample_member):
        """Should set tier to highest qualified level."""
        from app.models.membership_tier import MembershipTier
        if not db.query(MembershipTier).first():
            for code, name, rate, min_r, color in [
                ("basic", "普通会员", 1.0, 0, "#999"),
                ("silver", "银卡会员", 0.95, 500, "#C0C0C0"),
            ]:
                db.add(MembershipTier(tier_code=code, tier_name=name, discount_rate=rate, min_recharge=min_r, color=color))
            db.flush()

        sample_member.total_recharged = 100.0
        sample_member.tier = "basic"
        check_auto_tier_upgrade(db, sample_member)
        # 100 < 500 (silver), so stays at basic
        assert sample_member.tier == "basic"

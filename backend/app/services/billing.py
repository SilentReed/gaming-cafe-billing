from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.models.bill import Bill
from app.models.member import Member
from app.models.session import Session
from app.models.transaction import Transaction
from app.models.console import Console
from sqlalchemy import text


def calculate_usage_duration(session: Session, now: datetime | None = None) -> float:
    """Return usage duration in minutes, excluding paused time."""
    now = now or now_cst()
    end = session.end_time or now
    total_seconds = (end - session.start_time).total_seconds() - session.total_paused
    return max(total_seconds / 60.0, settings.MIN_CHARGE_MINUTES)


def calculate_bill_amount(
    hourly_rate: float,
    duration_min: float,
    billing_mode: str,
    duration_limit: float | None = None,
    discount_rate: float = 1.0,
) -> tuple[float, float, float, float]:
    """
    Calculate bill amounts.
    Returns: (original_amount, discount_rate, discount_amount, final_amount)
    """
    hours = duration_min / 60.0
    original = hourly_rate * hours

    # Apply member discount
    combined_rate = discount_rate

    final = original * combined_rate

    # For countdown mode, cap at prepaid amount + overtime
    if billing_mode == "countdown" and duration_limit is not None:
        prepaid_hours = duration_limit / 60.0
        if hours <= prepaid_hours:
            final = min(final, hourly_rate * prepaid_hours * combined_rate)
        else:
            # Prepaid portion + overtime at normal rate (no discount on overtime)
            overtime_hours = hours - prepaid_hours
            final = hourly_rate * prepaid_hours * combined_rate + hourly_rate * overtime_hours

    discount_amount = original - final
    return original, combined_rate, discount_amount, final


def deduct_from_balance(
    db: DBSession,
    member_id: int,
    amount: float,
    reference_id: int | None = None,
    merchant_id: int | None = None,
) -> tuple[float, float]:
    """
    Deduct amount from member balance.
    Returns: (actual_deduction, unpaid_amount)
    """
    member = db.query(Member).filter(Member.id == member_id).with_for_update().first()
    if not member:
        return 0.0, amount

    actual = min(amount, member.balance)
    unpaid = amount - actual

    if actual > 0:
        member.balance -= actual
        create_transaction(
            db,
            member_id=member_id,
            tx_type="deduction",
            amount=-actual,
            reference_id=reference_id,
            merchant_id=merchant_id,
        )

    return actual, unpaid


def generate_bill(
    db: DBSession,
    session: Session,
    console: Console,
    member: Member | None,
    payment_method: str = "balance",
    merchant_id: int | None = None,
) -> Bill:
    """Generate a bill for a completed session."""
    now = now_cst()
    duration_min = calculate_usage_duration(session, now)

    # Get member tier discount
    discount_rate = 1.0
    if member:
        tier_row = db.execute(
            text("SELECT discount_rate FROM membership_tiers WHERE tier_code = :tier"),
            {"tier": member.tier},
        ).fetchone()
        if tier_row:
            discount_rate = tier_row[0]

    original, final_rate, discount_amount, final_amount = calculate_bill_amount(
        hourly_rate=console.hourly_rate,
        duration_min=duration_min,
        billing_mode=session.billing_mode,
        duration_limit=session.duration_limit,
        discount_rate=discount_rate,
    )

    # Determine payment
    unpaid_amount = 0.0
    bonus_amount = 0.0

    if payment_method == "balance" and member:
        actual_deduction, unpaid_amount = deduct_from_balance(
            db, member.id, final_amount, None, merchant_id
        )
        # Calculate bonus portion: how much of the deduction came from bonus
        total_balance = member.total_recharged + member.total_bonus
        if total_balance > 0 and member.total_bonus > 0:
            bonus_ratio = member.total_bonus / total_balance
            bonus_amount = round(actual_deduction * bonus_ratio, 2)
    elif member:
        # Member pays with cash/wechat/alipay - no balance deduction
        actual_deduction = final_amount
    else:
        actual_deduction = final_amount

    bill = Bill(
        session_id=session.id,
        member_id=member.id if member else None,
        console_id=console.id,
        console_type=console.console_type,
        billing_mode=session.billing_mode,
        started_at=session.start_time,
        ended_at=now,
        duration_min=duration_min,
        original_amount=original,
        discount_rate=final_rate,
        discount_amount=discount_amount,
        final_amount=final_amount,
        bonus_amount=bonus_amount,
        payment_method=payment_method,
        status="paid" if unpaid_amount == 0 else "unpaid",
        merchant_id=merchant_id,
    )
    db.add(bill)
    db.flush()

    # Record spending transaction
    if member:
        tx_amount = -actual_deduction if payment_method == "balance" else -final_amount
        create_transaction(
            db,
            member_id=member.id,
            tx_type="deduction",
            amount=tx_amount,
            reference_id=bill.id,
            merchant_id=merchant_id,
        )

    return bill


def create_transaction(
    db: DBSession,
    member_id: int,
    tx_type: str,
    amount: float,
    reference_id: int | None = None,
    description: str = "",
    balance_after: float = 0,
    merchant_id: int | None = None,
) -> Transaction:
    """Create a transaction record."""
    tx = Transaction(
        member_id=member_id,
        type=tx_type,
        amount=amount,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
        merchant_id=merchant_id,
    )
    db.add(tx)
    db.flush()
    return tx


def check_auto_tier_upgrade(db: DBSession, member: Member):
    """Check and auto-upgrade member tier based on total recharge."""
    tiers = db.execute(
        text("SELECT tier_code, min_recharge FROM membership_tiers ORDER BY min_recharge DESC")
    ).fetchall()

    for tier_code, min_recharge in tiers:
        if member.total_recharged >= min_recharge:
            if member.tier != tier_code:
                member.tier = tier_code
            return

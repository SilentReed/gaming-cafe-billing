from app.utils.time_utils import now_cst
from datetime import datetime

from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.models.bill import Bill
from app.models.member import Member
from app.models.promotion import Promotion
from app.models.session import Session
from app.models.transaction import Transaction
from app.models.console import Console


def calculate_usage_duration(session: Session, now: datetime | None = None) -> float:
    """Return usage duration in minutes, excluding paused time."""
    now = now or now_cst()
    end = session.end_time or now
    total_seconds = (end - session.start_time).total_seconds() - session.total_paused
    return max(total_seconds / 60.0, settings.MIN_CHARGE_MINUTES)


def find_best_promotion(
    db: DBSession,
    console_type: str,
    session_start: datetime,
    duration_min: float,
) -> Promotion | None:
    """Find the best applicable promotion for a session."""
    now = now_cst()
    promotions = (
        db.query(Promotion)
        .filter(
            Promotion.is_active == True,
            Promotion.start_time <= session_start,
            Promotion.end_time >= session_start,
        )
        .all()
    )

    best = None
    best_score = float("inf")

    for promo in promotions:
        if promo.console_types:
            types = [t.strip() for t in promo.console_types.split(",")]
            if console_type not in types:
                continue

        if promo.type == "discount_rate":
            score = promo.value
        elif promo.type == "fixed_price":
            score = promo.value
        elif promo.type == "buy_hours":
            if duration_min / 60 < promo.min_hours:
                continue
            effective = (duration_min / 60) / ((duration_min / 60) + promo.bonus_hours)
            score = effective
        else:
            continue

        if score < best_score:
            best_score = score
            best = promo

    return best


def calculate_bill_amount(
    hourly_rate: float,
    duration_min: float,
    billing_mode: str,
    duration_limit: float | None = None,
    discount_rate: float = 1.0,
    promotion: Promotion | None = None,
) -> tuple[float, float, float, float]:
    """
    Calculate bill amounts.
    Returns: (original_amount, discount_rate, discount_amount, final_amount)
    """
    hours = duration_min / 60.0
    original = hourly_rate * hours

    # Apply promotion first
    promo_rate = 1.0
    if promotion:
        if promotion.type == "discount_rate":
            promo_rate = promotion.value
        elif promotion.type == "fixed_price":
            if hourly_rate > 0:
                promo_rate = promotion.value / hourly_rate

    # Combine rates (take the better deal)
    combined_rate = min(discount_rate, promo_rate)

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


def generate_bill(
    db: DBSession,
    session: Session,
    console: Console,
    member: Member | None,
    payment_method: str = "balance",
) -> Bill:
    """Generate a bill for a completed session."""
    now = now_cst()
    duration_min = calculate_usage_duration(session, now)

    # Get member tier discount
    discount_rate = 1.0
    if member:
        from app.models.report import DailyReport  # avoid circular
        from sqlalchemy import text

        tier_row = db.execute(
            text("SELECT discount_rate FROM membership_tiers WHERE tier_code = :tier"),
            {"tier": member.tier},
        ).fetchone()
        if tier_row:
            discount_rate = tier_row[0]

    # Find best promotion
    promotion = find_best_promotion(db, console.console_type, session.start_time, duration_min)

    original, final_rate, discount_amount, final_amount = calculate_bill_amount(
        hourly_rate=console.hourly_rate,
        duration_min=duration_min,
        billing_mode=session.billing_mode,
        duration_limit=session.duration_limit,
        discount_rate=discount_rate,
        promotion=promotion,
    )

    # Determine payment
    unpaid_amount = 0.0
    bonus_amount = 0.0

    if payment_method == "balance" and member:
        actual_deduction, unpaid_amount = deduct_from_balance(
            db, member.id, final_amount, None
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
        promotion_id=promotion.id if promotion else None,
        final_amount=final_amount,
        bonus_amount=bonus_amount,
        payment_method=payment_method,
        status="paid" if unpaid_amount == 0 else "unpaid",
    )
    db.add(bill)
    db.flush()

    # Record deduction transaction
    if member:
        create_transaction(
            db,
            member_id=member.id,
            tx_type="deduction",
            amount=-actual_deduction,
            reference_id=bill.id,
            description=f"Session #{session.id} - {console.name} ({duration_min:.1f}min)",
        )
        member.total_spent += actual_deduction
        member.total_hours += duration_min / 60.0

    return bill


def deduct_from_balance(
    db: DBSession, member_id: int, amount: float, bill_id: int | None
) -> tuple[float, float]:
    """Deduct from member balance. Returns (actual_deduction, remaining_unpaid)."""
    member = db.query(Member).filter(Member.id == member_id).first()
    actual = min(member.balance, amount)
    member.balance -= actual
    remaining = amount - actual

    create_transaction(
        db,
        member_id=member_id,
        tx_type="deduction",
        amount=-actual,
        reference_id=bill_id,
        balance_after=member.balance,
    )

    return actual, remaining


def create_transaction(
    db: DBSession,
    member_id: int,
    tx_type: str,
    amount: float,
    reference_id: int | None = None,
    description: str = "",
    balance_after: float | None = None,
    operator_id: int | None = None,
) -> Transaction:
    """Create a balance transaction record."""
    member = db.query(Member).filter(Member.id == member_id).first()
    if balance_after is None:
        balance_after = member.balance

    tx = Transaction(
        member_id=member_id,
        type=tx_type,
        amount=amount,
        balance_after=balance_after,
        reference_id=reference_id,
        description=description,
        operator_id=operator_id,
    )
    db.add(tx)
    return tx


def check_auto_tier_upgrade(db: DBSession, member: Member):
    """Check and auto-upgrade member tier based on total recharge."""
    tiers = db.execute(
        __import__("sqlalchemy").text(
            "SELECT tier_code, min_recharge FROM membership_tiers ORDER BY min_recharge DESC"
        )
    ).fetchall()

    for tier_code, min_recharge in tiers:
        if member.total_recharged >= min_recharge:
            if member.tier != tier_code:
                member.tier = tier_code
            return

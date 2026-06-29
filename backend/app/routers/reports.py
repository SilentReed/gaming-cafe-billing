from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession
import sqlalchemy as sa

from app.database import get_db
from app.deps import get_current_merchant_id
from app.models.bill import Bill
from app.models.member import Member
from app.routers.bills import utc_to_local

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/daily")
def daily_report(date: str = Query(None), db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    if not date:
        from datetime import date as dt_date
        date = dt_date.today().isoformat()

    bills = db.execute(
        sa.text(
            "SELECT COUNT(*), COALESCE(SUM(final_amount), 0), COALESCE(SUM(bonus_amount), 0), COALESCE(SUM(duration_min), 0) "
            "FROM bills WHERE date(ended_at) = :date AND status != 'refunded'"
            + (" AND merchant_id = :mid" if merchant_id is not None else "")
        ),
        {"date": date, **({"mid": merchant_id} if merchant_id is not None else {})},
    ).fetchone()

    recharges = db.execute(
        sa.text(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions "
            "WHERE type = 'recharge' AND date(created_at) = :date"
            + (" AND merchant_id = :mid" if merchant_id is not None else "")
        ),
        {"date": date, **({"mid": merchant_id} if merchant_id is not None else {})},
    ).fetchone()

    new_members = db.execute(
        sa.text("SELECT COUNT(*) FROM members WHERE date(created_at) = :date"
                + (" AND merchant_id = :mid" if merchant_id is not None else "")),
        {"date": date, **({"mid": merchant_id} if merchant_id is not None else {})},
    ).fetchone()

    hourly = db.execute(
        sa.text(
            "SELECT strftime('%H', ended_at) as hour, COUNT(*) as cnt "
            "FROM bills WHERE date(ended_at) = :date AND status != 'refunded' "
            + ("AND merchant_id = :mid " if merchant_id is not None else "")
            + "GROUP BY hour ORDER BY cnt DESC LIMIT 1"
        ),
        {"date": date, **({"mid": merchant_id} if merchant_id is not None else {})},
    ).fetchone()

    total_revenue = bills[1]
    bonus_amount = bills[2]
    actual_revenue = round(total_revenue - bonus_amount, 2)

    return {
        "report_date": date,
        "total_sessions": bills[0],
        "total_revenue": total_revenue,
        "actual_revenue": actual_revenue,
        "bonus_amount": bonus_amount,
        "total_hours": round(bills[3] / 60, 1) if bills[3] else 0,
        "recharges": recharges[0],
        "new_members": new_members[0],
        "peak_hour": int(hourly[0]) if hourly else None,
    }


@router.get("/range")
def range_report(start: str, end: str, db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    query = (
        "SELECT date(ended_at, '+8 hours') as d, COUNT(*), COALESCE(SUM(final_amount), 0), COALESCE(SUM(bonus_amount), 0), COALESCE(SUM(duration_min), 0) "
        "FROM bills WHERE date(ended_at, '+8 hours') BETWEEN :start AND :end AND status != 'refunded'"
        + (" AND merchant_id = :mid" if merchant_id is not None else "")
        + " GROUP BY d ORDER BY d"
    )
    params = {"start": start, "end": end}
    if merchant_id is not None:
        params["mid"] = merchant_id
    rows = db.execute(sa.text(query), params).fetchall()
    return [
        {"date": r[0], "sessions": r[1], "revenue": r[2], "actual_revenue": round(r[2] - r[3], 2), "bonus_amount": r[3], "hours": round(r[4] / 60, 1) if r[4] else 0}
        for r in rows
    ]


@router.get("/console-utilization")
def console_utilization(start: str | None = None, end: str | None = None, db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    from app.models.console import Console

    query = db.query(Console)
    if merchant_id is not None:
        query = query.filter(Console.merchant_id == merchant_id)
    consoles = query.all()
    result = []
    for c in consoles:
        query = "SELECT COALESCE(SUM(CAST((julianday(COALESCE(end_time, datetime('now'))) - julianday(start_time)) * 24 AS REAL) - total_paused / 3600.0), 0) FROM sessions WHERE console_id = :cid AND status = 'ended'"
        params = {"cid": c.id}
        if start:
            query += " AND start_time >= :start"
            params["start"] = start
        if end:
            query += " AND start_time <= :end || ' 23:59:59'"
            params["end"] = end
        usage = db.execute(sa.text(query), params).fetchone()
        result.append({
            "console_id": c.id,
            "name": c.name,
            "type": c.console_type,
            "total_hours": round(usage[0], 1),
        })
    return result


@router.get("/export")
def export_bills(start_date: str | None = None, end_date: str | None = None, token: str | None = Query(None), db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    from fastapi import HTTPException
    from app.config import settings
    from jose import jwt as _jwt
    from app.models.user import User

    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = _jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    from fastapi.responses import StreamingResponse
    import csv
    import io

    query = db.query(Bill)
    if merchant_id is not None:
        query = query.filter(Bill.merchant_id == merchant_id)
    if start_date:
        query = query.filter(Bill.started_at >= start_date)
    if end_date:
        query = query.filter(Bill.started_at <= end_date + " 23:59:59")
    bills = query.order_by(Bill.id.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', '会员', '手机号', '类型', '模式', '开始时间', '结束时间', '时长(分)', '费用', '赠费', '支付方式', '状态'])

    for b in bills:
        member = db.query(Member).filter(Member.id == b.member_id).first() if b.member_id else None
        writer.writerow([
            b.id,
            member.name if member else '散客',
            member.phone if member else '',
            b.console_type,
            '正计时' if b.billing_mode == 'count_up' else '倒计时',
            utc_to_local(b.started_at) or '',
            utc_to_local(b.ended_at) or '',
            round(b.duration_min, 1),
            round(b.final_amount, 2),
            round(b.bonus_amount, 2),
            {'balance': '余额', 'cash': '现金', 'wechat': '微信', 'alipay': '支付宝'}.get(b.payment_method, b.payment_method),
            {'paid': '已付', 'unpaid': '未付', 'refunded': '已退款'}.get(b.status, b.status),
        ])

    output.seek(0)
    bom = '\ufeff'
    return StreamingResponse(
        iter([bom + output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=bills_{start_date or 'all'}_{end_date or 'all'}.csv"}
    )


@router.get("/overview")
def overview_report(
    days: int = 30,
    db: DBSession = Depends(get_db),
    merchant_id: int | None = Depends(get_current_merchant_id),
):
    """Enhanced overview with trends."""
    from datetime import date, timedelta

    today = date.today()
    start = (today - timedelta(days=days)).isoformat()

    # Revenue trend
    where = "WHERE date(ended_at, '+8 hours') BETWEEN :start AND :end AND status != 'refunded'"
    params = {"start": start, "end": today.isoformat()}
    if merchant_id is not None:
        where += " AND merchant_id = :mid"
        params["mid"] = merchant_id

    rows = db.execute(sa.text(
        f"SELECT date(ended_at, '+8 hours') as d, COUNT(*), COALESCE(SUM(final_amount), 0) "
        f"FROM bills {where} GROUP BY d ORDER BY d"
    ), params).fetchall()

    # Peak hours
    peak_rows = db.execute(sa.text(
        f"SELECT strftime('%H', ended_at) as hour, COUNT(*) as cnt "
        f"FROM bills {where} GROUP BY hour ORDER BY cnt DESC LIMIT 5"
    ), params).fetchall()

    # Console type breakdown
    type_rows = db.execute(sa.text(
        f"SELECT console_type, COUNT(*), COALESCE(SUM(final_amount), 0), COALESCE(SUM(duration_min), 0) "
        f"FROM bills {where} GROUP BY console_type ORDER BY SUM(final_amount) DESC"
    ), params).fetchall()

    return {
        "period": {"start": start, "end": today.isoformat(), "days": days},
        "revenue_trend": [{"date": r[0], "sessions": r[1], "revenue": r[2]} for r in rows],
        "peak_hours": [{"hour": int(r[0]), "count": r[1]} for r in peak_rows],
        "console_breakdown": [
            {"type": r[0], "sessions": r[1], "revenue": r[2], "hours": round(r[3]/60, 1) if r[3] else 0}
            for r in type_rows
        ],
    }


@router.get("/member-activity")
def member_activity(start: str | None = None, end: str | None = None, db: DBSession = Depends(get_db), merchant_id: int | None = Depends(get_current_merchant_id)):
    query = (
        "SELECT m.id, m.name, m.member_code, m.tier, "
        "COALESCE(SUM(b.final_amount), 0) as total_spent, "
        "COALESCE(SUM(b.duration_min), 0) as total_minutes "
        "FROM members m "
        "LEFT JOIN bills b ON b.member_id = m.id AND b.status != 'refunded'"
    )
    params = {}
    conditions = ["m.status = 'active'"]
    if merchant_id is not None:
        conditions.append("m.merchant_id = :mid")
        params["mid"] = merchant_id
    if start:
        conditions.append("b.started_at >= :start")
        params["start"] = start
    if end:
        conditions.append("b.started_at <= :end || ' 23:59:59'")
        params["end"] = end
    query += " WHERE " + " AND ".join(conditions)
    query += " GROUP BY m.id ORDER BY total_spent DESC LIMIT 20"

    rows = db.execute(sa.text(query), params).fetchall()
    return [
        {"name": r[1], "code": r[2], "total_spent": r[4], "total_hours": round(r[5] / 60, 1) if r[5] else 0, "tier": r[3]}
        for r in rows
    ]

# Gaming Console Host Billing System — Design Document

## 1. Database Schema

### 1.1 `consoles` — Gaming console inventory

```sql
CREATE TABLE consoles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,                  -- e.g. "PS5-01"
    console_type    TEXT NOT NULL,                  -- PS5, Xbox, Switch, PC
    hourly_rate     REAL NOT NULL DEFAULT 0,        -- base hourly rate (元/小时)
    status          TEXT NOT NULL DEFAULT 'idle',   -- idle | in_use | maintenance | offline
    zone            TEXT DEFAULT '',                 -- 区域: VIP区, 普通区, etc.
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.2 `members` — Member accounts

```sql
CREATE TABLE members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code     TEXT UNIQUE NOT NULL,           -- unique member card number
    name            TEXT NOT NULL,
    phone           TEXT UNIQUE,                    -- login/identification
    tier            TEXT NOT NULL DEFAULT 'basic',  -- basic | silver | gold | diamond
    balance         REAL NOT NULL DEFAULT 0,        -- available credit balance (元)
    total_recharged REAL NOT NULL DEFAULT 0,        -- cumulative recharge amount
    total_spent     REAL NOT NULL DEFAULT 0,        -- cumulative spending
    total_hours     REAL NOT NULL DEFAULT 0,        -- cumulative usage hours
    status          TEXT NOT NULL DEFAULT 'active', -- active | frozen | deleted
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.3 `membership_tiers` — Tier discount rules

```sql
CREATE TABLE membership_tiers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tier_code       TEXT UNIQUE NOT NULL,           -- basic | silver | gold | diamond
    tier_name       TEXT NOT NULL,                  -- 普通会员, 银卡会员, etc.
    discount_rate   REAL NOT NULL DEFAULT 1.0,      -- multiplier: 0.8 = 20% off
    min_recharge    REAL NOT NULL DEFAULT 0,        -- minimum total recharge to qualify
    color           TEXT DEFAULT '#999999',          -- UI badge color
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.4 `sessions` — Usage sessions (one per console per user visit)

```sql
CREATE TABLE sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    console_id      INTEGER NOT NULL REFERENCES consoles(id),
    member_id       INTEGER REFERENCES members(id), -- NULL for walk-in (non-member)
    billing_mode    TEXT NOT NULL,                   -- count_up | countdown
    start_time      TEXT NOT NULL DEFAULT (datetime('now')),
    end_time        TEXT,                            -- NULL while active
    paused_at       TEXT,                            -- if paused
    total_paused    REAL NOT NULL DEFAULT 0,         -- accumulated paused seconds
    duration_limit  REAL,                            -- countdown: pre-paid minutes; NULL for count_up
    status          TEXT NOT NULL DEFAULT 'active',  -- active | paused | ended
    operator_id     INTEGER REFERENCES users(id),    -- staff who started this session
    notes           TEXT DEFAULT '',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.5 `bills` — Generated bills (one per session)

```sql
CREATE TABLE bills (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(id),
    member_id       INTEGER REFERENCES members(id),
    console_id      INTEGER NOT NULL REFERENCES consoles(id),
    console_type    TEXT NOT NULL,                   -- denormalized for reporting
    billing_mode    TEXT NOT NULL,                   -- count_up | countdown
    started_at      TEXT NOT NULL,
    ended_at        TEXT NOT NULL,
    duration_min    REAL NOT NULL,                  -- actual usage minutes (excluding paused)
    original_amount REAL NOT NULL,                  -- before discounts
    discount_rate   REAL NOT NULL DEFAULT 1.0,
    discount_amount REAL NOT NULL DEFAULT 0,
    promotion_id    INTEGER REFERENCES promotions(id),
    final_amount    REAL NOT NULL,                  -- amount charged
    payment_method  TEXT NOT NULL DEFAULT 'balance',-- balance | cash | wechat | alipay
    paid_at         TEXT DEFAULT (datetime('now')),
    status          TEXT NOT NULL DEFAULT 'paid',   -- paid | unpaid | refunded
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.6 `transactions` — Balance ledger (recharge + deduction)

```sql
CREATE TABLE transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL REFERENCES members(id),
    type            TEXT NOT NULL,                   -- recharge | deduction | refund | adjustment
    amount          REAL NOT NULL,                  -- positive = credit, negative = debit
    balance_after   REAL NOT NULL,                  -- balance snapshot after this tx
    reference_id    INTEGER,                        -- bill_id for deductions, NULL for recharge
    description     TEXT DEFAULT '',
    operator_id     INTEGER REFERENCES users(id),
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.7 `promotions` — Promotional pricing rules

```sql
CREATE TABLE promotions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    type            TEXT NOT NULL,                   -- discount_rate | fixed_price | buy_hours
    value           REAL NOT NULL,                  -- discount_rate: 0.7=30% off; fixed_price: price/hour
    console_types   TEXT DEFAULT '',                 -- comma-separated; empty = all types
    min_hours       REAL DEFAULT 0,                 -- minimum hours to qualify (for buy_hours type)
    bonus_hours     REAL DEFAULT 0,                 -- extra hours given (for buy_hours type)
    start_time      TEXT NOT NULL,                  -- promotion start datetime
    end_time        TEXT NOT NULL,                  -- promotion end datetime
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.8 `users` — Admin/staff accounts

```sql
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'staff',  -- admin | staff
    name            TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT DEFAULT (datetime('now'))
);
```

### 1.9 `daily_reports` — Aggregated daily revenue (materialized at midnight or on-demand)

```sql
CREATE TABLE daily_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    report_date     TEXT UNIQUE NOT NULL,           -- YYYY-MM-DD
    total_sessions  INTEGER NOT NULL DEFAULT 0,
    total_hours     REAL NOT NULL DEFAULT 0,
    total_revenue   REAL NOT NULL DEFAULT 0,
    cash_revenue    REAL NOT NULL DEFAULT 0,
    balance_revenue REAL NOT NULL DEFAULT 0,
    recharges       REAL NOT NULL DEFAULT 0,        -- total recharge that day
    new_members     INTEGER NOT NULL DEFAULT 0,
    peak_hour       INTEGER,                        -- 0-23
    created_at      TEXT DEFAULT (datetime('now'))
);
```

---

## 2. API Design

Base URL: `/api/v1`

### 2.1 Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns JWT token |
| POST | `/auth/logout` | Invalidate token |
| GET | `/auth/me` | Get current user info |

### 2.2 Consoles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/consoles` | List all consoles (with status) |
| GET | `/consoles/{id}` | Get console detail |
| POST | `/consoles` | Create console |
| PUT | `/consoles/{id}` | Update console |
| DELETE | `/consoles/{id}` | Soft delete / mark offline |
| PUT | `/consoles/{id}/status` | Quick status toggle |
| GET | `/consoles/dashboard` | Real-time dashboard data (all console statuses + active sessions) |

### 2.3 Members

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/members` | List members (search by name/phone/code) |
| GET | `/members/{id}` | Member detail + session history |
| POST | `/members` | Register new member |
| PUT | `/members/{id}` | Update member info |
| PUT | `/members/{id}/tier` | Manually change tier |
| POST | `/members/{id}/recharge` | Recharge balance (creates transaction) |
| GET | `/members/{id}/transactions` | Transaction history |
| GET | `/members/{id}/sessions` | Session history |

### 2.4 Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions` | List sessions (filter: status, date range, console) |
| GET | `/sessions/{id}` | Session detail |
| POST | `/sessions` | **Start session** — body: `{ console_id, member_id?, billing_mode, duration_limit? }` |
| PUT | `/sessions/{id}/pause` | Pause session |
| PUT | `/sessions/{id}/resume` | Resume session |
| PUT | `/sessions/{id}/end` | **End session** — calculates final bill, deducts balance |
| GET | `/sessions/active` | List all currently active sessions |

### 2.5 Bills

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/bills` | List bills (filter: date range, console_type, payment_method) |
| GET | `/bills/{id}` | Bill detail |
| POST | `/bills/{id}/refund` | Refund a bill |
| GET | `/bills/today` | Today's bills summary |

### 2.6 Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/transactions` | List transactions (filter: member_id, type, date range) |

### 2.7 Promotions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/promotions` | List active promotions |
| POST | `/promotions` | Create promotion |
| PUT | `/promotions/{id}` | Update promotion |
| DELETE | `/promotions/{id}` | Deactivate promotion |

### 2.8 Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports/daily?date=YYYY-MM-DD` | Daily revenue report |
| GET | `/reports/range?start=&end=` | Revenue over date range |
| GET | `/reports/console-utilization` | Console utilization stats |
| GET | `/reports/member-activity` | Member spending/activity stats |
| GET | `/reports/export` | Export report as CSV |

### 2.9 System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/system/tiers` | List membership tiers |
| PUT | `/system/tiers/{code}` | Update tier discount rate |
| GET | `/system/config` | System config (business hours, etc.) |
| PUT | `/system/config` | Update system config |

---

## 3. Project Structure

```
gaming-cafe-billing/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app entry, CORS, routers
│   │   ├── config.py                  # Settings via pydantic-settings
│   │   ├── database.py                # SQLite engine, session dependency
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── console.py
│   │   │   ├── member.py
│   │   │   ├── session.py
│   │   │   ├── bill.py
│   │   │   ├── transaction.py
│   │   │   ├── promotion.py
│   │   │   ├── user.py
│   │   │   └── report.py
│   │   ├── schemas/                   # Pydantic request/response schemas
│   │   │   ├── __init__.py
│   │   │   ├── console.py
│   │   │   ├── member.py
│   │   │   ├── session.py
│   │   │   ├── bill.py
│   │   │   ├── transaction.py
│   │   │   ├── promotion.py
│   │   │   ├── auth.py
│   │   │   └── report.py
│   │   ├── routers/                   # API route handlers
│   │   │   ├── __init__.py
│   │   │   ├── auth.py
│   │   │   ├── consoles.py
│   │   │   ├── members.py
│   │   │   ├── sessions.py
│   │   │   ├── bills.py
│   │   │   ├── promotions.py
│   │   │   └── reports.py
│   │   ├── services/                  # Business logic layer
│   │   │   ├── __init__.py
│   │   │   ├── billing.py             # Core: calculate fee, apply discounts, deduct
│   │   │   ├── timing.py              # Session timing, pause/resume, countdown
│   │   │   ├── member.py              # Tier auto-upgrade, balance ops
│   │   │   ├── console.py             # Status management
│   │   │   └── report.py              # Report generation
│   │   ├── deps.py                    # Dependency injection (get_db, get_current_user)
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── auth.py                # JWT, password hashing
│   │       └── time_utils.py          # Timezone, duration calc helpers
│   ├── alembic/                       # DB migrations (optional, can use raw SQL init)
│   │   └── ...
│   ├── init_db.py                     # One-time DB init script
│   ├── requirements.txt
│   └── pytest.ini
├── frontend/
│   ├── index.html                     # SPA entry
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js                     # Router, global state, API client
│   │   ├── pages/
│   │   │   ├── dashboard.js           # Real-time console status grid
│   │   │   ├── sessions.js            # Active session management
│   │   │   ├── members.js             # Member CRUD + recharge
│   │   │   ├── billing.js             # Bill history, today's summary
│   │   │   ├── promotions.js          # Promotion management
│   │   │   ├── reports.js             # Charts + export
│   │   │   └── settings.js            # Console config, tier config, system settings
│   │   └── components/
│   │       ├── nav.js
│   │       ├── modal.js
│   │       ├── table.js
│   │       ├── toast.js
│   │       └── chart.js               # Lightweight chart helper (canvas-based)
│   └── assets/
│       └── icons/
├── DESIGN.md                          # This file
└── README.md
```

**Frontend note**: Using vanilla HTML/CSS/JS with no build tool for simplicity. Can be served as static files by FastAPI. If SPA routing is needed, use hash-based routing (`#/dashboard`).

---

## 4. Frontend Pages

### 4.1 Dashboard (`#/dashboard`) — Main view
- **Console grid**: Visual grid of all consoles, color-coded by status (green=idle, red=in_use, yellow=paused, gray=offline/maintenance)
- Click a console → shows session details or allows starting new session
- **Quick stats bar**: Total consoles, currently in use, today's revenue, active members
- **Live clock**: Current time (important for countdown mode)

### 4.2 Session Management (`#/sessions`)
- **Active sessions table**: All running/paused sessions with live elapsed time, current cost
- Actions: Pause, Resume, End, Extend (for countdown)
- **New session form**: Select console → select member (optional) → choose billing mode → set duration (countdown) → Start
- Real-time auto-refresh (every 5s via polling or SSE)

### 4.3 Members (`#/members`)
- **Member list**: Searchable table with code, name, phone, tier, balance
- **Member detail page**: Info + balance + recharge history + session history
- **Recharge modal**: Amount input, payment method, confirm
- **New member form**: Name, phone, initial recharge amount
- **Tier management**: View all tiers, edit discount rates

### 4.4 Billing (`#/bills`)
- **Today's bills**: Quick view of today's revenue
- **Bill history**: Filterable table (date range, console type, payment method)
- **Bill detail**: Full breakdown of one session's charges
- **Refund**: Process refund for a bill

### 4.5 Promotions (`#/promotions`)
- **Promotion list**: Active/inactive promotions
- **Create/edit promotion**: Type, discount value, applicable console types, date range
- Preview: Show which sessions would be affected

### 4.6 Reports (`#/reports`)
- **Daily summary**: Revenue, sessions, utilization pie chart
- **Revenue trend**: Line chart over selected date range
- **Console utilization**: Heatmap or bar chart by hour of day
- **Top members**: Ranked by spending
- **Export**: Download as CSV

### 4.7 Settings (`#/settings`)
- Console management: Add/edit/delete consoles, set hourly rates
- Membership tiers: Edit tier names, discount rates, thresholds
- System settings: Business hours, auto-pause policy, session timeout
- Staff management: Add/edit staff accounts

---

## 5. Key Business Logic

### 5.1 Session Lifecycle & Billing

```
START → (running) → PAUSE → (paused) → RESUME → (running) → END → BILL
                                     ↓                          ↓
                              countdown expired          generate bill
```

**Start session:**
1. Validate console is idle
2. If member: check balance > minimum threshold (e.g., 1 hour of base rate)
3. Create session record, set console status to `in_use`
4. Return session ID

**Pause/Resume:**
- Record `paused_at` timestamp on pause
- On resume: add `(now - paused_at)` to `total_paused`, clear `paused_at`
- Billing duration = `(end_time - start_time) - total_paused`

**End session:**
1. Calculate `duration_min = (now - start_time - total_paused) / 60`
2. Apply billing rules:
   - Count-up: `final_amount = hourly_rate × (duration_min / 60) × discount_rate`
   - Countdown: `final_amount = min(prepaid_amount, hourly_rate × (duration_min / 60) × discount_rate)`
     - If duration exceeded prepaid: charge overtime at normal rate
3. Apply promotions (best applicable discount wins)
4. Determine member tier discount
5. Create bill, deduct from member balance (if member)
6. If balance insufficient: deduct what's available, mark bill as `unpaid` for remainder
7. Update console status to `idle`
8. Update member stats

### 5.2 Balance & Deduction Logic

```python
def deduct_balance(member_id: int, amount: float, bill_id: int):
    member = get_member(member_id)
    actual_deduction = min(member.balance, amount)
    member.balance -= actual_deduction
    remaining = amount - actual_deduction

    # Record transaction
    create_transaction(
        member_id=member_id,
        type='deduction',
        amount=-actual_deduction,
        balance_after=member.balance,
        reference_id=bill_id
    )

    if remaining > 0:
        # Mark bill as partially unpaid
        update_bill(bill_id, status='unpaid', unpaid_amount=remaining)

    return actual_deduction, remaining
```

**Edge case — balance runs out during session:**
- Option A (recommended): Let session continue, end bill as `unpaid` for the deficit. Staff can top-up and settle later.
- Option B: Auto-pause when balance hits threshold, notify staff.
- Implementation: At session end, check balance. If insufficient, deduct all available, flag remainder.

### 5.3 Countdown Timer Logic

```python
def get_countdown_remaining(session) -> float:
    """Returns remaining seconds."""
    elapsed = (now - session.start_time).total_seconds() - session.total_paused
    limit_seconds = session.duration_limit * 60  # duration_limit in minutes
    remaining = limit_seconds - elapsed
    return max(0, remaining)
```

**Auto-end on expiry:**
- Background task (runs every 30s) checks all active countdown sessions
- If remaining <= 0: auto-end session, charge full prepaid amount
- Can be extended by staff (add time, deduct additional balance)

### 5.4 Promotion Resolution

When a session ends:
1. Query all active promotions where `start_time <= session.start <= end_time`
2. Filter by console_type match
3. For each promotion, calculate effective discount:
   - `discount_rate` type: use promotion's rate
   - `fixed_price` type: compare with member's tier rate, take better deal
4. Apply the best (lowest final_amount) promotion
5. Record `promotion_id` on the bill

### 5.5 Concurrent Session Prevention

- A console can only have ONE active session at a time
- Enforce via application lock: before creating session, check `consoles.status != 'in_use'`
- Use SQLite's `BEGIN IMMEDIATE` or application-level lock to prevent race conditions
- A member CAN have multiple concurrent sessions on different consoles

### 5.6 Auto-Tier Upgrade

After each recharge:
1. Sum member's `total_recharged`
2. Compare against tier thresholds (ordered: diamond > gold > silver > basic)
3. If qualifies for higher tier, auto-upgrade
4. Downgrade is manual only (to avoid flickering)

### 5.7 Real-time Dashboard Updates

Two approaches (choose one):
- **Polling (simpler)**: Frontend polls `/consoles/dashboard` every 3-5 seconds
- **SSE (better UX)**: `/api/v1/events/stream` sends console status changes in real-time

For MVP, polling is sufficient. The dashboard endpoint returns:
```json
{
  "consoles": [
    {
      "id": 1, "name": "PS5-01", "type": "PS5", "status": "in_use",
      "session": {
        "id": 42, "member_name": "张三", "billing_mode": "count_up",
        "elapsed_min": 45.3, "current_cost": 13.59, "started_at": "..."
      }
    }
  ],
  "summary": {
    "total": 20, "in_use": 12, "idle": 6, "maintenance": 2,
    "today_revenue": 1280.50, "today_sessions": 38
  }
}
```

### 5.8 Edge Cases

| Scenario | Handling |
|----------|----------|
| Session ends at 2:59 AM (after business hours) | Charge normally; no automatic cutoff |
| Same member starts 2 sessions simultaneously | Allowed on different consoles; blocked on same console |
| Admin adjusts rate mid-session | Use rate at session START time (snapshot) |
| Promotion expires during active session | Use promotion valid at session START time |
| Console crashes mid-session | Staff manually ends session; bill calculated to crash time |
| Member's phone already registered | Return error on registration; suggest login instead |
| Countdown timer reaches 0 | Auto-end session, bill = prepaid amount |
| Refund after payment | Reverse transaction, add back to balance, mark bill refunded |
| Very short session (< 1 min) | Minimum charge = 1 minute worth (configurable) |

---

## 6. Implementation Phases

### Phase 1: Core (MVP)
1. Database init + SQLAlchemy models
2. Auth (login, JWT)
3. Console CRUD + status management
4. Session start/pause/resume/end
5. Basic billing (count-up only, no promotions)
6. Member CRUD + recharge + balance deduction
7. Dashboard page (console grid)

### Phase 2: Billing Features
8. Countdown billing mode
9. Membership tier discounts
10. Promotion system
11. Bill history + today's summary
12. Member transaction history

### Phase 3: Reporting & Polish
13. Daily/monthly reports with charts
14. Console utilization analytics
15. CSV export
16. Auto-tier upgrade logic
17. Session timeout / auto-end background task
18. Settings page (system config)

### Phase 4: Production Hardening
19. Rate limiting, input validation
20. Audit logging
21. Database backup strategy
22. Deployment config (Docker, etc.)

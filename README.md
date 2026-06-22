# Gaming Console Host Billing System

网吧主机计费系统 — PS5/Xbox/Switch 主机计时收费管理

## Quick Start

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Initialize database with seed data
python init_db.py

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open http://localhost:8000 in browser.

Default admin: `admin` / `admin123`

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Auth**: JWT (jose)

## Features

- Real-time console status dashboard
- Count-up and countdown billing modes
- Member system with tier discounts
- Promotion engine (discount rate / fixed price / buy hours)
- Balance management with recharge/deduction ledger
- Revenue reports and utilization analytics

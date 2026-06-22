from datetime import datetime, timezone, timedelta

CST = timezone(timedelta(hours=8))

def now_cst():
    return datetime.now(CST).replace(tzinfo=None)

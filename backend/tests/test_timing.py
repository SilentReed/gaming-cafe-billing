"""Tests for session timing logic."""
import pytest
from datetime import datetime, timedelta

from app.services.timing import (
    pause_session,
    resume_session,
    end_session,
    get_elapsed_seconds,
    get_countdown_remaining,
)
from app.models.session import Session
from app.utils.time_utils import now_cst


class TestPauseResume:
    """Test pause and resume logic."""

    def test_pause_sets_status(self, db):
        """Pausing should set status to 'paused' and record paused_at."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=10),
            status="active",
        )
        db.add(session)
        db.flush()

        pause_session(db, session)
        assert session.status == "paused"
        assert session.paused_at is not None

    def test_resume_calculates_paused_time(self, db):
        """Resuming should accumulate paused seconds."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=20),
            paused_at=now - timedelta(minutes=5),
            total_paused=0,
            status="paused",
        )
        db.add(session)
        db.flush()

        resume_session(db, session)
        assert session.status == "active"
        assert session.paused_at is None
        # Should have ~5 minutes (300 seconds) of paused time
        assert session.total_paused >= 290  # allow small timing误差

    def test_cannot_pause_non_active(self, db):
        """Should raise error if session is not active."""
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now_cst(), status="paused",
        )
        db.add(session)
        db.flush()

        with pytest.raises(ValueError, match="not active"):
            pause_session(db, session)


class TestEndSession:
    """Test session ending logic."""

    def test_end_sets_status_and_time(self, db):
        """Ending should set status='ended' and record end_time."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            status="active",
        )
        db.add(session)
        db.flush()

        end_session(db, session)
        assert session.status == "ended"
        assert session.end_time is not None

    def test_end_paused_session(self, db):
        """Ending a paused session should accumulate final pause time."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            paused_at=now - timedelta(minutes=5),
            total_paused=0,
            status="paused",
        )
        db.add(session)
        db.flush()

        end_session(db, session)
        assert session.status == "ended"
        assert session.total_paused >= 290  # ~5 min accumulated


class TestElapsedSeconds:
    """Test elapsed time calculation."""

    def test_active_session(self, db):
        """Active session: elapsed = now - start - paused."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            total_paused=300,  # 5 min paused
            status="active",
        )
        elapsed = get_elapsed_seconds(session, now)
        # 30 min - 5 min = 25 min = 1500 sec
        assert abs(elapsed - 1500) < 5

    def test_paused_session(self, db):
        """Paused session: should exclude current pause period."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            paused_at=now - timedelta(minutes=5),
            total_paused=0,
            status="paused",
        )
        elapsed = get_elapsed_seconds(session, now)
        # 30 min - 5 min current pause = 25 min = 1500 sec
        assert abs(elapsed - 1500) < 5

    def test_ended_session(self, db):
        """Ended session: elapsed = end - start - paused."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            end_time=now - timedelta(minutes=5),
            total_paused=120,  # 2 min paused
            status="ended",
        )
        elapsed = get_elapsed_seconds(session, now)
        # 25 min - 2 min = 23 min = 1380 sec
        assert abs(elapsed - 1380) < 5


class TestCountdownRemaining:
    """Test countdown timer logic."""

    def test_countdown_active(self, db):
        """Active countdown: remaining = limit - elapsed."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="countdown",
            start_time=now - timedelta(minutes=30),
            duration_limit=60.0,  # 60 min prepaid
            total_paused=0,
            status="active",
        )
        remaining = get_countdown_remaining(session, now)
        # 60 min - 30 min = 30 min = 1800 sec
        assert abs(remaining - 1800) < 5

    def test_countdown_expired(self, db):
        """Expired countdown: remaining = 0."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="countdown",
            start_time=now - timedelta(minutes=90),
            duration_limit=60.0,
            total_paused=0,
            status="active",
        )
        remaining = get_countdown_remaining(session, now)
        assert remaining == 0

    def test_countup_returns_zero(self, db):
        """Count-up mode: remaining should be 0."""
        now = now_cst()
        session = Session(
            console_id=1, billing_mode="count_up",
            start_time=now - timedelta(minutes=30),
            status="active",
        )
        remaining = get_countdown_remaining(session, now)
        assert remaining == 0

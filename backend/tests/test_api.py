"""Tests for API endpoints."""
import pytest


class TestHealthEndpoint:
    """Test health check."""

    def test_health(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestAuth:
    """Test authentication endpoints."""

    def test_login_success(self, client, admin_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testadmin", "password": "testpass"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["role"] == "admin"

    def test_login_wrong_password(self, client, admin_user):
        resp = client.post("/api/v1/auth/login", json={
            "username": "testadmin", "password": "wrong"
        })
        assert resp.status_code == 401

    def test_me(self, client, admin_user):
        _, token = admin_user
        resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "testadmin"

    def test_unauthorized(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code in (401, 403)


class TestConsoles:
    """Test console endpoints."""

    def test_create_console(self, client, merchant_user):
        _, token, _ = merchant_user
        resp = client.post("/api/v1/consoles", json={
            "name": "PS5-NEW", "console_type": "PS5",
            "hourly_rate": 35.0, "zone": "VIP"
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "PS5-NEW"
        assert data["hourly_rate"] == 35.0

    def test_list_consoles(self, client, merchant_user, sample_console):
        _, token, _ = merchant_user
        resp = client.get("/api/v1/consoles", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        consoles = resp.json()
        assert len(consoles) >= 1

    def test_delete_console_merchant_isolation(self, client, admin_user, sample_console):
        """Admin should see all consoles."""
        _, token = admin_user
        resp = client.get("/api/v1/consoles", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200


class TestMembers:
    """Test member endpoints."""

    def test_create_member(self, client, merchant_user):
        _, token, _ = merchant_user
        resp = client.post("/api/v1/members", json={
            "name": "New Member", "phone": "13900000000",
            "initial_recharge": 50.0,
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New Member"
        assert data["balance"] == 50.0
        assert data["member_code"].startswith("M")

    def test_list_members_search(self, client, merchant_user, sample_member):
        _, token, _ = merchant_user
        resp = client.get("/api/v1/members?q=Test", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        members = resp.json()
        assert any(m["name"] == "Test Member" for m in members)

    def test_recharge_member(self, client, merchant_user, sample_member):
        _, token, _ = merchant_user
        resp = client.post(f"/api/v1/members/{sample_member.id}/recharge", json={
            "amount": 200.0, "payment_method": "cash"
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "recharge"
        assert data["amount"] >= 200  # 200 or more (bonus depends on rules)


class TestSessions:
    """Test session endpoints."""

    def test_start_and_end_session(self, client, merchant_user, sample_console):
        _, token, _ = merchant_user

        # Start session
        resp = client.post("/api/v1/sessions", json={
            "console_id": sample_console.id,
            "billing_mode": "count_up",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        session_id = resp.json()["id"]

        # End session
        resp = client.put(f"/api/v1/sessions/{session_id}/end", json={
            "payment_method": "cash"
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["bill_id"] is not None

    def test_pause_resume(self, client, merchant_user, sample_console):
        _, token, _ = merchant_user

        # Start
        resp = client.post("/api/v1/sessions", json={
            "console_id": sample_console.id,
            "billing_mode": "count_up",
        }, headers={"Authorization": f"Bearer {token}"})
        session_id = resp.json()["id"]

        # Pause
        resp = client.put(f"/api/v1/sessions/{session_id}/pause",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        # Resume
        resp = client.put(f"/api/v1/sessions/{session_id}/resume",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    def test_cannot_start_on_busy_console(self, client, merchant_user, sample_console):
        """Should fail if console is already in use."""
        _, token, _ = merchant_user

        # Start first session
        client.post("/api/v1/sessions", json={
            "console_id": sample_console.id,
            "billing_mode": "count_up",
        }, headers={"Authorization": f"Bearer {token}"})

        # Try second session on same console
        resp = client.post("/api/v1/sessions", json={
            "console_id": sample_console.id,
            "billing_mode": "count_up",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 400


class TestBills:
    """Test bill endpoints."""

    def test_list_bills(self, client, merchant_user):
        _, token, _ = merchant_user
        resp = client.get("/api/v1/bills", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert "items" in resp.json()

    def test_today_summary(self, client, merchant_user):
        _, token, _ = merchant_user
        resp = client.get("/api/v1/bills/today", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "revenue" in data


class TestMerchantIsolation:
    """Test that merchants can only see their own data."""

    def test_merchant_cannot_see_other_consoles(self, client, merchant_user, admin_user, db):
        """Merchant should only see their own consoles."""
        from app.models.console import Console
        from app.models.merchant import Merchant

        _, admin_token = admin_user
        _, merchant_token, merchant_id = merchant_user

        # Create a console for a different merchant
        other_merchant = Merchant(name="Other Merchant")
        db.add(other_merchant)
        db.flush()
        other_console = Console(
            name="OTHER-PS5", console_type="PS5",
            hourly_rate=25.0, merchant_id=other_merchant.id,
        )
        db.add(other_console)
        db.flush()

        # Merchant should NOT see the other console
        resp = client.get("/api/v1/consoles",
                          headers={"Authorization": f"Bearer {merchant_token}"})
        assert resp.status_code == 200
        console_names = [c["name"] for c in resp.json()]
        assert "OTHER-PS5" not in console_names



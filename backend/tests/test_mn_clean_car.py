"""End-to-end backend tests for M&N Clean Car API."""
import os
import time
import uuid
import pytest
import requests
from datetime import date, timedelta

from conftest import auth

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://language-helper-82.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

# Use a future date to avoid clashes with existing bookings
FUTURE_DATE = (date.today() + timedelta(days=30)).isoformat()
HOUR = 14


# ---- Auth ----
class TestAuth:
    def test_register_new_client(self, api_client):
        phone = "TEST" + str(int(time.time()))[-7:]
        r = api_client.post(f"{API}/auth/register", json={"phone": phone, "password": "test1234", "name": "Test User"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and d["user"]["phone"] == phone
        assert d["user"]["role"] == "client"
        # cleanup
        from pymongo import MongoClient
        try:
            mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            mc[os.environ.get("DB_NAME", "test_database")].users.delete_one({"phone": phone})
        except Exception:
            pass

    def test_login_admin(self, api_client, admin_token):
        assert admin_token

    def test_login_client(self, api_client, client_token):
        assert client_token

    def test_login_wrong_password(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"phone": "8717958646", "password": "wrong"})
        assert r.status_code == 401

    def test_me_admin(self, api_client, admin_token):
        r = api_client.get(f"{API}/auth/me", headers=auth(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_no_token(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---- Services ----
class TestServices:
    def test_client_sees_only_active(self, api_client, client_token):
        r = api_client.get(f"{API}/services", headers=auth(client_token))
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 3
        assert all(s.get("active") for s in items)

    def test_admin_sees_all(self, api_client, admin_token):
        r = api_client.get(f"{API}/services", headers=auth(admin_token))
        assert r.status_code == 200

    def test_admin_crud_service(self, api_client, admin_token):
        r = api_client.post(f"{API}/services", headers=auth(admin_token),
                            json={"name": "TEST_Service", "price": 50, "includes": ["a"], "active": True})
        assert r.status_code == 200
        sid = r.json()["id"]
        # Update
        r2 = api_client.put(f"{API}/services/{sid}", headers=auth(admin_token),
                            json={"name": "TEST_Service2", "price": 60, "includes": ["b"], "active": True})
        assert r2.status_code == 200 and r2.json()["price"] == 60
        # Delete
        r3 = api_client.delete(f"{API}/services/{sid}", headers=auth(admin_token))
        assert r3.status_code == 200

    def test_client_cannot_create_service(self, api_client, client_token):
        r = api_client.post(f"{API}/services", headers=auth(client_token),
                            json={"name": "X", "price": 1, "includes": []})
        assert r.status_code == 403


# ---- Bookings ----
class TestBookings:
    @pytest.fixture(scope="class")
    def created_ids(self):
        return []

    def test_availability_returns_13_slots(self, api_client, client_token):
        r = api_client.get(f"{API}/bookings/availability?date={FUTURE_DATE}", headers=auth(client_token))
        assert r.status_code == 200
        d = r.json()
        assert len(d["slots"]) == 13
        assert d["slots"][0]["hour"] == 7 and d["slots"][-1]["hour"] == 19
        assert d["capacity"] == 2

    def test_full_booking_flow(self, api_client, client_token, admin_token, created_ids):
        # Get an active service
        rs = api_client.get(f"{API}/services", headers=auth(client_token))
        svc = rs.json()[0]

        # Booking 1
        b1 = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": HOUR,
            "vehicle_type": "Sedán", "address": "Calle 123",
        })
        assert b1.status_code == 200, b1.text
        created_ids.append(b1.json()["id"])
        assert b1.json()["status"] == "pending"
        assert b1.json()["final_price"] == svc["price"]

        # Booking 2 same hour -> remaining=0
        b2 = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": HOUR,
            "vehicle_type": "SUV", "address": "Calle 456",
        })
        assert b2.status_code == 200
        created_ids.append(b2.json()["id"])

        # Availability now hides slot
        rav = api_client.get(f"{API}/bookings/availability?date={FUTURE_DATE}", headers=auth(client_token))
        slot = next(s for s in rav.json()["slots"] if s["hour"] == HOUR)
        assert slot["remaining"] == 0 and slot["available"] is False

        # Booking 3 -> rejected
        b3 = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": HOUR,
            "vehicle_type": "Pickup", "address": "Calle 789",
        })
        assert b3.status_code == 400
        assert "no está disponible" in b3.json().get("detail", "")

        # /bookings/me
        rme = api_client.get(f"{API}/bookings/me", headers=auth(client_token))
        assert rme.status_code == 200
        assert any(x["id"] == created_ids[0] for x in rme.json())

        # admin list with status filter
        ral = api_client.get(f"{API}/bookings?status=pending", headers=auth(admin_token))
        assert ral.status_code == 200
        assert all(x["status"] == "pending" for x in ral.json())

        # admin confirm + complete
        bid = created_ids[0]
        rc = api_client.patch(f"{API}/bookings/{bid}/status", headers=auth(admin_token),
                              json={"status": "confirmed"})
        assert rc.status_code == 200

        # Get service completed_count BEFORE
        before = next(s for s in api_client.get(f"{API}/services", headers=auth(admin_token)).json() if s["id"] == svc["id"])
        cb = before.get("completed_count", 0)

        rcomp = api_client.patch(f"{API}/bookings/{bid}/status", headers=auth(admin_token),
                                 json={"status": "completed"})
        assert rcomp.status_code == 200
        after = next(s for s in api_client.get(f"{API}/services", headers=auth(admin_token)).json() if s["id"] == svc["id"])
        assert after["completed_count"] == cb + 1

        # reject second
        rr = api_client.patch(f"{API}/bookings/{created_ids[1]}/status", headers=auth(admin_token),
                              json={"status": "rejected"})
        assert rr.status_code == 200

    def test_client_cannot_admin_list(self, api_client, client_token):
        r = api_client.get(f"{API}/bookings", headers=auth(client_token))
        assert r.status_code == 403


# ---- Coupons ----
class TestCoupons:
    def test_create_coupon_with_whatsapp(self, api_client, admin_token):
        code = "TEST" + uuid.uuid4().hex[:6].upper()
        r = api_client.post(f"{API}/coupons", headers=auth(admin_token), json={
            "code": code, "type": "discount_percent", "value": 20,
            "assigned_to_phone": "8711111111", "note": "Prueba"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"] == code
        assert "whatsapp_url" in d and "wa.me/521" in d["whatsapp_url"]

    def test_my_coupons_returns_assigned(self, api_client, admin_token, client_token):
        code = "TEST" + uuid.uuid4().hex[:6].upper()
        api_client.post(f"{API}/coupons", headers=auth(admin_token), json={
            "code": code, "type": "discount_amount", "value": 30,
            "assigned_to_phone": "8711111111"
        })
        r = api_client.get(f"{API}/coupons/me", headers=auth(client_token))
        assert r.status_code == 200
        assert any(c["code"] == code for c in r.json())

    def test_use_coupon_percent_in_booking(self, api_client, admin_token, client_token):
        code = "PCT" + uuid.uuid4().hex[:6].upper()
        api_client.post(f"{API}/coupons", headers=auth(admin_token), json={
            "code": code, "type": "discount_percent", "value": 50,
            "assigned_to_phone": "8711111111"
        })
        svc = api_client.get(f"{API}/services", headers=auth(client_token)).json()[0]
        r = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": 8,
            "vehicle_type": "Sedán", "address": "X", "coupon_code": code,
        })
        assert r.status_code == 200, r.text
        assert r.json()["final_price"] == round(svc["price"] * 0.5, 2)

    def test_use_coupon_amount_in_booking(self, api_client, admin_token, client_token):
        code = "AMT" + uuid.uuid4().hex[:6].upper()
        api_client.post(f"{API}/coupons", headers=auth(admin_token), json={
            "code": code, "type": "discount_amount", "value": 25,
            "assigned_to_phone": "8711111111"
        })
        svc = api_client.get(f"{API}/services", headers=auth(client_token)).json()[0]
        r = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": 9,
            "vehicle_type": "Sedán", "address": "X", "coupon_code": code,
        })
        assert r.status_code == 200
        assert r.json()["final_price"] == max(0, svc["price"] - 25)

    def test_use_coupon_free(self, api_client, admin_token, client_token):
        code = "FREE" + uuid.uuid4().hex[:6].upper()
        api_client.post(f"{API}/coupons", headers=auth(admin_token), json={
            "code": code, "type": "free_service", "value": 0,
            "assigned_to_phone": "8711111111"
        })
        svc = api_client.get(f"{API}/services", headers=auth(client_token)).json()[0]
        r = api_client.post(f"{API}/bookings", headers=auth(client_token), json={
            "service_id": svc["id"], "date": FUTURE_DATE, "hour": 10,
            "vehicle_type": "Sedán", "address": "X", "coupon_code": code,
        })
        assert r.status_code == 200
        assert r.json()["final_price"] == 0


# ---- Expenses ----
class TestExpenses:
    def test_admin_crud_expense(self, api_client, admin_token):
        r = api_client.post(f"{API}/expenses", headers=auth(admin_token), json={
            "product_name": "TEST_Product", "cost": 99, "quantity": "1 lt",
            "services_yield": 40, "category": "producto"
        })
        assert r.status_code == 200
        eid = r.json()["id"]
        rl = api_client.get(f"{API}/expenses", headers=auth(admin_token))
        assert any(e["id"] == eid for e in rl.json())
        rd = api_client.delete(f"{API}/expenses/{eid}", headers=auth(admin_token))
        assert rd.status_code == 200

    def test_client_cannot_list_expenses(self, api_client, client_token):
        r = api_client.get(f"{API}/expenses", headers=auth(client_token))
        assert r.status_code == 403


# ---- Dashboard ----
class TestDashboard:
    def test_admin_dashboard(self, api_client, admin_token):
        r = api_client.get(f"{API}/admin/dashboard", headers=auth(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("income_total", "expense_total", "net", "services", "inventory", "completed", "pending"):
            assert k in d
        assert isinstance(d["inventory"], list)
        if d["inventory"]:
            assert "services_until_restock" in d["inventory"][0]

    def test_client_cannot_dashboard(self, api_client, client_token):
        r = api_client.get(f"{API}/admin/dashboard", headers=auth(client_token))
        assert r.status_code == 403

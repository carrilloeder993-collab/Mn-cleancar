"""Iteration 2 tests: Push token + Loyalty program (loyalty_full coupon)."""
import os
import time
import uuid
import pytest
import requests
from datetime import date, timedelta
from pymongo import MongoClient

from conftest import auth, BASE_URL

API = f"{BASE_URL}/api"
FUTURE_DATE = (date.today() + timedelta(days=45)).isoformat()


def _mongo():
    return MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[
        os.environ.get("DB_NAME", "mn_clean_car")
    ]


# ---- 1) Push token endpoint ----
class TestPushToken:
    def test_save_push_token_persists(self, api_client, client_token):
        token_value = "ExponentPushToken[TEST_" + uuid.uuid4().hex[:10] + "]"
        r = api_client.post(
            f"{API}/users/push-token",
            headers=auth(client_token),
            json={"push_token": token_value},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify persisted in DB
        u = _mongo().users.find_one({"phone": "8711111111"}, {"_id": 0})
        assert u and u.get("push_token") == token_value

    def test_push_token_requires_auth(self, api_client):
        r = api_client.post(f"{API}/users/push-token", json={"push_token": "x"})
        assert r.status_code == 401

    def test_me_does_not_return_password_hash(self, api_client, client_token):
        r = api_client.get(f"{API}/auth/me", headers=auth(client_token))
        assert r.status_code == 200
        d = r.json()
        assert "password_hash" not in d
        # push_token CAN be present (it is allowed per spec)
        assert d["phone"] == "8711111111"


# ---- 2) loyalty_full coupon type ----
class TestLoyaltyCouponType:
    def test_create_loyalty_full_coupon_accepted(self, api_client, admin_token):
        code = "LFTEST" + uuid.uuid4().hex[:6].upper()
        r = api_client.post(
            f"{API}/coupons",
            headers=auth(admin_token),
            json={
                "code": code,
                "type": "loyalty_full",
                "value": 100,
                "assigned_to_phone": "8711111111",
                "note": "Loyalty test",
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "loyalty_full" and d["value"] == 100
        assert "wa.me/521" in d.get("whatsapp_url", "")

    def test_invalid_coupon_type_rejected(self, api_client, admin_token):
        code = "BADTYPE" + uuid.uuid4().hex[:6].upper()
        r = api_client.post(
            f"{API}/coupons",
            headers=auth(admin_token),
            json={"code": code, "type": "weird_type", "value": 1},
        )
        assert r.status_code == 400

    def test_loyalty_full_only_applies_to_limpieza_completa(
        self, api_client, admin_token, client_token
    ):
        # Get services
        services = api_client.get(f"{API}/services", headers=auth(client_token)).json()
        completa = next(s for s in services if "completa" in s["name"].lower())
        otro = next(s for s in services if "completa" not in s["name"].lower())

        # Create loyalty coupon
        code = "LF" + uuid.uuid4().hex[:6].upper()
        r = api_client.post(
            f"{API}/coupons",
            headers=auth(admin_token),
            json={
                "code": code,
                "type": "loyalty_full",
                "value": 100,
                "assigned_to_phone": "8711111111",
            },
        )
        assert r.status_code == 200

        # Use on non-completa -> should fail with specific message
        bad = api_client.post(
            f"{API}/bookings",
            headers=auth(client_token),
            json={
                "service_id": otro["id"],
                "date": FUTURE_DATE,
                "hour": 11,
                "vehicle_type": "Sedán",
                "address": "Calle Loyalty",
                "coupon_code": code,
            },
        )
        assert bad.status_code == 400
        assert "Limpieza completa" in bad.json().get("detail", "")

        # Confirm coupon was NOT marked used
        coup = _mongo().coupons.find_one({"code": code}, {"_id": 0})
        assert coup and coup.get("used") is False

        # Use on Limpieza completa -> success, final_price=100
        ok = api_client.post(
            f"{API}/bookings",
            headers=auth(client_token),
            json={
                "service_id": completa["id"],
                "date": FUTURE_DATE,
                "hour": 12,
                "vehicle_type": "Sedán",
                "address": "Calle Loyalty 2",
                "coupon_code": code,
            },
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["final_price"] == 100
        assert ok.json()["coupon_code"] == code

        # Cleanup booking + coupon
        bid = ok.json()["id"]
        _mongo().bookings.delete_one({"id": bid})
        _mongo().coupons.delete_one({"code": code})


# ---- 3) Loyalty program: 5 completed -> coupon awarded ----
class TestLoyaltyProgram:
    def test_award_loyalty_after_five_completed(self, api_client, admin_token):
        """Create a fresh test user, seed 4 completed bookings directly,
        then use the API to complete the 5th and assert loyalty_coupon is returned."""
        mongo = _mongo()

        # Register a brand-new client (phone reused, login)
        phone = "TST" + str(int(time.time()))[-7:]
        reg = api_client.post(
            f"{API}/auth/register",
            json={"phone": phone, "password": "loyal123", "name": "Loyal Tester"},
        )
        assert reg.status_code == 200, reg.text
        token = reg.json()["token"]
        user_id = reg.json()["user"]["id"]

        # Pick a service (completa to make economy realistic)
        services = api_client.get(f"{API}/services", headers=auth(token)).json()
        svc = next(s for s in services if "completa" in s["name"].lower())

        # Insert 4 already-completed bookings directly in DB to avoid date/capacity collisions
        seed_ids = []
        for i in range(4):
            bid = str(uuid.uuid4())
            seed_ids.append(bid)
            mongo.bookings.insert_one({
                "id": bid,
                "user_id": user_id,
                "user_name": "Loyal Tester",
                "user_phone": phone,
                "service_id": svc["id"],
                "service_name": svc["name"],
                "service_price": svc["price"],
                "final_price": svc["price"],
                "date": (date.today() - timedelta(days=20 + i)).isoformat(),
                "hour": 10,
                "vehicle_type": "Sedán",
                "address": "Seed",
                "coupon_code": None,
                "status": "completed",
                "created_at": "2025-01-01T00:00:00+00:00",
            })

        # Create the 5th booking via API (must be via /bookings to be valid)
        b = api_client.post(
            f"{API}/bookings",
            headers=auth(token),
            json={
                "service_id": svc["id"],
                "date": FUTURE_DATE,
                "hour": 13,
                "vehicle_type": "Sedán",
                "address": "Calle Loyalty Test",
            },
        )
        assert b.status_code == 200, b.text
        bid5 = b.json()["id"]

        # Admin confirms then completes the 5th booking
        rc = api_client.patch(
            f"{API}/bookings/{bid5}/status",
            headers=auth(admin_token),
            json={"status": "confirmed"},
        )
        assert rc.status_code == 200

        rcomp = api_client.patch(
            f"{API}/bookings/{bid5}/status",
            headers=auth(admin_token),
            json={"status": "completed"},
        )
        assert rcomp.status_code == 200, rcomp.text
        body = rcomp.json()
        assert body.get("status") == "completed"
        loyalty_code = body.get("loyalty_coupon")
        assert loyalty_code, f"Expected loyalty_coupon, got {body}"
        assert loyalty_code.startswith("LEALTAD-")

        # Verify coupon exists in DB with right shape
        coup = mongo.coupons.find_one({"code": loyalty_code}, {"_id": 0})
        assert coup is not None
        assert coup["type"] == "loyalty_full"
        assert coup["value"] == 100
        assert coup["is_loyalty"] is True
        assert coup["assigned_to_phone"] == phone
        assert coup["used"] is False

        # /coupons/me returns it
        rme = api_client.get(f"{API}/coupons/me", headers=auth(token))
        assert rme.status_code == 200
        assert any(c["code"] == loyalty_code for c in rme.json())

        # Cleanup
        mongo.bookings.delete_many({"user_id": user_id})
        mongo.coupons.delete_many({"assigned_to_phone": phone})
        mongo.users.delete_one({"id": user_id})

    def test_no_loyalty_below_threshold(self, api_client, admin_token):
        """1 completed booking should NOT trigger loyalty (count not multiple of 5)."""
        mongo = _mongo()
        phone = "TST" + str(int(time.time()))[-7:] + "B"
        reg = api_client.post(
            f"{API}/auth/register",
            json={"phone": phone, "password": "loyal123", "name": "Solo One"},
        )
        assert reg.status_code == 200
        token = reg.json()["token"]
        user_id = reg.json()["user"]["id"]

        services = api_client.get(f"{API}/services", headers=auth(token)).json()
        svc = services[0]

        b = api_client.post(
            f"{API}/bookings",
            headers=auth(token),
            json={
                "service_id": svc["id"],
                "date": FUTURE_DATE,
                "hour": 15,
                "vehicle_type": "Sedán",
                "address": "Solo",
            },
        )
        assert b.status_code == 200
        bid = b.json()["id"]

        api_client.patch(
            f"{API}/bookings/{bid}/status",
            headers=auth(admin_token),
            json={"status": "confirmed"},
        )
        r = api_client.patch(
            f"{API}/bookings/{bid}/status",
            headers=auth(admin_token),
            json={"status": "completed"},
        )
        assert r.status_code == 200
        assert r.json().get("loyalty_coupon") in (None, "")

        mongo.bookings.delete_many({"user_id": user_id})
        mongo.users.delete_one({"id": user_id})


# ---- 4) Regression checks for existing flows ----
class TestRegression:
    def test_admin_seed_credentials(self, api_client):
        r = api_client.post(
            f"{API}/auth/login", json={"phone": "8717958646", "password": "admin123"}
        )
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_client_seed_credentials(self, api_client):
        r = api_client.post(
            f"{API}/auth/login", json={"phone": "8711111111", "password": "cliente123"}
        )
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "client"

    def test_existing_coupon_types_still_work(self, api_client, admin_token):
        for ctype, val in [
            ("discount_percent", 10),
            ("discount_amount", 25),
            ("free_service", 0),
        ]:
            code = ctype[:3].upper() + uuid.uuid4().hex[:6].upper()
            r = api_client.post(
                f"{API}/coupons",
                headers=auth(admin_token),
                json={"code": code, "type": ctype, "value": val},
            )
            assert r.status_code == 200, f"{ctype} failed: {r.text}"
            _mongo().coupons.delete_one({"code": code})

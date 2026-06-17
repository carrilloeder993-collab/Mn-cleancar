"""
Iteration 3 backend tests: POST /api/coupons/validate (pre-booking inline coupon validation).

Covers:
- 401 when no auth
- non-existent code -> {valid: false, message: 'Cupón no encontrado'}
- discount_percent (10%) on 'Limpieza completa' ($150) -> valid, base=150, final=135, savings=15
- loyalty_full on a non-'completa' service -> valid:false 'Este cupón solo aplica a Limpieza completa'
- coupon assigned to other phone -> valid:false 'Este cupón no es para tu cuenta'
- coupon already used -> valid:false 'Este cupón ya fue usado'

Uses TEST-V3-* codes so it does not collide with existing seeded/loyalty coupons.
"""
import os
import time
import uuid
import pytest
import requests

from conftest import auth, BASE_URL


# --------- helpers ---------

def _get_service_by_name_substring(api_client, admin_token, substr):
    r = api_client.get(f"{BASE_URL}/api/services", headers=auth(admin_token))
    assert r.status_code == 200, r.text
    items = r.json()
    matches = [s for s in items if substr.lower() in s["name"].lower() and s.get("active", True)]
    assert matches, f"No active service matching '{substr}': {[s['name'] for s in items]}"
    return matches[0]


def _create_coupon(api_client, admin_token, payload):
    r = api_client.post(f"{BASE_URL}/api/coupons", headers=auth(admin_token), json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def _delete_coupon(api_client, admin_token, coupon_id):
    api_client.delete(f"{BASE_URL}/api/coupons/{coupon_id}", headers=auth(admin_token))


# --------- fixtures ---------

@pytest.fixture(scope="module")
def services(api_client, admin_token):
    full = _get_service_by_name_substring(api_client, admin_token, "completa")
    exterior = _get_service_by_name_substring(api_client, admin_token, "exterior")
    return {"full": full, "exterior": exterior}


@pytest.fixture(scope="module")
def client_phone(api_client, client_token):
    r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth(client_token))
    assert r.status_code == 200
    return r.json()["phone"]


# --------- module: auth ---------

class TestCouponValidateAuth:
    def test_validate_requires_bearer(self, api_client, services):
        r = api_client.post(
            f"{BASE_URL}/api/coupons/validate",
            json={"code": "ANY", "service_id": services["full"]["id"]},
        )
        assert r.status_code == 401, r.text
        assert "auten" in r.json().get("detail", "").lower()


# --------- module: not found ---------

class TestCouponValidateNotFound:
    def test_validate_nonexistent_code(self, api_client, client_token, services):
        r = api_client.post(
            f"{BASE_URL}/api/coupons/validate",
            headers=auth(client_token),
            json={"code": "TEST-V3-NOPE-" + uuid.uuid4().hex[:6].upper(),
                  "service_id": services["full"]["id"]},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is False
        assert body["message"] == "Cupón no encontrado"


# --------- module: discount_percent happy path ---------

class TestCouponValidateDiscountPercent:
    def test_10_percent_on_limpieza_completa(self, api_client, admin_token, client_token, services, client_phone):
        code = f"TEST-V3-PCT-{uuid.uuid4().hex[:5].upper()}"
        coupon = _create_coupon(api_client, admin_token, {
            "code": code,
            "type": "discount_percent",
            "value": 10,
            "assigned_to_phone": client_phone,
            "note": "iter3 pct test",
        })
        try:
            r = api_client.post(
                f"{BASE_URL}/api/coupons/validate",
                headers=auth(client_token),
                json={"code": code, "service_id": services["full"]["id"]},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["valid"] is True, body
            assert body["base_price"] == 150
            assert body["final_price"] == 135
            assert body["savings"] == 15
            assert "10" in body["message"]
            # Validate is read-only: the coupon must NOT be marked used
            r2 = api_client.get(f"{BASE_URL}/api/coupons/me", headers=auth(client_token))
            assert r2.status_code == 200
            assert any(c["code"] == code and c["used"] is False for c in r2.json())
        finally:
            _delete_coupon(api_client, admin_token, coupon["id"])


# --------- module: loyalty_full restriction ---------

class TestCouponValidateLoyaltyOnly:
    def test_loyalty_full_rejects_non_completa(self, api_client, admin_token, client_token, services, client_phone):
        code = f"TEST-V3-LOY-{uuid.uuid4().hex[:5].upper()}"
        coupon = _create_coupon(api_client, admin_token, {
            "code": code,
            "type": "loyalty_full",
            "value": 100,
            "assigned_to_phone": client_phone,
            "note": "iter3 loyalty test",
        })
        try:
            r = api_client.post(
                f"{BASE_URL}/api/coupons/validate",
                headers=auth(client_token),
                json={"code": code, "service_id": services["exterior"]["id"]},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["valid"] is False
            assert body["message"] == "Este cupón solo aplica a Limpieza completa"

            # And it WORKS on Limpieza completa (sanity)
            r2 = api_client.post(
                f"{BASE_URL}/api/coupons/validate",
                headers=auth(client_token),
                json={"code": code, "service_id": services["full"]["id"]},
            )
            assert r2.status_code == 200
            body2 = r2.json()
            assert body2["valid"] is True
            assert body2["final_price"] == 100
            assert body2["base_price"] == 150
            assert body2["savings"] == 50
        finally:
            _delete_coupon(api_client, admin_token, coupon["id"])


# --------- module: assigned to other phone ---------

class TestCouponValidateAssignment:
    def test_coupon_assigned_to_other_phone(self, api_client, admin_token, client_token, services):
        # Assigned to admin phone, but validating as client
        code = f"TEST-V3-OTH-{uuid.uuid4().hex[:5].upper()}"
        coupon = _create_coupon(api_client, admin_token, {
            "code": code,
            "type": "discount_percent",
            "value": 20,
            "assigned_to_phone": "8717958646",  # admin phone (not the client)
            "note": "iter3 other phone",
        })
        try:
            r = api_client.post(
                f"{BASE_URL}/api/coupons/validate",
                headers=auth(client_token),
                json={"code": code, "service_id": services["full"]["id"]},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["valid"] is False
            assert body["message"] == "Este cupón no es para tu cuenta"
        finally:
            _delete_coupon(api_client, admin_token, coupon["id"])


# --------- module: already used ---------

class TestCouponValidateUsed:
    def test_already_used_coupon(self, api_client, admin_token, client_token, services, client_phone):
        # Create unassigned coupon (or assigned to client) and consume it via a booking
        code = f"TEST-V3-USED-{uuid.uuid4().hex[:5].upper()}"
        coupon = _create_coupon(api_client, admin_token, {
            "code": code,
            "type": "discount_percent",
            "value": 10,
            "assigned_to_phone": client_phone,
            "note": "iter3 used test",
        })
        booking_id = None
        try:
            # Use it by creating a booking (any future date, hour 7..19)
            booking_payload = {
                "service_id": services["full"]["id"],
                "date": "2099-12-31",
                "hour": 7,
                "vehicle_type": "Sedán",
                "address": "TEST address iter3",
                "coupon_code": code,
            }
            rb = api_client.post(f"{BASE_URL}/api/bookings", headers=auth(client_token), json=booking_payload)
            # If the slot is somehow full, retry on hour 8/9
            for hr in (8, 9, 10, 11):
                if rb.status_code == 200:
                    break
                booking_payload["hour"] = hr
                rb = api_client.post(f"{BASE_URL}/api/bookings", headers=auth(client_token), json=booking_payload)
            assert rb.status_code == 200, rb.text
            booking_id = rb.json()["id"]

            # Now validate the same coupon again -> must report 'already used'
            r = api_client.post(
                f"{BASE_URL}/api/coupons/validate",
                headers=auth(client_token),
                json={"code": code, "service_id": services["full"]["id"]},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["valid"] is False
            assert body["message"] == "Este cupón ya fue usado"
        finally:
            # cleanup booking via Mongo not available here; use admin reject to free slot; coupon delete still works
            if booking_id:
                api_client.patch(
                    f"{BASE_URL}/api/bookings/{booking_id}/status",
                    headers=auth(admin_token),
                    json={"status": "rejected"},
                )
            _delete_coupon(api_client, admin_token, coupon["id"])


# --------- module: regression smoke (quick) ---------

class TestRegressionSmoke:
    def test_admin_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"phone": "8717958646", "password": "admin123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_client_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"phone": "8711111111", "password": "cliente123"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "client"

    def test_services_list_for_client(self, api_client, client_token):
        r = api_client.get(f"{BASE_URL}/api/services", headers=auth(client_token))
        assert r.status_code == 200
        names = [s["name"] for s in r.json()]
        assert any("completa" in n.lower() for n in names)
        assert any("exterior" in n.lower() for n in names)
        # client must only see active services
        assert all(s.get("active", True) for s in r.json())

    def test_admin_dashboard(self, api_client, admin_token):
        r = api_client.get(f"{BASE_URL}/api/admin/dashboard", headers=auth(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_bookings", "pending", "confirmed", "completed",
                  "income_total", "expense_total", "net", "services", "inventory"):
            assert k in d, f"missing dashboard key: {k}"

    def test_coupons_crud(self, api_client, admin_token):
        code = f"TEST-V3-CRUD-{uuid.uuid4().hex[:5].upper()}"
        r = api_client.post(f"{BASE_URL}/api/coupons", headers=auth(admin_token),
                            json={"code": code, "type": "discount_amount", "value": 25})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        r = api_client.get(f"{BASE_URL}/api/coupons", headers=auth(admin_token))
        assert any(c["code"] == code for c in r.json())
        r = api_client.delete(f"{BASE_URL}/api/coupons/{cid}", headers=auth(admin_token))
        assert r.status_code == 200

    def test_push_token_endpoint(self, api_client, client_token):
        r = api_client.post(f"{BASE_URL}/api/users/push-token", headers=auth(client_token),
                            json={"push_token": "ExponentPushToken[TEST-V3-xxxxxx]"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_availability(self, api_client, client_token):
        r = api_client.get(f"{BASE_URL}/api/bookings/availability?date=2099-12-31",
                           headers=auth(client_token))
        assert r.status_code == 200
        data = r.json()
        assert data["capacity"] == 2
        assert len(data["slots"]) == 13  # 7..19 inclusive

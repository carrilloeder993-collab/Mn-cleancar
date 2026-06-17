from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import asyncio
import secrets
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

MX_TZ = ZoneInfo("America/Monterrey")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ADMIN_PHONE = os.environ.get("ADMIN_PHONE", "8717958646")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
CALLMEBOT_API_KEY = os.environ.get("CALLMEBOT_API_KEY", "")
CALLMEBOT_PHONE = os.environ.get("CALLMEBOT_PHONE", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="M&N Clean Car API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mn-clean-car")

# ---- Slot grid: 7:00 to 21:40, every 20 minutes ----
SLOT_START_MIN = 7 * 60          # 420
SLOT_LAST_MIN = 21 * 60 + 40     # 1300
SLOT_STEP_MIN = 20
SLOT_CAPACITY = 2                # 2 workers
DAY_END_MIN = 22 * 60            # services cannot end after 10pm

SLOT_GRID = list(range(SLOT_START_MIN, SLOT_LAST_MIN + 1, SLOT_STEP_MIN))


def hhmm(m: int) -> str:
    return f"{m // 60:02d}:{m % 60:02d}"


def occupied_buckets(start_min: int, dur_min: int) -> List[int]:
    """20-min buckets occupied by a booking starting at start_min for dur_min minutes."""
    if dur_min <= 0:
        return []
    end_min = start_min + dur_min
    res = []
    t = (start_min // SLOT_STEP_MIN) * SLOT_STEP_MIN
    while t < end_min:
        res.append(t)
        t += SLOT_STEP_MIN
    return res


def booking_start_minutes(b: dict) -> int:
    if "start_minutes" in b and b["start_minutes"] is not None:
        return int(b["start_minutes"])
    # legacy fallback
    return int(b.get("hour", 7)) * 60


def booking_duration(b: dict) -> int:
    return int(b.get("duration_minutes") or 60)


# ---- Helpers ----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": datetime.now(timezone.utc) + timedelta(days=30)},
        JWT_SECRET, algorithm=JWT_ALG,
    )


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acceso solo para administrador")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_mx() -> datetime:
    return datetime.now(MX_TZ)


# ---- External integrations ----
async def send_push(token: Optional[str], title: str, body: str, data: Optional[dict] = None):
    if not token:
        return
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            await c.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "sound": "default", "data": data or {}},
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
    except Exception as e:
        log.warning("push send failed: %s", e)


async def push_to_admins(title: str, body: str, data: Optional[dict] = None):
    async for u in db.users.find({"role": "admin", "push_token": {"$exists": True, "$ne": None}}, {"push_token": 1}):
        await send_push(u.get("push_token"), title, body, data)


async def push_to_user_id(user_id: str, title: str, body: str, data: Optional[dict] = None):
    u = await db.users.find_one({"id": user_id}, {"push_token": 1})
    if u:
        await send_push(u.get("push_token"), title, body, data)


async def send_whatsapp_admin(text: str):
    """Send a WhatsApp message to the admin via CallMeBot."""
    if not CALLMEBOT_API_KEY or not CALLMEBOT_PHONE:
        log.info("CallMeBot not configured, skipping admin WhatsApp")
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                "https://api.callmebot.com/whatsapp.php",
                params={"phone": CALLMEBOT_PHONE, "text": text, "apikey": CALLMEBOT_API_KEY},
            )
            log.info("CallMeBot status=%s", r.status_code)
    except Exception as e:
        log.warning("CallMeBot send failed: %s", e)


def gen_loyalty_code() -> str:
    return "LEALTAD-" + secrets.token_hex(3).upper()


# ---- Models ----
class RegisterIn(BaseModel):
    phone: str
    password: str
    name: str


class LoginIn(BaseModel):
    phone: str
    password: str


class ServiceIn(BaseModel):
    name: str
    price: float
    includes: List[str]
    active: bool = True
    duration_minutes: int = 60


class BookingIn(BaseModel):
    service_id: str
    date: str  # YYYY-MM-DD
    start_minutes: Optional[int] = None  # new field
    hour: Optional[int] = None           # legacy fallback
    vehicle_type: str
    address: str
    coupon_code: Optional[str] = None
    extra_service_id: Optional[str] = None


class CouponIn(BaseModel):
    code: str
    type: str
    value: float = 0
    assigned_to_phone: Optional[str] = None
    note: Optional[str] = None
    expires_at: Optional[str] = None   # YYYY-MM-DD or ISO


class ExpenseIn(BaseModel):
    product_name: str
    cost: float
    quantity: str
    services_yield: int = 40
    category: str = "producto"


class StatusUpdate(BaseModel):
    status: str


class PushTokenIn(BaseModel):
    push_token: str


class CouponValidateIn(BaseModel):
    code: str
    service_id: str
    extra_service_id: Optional[str] = None


# ---- Coupon utilities ----
def parse_expires(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    try:
        if len(s) == 10:  # YYYY-MM-DD → end of that day in MX
            d = datetime.strptime(s, "%Y-%m-%d")
            return d.replace(hour=23, minute=59, second=59, tzinfo=MX_TZ)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s)
    except Exception:
        return None


def coupon_is_expired(coupon: dict) -> bool:
    exp = coupon.get("expires_at")
    if not exp:
        return False
    dt = parse_expires(exp)
    if not dt:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=MX_TZ)
    return now_mx() > dt


def apply_coupon_to_price(service: dict, coupon: dict, base_price: float) -> tuple[float, str]:
    """Returns (final_price, description). Raises HTTPException for invalid combos."""
    ctype = coupon["type"]
    val = coupon.get("value", 0)
    if ctype == "discount_percent":
        return max(0, base_price * (1 - val / 100)), f"{val}% de descuento"
    if ctype == "discount_amount":
        return max(0, base_price - val), f"${val} de descuento"
    if ctype == "free_service":
        return 0, "Servicio GRATIS"
    if ctype == "loyalty_full":
        if "completa" not in service["name"].lower():
            raise HTTPException(status_code=400, detail="Este cupón solo aplica a Limpieza completa")
        return float(val), f"Limpieza completa por ${val}"
    raise HTTPException(status_code=400, detail="Tipo de cupón inválido")


# ---- Auth ----
@api.post("/auth/register")
async def register(body: RegisterIn):
    phone = body.phone.strip()
    if len(phone) < 7:
        raise HTTPException(400, "Número de teléfono inválido")
    if len(body.password) < 4:
        raise HTTPException(400, "Contraseña muy corta (mínimo 4)")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(400, "Este número ya está registrado")
    user = {
        "id": str(uuid.uuid4()), "phone": phone, "name": body.name.strip(),
        "password_hash": hash_password(body.password), "role": "client", "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_token(user["id"], user["role"])
    user.pop("password_hash", None); user.pop("_id", None)
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(body: LoginIn):
    phone = body.phone.strip()
    user = await db.users.find_one({"phone": phone})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Teléfono o contraseña incorrectos")
    token = create_token(user["id"], user["role"])
    user.pop("password_hash", None); user.pop("_id", None)
    return {"token": token, "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/users/push-token")
async def save_push_token(body: PushTokenIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": body.push_token}})
    return {"ok": True}


# ---- Services ----
@api.get("/services")
async def list_services(user: dict = Depends(get_current_user)):
    q = {} if user.get("role") == "admin" else {"active": True}
    items = await db.services.find(q, {"_id": 0}).to_list(200)
    for s in items:
        s.setdefault("duration_minutes", 60)
    return items


@api.post("/services")
async def create_service(body: ServiceIn, _: dict = Depends(require_admin)):
    if body.duration_minutes <= 0 or body.duration_minutes > 480:
        raise HTTPException(400, "Duración inválida (1-480 min)")
    item = {
        "id": str(uuid.uuid4()),
        "name": body.name, "price": body.price, "includes": body.includes,
        "active": body.active, "duration_minutes": body.duration_minutes,
        "completed_count": 0, "created_at": now_iso(),
    }
    await db.services.insert_one(item); item.pop("_id", None)
    return item


@api.put("/services/{service_id}")
async def update_service(service_id: str, body: ServiceIn, _: dict = Depends(require_admin)):
    if body.duration_minutes <= 0 or body.duration_minutes > 480:
        raise HTTPException(400, "Duración inválida (1-480 min)")
    res = await db.services.update_one({"id": service_id}, {"$set": {
        "name": body.name, "price": body.price, "includes": body.includes,
        "active": body.active, "duration_minutes": body.duration_minutes,
    }})
    if res.matched_count == 0:
        raise HTTPException(404, "Servicio no encontrado")
    item = await db.services.find_one({"id": service_id}, {"_id": 0})
    return item


@api.delete("/services/{service_id}")
async def delete_service(service_id: str, _: dict = Depends(require_admin)):
    await db.services.delete_one({"id": service_id})
    return {"ok": True}


# ---- Bookings ----
async def get_active_bookings(date: str) -> List[dict]:
    return await db.bookings.find(
        {"date": date, "status": {"$in": ["pending", "confirmed"]}},
        {"_id": 0, "start_minutes": 1, "hour": 1, "duration_minutes": 1},
    ).to_list(2000)


def slot_available_for_duration(start_min: int, dur_min: int, bookings: List[dict]) -> bool:
    """Check whether a service of dur_min starting at start_min fits the SLOT_CAPACITY."""
    if start_min + dur_min > DAY_END_MIN:
        return False
    needed_buckets = occupied_buckets(start_min, dur_min)
    counts = {b: 0 for b in needed_buckets}
    for b in bookings:
        bs = booking_start_minutes(b); bd = booking_duration(b)
        for bucket in occupied_buckets(bs, bd):
            if bucket in counts:
                counts[bucket] += 1
    return all(c < SLOT_CAPACITY for c in counts.values())


@api.get("/bookings/availability")
async def availability(
    date: str,
    service_id: Optional[str] = None,
    extra_service_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # default duration = 60 if no service given
    total_dur = 60
    if service_id:
        s = await db.services.find_one({"id": service_id}, {"_id": 0})
        if s: total_dur = int(s.get("duration_minutes") or 60)
    if extra_service_id:
        e = await db.services.find_one({"id": extra_service_id}, {"_id": 0})
        if e: total_dur += int(e.get("duration_minutes") or 60)

    bookings = await get_active_bookings(date)
    slots = []
    for sm in SLOT_GRID:
        ok = slot_available_for_duration(sm, total_dur, bookings)
        slots.append({
            "start_minutes": sm,
            "label": hhmm(sm),
            "available": ok,
        })
    return {"date": date, "duration_minutes": total_dur, "capacity": SLOT_CAPACITY, "slots": slots}


@api.post("/bookings")
async def create_booking(body: BookingIn, user: dict = Depends(get_current_user)):
    # resolve start_minutes (support legacy hour)
    start_min = body.start_minutes if body.start_minutes is not None else (body.hour * 60 if body.hour is not None else None)
    if start_min is None:
        raise HTTPException(400, "Falta el horario")
    if start_min not in SLOT_GRID:
        raise HTTPException(400, "Horario fuera de los slots permitidos")

    service = await db.services.find_one({"id": body.service_id, "active": True}, {"_id": 0})
    if not service:
        raise HTTPException(404, "Servicio no disponible")
    service_duration = int(service.get("duration_minutes") or 60)

    extra = None
    extra_duration = 0
    if body.extra_service_id:
        extra = await db.services.find_one({"id": body.extra_service_id, "active": True}, {"_id": 0})
        if not extra:
            raise HTTPException(404, "Servicio extra no disponible")
        if extra["id"] == service["id"]:
            raise HTTPException(400, "El servicio extra no puede ser igual al principal")
        extra_duration = int(extra.get("duration_minutes") or 60)

    total_duration = service_duration + extra_duration
    if start_min + total_duration > DAY_END_MIN:
        raise HTTPException(400, "El servicio terminaría después de las 10pm")

    # capacity check
    bookings = await get_active_bookings(body.date)
    if not slot_available_for_duration(start_min, total_duration, bookings):
        raise HTTPException(400, "Este horario ya no está disponible")

    base_price = service["price"] + (extra["price"] if extra else 0)
    final_price = base_price
    coupon_used = None
    if body.coupon_code:
        coupon = await db.coupons.find_one({"code": body.coupon_code.upper(), "used": False}, {"_id": 0})
        if not coupon:
            raise HTTPException(400, "Cupón inválido o ya usado")
        if coupon_is_expired(coupon):
            raise HTTPException(400, "El cupón ha expirado")
        if coupon.get("assigned_to_phone") and coupon["assigned_to_phone"] != user["phone"]:
            raise HTTPException(400, "Cupón no válido para esta cuenta")
        # apply coupon to MAIN service only (or to total for non-loyalty)
        if coupon["type"] == "loyalty_full":
            # only valid on Limpieza completa main service; extra is added on top at full price
            if "completa" not in service["name"].lower():
                raise HTTPException(400, "Este cupón solo aplica a Limpieza completa")
            final_price = float(coupon["value"]) + (extra["price"] if extra else 0)
        else:
            tmp_final, _ = apply_coupon_to_price(service, coupon, base_price)
            final_price = tmp_final
        coupon_used = coupon["code"]

    final_price = round(max(0, final_price), 2)

    booking = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"], "user_phone": user["phone"],
        "service_id": service["id"], "service_name": service["name"],
        "service_price": service["price"], "service_duration": service_duration,
        "extra_service_id": extra["id"] if extra else None,
        "extra_service_name": extra["name"] if extra else None,
        "extra_service_price": extra["price"] if extra else 0,
        "extra_service_duration": extra_duration,
        "duration_minutes": total_duration,
        "start_minutes": start_min,
        "hour": start_min // 60,  # legacy
        "start_label": hhmm(start_min),
        "end_label": hhmm(start_min + total_duration),
        "final_price": final_price,
        "date": body.date,
        "vehicle_type": body.vehicle_type, "address": body.address,
        "coupon_code": coupon_used,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.bookings.insert_one(booking)
    if coupon_used:
        await db.coupons.update_one(
            {"code": coupon_used},
            {"$set": {"used": True, "used_at": now_iso(), "used_by_phone": user["phone"]}},
        )
    booking.pop("_id", None)

    # Notify
    extra_text = f" + {extra['name']}" if extra else ""
    wa_msg = (
        f"🚗💧 *Nueva cita M&N Clean Car*\n"
        f"Cliente: {user['name']} ({user['phone']})\n"
        f"Servicio: {service['name']}{extra_text}\n"
        f"Fecha: {body.date} a las {hhmm(start_min)}\n"
        f"Duración: {total_duration} min (termina {hhmm(start_min + total_duration)})\n"
        f"Vehículo: {body.vehicle_type}\n"
        f"Domicilio: {body.address}\n"
        f"Total: ${final_price}"
        + (f"\nCupón: {coupon_used}" if coupon_used else "")
    )
    asyncio.create_task(send_whatsapp_admin(wa_msg))
    asyncio.create_task(push_to_admins(
        "Nueva cita pendiente",
        f"{user['name']} - {service['name']}{extra_text} - {body.date} {hhmm(start_min)}",
        {"booking_id": booking["id"]},
    ))
    return booking


@api.get("/bookings/me")
async def my_bookings(user: dict = Depends(get_current_user)):
    items = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort([("date", -1), ("start_minutes", -1)]).to_list(500)
    for b in items:
        b.setdefault("start_label", hhmm(booking_start_minutes(b)))
        b.setdefault("duration_minutes", 60)
    return items


@api.get("/bookings")
async def list_all_bookings(status: Optional[str] = None, _: dict = Depends(require_admin)):
    q = {}
    if status: q["status"] = status
    items = await db.bookings.find(q, {"_id": 0}).sort([("date", -1), ("start_minutes", -1)]).to_list(1000)
    for b in items:
        b.setdefault("start_label", hhmm(booking_start_minutes(b)))
        b.setdefault("duration_minutes", 60)
    return items


@api.patch("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, body: StatusUpdate, _: dict = Depends(require_admin)):
    if body.status not in ("confirmed", "rejected", "completed"):
        raise HTTPException(400, "Estado inválido")
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Reserva no encontrada")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": body.status, "updated_at": now_iso()}})

    start_label = booking.get("start_label") or hhmm(booking_start_minutes(booking))
    if body.status == "confirmed":
        asyncio.create_task(push_to_user_id(
            booking["user_id"], "✅ Cita confirmada",
            f"Tu {booking['service_name']} del {booking['date']} a las {start_label} fue confirmado.",
            {"booking_id": booking_id},
        ))
    elif body.status == "rejected":
        asyncio.create_task(push_to_user_id(
            booking["user_id"], "❌ Cita rechazada",
            f"Tu cita del {booking['date']} a las {start_label} no pudo ser confirmada.",
            {"booking_id": booking_id},
        ))

    awarded = None
    if body.status == "completed" and booking["status"] != "completed":
        await db.services.update_one({"id": booking["service_id"]}, {"$inc": {"completed_count": 1}})
        user_completed = await db.bookings.count_documents({"user_id": booking["user_id"], "status": "completed"})
        if user_completed > 0 and user_completed % 5 == 0:
            code = gen_loyalty_code()
            coupon = {
                "id": str(uuid.uuid4()), "code": code, "type": "loyalty_full", "value": 100,
                "assigned_to_phone": booking["user_phone"],
                "note": f"¡Felicidades! Llevas {user_completed} lavados. Limpieza completa por solo $100.",
                "used": False, "used_at": None, "used_by_phone": None, "is_loyalty": True,
                "expires_at": None, "created_at": now_iso(),
            }
            await db.coupons.insert_one(coupon)
            awarded = code
            asyncio.create_task(push_to_user_id(
                booking["user_id"], "🎁 ¡Cupón de lealtad ganado!",
                f"Has completado {user_completed} servicios. Limpieza completa por $100. Código: {code}",
            ))
    return {"ok": True, "status": body.status, "loyalty_coupon": awarded}


# ---- Coupons ----
@api.get("/coupons")
async def list_coupons(_: dict = Depends(require_admin)):
    items = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for c in items:
        c["expired"] = coupon_is_expired(c)
    return items


@api.post("/coupons")
async def create_coupon(body: CouponIn, _: dict = Depends(require_admin)):
    code = body.code.strip().upper()
    if not code: raise HTTPException(400, "Código requerido")
    if body.type not in ("discount_percent", "discount_amount", "free_service", "loyalty_full"):
        raise HTTPException(400, "Tipo de cupón inválido")
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, "Código ya existe")
    coupon = {
        "id": str(uuid.uuid4()), "code": code, "type": body.type, "value": body.value,
        "assigned_to_phone": body.assigned_to_phone, "note": body.note,
        "expires_at": body.expires_at,
        "used": False, "used_at": None, "used_by_phone": None,
        "created_at": now_iso(),
    }
    await db.coupons.insert_one(coupon); coupon.pop("_id", None)
    return coupon


@api.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, _: dict = Depends(require_admin)):
    await db.coupons.delete_one({"id": coupon_id})
    return {"ok": True}


@api.get("/coupons/me")
async def my_coupons(user: dict = Depends(get_current_user)):
    items = await db.coupons.find(
        {"assigned_to_phone": user["phone"], "used": False}, {"_id": 0}
    ).to_list(200)
    out = []
    for c in items:
        if not coupon_is_expired(c):
            out.append(c)
    return out


@api.post("/coupons/validate")
async def validate_coupon(body: CouponValidateIn, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    if not code: return {"valid": False, "message": "Ingresa un código"}
    coupon = await db.coupons.find_one({"code": code}, {"_id": 0})
    if not coupon: return {"valid": False, "message": "Cupón no encontrado"}
    if coupon.get("used"): return {"valid": False, "message": "Este cupón ya fue usado"}
    if coupon_is_expired(coupon): return {"valid": False, "message": "El cupón ha expirado"}
    if coupon.get("assigned_to_phone") and coupon["assigned_to_phone"] != user["phone"]:
        return {"valid": False, "message": "Este cupón no es para tu cuenta"}
    service = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not service: return {"valid": False, "message": "Servicio no encontrado"}
    extra = None
    if body.extra_service_id:
        extra = await db.services.find_one({"id": body.extra_service_id}, {"_id": 0})
    base = service["price"] + (extra["price"] if extra else 0)
    try:
        if coupon["type"] == "loyalty_full":
            if "completa" not in service["name"].lower():
                return {"valid": False, "message": "Este cupón solo aplica a Limpieza completa"}
            final = float(coupon["value"]) + (extra["price"] if extra else 0)
            desc = f"Limpieza completa por ${coupon['value']}"
        else:
            final, desc = apply_coupon_to_price(service, coupon, base)
    except HTTPException as e:
        return {"valid": False, "message": e.detail}
    return {
        "valid": True, "message": f"✓ {desc}",
        "base_price": round(base, 2), "final_price": round(final, 2),
        "savings": round(base - final, 2),
    }


# ---- Expenses ----
@api.get("/expenses")
async def list_expenses(_: dict = Depends(require_admin)):
    return await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api.post("/expenses")
async def create_expense(body: ExpenseIn, _: dict = Depends(require_admin)):
    item = {
        "id": str(uuid.uuid4()), "product_name": body.product_name, "cost": body.cost,
        "quantity": body.quantity, "services_yield": body.services_yield,
        "category": body.category, "created_at": now_iso(),
    }
    await db.expenses.insert_one(item); item.pop("_id", None)
    return item


@api.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, _: dict = Depends(require_admin)):
    await db.expenses.delete_one({"id": expense_id})
    return {"ok": True}


# ---- Dashboard ----
@api.get("/admin/dashboard")
async def admin_dashboard(_: dict = Depends(require_admin)):
    total_bookings = await db.bookings.count_documents({})
    pending = await db.bookings.count_documents({"status": "pending"})
    confirmed = await db.bookings.count_documents({"status": "confirmed"})
    completed = await db.bookings.count_documents({"status": "completed"})
    income_total = 0
    async for r in db.bookings.aggregate([{"$match": {"status": "completed"}}, {"$group": {"_id": None, "total": {"$sum": "$final_price"}}}]):
        income_total = r.get("total", 0) or 0
    expense_total = 0
    async for r in db.expenses.aggregate([{"$group": {"_id": None, "total": {"$sum": "$cost"}}}]):
        expense_total = r.get("total", 0) or 0
    services = await db.services.find({}, {"_id": 0}).to_list(100)
    products = await db.expenses.find({"category": "producto"}, {"_id": 0}).to_list(200)
    services_done = completed
    inventory = []
    for p in products:
        y = p.get("services_yield", 40) or 40
        cycles = services_done // y
        next_restock_at = (cycles + 1) * y
        until = next_restock_at - services_done
        alert = (services_done > 0) and (services_done % 20 == 0)
        inventory.append({
            "product_name": p["product_name"], "quantity": p.get("quantity"),
            "cost": p.get("cost"), "services_yield": y,
            "services_done": services_done, "services_until_restock": until,
            "needs_restock_alert": alert,
        })
    return {
        "total_bookings": total_bookings, "pending": pending, "confirmed": confirmed, "completed": completed,
        "income_total": round(income_total, 2), "expense_total": round(expense_total, 2),
        "net": round(income_total - expense_total, 2),
        "services": services, "inventory": inventory,
        "restock_alert_global": (completed > 0 and completed % 20 == 0),
    }


# ---- Misc ----
@api.get("/")
async def root():
    return {"app": "M&N Clean Car API", "ok": True, "slot_step_min": SLOT_STEP_MIN}


# ---- Reminder loop ----
async def reminder_loop():
    while True:
        try:
            now_local = now_mx()
            in_one_hour = now_local + timedelta(hours=1)
            target_date = in_one_hour.strftime("%Y-%m-%d")
            target_min_low = in_one_hour.hour * 60 + in_one_hour.minute - 5
            target_min_high = target_min_low + 10
            cursor = db.bookings.find({
                "date": target_date,
                "status": "confirmed",
                "reminder_sent": {"$ne": True},
            })
            async for b in cursor:
                sm = booking_start_minutes(b)
                if target_min_low <= sm <= target_min_high:
                    user = await db.users.find_one({"id": b["user_id"]}, {"push_token": 1})
                    if user and user.get("push_token"):
                        await send_push(
                            user["push_token"],
                            "⏰ Recordatorio M&N Clean Car",
                            f"Tu {b['service_name']} es en 1 hora ({hhmm(sm)}). Te esperamos en {b['address']}.",
                            {"booking_id": b["id"]},
                        )
                    await db.bookings.update_one({"id": b["id"]}, {"$set": {"reminder_sent": True}})
        except Exception as e:
            log.warning("reminder_loop error: %s", e)
        await asyncio.sleep(60)


# ---- Startup ----
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("phone", unique=True)
    await db.services.create_index("id", unique=True)
    await db.bookings.create_index([("date", 1), ("start_minutes", 1)])
    await db.bookings.create_index("user_id")
    await db.coupons.create_index("code", unique=True)
    asyncio.create_task(reminder_loop())

    admin = await db.users.find_one({"phone": ADMIN_PHONE})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": ADMIN_PHONE, "name": "Administrador",
            "password_hash": hash_password(ADMIN_PASSWORD), "role": "admin", "created_at": now_iso(),
        })
    else:
        if not verify_password(ADMIN_PASSWORD, admin["password_hash"]):
            await db.users.update_one({"phone": ADMIN_PHONE},
                {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin"}})

    if not await db.users.find_one({"phone": "8711111111"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": "8711111111", "name": "Cliente Demo",
            "password_hash": hash_password("cliente123"), "role": "client", "created_at": now_iso(),
        })

    # backfill duration_minutes for existing services
    await db.services.update_many({"duration_minutes": {"$exists": False}}, {"$set": {"duration_minutes": 60}})

    if await db.services.count_documents({}) == 0:
        defaults = [
            ("Limpieza exterior", 80, 45, [
                "Prelavado", "Lavado de contacto",
                "Limpieza de llantas y rines", "Abrillantador de llantas y plásticos",
            ]),
            ("Limpieza interior", 100, 45, [
                "Aspirado de interior", "Limpieza e hidratación de paneles interiores",
            ]),
            ("Limpieza completa", 150, 90, [
                "Prelavado", "Lavado de contacto",
                "Limpieza de llantas, rines y tolvas",
                "Abrillantador de llantas y plásticos exteriores",
                "Aspirado de interior", "Limpieza e hidratación de interiores",
            ]),
        ]
        docs = [{
            "id": str(uuid.uuid4()), "name": n, "price": p, "duration_minutes": d,
            "includes": inc, "active": True, "completed_count": 0, "created_at": now_iso(),
        } for n, p, d, inc in defaults]
        await db.services.insert_many(docs)

    if await db.expenses.count_documents({}) == 0:
        products = [
            ("Shampoo prelavado", 115, "4 lts", 40, "producto"),
            ("Shampoo con cera", 155, "1.9 lts", 40, "producto"),
            ("APC", 120, "1 lt", 40, "producto"),
            ("Desengrasante", 120, "1 lt", 40, "producto"),
            ("Hidratador plásticos", 100, "500 ml", 40, "producto"),
            ("Brillo exterior", 89, "500 ml", 40, "producto"),
            ("Limpia vidrios", 80, "500 ml", 40, "producto"),
            ("Toallas microfibra", 300, "36 toallas", 40, "producto"),
            ("Gasolina (semanal)", 600, "semanal", 0, "gasolina"),
        ]
        await db.expenses.insert_many([{
            "id": str(uuid.uuid4()), "product_name": n, "cost": c, "quantity": q,
            "services_yield": y, "category": cat, "created_at": now_iso(),
        } for n, c, q, y, cat in products])


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)

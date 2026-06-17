# M&N Clean Car

App de agendado de lavado de autos. Cliente reserva citas, paga con cupones,
el admin gestiona servicios, reservas, cupones y gastos desde un panel.

Este repositorio contiene:
- `backend/` — API en FastAPI + MongoDB (Python)
- `frontend/` — App en Expo / React Native, exportada como sitio web estático

## Arquitectura de despliegue (gratis, 24/7)

- **Base de datos:** MongoDB Atlas (free tier)
- **Backend:** Render.com (free tier, Web Service de Python)
- **Frontend:** Netlify (sitio estático)

## Cómo desplegar desde cero

### 1. Base de datos — MongoDB Atlas
1. Crea una cuenta gratis en https://www.mongodb.com/cloud/atlas/register
2. Crea un cluster gratuito (M0)
3. En "Database Access", crea un usuario con contraseña
4. En "Network Access", permite acceso desde cualquier IP (0.0.0.0/0) — Render usa IPs dinámicas
5. En "Database" → "Connect" → "Drivers", copia el connection string (empieza con `mongodb+srv://`)

### 2. Backend — Render
1. Crea una cuenta gratis en https://render.com (puedes usar tu cuenta de GitHub)
2. Sube este repositorio a tu GitHub
3. En Render: **New +** → **Web Service** → conecta tu repositorio
4. Render detectará el archivo `render.yaml` automáticamente (Blueprint)
   - Si no lo detecta, configura manualmente:
     - **Root Directory:** `backend`
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Agrega las variables de entorno (ve `backend/.env.example` para la lista completa):
   - `MONGO_URL` → el connection string de Atlas (paso 1)
   - `DB_NAME` → `mn_clean_car`
   - `JWT_SECRET` → genera una clave aleatoria larga
   - `ADMIN_PHONE` y `ADMIN_PASSWORD` → credenciales del administrador
   - `CALLMEBOT_API_KEY` y `CALLMEBOT_PHONE` → opcional, para WhatsApp al admin
6. Deploy. Render te dará una URL tipo `https://mn-clean-car-api.onrender.com`

**Nota sobre el plan gratis de Render:** el servicio "duerme" tras 15 minutos
sin tráfico. La primera petición después de dormir tarda 30-50 segundos en
responder mientras despierta; las siguientes son normales. Si necesitas que
nunca duerma, el plan pagado (~$7 USD/mes) lo evita.

### 3. Frontend — Netlify
1. Edita `frontend/.env` y pon la URL real de tu backend de Render:
   ```
   EXPO_PUBLIC_BACKEND_URL=https://mn-clean-car-api.onrender.com
   ```
2. Crea una cuenta gratis en https://netlify.com
3. **Add new site → Import an existing project → GitHub** → selecciona este repo
4. Configura:
   - **Base directory:** `frontend`
   - **Build command:** `yarn install && yarn export:web`
   - **Publish directory:** `frontend/dist`
5. Deploy. Netlify te dará una URL tipo `https://tu-app.netlify.app`

Si cambias la URL del backend más adelante, agrega `EXPO_PUBLIC_BACKEND_URL`
como variable de entorno en Netlify (Site settings → Environment variables)
y vuelve a desplegar con "Clear cache and deploy site".

## Credenciales de prueba

- **Admin:** el teléfono y contraseña que pongas en `ADMIN_PHONE` / `ADMIN_PASSWORD`
- Se crean automáticamente la primera vez que el backend arranca

## Estructura de la app

- Login / registro por teléfono y contraseña
- Cliente: ver servicios, agendar cita (con disponibilidad en tiempo real),
  ver sus reservas, ver y usar cupones, perfil
- Admin: dashboard con métricas, gestionar reservas (confirmar/rechazar/completar),
  gestionar servicios, crear y enviar cupones por WhatsApp, registrar gastos e inventario
- Sistema de lealtad automático: cada 5 servicios completados, el cliente
  recibe un cupón de limpieza completa por $100

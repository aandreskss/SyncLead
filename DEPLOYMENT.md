# SyncLead — Checklist de deployment a producción

## Pre-requisitos

- [ ] Cuenta de Vercel (plan Hobby o superior)
- [ ] Base de datos Neon Postgres (plan Free funciona para empezar)
- [ ] Cuenta de Resend (emails transaccionales)
- [ ] Cuenta de Upstash Redis (rate limiting — opcional)
- [ ] Meta Business Suite con Lead Ads activos (para ingesta)
- [ ] Google Cloud Console (para OAuth — opcional)

---

## 1. Variables de entorno

Configura las siguientes variables en **Vercel → Project → Settings → Environment Variables**.

| Variable | Descripción | Cómo obtenerla |
|---|---|---|
| `DATABASE_URL` | Neon connection string (pooler) | Neon dashboard → Connection string → Connection pooling |
| `AUTH_SECRET` | Secret de Auth.js (≥32 chars aleatorios) | `npx auth secret` o `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | Google Cloud → APIs & Services → Credentials |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | Google Cloud → APIs & Services → Credentials |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `RESEND_API_KEY` | API key de Resend | resend.com → API Keys |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app (sin `/` final) | `https://tudominio.com` |
| `CRON_SECRET` | Secret para proteger el endpoint de cron | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | Redis URL (opcional) | Upstash dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token (opcional) | Upstash dashboard |

> **Importante:** `ENCRYPTION_KEY` nunca debe cambiar después del primer deploy. Si cambia, los tokens Meta guardados en DB no se podrán descifrar.

---

## 2. Base de datos Neon

### 2.1 Crear base de datos

1. Ir a [neon.tech](https://neon.tech) → New Project
2. Elegir región más cercana a los usuarios (us-east-1 para Venezuela/Colombia)
3. Copiar el **Connection string** con **pooler** habilitado:
   ```
   postgres://user:password@ep-xxx.us-east-1.aws.neon.tech:5432/neondb?sslmode=require
   ```

### 2.2 Aplicar migraciones

```bash
# Clonar el repo localmente
git clone https://github.com/aandreskss/SyncLead.git
cd SyncLead

# Configurar .env.local con DATABASE_URL real
cp .env.example .env.local
# Editar .env.local con los valores reales

# Aplicar migraciones
npx drizzle-kit migrate
```

Las migraciones crean:
- Tablas de Auth.js (user, account, session, verificationToken)
- Organizations, clients, campaigns, leads, lead_stage_history
- webhook_events (idempotencia de webhooks)
- funnels (tableros kanban)

### 2.3 Crear primer administrador

```bash
npm run create-admin -- admin@example.com "Mi Empresa" "MiPassword123!"
```

---

## 3. Deploy en Vercel

### 3.1 Conectar repositorio

1. Vercel → Add New Project → Import Git Repository
2. Seleccionar `SyncLead`
3. Framework: Next.js (detectado automáticamente)

### 3.2 Configurar variables de entorno

1. Ir a **Settings → Environment Variables**
2. Agregar todas las variables de la tabla del paso 1
3. Asegurarse de que aplican a **Production**, **Preview** y **Development**

### 3.3 Deploy

```bash
git push origin main
```

Vercel detectará el push y hará el deploy automáticamente.

### 3.4 Verificar el cron job

Vercel detectará automáticamente el `vercel.json` con el cron:
```json
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }]
}
```

El cron corre diariamente a las 3:00 AM UTC y limpia `webhook_events` con más de 30 días.

---

## 4. Auth.js — Configurar OAuth

### Google OAuth

1. Ir a [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials → Create OAuth 2.0 Client
3. Application type: Web application
4. Authorized redirect URIs:
   ```
   https://tudominio.com/api/auth/callback/google
   ```
5. Copiar Client ID y Client Secret a las variables de entorno

### Auth.js callbacks URL

En Vercel, asegurarse de que `AUTH_URL` (o `NEXTAUTH_URL` en versiones anteriores) apunte al dominio correcto:
```
https://tudominio.com
```

---

## 5. Dominio personalizado

1. Vercel → Project → Settings → Domains
2. Agregar tu dominio: `tudominio.com`
3. Configurar los registros DNS según las instrucciones de Vercel:
   - Si usas Vercel DNS: Nameservers de Vercel
   - Si usas otro proveedor: Registros A y CNAME según indique Vercel

---

## 6. Meta Lead Ads — Setup de webhook

Para cada campaña de Lead Ads de Meta:

1. Ir a SyncLead → Campañas → (tu campaña) → Revelar API Key
2. Copiar la URL de webhook:
   ```
   https://tudominio.com/api/leads/ingest
   ```
3. En Meta Business Suite → Formularios de Leads → Webhook:
   - URL: `https://tudominio.com/api/leads/ingest`
   - Header: `X-Campaign-Key: slk_tuapikey`
4. Hacer un lead de prueba con un formulario de Meta

### Meta Pixel + CAPI (opcional)

En SyncLead → Clientes → (tu cliente):
1. Ingresar el **Meta Pixel ID** (ej: `123456789012345`)
2. Ingresar el **Meta Access Token** del sistema:
   - Meta Events Manager → Data Sources → (tu Pixel) → Settings → Generate Access Token
3. El token se encripta automáticamente al guardarlo

---

## 7. Tests post-deployment

### Smoke tests manuales

- [ ] `/` — Homepage carga correctamente con nav y CTA
- [ ] `/register` — Registro de usuario funciona y envía email
- [ ] `/login` — Login con email/password funciona
- [ ] `/dashboard` — Dashboard carga KPIs y gráficas
- [ ] `/dashboard/clients` — Lista de clientes visible
- [ ] `/dashboard/campaigns` — Lista de campañas visible
- [ ] `/api/leads/ingest` — Devuelve 401 sin API Key
- [ ] Webhook test con cURL:
  ```bash
  curl -X POST https://tudominio.com/api/leads/ingest \
    -H "Content-Type: application/json" \
    -H "X-Campaign-Key: slk_tuapikey" \
    -d '{"name":"Test Lead","phone":"04121234567","city":"Caracas","negocio":true}'
  ```
- [ ] Lead aparece en tabla después del POST
- [ ] `/sitemap.xml` — Devuelve XML válido
- [ ] `/robots.txt` — Bloquea /dashboard y /api

### Vercel Analytics

Activar Vercel Analytics:
1. Project → Analytics → Enable

---

## 8. Seed de datos demo (opcional)

Para demostrar el producto con datos realistas:

```bash
npm run seed
```

Crea:
- Usuario: `demo@synclead.app` / `Demo1234!`
- 3 clientes, 5 campañas, 200 leads con distribución hot/warm/cold

> Borrar el seed de producción antes del lanzamiento público con:
> ```sql
> DELETE FROM "user" WHERE email = 'demo@synclead.app';
> -- (en cascade borra org, clients, campaigns, leads)
> ```

---

## 9. Tests automatizados

### Unit tests (Vitest)

```bash
npm run test:unit
```

Cubre: normalizePhone, calculateTemperature, encryptToken/decryptToken, sha256 hashing.

### E2E tests (Playwright)

```bash
# Instalar browsers (solo la primera vez)
npx playwright install --with-deps chromium

# Necesita el seed corrido y el servidor activo
npm run seed
npm run dev &
npm run test:e2e
```

Variables de entorno para tests:
```env
E2E_EMAIL=demo@synclead.app
E2E_PASS=Demo1234!
BASE_URL=http://localhost:3000
```

---

## 10. Checklist final antes del lanzamiento público

- [ ] `ENCRYPTION_KEY` generada y guardada de forma segura (1Password, Bitwarden, etc.)
- [ ] `AUTH_SECRET` con al menos 32 caracteres aleatorios
- [ ] `CRON_SECRET` configurado para proteger el endpoint `/api/cron/cleanup`
- [ ] Dominio personalizado configurado y SSL activo
- [ ] Google OAuth con redirect URI correcto
- [ ] Al menos un lead de prueba ingresado vía API
- [ ] Email de verificación llega correctamente (probar con email real)
- [ ] Meta CAPI configurado en al menos un cliente (probar con conversión real)
- [ ] Migraciones aplicadas (`npx drizzle-kit migrate`)
- [ ] Seed demo eliminado (si aplica)
- [ ] `NEXT_PUBLIC_APP_URL` apunta al dominio de producción (necesario para OG images y sitemap)
- [ ] Vercel Cron habilitado (Projects → Settings → Cron Jobs)
- [ ] Smoke tests manuales completados ✓

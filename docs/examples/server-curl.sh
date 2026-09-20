#!/bin/bash
#
# MODO B — Servidor a Servidor (cURL)
# ====================================
# Credencial: SERVER SECRET (slk_xxx...)
# Endpoint:   POST /api/ingest/server
# Header:     Authorization: Bearer <server_secret>
#
# ⚠️  NUNCA uses esta credencial en JavaScript del navegador.
#     Solo sirvidores de confianza deben poseer esta key.

API_KEY="slk_REPLACE_WITH_YOUR_SERVER_SECRET"
INGEST_URL="https://app.tudominio.com/api/ingest/server"

# ─── Ejemplo básico ───────────────────────────────────────────────────────────

curl -X POST "$INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "name": "María González",
    "email": "maria@ejemplo.com",
    "phone": "+584121234567",
    "city": "Caracas",
    "negocio": true,
    "event_id": "evt-2026-001",
    "utm_source": "facebook",
    "utm_medium": "paid",
    "utm_campaign": "agosto-2026"
  }'

# ─── Respuesta esperada (primer envío) ────────────────────────────────────────
# HTTP 201
# { "success": true, "correlationId": "...", "duplicate": false }

# ─── Respuesta esperada (re-envío con el mismo event_id) ─────────────────────
# HTTP 200
# { "success": true, "correlationId": "...", "duplicate": true }

# ─── Rotación de credenciales ─────────────────────────────────────────────────
# 1. Genera la nueva credencial en el dashboard de SyncLead
# 2. Actualiza la variable de entorno en tu servidor con la nueva key
# 3. La credencial antigua queda como "revoked" y deja de funcionar

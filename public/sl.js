/**
 * SyncLead Universal Script v3
 *
 * ── Modo campaña única ──────────────────────────────────────────────────────
 *   window.SyncLeadKey  = "api_key_de_la_campaña";
 *   window.SyncLeadHost = "https://tu-app.vercel.app";
 *
 * ── Modo multi-campaña (generado desde SyncLead) ───────────────────────────
 *   window.SyncLeadHost      = "https://tu-app.vercel.app";
 *   window.SyncLeadCampaigns = {
 *     "nombre_utm_campaña_1": "api_key_1",
 *     "nombre_utm_campaña_2": "api_key_2",
 *     "_default":             "api_key_fallback",
 *   };
 *
 * Métodos disponibles:
 *   SyncLead.capture({ name, email, phone, city, negocio })
 *   SyncLead.purchase({ amount, currency, order_id, email, phone })
 */
(function () {
  'use strict';

  var host = (window.SyncLeadHost || '').replace(/\/$/, '');

  // Valida que haya al menos un modo de operación configurado
  if (!window.SyncLeadKey && !window.SyncLeadCampaigns) {
    console.warn('[SyncLead] Define window.SyncLeadKey o window.SyncLeadCampaigns.');
    return;
  }

  // ── Almacena UTMs, fbclid y parámetros de Meta Ads del URL en localStorage ─
  function _store() {
    try {
      var p = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) {
        var v = p.get(k);
        if (v) localStorage.setItem('_sl_' + k, v);
      });
      // Parámetros de Meta Ads: agregar en el anuncio como
      // adset_name={{adset.name}}&ad_name={{ad.name}}&campaign_name={{campaign.name}}
      var adsetName = p.get('adset_name');
      if (adsetName) localStorage.setItem('_sl_meta_adset_name', adsetName);
      var adName = p.get('ad_name');
      if (adName) localStorage.setItem('_sl_meta_ad_name', adName);
      var campaignName = p.get('campaign_name');
      if (campaignName) localStorage.setItem('_sl_meta_campaign_name', campaignName);
      var fbclid = p.get('fbclid');
      if (fbclid) {
        localStorage.setItem('_sl_fbc', 'fb.1.' + Date.now() + '.' + fbclid);
      }
    } catch (e) {}
  }

  // ── Lee los parámetros de atribución almacenados ──────────────────────────
  function _attrs() {
    var d = {};
    try {
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbc'].forEach(function (k) {
        var v = localStorage.getItem('_sl_' + k);
        if (v) d[k] = v;
      });
      var adsetName = localStorage.getItem('_sl_meta_adset_name');
      if (adsetName) d.meta_adset_name = adsetName;
      var adName = localStorage.getItem('_sl_meta_ad_name');
      if (adName) d.meta_ad_name = adName;
      var campaignName = localStorage.getItem('_sl_meta_campaign_name');
      if (campaignName) d.meta_campaign_name = campaignName;
      // Lee _fbp de cookie (puesto por el Pixel de Meta)
      var m = document.cookie.match(/_fbp=([^;]+)/);
      if (m) d.fbp = m[1];
    } catch (e) {}
    return d;
  }

  // ── Resuelve el API key correcto según el UTM almacenado ──────────────────
  // Prioridad: coincidencia exacta → _default → SyncLeadKey (orgánico) → primer key del mapa
  function _resolveKey() {
    if (window.SyncLeadCampaigns) {
      var utmCampaign = '';
      try { utmCampaign = localStorage.getItem('_sl_utm_campaign') || ''; } catch (e) {}
      var map = window.SyncLeadCampaigns;
      return map[utmCampaign] || map['_default'] || window.SyncLeadKey || Object.values(map)[0] || '';
    }
    return window.SyncLeadKey || '';
  }

  // ── Envía el lead a la campaña correcta ───────────────────────────────────
  function capture(data) {
    var key = _resolveKey();
    if (!key) { console.error('[SyncLead] No se encontró un API key para este lead.'); return Promise.reject('no key'); }

    var payload = _attrs();
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k];
    }
    if (!payload.landing_url) payload.landing_url = location.href;
    if (!payload.event_id) {
      try { payload.event_id = crypto.randomUUID(); } catch (e) {
        payload.event_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
    }

    // keepalive: true guarantees delivery even if the page navigates away immediately (e.g. SPA router.push).
    // Key goes in the header — the original approach confirmed working in production.
    return fetch(host + '/api/leads/ingest', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Campaign-Key': key },
      body:    JSON.stringify(payload),
      keepalive: true,
    }).then(function (r) { return r.json(); }).catch(function () {
      // keepalive fails if payload > 64 KB — plain fetch as last resort
      return fetch(host + '/api/leads/ingest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Campaign-Key': key },
        body:    JSON.stringify(payload),
      }).then(function (r) { return r.json(); });
    });
  }

  // ── Registra una venta en la página de confirmación de pedido ────────────
  // data: { amount (número), currency (ISO-4217), order_id?, email?, phone?, name? }
  function purchase(data) {
    var key = _resolveKey();
    if (!key) { console.error('[SyncLead] No se encontró un API key para registrar la venta.'); return Promise.reject('no key'); }
    if (!data || !data.amount || !data.currency) { console.error('[SyncLead] purchase() requiere amount y currency.'); return Promise.reject('missing fields'); }

    var payload = {};
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) payload[k] = data[k];
    }
    if (!payload.event_id) {
      try { payload.event_id = crypto.randomUUID(); } catch (e) {
        payload.event_id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }
    }

    return fetch(host + '/api/leads/purchase', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Campaign-Key': key },
      body:    JSON.stringify(payload),
    }).then(function (r) { return r.json(); });
  }

  window.SyncLead = { capture: capture, purchase: purchase };

  // Almacena UTMs en cuanto se carga el script
  _store();

})();

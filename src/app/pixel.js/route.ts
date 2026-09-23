import { NextResponse } from "next/server"

function buildPixelScript(appUrl: string): string {
  return `/* SyncLead Pixel SDK — https://synclead.io */
(function(){
'use strict';
var s=document.currentScript;
var TOKEN=s&&s.getAttribute('data-token')||'';
if(!TOKEN)return;
var CAMPAIGN=s&&s.getAttribute('data-campaign')||'';
var B='${appUrl}';

function ck(n){var c=document.cookie,i=c.indexOf(n+'=');return i<0?'':c.slice(i+n.length+1).split(';')[0];}
function vid(){var k='_sl_vid',v=localStorage.getItem(k);if(!v){v='v_'+Date.now()+'_'+Math.random().toString(36).slice(2,11);localStorage.setItem(k,v);}return v;}
function compact(o){var r={};for(var k in o){if(o[k]!==null&&o[k]!==undefined&&o[k]!=='')r[k]=o[k];}return r;}
function ctx(){return compact({visitorId:vid(),utmSource:localStorage.getItem('_sl_utm_source'),utmMedium:localStorage.getItem('_sl_utm_medium'),utmCampaign:localStorage.getItem('_sl_utm_campaign'),referrer:document.referrer||null,fbc:ck('_fbc')||localStorage.getItem('_sl_fbc')||null,fbp:ck('_fbp')||null});}

try{
  var p=new URLSearchParams(location.search);
  ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(k){var v=p.get(k);if(v&&!localStorage.getItem('_sl_'+k))localStorage.setItem('_sl_'+k,v);});
  var fbclid=p.get('fbclid');
  if(fbclid&&!ck('_fbc')&&!localStorage.getItem('_sl_fbc'))localStorage.setItem('_sl_fbc','fb.1.'+Date.now()+'.'+fbclid);
}catch(e){}

function post(url,headers,body){try{fetch(url,{method:'POST',headers:Object.assign({'Content-Type':'application/json'},headers),body:JSON.stringify(body),keepalive:true}).catch(function(){});}catch(e){}}
function collect(n,x){post(B+'/api/collect/'+TOKEN,{},Object.assign({eventName:n,pageUrl:location.href,environment:'production',parameters:{}},ctx(),x||{}));}
function behavior(t,d){post(B+'/api/behavior',{Authorization:'Bearer '+TOKEN},Object.assign({eventType:t,visitorId:vid()},d||{}));}
function utms(){return compact({utm_source:localStorage.getItem('_sl_utm_source'),utm_medium:localStorage.getItem('_sl_utm_medium'),utm_campaign:localStorage.getItem('_sl_utm_campaign'),utm_content:localStorage.getItem('_sl_utm_content')});}
function lead(d){post(B+'/api/ingest/form',{'X-Ingest-Token':TOKEN},Object.assign(CAMPAIGN?{campaign_id:CAMPAIGN}:{},utms(),d||{}));}

collect('PageView',{});
setInterval(function(){collect('session_ping',{});},30000);

// ── Meta Pixel (fbq) intercept ────────────────────────────────────────────────
// Intercepts fbq('track',...) / fbq('trackCustom',...) so sites already using
// the Meta Pixel get SyncLead event tracking automatically — no extra code needed.
var FB_SL={AddToCart:'add_to_cart',InitiateCheckout:'begin_checkout',Purchase:'purchase',ViewContent:'view_product',Lead:'form_submitted',AddPaymentInfo:'form_submitted',CompleteRegistration:'form_submitted',Subscribe:'form_submitted'};
var SL_BEH={add_to_cart:1,begin_checkout:1,purchase:1,view_product:1,form_submitted:1,checkout_abandoned:1,remove_from_cart:1,info_requested:1,payment_failed:1};
function fbqMap(fbName,params){
  var slName=FB_SL[fbName]||fbName;
  var bp={};
  if(params){
    if(typeof params.value==='number'&&params.value>0)bp.value=params.value;
    if(params.currency&&params.currency.length===3)bp.currency=params.currency.toUpperCase();
    var cids=params.content_ids;if(cids&&cids[0])bp.productId=String(cids[0]);
    if(params.num_items&&params.num_items>0)bp.quantity=Math.floor(params.num_items);
  }
  collect(slName,{});
  if(SL_BEH[slName])behavior(slName,compact(bp));
}
function wrapFbq(orig){
  if(orig&&orig._sl_wrapped)return orig;
  function wrapper(){
    var a=Array.prototype.slice.call(arguments);
    try{if(a[0]==='track'||a[0]==='trackCustom')fbqMap(a[1],a[2]||{});}catch(e){}
    if(typeof wrapper.callMethod==='function')return wrapper.callMethod.apply(wrapper,a);
    return orig.apply(this,arguments);
  }
  try{var sk={length:1,name:1,prototype:1,caller:1,arguments:1};Object.getOwnPropertyNames(orig).forEach(function(k){if(sk[k])return;Object.defineProperty(wrapper,k,{get:function(){return orig[k];},set:function(v){orig[k]=v;},configurable:true,enumerable:true});});}catch(e){}
  wrapper._sl_wrapped=true;
  return wrapper;
}
if(typeof window.fbq==='function'){
  window.fbq=wrapFbq(window.fbq);
  try{if(window._fbq!==window.fbq)window._fbq=window.fbq;}catch(e){}
}else{
  try{Object.defineProperty(window,'fbq',{configurable:true,set:function(val){var w=typeof val==='function'?wrapFbq(val):val;Object.defineProperty(window,'fbq',{configurable:true,writable:true,value:w});try{if(window._fbq!==window.fbq)window._fbq=window.fbq;}catch(e){};}});}catch(e){}
}
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('submit',function(e){
  var f=e.target;
  if(!f||typeof f.elements==='undefined')return;
  var em='',ph='',nm='';
  for(var i=0;i<f.elements.length;i++){
    var el=f.elements[i];
    if(el.type==='submit'||el.type==='button'||el.type==='hidden'||el.type==='checkbox'||el.type==='radio')continue;
    var v=(el.value||'').trim();
    if(!v)continue;
    var h=((el.type||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.autocomplete||'')).toLowerCase();
    if(!em&&(el.type==='email'||h.indexOf('email')!==-1||h.indexOf('correo')!==-1)&&/@\w+\.\w/.test(v)){em=v;}
    else if(!ph&&(el.type==='tel'||h.indexOf('phone')!==-1||h.indexOf('tel')!==-1||h.indexOf('celular')!==-1||h.indexOf('movil')!==-1||h.indexOf('whatsapp')!==-1)&&/^[+\\d\\s\\-.()]{5,25}$/.test(v)){ph=v;}
    else if(!nm&&(h.indexOf('name')!==-1||h.indexOf('nombre')!==-1)&&v.length>=2&&v.length<=100){nm=v;}
  }
  if((em||ph)&&nm){lead(compact({name:nm,email:em||undefined,phone:ph||undefined}));}
},true);

// Drain any calls queued before the pixel loaded (stub pattern)
var _q=(window.SyncLead&&window.SyncLead._q)||[];
window.SyncLead={
  lead:function(d){lead(d||{});},
  // event + purchase: dual-send — collect (live feed/visitors) + behavior (lead qualification)
  purchase:function(d){collect('purchase',d||{});behavior('purchase',d||{});},
  event:function(t,d){collect(t,d||{});behavior(t,d||{});},
  track:function(n,d){collect(n,d||{});},
};
// Backward compat: old per-site script exposed window.__synclead_collect
window.__synclead_collect=function(n,d){collect(n,d||{});};
for(var _i=0;_i<_q.length;_i++){
  var _c=_q[_i];
  if(_c[0]==='lead')lead(_c[1]||{});
  else if(_c[0]==='event'){collect(_c[1],_c[2]||{});behavior(_c[1],_c[2]||{});}
  else if(_c[0]==='purchase'){collect('purchase',_c[1]||{});behavior('purchase',_c[1]||{});}
  else if(_c[0]==='track')collect(_c[1],_c[2]||{});
  else if(_c[0]==='__synclead_collect')collect(_c[1],_c[2]||{});
}
})();`
}

export const dynamic = "force-dynamic"

export async function GET() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "")
  return new NextResponse(buildPixelScript(appUrl), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

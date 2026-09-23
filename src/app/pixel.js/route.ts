import { NextResponse } from "next/server"

function buildPixelScript(appUrl: string): string {
  return `/* SyncLead Pixel SDK — https://synclead.io */
(function(){
'use strict';
var s=document.currentScript;
var TOKEN=s&&s.getAttribute('data-token')||'';
if(!TOKEN)return;
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
function behavior(t,d){post(B+'/api/behavior',{Authorization:'Bearer '+TOKEN},Object.assign({eventType:t},d||{}));}
function lead(d){post(B+'/api/ingest/form',{'X-Ingest-Token':TOKEN},Object.assign({},d));}

collect('PageView',{});
setInterval(function(){collect('session_ping',{});},30000);

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

window.SyncLead={
  lead:function(d){lead(d||{});},
  purchase:function(d){behavior('purchase',d||{});},
  event:function(t,d){behavior(t,d||{});},
  track:function(n,d){collect(n,d||{});},
};
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

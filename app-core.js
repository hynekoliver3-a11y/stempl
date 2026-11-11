"use strict";
/* ================= CONFIG ================= */
const SB_URL="https://tmhzusgvgujrbihzusyt.supabase.co";
const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtaHp1c2d2Z3VqcmJpaHp1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzIwNzgsImV4cCI6MjEwODUwODA3OH0.NvEwfdi0OMtpmCbIqROIvB22ALDJfif6gR5FigEQ3Tw";
const API=SB_URL+"/functions/v1/stempl-api";
const PAY={month:"https://buy.stripe.com/9B65kD6NP4O9dwkfyeew808",year:"https://buy.stripe.com/28E8wP8VX4O92RGeuaew809"};
const PORTAL="https://billing.stripe.com/p/login/9B64gzc89cgB8c0euaew800";
const PRICE={month:490,year:4900};
/* Provider details shown in the terms and privacy policy – fill in IČO before selling */
const PROVIDER={name:"Oliver Hynek",city:"Brno",ico:"",email:"stemplapp@gmail.com",vatNote:"Provozovatel není plátcem DPH, ceny jsou konečné."};

const app=document.getElementById("app");
const BASE=location.origin+location.pathname;
const ERR={
  bad_code:"Nesprávná adresa podniku nebo kód.", too_soon:"Razítko už bylo přidáno před chvílí.", wrong_business:"Tahle karta patří jinému podniku.",
  no_card:"Karta nenalezena.", not_enough:"Na odměnu zatím nemá dost razítek.", consent_required:"Zaškrtněte souhlas, nebo nechte e-mail prázdný.",
  slug_taken:"Tahle adresa podniku už je obsazená, zvolte jinou.", bad_installer_key:"Nesprávný instalační klíč.", no_business:"Podnik nenalezen.",
  ambiguous:"Kód odpovídá více kartám, zadejte ho celý.", short_too_short:"Zadejte aspoň 6 znaků kódu karty.", rate_limited:"Příliš mnoho pokusů, zkuste to za chvíli.",
  network:"Nepodařilo se spojit se serverem. Zkontrolujte připojení a zkuste to znovu.", cannot_undo:"Razítko už vrátit nejde (víc než 10 minut, nebo už byla vydaná odměna).",
  subscription_inactive:"Předplatné podniku vypršelo. Majitel ho obnoví v Přehledu → Předplatné.", program_paused:"Věrnostní program tohoto podniku je teď pozastavený.",
  owner_only:"Tohle může jen majitel. Přihlaste se kódem majitele.", bad_email:"Zkontrolujte e-mailovou adresu.", no_email:"Vyplňte e-mail.",
  terms_required:"Je potřeba souhlasit s podmínkami.", bad_slug:"Adresa může mít 3–40 znaků: malá písmena, čísla a pomlčky.", bad_name:"Vyplňte název podniku.",
  bad_reward:"Vyplňte odměnu.", bad_needed:"Počet razítek musí být 3 až 30.", bad_token:"Odkaz je neplatný nebo už vypršel.", already_confirmed:"Registrace už je potvrzená. Přihlaste se v Přehledu.",
  expired:"Odkaz vypršel. Zaregistrujte se prosím znovu.", mail_not_configured:"Odesílání e-mailů zatím není zapnuté. Napište nám prosím na "+PROVIDER.email+".",
  server_error:"Na serveru se něco pokazilo. Zkuste to prosím znovu.", card_exists:"Na tento e-mail už u nás kartu máte.",
  query_too_short:"Napište aspoň 2 znaky.", bad_count:"Najednou jde přidat 1 až 5 razítek.", mail_failed:"E-mail se nepodařilo odeslat. Zkontrolujte adresu a zkuste to znovu.",
  demo_mode:"Tohle je ukázka s vymyšlenými daty, změny se tu neukládají.", confirm_mismatch:"Pro potvrzení napište přesně adresu podniku.", bad_days:"Neplatný počet dní.", no_payment:"Platba nenalezena."
};
const say=e=>ERR[e&&e.message]||ERR[(e&&e.message||"").split(" ")[0]]||("Něco se nepovedlo ("+(e&&e.message||"chyba")+").");

async function rpc(fn,args){
  if(demo.on) return demoRpc(fn,args||{});
  let r;
  try{ r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(args||{})}); }
  catch(e){ throw new Error("network"); }
  const txt=await r.text(); let data=null; try{ data=txt?JSON.parse(txt):null; }catch(e){}
  if(!r.ok) throw new Error((data&&data.message)||("http_"+r.status));
  return data;
}
async function api(action,body){
  let r;
  try{ r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.assign({action},body||{}))}); }
  catch(e){ throw new Error("network"); }
  let data=null; try{ data=await r.json(); }catch(e){}
  if(!r.ok) throw new Error((data&&data.error)||("http_"+r.status));
  return data;
}
const store={
  get(k,d){ try{ const v=localStorage.getItem("stempl."+k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem("stempl."+k,JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem("stempl."+k); }catch(e){} }
};
/* ask the browser to keep our storage (helps the card survive long inactivity) */
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{}); }catch(e){}
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const short=t=>String(t||"").slice(0,8).toUpperCase();
const CATS={kavarna:"Kavárna",bistro:"Bistro / restaurace",kadernictvi:"Kadeřnictví",barber:"Barbershop",kosmetika:"Kosmetika / nehty",mycka:"Myčka aut",jine:"Jiné"};
function plural(n,a,b,c){ return n===1?a:(n>=2&&n<=4?b:c); }
const visits=n=>n+" "+plural(n,"návštěva","návštěvy","návštěv");
const fmtD=v=>v?new Date(v).toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric",year:"numeric"}):"–";
const fmtDT=v=>v?new Date(v).toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric"})+" "+new Date(v).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"–";
const kc=n=>n.toLocaleString("cs-CZ")+" Kč";
function lum(hex){ const c=[1,3,5].map(i=>{ const v=parseInt(hex.substr(i,2),16)/255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }); return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
function darken(hex,f){ return "#"+[1,3,5].map(i=>Math.round(parseInt(hex.substr(i,2),16)*f).toString(16).padStart(2,"0")).join(""); }
/* light brand colours (yellow, pastel) get dark text and a darker ink for stamps, so everything stays readable */
function setAccent(el,hex){
  if(!el||!/^#[0-9a-f]{6}$/i.test(hex||"")) return;
  const L=lum(hex); let ink=hex; for(let f=.85;lum(ink)>.18&&f>.2;f-=.1) ink=darken(hex,f);
  el.style.setProperty("--accent",hex); el.style.setProperty("--accent-ink",ink); el.style.setProperty("--on-accent",L>.45?"#1c1a17":"#fff");
}
function slugify(s){ return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40); }
function qrSVG(text){
  if(!window.StemplQR) return '<div class="small muted" style="padding:8px">QR se nenačetl. Použijte kód karty.</div>';
  const q=window.StemplQR(text,"M"), n=q.n, m=3; let d="";
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(q.dark(r,c)) d+=`M${c+m} ${r+m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n+2*m} ${n+2*m}" shape-rendering="crispEdges" role="img" aria-label="QR kód"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
function slotSVG(i,filled,needed,isNew){
  const rot=((i*47)%26)-13;
  if(filled) return `<svg class="slot${isNew?" new":""}" viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(${rot} 50 50)" filter="url(#ink)" style="color:var(--accent-ink,var(--accent))"><circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="2"/><path d="M33 52l12 12 23-25" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  const last=i===needed-1;
  return `<svg class="slot" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 7" opacity=".3"/>${last?'<path d="M50 31l5.6 11.6 12.8 1.8-9.3 9 2.2 12.7L50 60l-11.3 6.1 2.2-12.7-9.3-9 12.8-1.8z" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".45" stroke-linejoin="round"/>':`<text class="num" x="50" y="58" text-anchor="middle">${i+1}</text>`}</svg>`;
}
function stampsGrid(stamps,needed,newIndex){
  const n=Math.min(stamps,needed); let h="";
  for(let i=0;i<needed;i++) h+=slotSVG(i,i<n,needed,i===newIndex);
  const cls=needed%5===0?" n"+needed:"";
  return `<div class="stamps${cls}" role="img" aria-label="${n} z ${needed} razítek">${h}</div>`;
}
function downloadFile(name,content,type){
  const b=new Blob([content],{type}); const a=document.createElement("a");
  a.href=URL.createObjectURL(b); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
function copy(text,out){
  const done=()=>{ if(out) out.textContent="Zkopírováno."; }, fallback=()=>{ if(out) out.textContent=text; };
  try{ navigator.clipboard.writeText(text).then(done,fallback); }catch(e){ fallback(); }
}

/* ---------- sheet ---------- */
function openSheet(html){ $("#sheetInner").innerHTML=html; $("#sheet").classList.add("on"); $("#scrim").classList.add("on"); $("#sheet").scrollTop=0; }
function closeSheet(){ $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); }
$("#scrim").addEventListener("click",closeSheet);
addEventListener("keydown",e=>{ if(e.key==="Escape") closeSheet(); });

/* ---------- install to phone (home screen) ---------- */
/* Android/Chrome offers a native install prompt; iPhone has none, so we show short instructions instead */
let installEvt=null;
const isStandalone=()=>{ try{ return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true; }catch(e){ return false; } };
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); installEvt=e; });
addEventListener("appinstalled",()=>{ installEvt=null; $$("[data-install]").forEach(b=>b.hidden=true); });
function installBtn(label,cls){ return isStandalone()?"":`<button class="btn ${cls||"primary"}" type="button" data-install>${esc(label||"Stáhnout do telefonu")}</button>`; }
function setManifest(name,shortName,url){
  try{
    const m={name,short_name:shortName,start_url:url,scope:BASE,display:"standalone",background_color:"#f5f2ea",theme_color:"#f5f2ea",lang:"cs",
      icons:[{src:BASE+"icon-192.png",sizes:"192x192",type:"image/png"},{src:BASE+"icon-512.png",sizes:"512x512",type:"image/png"}]};
    let l=document.querySelector('link[rel="manifest"]'); if(!l){ l=document.createElement("link"); l.rel="manifest"; document.head.appendChild(l); }
    l.href="data:application/manifest+json,"+encodeURIComponent(JSON.stringify(m));
  }catch(e){}
}
document.addEventListener("click",async e=>{
  const b=e.target.closest&&e.target.closest("[data-install]"); if(!b) return;
  if(installEvt){
    const ev=installEvt; installEvt=null;
    try{ ev.prompt(); await ev.userChoice; }catch(err){}
    return;
  }
  const steps=isIOS()
    ?`<ol class="small" style="margin:0;padding-left:20px;display:grid;gap:8px"><li>Dole (nebo nahoře) ťukněte na <b>Sdílet</b> – čtvereček se šipkou nahoru.</li><li>Vyberte <b>Přidat na plochu</b>.</li><li>Potvrďte <b>Přidat</b>. Ikona Štemplu se objeví mezi aplikacemi.</li></ol><p class="tiny muted">Položku nevidíte? Sjeďte v nabídce níž, nebo stránku otevřete v Safari.</p>`
    :`<ol class="small" style="margin:0;padding-left:20px;display:grid;gap:8px"><li>Otevřete nabídku prohlížeče – tři tečky <b>⋮</b> vpravo nahoře.</li><li>Vyberte <b>Nainstalovat aplikaci</b> nebo <b>Přidat na plochu</b>.</li><li>Potvrďte. Ikona Štemplu se objeví mezi aplikacemi.</li></ol>`;
  openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">Stáhnout do telefonu</h2><p class="muted">Štempl se přidá na plochu jako aplikace. Nic se nestahuje z obchodu a nezabere místo.</p>${steps}<button class="btn primary" type="button" id="instOk">Rozumím</button>`);
  $("#instOk").addEventListener("click",closeSheet);
});

/* ---------- cookie notice (information only – we use no consent-requiring cookies) ---------- */
if(!store.get("cookieok",false)){ $("#cbar").hidden=false; document.body.classList.add("hasbar"); }
$("#cbarOk").addEventListener("click",()=>{ store.set("cookieok",true); $("#cbar").hidden=true; document.body.classList.remove("hasbar"); });

/* ---------- router ---------- */
let cleanup=[], routeSeq=0;
function onLeave(fn){ cleanup.push(fn); }
/* async screens check this after loading, so a slow answer never paints over a screen the user already moved to */
const stale=my=>my!==routeSeq;
function route(){
  routeSeq++;
  cleanup.forEach(f=>{try{f()}catch(e){}}); cleanup=[]; closeSheet();
  const h=decodeURIComponent(location.hash.replace(/^#\/?/,"")).split("/");
  window.scrollTo(0,0); document.title="Štempl";
  demo.on=h[0]==="demo";
  const ss=demo.on?null:sess.get(), cta=$("#topCta");
  cta.hidden=["k","c","moje","obnovit"].includes(h[0])||(h[0]==="r"&&!ss);
  $("#topLogin").hidden=cta.hidden||!!ss;
  if(ss){ cta.href=ss.role==="owner"?"#/prehled":"#/obsluha"; cta.textContent=ss.role==="owner"?"Přehled":"Obsluha"; } else { cta.href="#/registrace"; cta.textContent="Vyzkoušet zdarma"; }
  switch(h[0]){
    case "k": if(h[1]) return viewJoin(h[1]); break;
    case "c": if(h[1]) return viewCardToken(h[1]); break;
    case "r": if(h[1]) return viewScanTarget(h[1]); break;
    case "moje": return viewMyCards();
    case "obnovit": return viewRecover(h[1]||"");
    case "obsluha": return viewStaff();
    case "prehled": return viewOwner(h[1]);
    case "demo": return viewOwner(h[1]);
    case "registrace": return viewRegister();
    case "potvrdit": return viewConfirm(h[1]||"");
    case "zapomenuty-kod": return viewForgot();
    case "novy-kod": return viewResetCode(h[1]||"");
    case "zaplaceno": return viewPaid();
    case "podminky": return viewTerms();
    case "soukromi": return viewPrivacy();
    case "sprava": return viewAdmin();
    case "novy": return viewNew();
  }
  return viewLanding();
}
addEventListener("hashchange",route);
/* header links that scroll to a section of the landing page */
document.addEventListener("click",e=>{
  const a=e.target.closest&&e.target.closest("[data-jump]"); if(!a) return; e.preventDefault();
  const go=()=>{ const el=document.getElementById(a.dataset.jump); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); };
  if(document.getElementById(a.dataset.jump)) go(); else { location.hash="#/"; setTimeout(go,120); }
});
function foot(){ return `<footer class="foot"><div class="wrap"><span>Štempl · ${esc(PROVIDER.city)} · <a href="mailto:${esc(PROVIDER.email)}">${esc(PROVIDER.email)}</a></span><span><a href="#/podminky">Obchodní podmínky</a> · <a href="#/soukromi">Ochrana osobních údajů</a> · <a href="cookies.html">Cookies</a> · <a href="#/moje">Moje karty</a></span></div></footer>`; }
function fail(msg,extra){ app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><h2 style="font-size:1.8rem">Jejda</h2><p class="muted">${esc(msg)}</p>${extra||""}<a class="btn" href="#/">Na úvod</a></div>`; }
function loading(t){ app.innerHTML=`<div class="wrap narrow loadbox"><div class="spin" aria-hidden="true"></div><p class="muted">${esc(t||"Načítám…")}</p></div>`; }

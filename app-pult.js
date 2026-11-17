"use strict";
/* ================= PULT (tablet or old phone at the counter) =================
   Two ways to stamp without staff touching their own phone:
   1. "Skenovat karty": the camera scans continuously, the customer holds up their card QR, the stamp is added on its own.
   2. "QR pro zákazníky": the screen shows a one-time QR that changes every 30 s; the customer scans it with their own phone.
   Stamps given while there is no signal wait in a queue on the device and are sent once it is back online. */

const PULT_HOLD=2600;           // how long a result stays on screen before the next customer
const PULT_SAME_CARD=12000;     // the same card is ignored for a while, so one visit is not stamped twice

/* ---------- offline queue (shared with the staff screen) ---------- */
const stampQueue={
  all(){ return store.get("queue",[]); },
  add(item){ const q=this.all(); q.push(Object.assign({at:Date.now()},item)); store.set("queue",q.slice(-200)); },
  set(q){ store.set("queue",q); }
};
let flushing=false;
async function flushQueue(){
  const s=demo.on?null:sess.get(); const q=stampQueue.all();
  if(flushing||!s||!q.length||!navigator.onLine) return;
  flushing=true;
  const left=[], failed=store.get("queuefail",[]), before=q.length;
  for(const it of q){
    if(it.slug!==s.slug){ left.push(it); continue; }
    try{ await rpc("stamp_card_v2",{p_slug:s.slug,p_code:s.code,p_token:it.token,p_count:it.count||1,p_by:s.by||null}); }
    catch(e){
      if(e.message==="network"){ left.push(it); continue; }
      if(e.message==="session_expired"||e.message==="bad_code"){ left.push(it); break; }
      failed.push({token:it.token,at:it.at,error:e.message});
    }
  }
  /* stamps queued while this ran stay in the queue */
  stampQueue.set(left.concat(stampQueue.all().slice(before)));
  store.set("queuefail",failed.slice(-50));
  flushing=false;
  document.dispatchEvent(new CustomEvent("stempl-queue"));
}
addEventListener("online",flushQueue);
setInterval(()=>{ if(stampQueue.all().length) flushQueue(); },30000);
function queueBadge(){
  const n=stampQueue.all().length, f=store.get("queuefail",[]).length;
  if(!n&&!f) return "";
  return `<div class="note${f?" bad":""}" id="queueNote">${n?`Bez signálu: ${n} ${plural(n,"razítko čeká","razítka čekají","razítek čeká")} na odeslání. Odešlou se samy, až bude připojení.`:""}${f?` ${f} ${plural(f,"razítko se nepodařilo","razítka se nepodařila","razítek se nepodařilo")} odeslat (karta smazaná nebo limit). <button class="linkbtn" type="button" id="queueClear">Skrýt</button>`:""}</div>`;
}

/* ---------- generic QR scanner on a <video> element ---------- */
async function startScanner(video,facing,onText){
  let stream=null, raf=0, alive=true;
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing||"environment"},audio:false});
  video.srcObject=stream; await video.play().catch(()=>{});
  let det=null; if("BarcodeDetector" in window){ try{ det=new BarcodeDetector({formats:["qr_code"]}); }catch(e){} }
  if(!det) await loadJsQR();
  const cv=document.createElement("canvas"), cx=cv.getContext("2d",{willReadFrequently:true}); let lastTry=0, paused=false;
  const viaJsQR=()=>{
    const now=performance.now(); if(now-lastTry<140) return null; lastTry=now;
    const w=video.videoWidth, h=video.videoHeight; if(!w||!h) return null;
    const k=Math.min(1,640/Math.max(w,h)); cv.width=Math.round(w*k); cv.height=Math.round(h*k);
    cx.drawImage(video,0,0,cv.width,cv.height);
    const r=window.jsQR(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:"dontInvert"});
    return r?r.data:null;
  };
  const loop=async()=>{
    if(!alive) return;
    if(!paused&&video.readyState>=2){
      let txt=null; try{ if(det){ const r=await det.detect(video); if(r[0]) txt=r[0].rawValue; } else txt=viaJsQR(); }catch(e){}
      if(txt) await onText(txt);
    }
    raf=requestAnimationFrame(loop);
  };
  loop();
  return {
    pause(v){ paused=v; },
    stop(){ alive=false; cancelAnimationFrame(raf); if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
  };
}

/* ---------- screen wake lock ---------- */
function keepAwake(){
  let lock=null, gone=false;
  const get=()=>{ try{ if(navigator.wakeLock&&!document.hidden&&!gone) navigator.wakeLock.request("screen").then(l=>{ lock=l; }).catch(()=>{}); }catch(e){} };
  const vis=()=>{ if(!document.hidden) get(); };
  get(); document.addEventListener("visibilitychange",vis);
  return ()=>{ gone=true; document.removeEventListener("visibilitychange",vis); try{ if(lock) lock.release(); }catch(e){} };
}

/* ---------- the Pult screen ---------- */
function viewPult(){
  const s=sess.get();
  if(!s) return loginView("Pult",viewPult);
  if(demo.on) return fail("Režim Pult v ukázce nejde vyzkoušet. Založte si podnik zdarma.",`<a class="btn primary" href="#/registrace">Založit podnik</a>`);
  document.title="Pult · "+s.name;
  document.body.classList.add("pultmode");
  const mode=store.get("pultmode","scan"), facing=store.get("pultcam","user");
  app.innerHTML=`<div class="pult">
    <div class="pult-top"><div><div class="eyebrow">Pult</div><b>${esc(s.name)}</b></div>
      <div class="row-btns"><div class="tabs" role="group" aria-label="Režim"><button type="button" data-pm="scan" aria-pressed="${mode==="scan"}">Skenovat karty</button><button type="button" data-pm="qr" aria-pressed="${mode==="qr"}">QR pro zákazníky</button></div>
      <a class="btn ghost sm" href="#/obsluha">Ukončit</a></div></div>
    <div id="pultQueue">${queueBadge()}</div>
    <div id="pultBody" class="pult-body"></div>
  </div>`;
  const release=keepAwake();
  let stopMode=()=>{};
  onLeave(()=>{ stopMode(); release(); document.body.classList.remove("pultmode"); document.removeEventListener("stempl-queue",refreshQueue); });
  const refreshQueue=()=>{ const q=$("#pultQueue"); if(q){ q.innerHTML=queueBadge(); const c=$("#queueClear"); if(c) c.addEventListener("click",()=>{ store.set("queuefail",[]); refreshQueue(); }); } };
  document.addEventListener("stempl-queue",refreshQueue); refreshQueue(); flushQueue();
  const start=m=>{
    stopMode(); store.set("pultmode",m);
    $$("[data-pm]").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.pm===m)));
    stopMode=m==="qr"?pultQr(s):pultScan(s,facing);
  };
  $$("[data-pm]").forEach(x=>x.addEventListener("click",()=>start(x.dataset.pm)));
  start(mode);
}

/* result card shown for a moment after each customer */
function pultResult(host,kind,title,sub,extra){
  host.innerHTML=`<div class="pult-res ${kind}"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#mark"/></svg><b>${title}</b>${sub?`<span>${sub}</span>`:""}${extra||""}</div>`;
}

function pultScan(s,facing){
  const body=$("#pultBody");
  body.innerHTML=`<div class="pult-cam"><video id="pv" playsinline muted></video><div class="frame"></div><div class="hint">Přiložte QR kód své karty</div></div>
    <div id="pultOut" class="pult-out" aria-live="assertive"></div>
    <div class="row-btns" style="justify-content:center"><button class="btn ghost sm" type="button" id="flip">${facing==="user"?"Přepnout na zadní kameru":"Přepnout na přední kameru"}</button></div>`;
  let sc=null, gone=false, busy=false, last="", lastAt=0, timer=0;
  const out=$("#pultOut");
  const idle=()=>{ out.innerHTML=`<p class="muted" style="text-align:center">Zákazník přiloží kartu k fotoaparátu. Razítko se přidá samo.</p>`; };
  idle();
  const handle=async txt=>{
    const m=String(txt).toLowerCase().match(/[0-9a-f]{32}/); if(!m||busy) return;
    const tok=m[0]; if(tok===last&&Date.now()-lastAt<PULT_SAME_CARD) return;
    busy=true; last=tok; lastAt=Date.now(); sc&&sc.pause(true);
    try{
      const c=await rpc("stamp_card_v2",{p_slug:s.slug,p_code:s.code,p_token:tok,p_count:1,p_by:s.by||"pult"});
      const n=c.business.stamps_needed;
      beep(true); if(navigator.vibrate) navigator.vibrate([30,40,30]);
      if(c.reward_ready){
        pultResult(out,"ok",`Razítko přidáno${c.name?", "+esc(c.name):""}`,`${Math.min(c.stamps,n)} z ${n} · odměna čeká: ${esc(c.business.reward_text)}`,
          `<div class="row-btns" style="justify-content:center;margin-top:10px"><button class="btn light" type="button" id="pRedeem">Vydat odměnu</button><button class="btn onink" type="button" id="pLater">Později</button></div>`);
        const done=()=>{ clearTimeout(timer); busy=false; sc&&sc.pause(false); idle(); };
        $("#pRedeem").addEventListener("click",async()=>{ try{ await rpc("redeem_reward_v2",{p_slug:s.slug,p_code:s.code,p_token:tok,p_by:s.by||"pult"}); beep(true); pultResult(out,"ok","Odměna vydána",esc(c.business.reward_text)); timer=setTimeout(done,PULT_HOLD); }catch(e){ if(authFail(e)) return; pultResult(out,"bad","Odměnu se nepodařilo vydat",esc(say(e))); timer=setTimeout(done,PULT_HOLD); } });
        $("#pLater").addEventListener("click",done);
        timer=setTimeout(done,20000);
        return;
      }
      pultResult(out,"ok",`Razítko přidáno${c.name?", "+esc(c.name):""}`,`${Math.min(c.stamps,n)} z ${n} · ještě ${Math.max(0,n-c.stamps)} do odměny`);
    }catch(e){
      if(authFail(e)) return;
      if(e.message==="network"){ stampQueue.add({slug:s.slug,token:tok,count:1}); beep(true); pultResult(out,"warn","Razítko uloženo","Není signál. Odešle se samo, až bude připojení."); document.dispatchEvent(new CustomEvent("stempl-queue")); }
      else { beep(false); if(navigator.vibrate) navigator.vibrate(200); pultResult(out,"bad","Razítko nepřidáno",esc(say(e))); }
    }
    timer=setTimeout(()=>{ busy=false; if(!gone){ sc&&sc.pause(false); idle(); } },PULT_HOLD);
  };
  (async()=>{
    try{ sc=await startScanner($("#pv"),facing,handle); if(gone) sc.stop(); }
    catch(e){ out.innerHTML=`<p class="msg err">Kamera není dostupná. Povolte fotoaparát v nastavení prohlížeče, nebo použijte režim QR pro zákazníky.</p>`; }
  })();
  $("#flip").addEventListener("click",()=>{ store.set("pultcam",facing==="user"?"environment":"user"); viewPult(); });
  return ()=>{ gone=true; clearTimeout(timer); if(sc) sc.stop(); };
}

function pultQr(s){
  const body=$("#pultBody");
  body.innerHTML=`<div class="pult-qr"><div class="qrfull-qr" id="pqr"></div><div class="pult-bar"><i id="pbar"></i></div>
    <p class="pult-help">Naskenujte fotoaparátem svého telefonu.<br>Razítko se připíše na vaši kartu, nová karta se založí sama.</p></div>
    <div id="pultOut" class="pult-out" aria-live="assertive"></div>`;
  let gone=false, tIssue=0, tPoll=0, tShow=0, exp=0, seen=null;
  const out=$("#pultOut");
  const issue=async()=>{
    clearTimeout(tIssue);
    try{
      const r=await rpc("pult_issue",{p_slug:s.slug,p_code:s.code});
      if(gone) return;
      $("#pqr").innerHTML=qrSVG(BASE+"#/s/"+encodeURIComponent(s.slug)+"/"+r.claim); exp=Date.now()+30000;
      if(out.querySelector(".msg")) out.innerHTML="";   // clear a connection error, keep a "stamp added" result on screen
      tIssue=setTimeout(issue,30000);
    }catch(e){
      if(authFail(e)) return;
      $("#pqr").innerHTML=""; out.innerHTML=`<p class="msg err" style="text-align:center">${esc(e.message==="network"?"Není připojení k internetu. Zkouším znovu…":say(e))}</p>`;
      tIssue=setTimeout(issue,5000);
    }
  };
  const poll=async()=>{
    if(gone) return;
    try{
      const st=await rpc("pult_status",{p_slug:s.slug,p_code:s.code});
      /* the first answer only tells what was already there before this screen opened */
      if(seen===null){ seen=st.at||""; }
      else if(st.used&&st.at!==seen){
        seen=st.at;
        beep(true);
        pultResult(out,"ok",`Razítko přidáno${st.name?", "+esc(st.name):""}`,`${Math.min(st.stamps,st.needed)} z ${st.needed}${st.reward_ready?" · odměna čeká, řekněte si o ni":""}`);
        clearTimeout(tShow); tShow=setTimeout(()=>{ if(!gone) out.innerHTML=""; },PULT_HOLD+1000);
        await issue();
      }
    }catch(e){ if(authFail(e)) return; }
    tPoll=setTimeout(poll,2000);
  };
  const bar=setInterval(()=>{ const b=$("#pbar"); if(b) b.style.width=Math.max(0,Math.min(100,(exp-Date.now())/300))+"%"; },250);
  issue().then(()=>{ tPoll=setTimeout(poll,2000); });
  return ()=>{ gone=true; clearTimeout(tIssue); clearTimeout(tPoll); clearTimeout(tShow); clearInterval(bar); };
}

/* ---------- customer side of the counter QR ---------- */
const CLAIM_TTL=60000;
async function viewClaim(slug,claim){
  slug=String(slug).toLowerCase(); claim=String(claim).toUpperCase().replace(/[^0-9A-F]/g,"");
  history.replaceState(null,"","#/k/"+slug);
  const token=cardStore.all()[slug];
  if(!token){
    /* no card yet on this phone: remember the code, the join form will use it right after the card is created */
    try{ sessionStorage.setItem("stempl.claim",JSON.stringify({slug,claim,at:Date.now()})); }catch(e){}
    return viewJoin(slug);
  }
  loading("Přidávám razítko…");
  await claimFor(slug,token,claim);
}
async function claimFor(slug,token,claim){
  try{
    const c=await rpc("claim_stamp",{p_slug:slug,p_card:token,p_claim:claim});
    await showCard(token,slug,c,false);
    thanks(c,token);
  }catch(e){
    const msg=e.message==="claim_used"||e.message==="claim_expired"||e.message==="claim_invalid"
      ?"Tenhle QR kód už neplatí. Naskenujte prosím ten, který je teď na pultu."
      :say(e);
    await showCard(token,slug,null,false);
    openSheet(`<h2 id="sheetTitle" style="font-size:1.5rem">Razítko nepřidáno</h2><p class="muted">${esc(msg)}</p><button class="btn primary" type="button" id="okBtn">Rozumím</button>`);
    $("#okBtn").addEventListener("click",closeSheet);
  }
}
/* called by the join form after a new card was created */
function pendingClaim(slug){
  try{
    const p=JSON.parse(sessionStorage.getItem("stempl.claim")||"null"); sessionStorage.removeItem("stempl.claim");
    if(p&&p.slug===slug&&Date.now()-p.at<CLAIM_TTL) return p.claim;
  }catch(e){}
  return null;
}

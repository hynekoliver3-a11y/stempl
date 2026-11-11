"use strict";
/* ================= STAFF / OWNER SESSION ================= */
const sess={ get(){ return demo.on?DEMO_SESS:store.get("staff",null); }, set(v){ if(!demo.on) store.set("staff",v); }, clear(){ if(!demo.on) store.del("staff"); } };
function loginView(title,next,opts){
  const s=sess.get();
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:32px">
    <div><div class="eyebrow">${esc(title)}</div><h1 style="font-size:2.4rem;margin-top:8px">Přihlášení podniku</h1></div>
    <form class="form panel" id="loginForm" novalidate>
      <label class="field">Adresa podniku <small>z e-mailu s přístupy, např. ukazka</small><input class="input" id="sSlug" autocapitalize="off" autocomplete="username" value="${esc(s&&s.slug||"")}" required></label>
      <label class="field">${opts&&opts.owner?"Kód majitele":"Kód obsluhy nebo kód majitele"} <small>8 znaků</small><input class="input mono" id="sCode" autocapitalize="characters" autocomplete="current-password" maxlength="12" required></label>
      <button class="btn primary big" type="submit">Přihlásit</button>
      <div class="msg err" id="sOut" role="status"></div>
    </form>
    <p class="small muted">Nemáte ještě účet? <a href="#/registrace">Zaregistrujte podnik</a>. Zapomněli jste kód majitele? <a href="#/zapomenuty-kod">Pošleme nový</a>.</p></div>`;
  $("#loginForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#sOut"); out.textContent=""; const btn=e.target.querySelector("button"); btn.disabled=true;
    const slug=$("#sSlug").value.trim().toLowerCase(), code=$("#sCode").value.trim().toUpperCase();
    try{ const b=await rpc("staff_login",{p_slug:slug,p_code:code}); sess.set({slug,code,name:b.name,role:b.role}); next(); }
    catch(err){ out.textContent=say(err); btn.disabled=false; }
  });
}
function logout(){ sess.clear(); route(); }
function authFail(e){ if(e&&e.message==="bad_code"){ sess.clear(); route(); return true; } return false; }

/* card panel for staff: stamp, reward, undo, visits */
function staffCardPanel(host,s,cur,opts){
  opts=opts||{};
  const draw=()=>{
    const b=cur.business, n=b.stamps_needed;
    const canUndo=cur.last_stamp_at&&(Date.now()-new Date(cur.last_stamp_at).getTime()<10*60*1000);
    host.innerHTML=`<div class="result stack" id="rc" style="gap:14px">
      ${b.active===false?`<div class="note bad">${ERR.subscription_inactive}</div>`:""}
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><b style="font-size:1.3rem">${cur.name?esc(cur.name):"Zákazník"}</b><span class="mono small muted">${short(cur.token)}</span></div>
      ${stampsGrid(cur.stamps,n,-1)}
      <div class="kv"><div><b>${cur.total_stamps}</b><span>návštěv celkem</span></div><div><b>${Math.min(cur.stamps,n)}/${n}</b><span>na kartě</span></div><div><b>${cur.rewards_redeemed}</b><span>vydaných odměn</span></div></div>
      <p class="small muted">Karta od ${fmtD(cur.created_at)} · poslední návštěva ${cur.last_stamp_at?fmtDT(cur.last_stamp_at):"zatím žádná"}</p>
      ${cur.reward_ready?`<button class="btn accent big" id="redeemBtn" type="button">Vydat odměnu: ${esc(b.reward_text)}</button>`:""}
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px">
        <button class="btn ${cur.reward_ready?"":"accent"} big" id="stampBtn" type="button"${b.active===false?" disabled":""}>Přidat razítko</button>
        <button class="btn big" id="stamp2Btn" type="button" style="width:auto;padding:0 18px"${b.active===false?" disabled":""} aria-label="Přidat 2 razítka">+2</button>
      </div>
      ${canUndo?`<button class="btn ghost" id="undoBtn" type="button">Vrátit poslední přidání</button>`:""}
      ${opts.next?`<button class="btn ghost" id="nextBtn" type="button">Další zákazník</button>`:""}
      <div class="msg err" id="rcOut" role="status"></div></div>`;
    setAccent($("#rc",host),b.accent);
    $("#stampBtn",host).addEventListener("click",()=>act("stamp_card"));
    $("#stamp2Btn",host).addEventListener("click",()=>act("stamp_card",2));
    if(cur.reward_ready) $("#redeemBtn",host).addEventListener("click",()=>act("redeem_reward"));
    if(canUndo) $("#undoBtn",host).addEventListener("click",()=>act("undo_stamp"));
    if(opts.next) $("#nextBtn",host).addEventListener("click",opts.next);
  };
  async function act(fn,count){
    $$("button",host).forEach(b=>b.disabled=true);
    try{
      const args={p_slug:s.slug,p_code:s.code,p_token:cur.token}; if(count) args.p_count=count;
      cur=await rpc(fn,args);
      const what=fn==="stamp_card"?(count>1?count+" razítka přidána":"Razítko přidáno"):fn==="redeem_reward"?"Odměna vydána":((cur.undone||1)>1?"Razítka vrácena":"Razítko vráceno");
      host.innerHTML=`<div class="done"><svg viewBox="0 0 100 100"><use href="#mark"/></svg><b style="font-size:1.4rem">${what}</b><span>${Math.min(cur.stamps,cur.business.stamps_needed)} z ${cur.business.stamps_needed} · ${visits(cur.total_stamps)}${cur.reward_ready?" · odměna připravená":""}</span></div>
        <div class="row-btns" style="margin-top:12px"><button class="btn ghost" type="button" id="backCard">Zpět na kartu</button>${opts.next?`<button class="btn primary" type="button" id="nextAfter">Další zákazník</button>`:""}</div>
        ${opts.next?"":`<p class="small muted" style="margin-top:10px">Dalšího zákazníka naskenujte znovu fotoaparátem.</p>`}`;
      if(navigator.vibrate) navigator.vibrate([30,40,30]);
      $("#backCard",host).addEventListener("click",draw);
      if(opts.next) $("#nextAfter",host).addEventListener("click",opts.next);
    }catch(e){ if(authFail(e)) return; draw(); $("#rcOut",host).textContent=say(e); }
  }
  draw();
}

/* QR on a customer's card → opened by the phone's camera */
async function viewScanTarget(token){
  token=String(token).toLowerCase().replace(/[^0-9a-f]/g,"");
  const s=sess.get();
  if(!s){
    if(Object.values(cardStore.all()).includes(token)) return viewCardToken(token);   // the customer's own phone
    document.title="Karta zákazníka · Štempl";
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
      <div><div class="eyebrow">QR kód věrnostní karty</div><h1 style="font-size:2rem;margin-top:8px">Jste obsluha?</h1><p class="muted" style="margin-top:8px">Přihlaste se a hned můžete přidat razítko. Přihlášení vydrží, příště už se ptát nebudeme.</p></div>
      <form class="form panel" id="qLogin" novalidate>
        <label class="field">Adresa podniku<input class="input" id="qSlug" autocapitalize="off" autocomplete="username" required></label>
        <label class="field">Kód obsluhy<input class="input mono" id="qCode" autocapitalize="characters" autocomplete="current-password" maxlength="12" required></label>
        <button class="btn primary big" type="submit">Přihlásit a otevřít kartu</button>
        <div class="msg err" id="qOut" role="status"></div>
      </form>
      <a class="btn ghost" href="#/c/${esc(token)}">Jsem zákazník – otevřít moji kartu</a></div>`;
    $("#qLogin").addEventListener("submit",async e=>{
      e.preventDefault(); const out=$("#qOut"); out.textContent=""; const slug=$("#qSlug").value.trim().toLowerCase(), code=$("#qCode").value.trim().toUpperCase();
      try{ const b=await rpc("staff_login",{p_slug:slug,p_code:code}); sess.set({slug,code,name:b.name,role:b.role}); viewScanTarget(token); }
      catch(err){ out.textContent=say(err); }
    });
    return;
  }
  loading("Načítám kartu zákazníka…"); const my=routeSeq;
  let c; try{ c=await rpc("lookup_card",{p_slug:s.slug,p_code:s.code,p_token:token}); }
  catch(e){
    if(stale(my)) return;
    if(authFail(e)) return;
    if(e.message==="wrong_business") return fail("Tahle karta patří jinému podniku.",`<a class="btn ghost" href="#/c/${esc(token)}">Otevřít jako zákazník</a>`);
    return fail(say(e));
  }
  if(stale(my)) return;
  document.title="Obsluha · "+s.name;
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:18px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="eyebrow">Obsluha</div><b>${esc(s.name)}</b></div><a class="btn ghost sm" href="#/obsluha">Obsluha</a></div><div id="res"></div></div>`;
  staffCardPanel($("#res"),s,c);
}

/* ================= STAFF ================= */
function viewStaff(){
  const s=sess.get();
  if(!s) return loginView("Obsluha",viewStaff);
  document.title="Obsluha · "+s.name;
  const hasDet=("BarcodeDetector" in window);
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><div class="eyebrow">Obsluha${s.role==="owner"?" · majitel":""}</div><h1 style="font-size:1.8rem;margin-top:4px">${esc(s.name)}</h1></div><button class="btn ghost sm" id="out" type="button">Odhlásit</button></div>
    <div id="scanArea"></div>
    <div id="res"></div>
    <div class="panel stack" style="gap:12px">
      <b>Zákazník nemá QR po ruce?</b>
      <form class="form" id="manual" novalidate><div class="two" style="grid-template-columns:1fr auto"><input class="input" id="mCode" type="search" placeholder="Jméno, kód karty nebo e-mail" maxlength="120" autocomplete="off" aria-label="Hledat zákazníka"><button class="btn primary" type="submit">Najít</button></div></form>
      <ul class="clist" id="found"></ul>
      <div class="msg err" id="stOut" role="status"></div>
    </div>
    ${installBtn("Stáhnout obsluhu do telefonu","")}
    ${s.role==="owner"?`<a class="btn ghost" href="#/prehled">Přehled podniku</a>`:""}
  </div>`;
  if(!demo.on) setManifest("Štempl – obsluha","Štempl",BASE+"#/obsluha");
  $("#out").addEventListener("click",logout);
  let stream=null, raf=0, busy=false;
  const stop=()=>{ cancelAnimationFrame(raf); if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } };
  onLeave(stop);
  const idle=()=>{
    $("#scanArea").innerHTML=`<div class="panel stack" style="gap:14px">
      <div class="howscan"><svg aria-hidden="true"><use href="#cam"/></svg><div><b>Naskenujte QR kód zákazníka fotoaparátem telefonu</b><p class="small muted" style="margin-top:4px">Otevřete obyčejný fotoaparát, namiřte na QR na kartě zákazníka a ťukněte na odkaz, který se objeví. Karta se otevře tady a přidáte razítko.</p></div></div>
      ${hasDet?`<button class="btn primary big" id="camBtn" type="button">Nebo skenovat přímo tady</button>`:""}
      <p class="tiny muted">Tip: přihlaste se v prohlížeči, který fotoaparát otevírá (na iPhonu Safari). Přihlášení vydrží, dokud se neodhlásíte.</p></div>`;
    if(hasDet) $("#camBtn").addEventListener("click",startCam);
  };
  async function startCam(){
    $("#stOut").textContent="";
    try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}); }
    catch(e){ $("#stOut").textContent="Kamera není dostupná. Použijte fotoaparát telefonu nebo zadejte kód karty."; return; }
    $("#scanArea").innerHTML=`<div class="scan"><video id="vid" playsinline muted></video><div class="frame"></div><div class="hint">Namiřte na QR kód karty</div></div><button class="btn ghost" id="camStop" type="button" style="margin-top:10px;width:100%">Zavřít kameru</button>`;
    $("#camStop").addEventListener("click",()=>{ stop(); idle(); });
    const v=$("#vid"); v.srcObject=stream; await v.play().catch(()=>{});
    const det=new BarcodeDetector({formats:["qr_code"]});
    const loop=async()=>{
      if(!stream) return;
      if(!busy&&v.readyState>=2){
        let txt=null; try{ const r=await det.detect(v); if(r[0]) txt=r[0].rawValue; }catch(e){}
        const m=txt&&String(txt).toLowerCase().match(/[0-9a-f]{32}/);
        if(m){ busy=true; if(navigator.vibrate) navigator.vibrate(40); stop(); await find({p_token:m[0]}); return; }
      }
      raf=requestAnimationFrame(loop);
    };
    loop();
  }
  async function find(args,showRestore){
    $("#stOut").textContent=""; $("#found").innerHTML="";
    try{
      const c=await rpc("lookup_card",{p_slug:s.slug,p_code:s.code,p_token:args.p_token});
      $("#scanArea").innerHTML="";
      staffCardPanel($("#res"),s,c,{next:reset});
      if(showRestore){
        const restore=document.createElement("div"); restore.className="panel stack"; restore.style.gap="10px"; restore.style.marginTop="14px";
        restore.innerHTML=`<b>Zákazník nemá kartu v telefonu?</b><p class="small muted">Ať naskenuje tento kód svým fotoaparátem. Karta se mu otevře i s razítky.</p><div class="qr" style="width:200px;aspect-ratio:1;justify-self:center">${qrSVG(BASE+"#/c/"+c.token)}</div>`;
        $("#res").appendChild(restore);
      }
      $("#res").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){ if(authFail(e)) return; $("#stOut").textContent=say(e); busy=false; idle(); }
  }
  function reset(){ busy=false; $("#res").innerHTML=""; $("#found").innerHTML=""; $("#mCode").value=""; idle(); window.scrollTo(0,0); }
  $("#manual").addEventListener("submit",async e=>{
    e.preventDefault(); const v=$("#mCode").value.trim(); if(!v) return; stop(); $("#stOut").textContent="";
    const m=v.toLowerCase().match(/[0-9a-f]{32}/); if(m) return find({p_token:m[0]},true);
    try{
      const list=await rpc("staff_find",{p_slug:s.slug,p_code:s.code,p_query:v});
      if(list.length===1) return find({p_token:list[0].token},true);
      $("#found").innerHTML=list.length?list.map((c,i)=>`<li><button type="button" data-i="${i}"><span class="nm">${c.name?esc(c.name):'<span class="mono">'+esc(c.code)+'</span>'}</span><span class="vs">${c.total_stamps}</span><span class="sub"><span class="mono">${esc(c.code)}</span> · ${c.stamps} na kartě${c.email_hint?" · "+esc(c.email_hint):""} · naposledy ${c.last_stamp_at?fmtD(c.last_stamp_at):"–"}</span></button></li>`).join(""):`<li class="small muted" style="padding:10px 4px">Nikoho jsme nenašli. Zkuste jiné jméno nebo kód z karty zákazníka.</li>`;
      $$("#found button").forEach(x=>x.addEventListener("click",()=>find({p_token:list[+x.dataset.i].token},true)));
    }catch(err){ if(authFail(err)) return; $("#stOut").textContent=say(err); }
  });
  idle();
}

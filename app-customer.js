"use strict";
/* ================= CUSTOMER ================= */
const cardStore={
  all(){ return store.get("cards",{}); },
  put(slug,token){ const a=this.all(); a[slug]=token; store.set("cards",a); },
  drop(slug){ const a=this.all(); delete a[slug]; store.set("cards",a); }
};
async function viewJoin(slug){
  slug=slug.toLowerCase(); loading("Načítám kartu…"); const my=routeSeq;
  const mine=cardStore.all()[slug];
  if(mine) return showCard(mine,slug);
  let b; try{ b=await rpc("public_business",{p_slug:slug}); }catch(e){ return stale(my)||fail(say(e)); }
  if(stale(my)) return;
  if(!b) return fail("Tento podnik ve Štemplu nenajdeme. Zkontrolujte QR kód.");
  document.title=b.name+" · Štempl";
  if(!b.active){
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px"><div class="lcard" id="jc"><div class="eyebrow">Věrnostní karta</div><div class="biz">${esc(b.name)}</div><p class="muted" style="margin-top:10px">Věrnostní program je teď pozastavený. Zkuste to prosím později.</p></div><a class="btn ghost" href="#/obnovit/${esc(slug)}">Už kartu mám, chci ji obnovit</a></div>`;
    return setAccent($("#jc"),b.accent);
  }
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div class="panel stack" style="gap:10px" id="backBox">
      <b>Už jste tu kartu měli?</b>
      <p class="small muted">Telefon ji mohl po delší době zapomenout (dělá to hlavně iPhone). Razítka nezmizela, kartu vám obnovíme.</p>
      <form class="form" id="backForm" novalidate><div class="two" style="grid-template-columns:1fr auto"><input class="input" id="backEmail" type="email" autocomplete="email" placeholder="E-mail, který jste ke kartě dali" aria-label="E-mail ke kartě"><button class="btn primary" type="submit">Obnovit</button></div></form>
      <div class="msg small" id="backOut" role="status"></div>
      <p class="tiny muted">Nedali jste ke kartě e-mail? Řekněte obsluze své jméno, kartu vám najde.</p>
    </div>
    <div class="lcard" id="jc"><div class="eyebrow">Věrnostní karta</div><div class="biz">${esc(b.name)}</div>
      <div class="rw"><span class="small muted">${b.stamps_needed} ${plural(b.stamps_needed,"razítko","razítka","razítek")}</span><span class="small"><b>${esc(b.reward_text)}</b></span></div>
      ${stampsGrid(0,b.stamps_needed,-1)}
    </div>
    <form class="form panel" id="joinForm" novalidate>
      <h2 style="font-size:1.6rem">Získejte kartu zdarma</h2>
      <p class="muted small">Za každou návštěvu razítko, po ${b.stamps_needed}. ${esc(b.reward_text.toLowerCase())}. Nic se nestahuje a karta vám zůstane natrvalo.</p>
      <label class="field">Křestní jméno <small>nepovinné, ať vás obsluha pozná</small><input class="input" id="jName" autocomplete="given-name" maxlength="60"></label>
      <label class="field">E-mail <small>doporučujeme – bez něj se karta při výměně telefonu nebo vymazání prohlížeče ztratí</small><input class="input" id="jEmail" type="email" autocomplete="email" maxlength="120"></label>
      <label class="check" id="consentRow" hidden><input type="checkbox" id="jConsent"><span>Souhlasím, aby ${esc(b.name)} uložil můj e-mail pro věrnostní program. Souhlas můžu kdykoli odvolat. <a href="#/soukromi">Ochrana údajů</a></span></label>
      <button class="btn accent big" type="submit">Získat kartu</button>
      <div class="msg err" id="jOut" role="status"></div>
    </form></div>`;
  setAccent($("#jc"),b.accent); setAccent($("#joinForm"),b.accent);
  const em=$("#jEmail"); em.addEventListener("input",()=>{ $("#consentRow").hidden=!em.value.trim(); });
  const recover=async(email,out)=>{
    out.className="msg small";
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ out.className="msg small err"; out.textContent=ERR.bad_email; return; }
    try{ await api("recover_card",{email,slug}); out.className="msg small ok"; out.textContent="Poslali jsme vám e-mail s odkazem na kartu. Otevřete ho v tomto telefonu (zkontrolujte i spam)."; }
    catch(err){ out.className="msg small err"; out.textContent=say(err); }
  };
  $("#backForm").addEventListener("submit",e=>{ e.preventDefault(); recover($("#backEmail").value.trim(),$("#backOut")); });
  $("#joinForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#jOut"); out.textContent="";
    const email=em.value.trim();
    if(email&&!$("#jConsent").checked){ out.textContent=ERR.consent_required; return; }
    const btn=e.target.querySelector("button"); btn.disabled=true;
    try{
      const c=await rpc("join_card",{p_slug:slug,p_name:$("#jName").value.trim()||null,p_email:email||null,p_consent:!!$("#jConsent").checked});
      cardStore.put(slug,c.token);
      showCard(c.token,slug,c,true);
    }catch(err){
      btn.disabled=false;
      if(err.message==="card_exists"){ await recover(email,out); out.textContent=ERR.card_exists+" "+out.textContent; return; }
      out.textContent=say(err);
    }
  });
}
async function viewCardToken(token){
  token=String(token).toLowerCase().replace(/[^0-9a-f]/g,""); loading("Načítám kartu…"); const my=routeSeq;
  let c; try{ c=await rpc("get_card",{p_token:token}); }catch(e){ return stale(my)||fail(say(e)); }
  if(stale(my)) return;
  if(!c) return fail("Karta nenalezena. Možná byla smazána.",`<a class="btn ghost" href="#/obnovit">Obnovit kartu e-mailem</a>`);
  cardStore.put(c.business.slug,token);
  showCard(token,c.business.slug,c);
}
async function showCard(token,slug,pre,fresh){
  let c=pre; const my=routeSeq;
  if(!c){ try{ c=await rpc("get_card",{p_token:token}); }catch(e){ return stale(my)||fail(say(e)); } }
  if(stale(my)) return;
  if(!c){ cardStore.drop(slug); return viewJoin(slug); }
  document.title=c.business.name+" · Štempl";
  if(location.hash!=="#/c/"+token) history.replaceState(null,"","#/c/"+token);
  setCardManifest(c.business.name,BASE+"#/c/"+token);
  let last=c;
  const link=BASE+"#/c/"+token;
  const render=(isNewStamp)=>{
    const b=last.business, n=b.stamps_needed, left=Math.max(0,n-last.stamps);
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:22px">
      ${b.active===false?`<div class="note">Věrnostní program podniku je teď pozastavený. Vaše razítka zůstávají uložená.</div>`:""}
      <div class="lcard" id="lc">
        <div class="eyebrow">Věrnostní karta${last.name?" · "+esc(last.name):""}</div>
        <div class="biz">${esc(b.name)}</div>
        <div class="rw"><span class="small muted">${Math.min(last.stamps,n)} z ${n}${last.stamps>n?" (+"+(last.stamps-n)+" navíc)":""}</span><span class="small"><b>${esc(b.reward_text)}</b></span></div>
        ${stampsGrid(last.stamps,n,isNewStamp?Math.min(last.stamps,n)-1:-1)}
        ${last.reward_ready?`<div class="ready"><svg width="22" height="22" viewBox="0 0 100 100" style="color:currentColor;flex:none"><use href="#mark"/></svg>Odměna čeká! Ukažte kartu obsluze.</div>`:`<p class="small muted" style="margin-top:14px">${left===1?"Poslední razítko a čeká vás":"Ještě "+left+" "+plural(left,"razítko","razítka","razítek")+" a čeká vás"} ${esc(b.reward_text.toLowerCase())}.</p>`}
        <div class="qrbig"><div class="qr">${qrSVG(BASE+"#/r/"+token)}</div><div class="small muted">Ukažte obsluze k naskenování</div><div class="code">${short(token)}</div></div>
      </div>
      ${last.has_email?"":`<div class="panel stack" style="gap:10px"><b>Pojistěte si kartu</b><p class="small muted">Přidejte e-mail a kartu i s razítky obnovíte na novém telefonu nebo po smazání prohlížeče.</p>
        <form class="form" id="emForm" novalidate><input class="input" id="emIn" type="email" autocomplete="email" placeholder="vas@email.cz" maxlength="120">
        <label class="check"><input type="checkbox" id="emCon"><span>Souhlasím, aby ${esc(b.name)} uložil můj e-mail pro věrnostní program. Souhlas můžu kdykoli odvolat.</span></label>
        <button class="btn" type="submit">Uložit e-mail</button><div class="msg" id="emOut" role="status"></div></form></div>`}
      <div class="panel stack" style="gap:10px">
        <b>Karta je uložená automaticky</b>
        <p class="small muted">Razítka jsou uložená u nás, ne v telefonu, a karta neexpiruje. Nejrychleji ji otevřete z plochy: Sdílet → Přidat na plochu. Nebo si uložte odkaz.</p>
        <div class="row-btns"><button class="btn ghost" id="copyLink" type="button">Kopírovat odkaz na kartu</button></div>
        <div class="msg small" id="copyOut" role="status"></div>
        <p class="small muted">Celkem ${visits(last.total_stamps)}${last.rewards_redeemed?" · vydané odměny: "+last.rewards_redeemed:""} · karta od ${fmtD(last.created_at)}</p>
      </div>
      <button class="btn danger" id="delBtn" type="button">Smazat kartu a moje údaje</button>
      <p class="tiny muted" style="text-align:center"><a href="#/soukromi">Ochrana osobních údajů</a> · <a href="cookies.html">Cookies</a> · <a href="#/moje">Moje karty</a></p>
      </div>`;
    setAccent($("#lc"),b.accent);
    $("#copyLink").addEventListener("click",()=>copy(link,$("#copyOut")));
    const ef=$("#emForm");
    if(ef) ef.addEventListener("submit",async e=>{
      e.preventDefault(); const out=$("#emOut"); out.className="msg";
      if(!$("#emCon").checked){ out.className="msg err"; out.textContent="Zaškrtněte souhlas s uložením e-mailu."; return; }
      try{ last=await rpc("set_card_email",{p_token:token,p_email:$("#emIn").value.trim(),p_consent:true}); render(false); }
      catch(err){ out.className="msg err"; out.textContent=say(err); }
    });
    $("#delBtn").addEventListener("click",()=>{
      openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">Smazat kartu?</h2><p class="muted">Karta, razítka i vaše jméno a e-mail se nenávratně smažou. Tohle nejde vrátit.</p><button class="btn danger big" type="button" id="delYes">Ano, smazat</button><button class="btn ghost" type="button" id="delNo">Ponechat kartu</button><div class="msg err" id="delOut"></div>`);
      $("#delNo").addEventListener("click",closeSheet);
      $("#delYes").addEventListener("click",async()=>{
        try{ await rpc("forget_card",{p_token:token}); cardStore.drop(slug); closeSheet();
          app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><h2 style="font-size:1.8rem">Karta je smazaná</h2><p class="muted">Smazali jsme kartu i vaše údaje. Novou kartu můžete kdykoli získat naskenováním QR kódu v podniku.</p><a class="btn" href="#/">Na úvod</a></div>`;
        }catch(err){ $("#delOut").textContent=say(err); }
      });
    });
  };
  render(false);
  if(fresh){ openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">Karta je vaše</h2><p class="muted">Při každé návštěvě ukažte QR kód obsluze. Razítko se objeví samo.</p><button class="btn primary" type="button" id="okBtn">Rozumím</button>`); $("#okBtn").addEventListener("click",closeSheet); }
  const tick=async()=>{
    if(document.hidden) return;
    try{
      const n=await rpc("get_card",{p_token:token});
      if(!n){ cardStore.drop(slug); return; }
      const stamped=n.total_stamps>last.total_stamps, redeemed=n.rewards_redeemed>last.rewards_redeemed;
      if(stamped||redeemed||n.stamps!==last.stamps||n.has_email!==last.has_email){ last=n; render(stamped); }
      if(stamped) thanks(n,token);
      else if(redeemed){ openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">Odměna je vaše!</h2><p class="muted">Dobrou chuť. Sbírání začíná znovu.</p><button class="btn primary" type="button" id="okBtn">Díky</button>`); $("#okBtn").addEventListener("click",closeSheet); }
    }catch(e){}
  };
  const iv=setInterval(tick,4000); onLeave(()=>clearInterval(iv));
}
/* "Add to home screen" from a card page must open that card, also on iPhone where the home-screen app has its own storage */
function setCardManifest(name,url){
  try{
    const m={name:name+" – věrnostní karta",short_name:name.slice(0,12),start_url:url,scope:BASE,display:"standalone",background_color:"#f5f2ea",theme_color:"#f5f2ea",lang:"cs",
      icons:[{src:BASE+"icon-192.png",sizes:"192x192",type:"image/png"},{src:BASE+"icon-512.png",sizes:"512x512",type:"image/png"}]};
    let l=document.querySelector('link[rel="manifest"]'); if(!l){ l=document.createElement("link"); l.rel="manifest"; document.head.appendChild(l); }
    l.href="data:application/manifest+json,"+encodeURIComponent(JSON.stringify(m));
  }catch(e){}
}
function thanks(c,token){
  const b=c.business, url=b.google_review_url;
  openSheet(`<h2 id="sheetTitle" style="font-size:1.7rem">Díky za návštěvu!</h2>
    <p class="muted">${c.reward_ready?"Máte plnou kartu, odměnu si vyzvedněte u obsluhy.":"Razítko je na kartě."}${url?" Pomůže nám, když nám na Googlu napíšete, jak se vám u nás líbilo.":""}</p>
    ${url?`<a class="btn accent big" id="revBtn" href="${esc(url)}" target="_blank" rel="noopener">Napsat recenzi na Googlu</a>`:""}
    <button class="btn ghost" type="button" id="laterBtn">${url?"Teď ne":"Zavřít"}</button>`);
  setAccent($("#sheet"),b.accent);
  if(url) $("#revBtn").addEventListener("click",()=>{ rpc("log_review_click",{p_token:token}).catch(()=>{}); setTimeout(closeSheet,300); });
  $("#laterBtn").addEventListener("click",closeSheet);
}
async function viewMyCards(){
  document.title="Moje karty · Štempl";
  const all=cardStore.all(), slugs=Object.keys(all);
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px"><div><div class="eyebrow">Štempl</div><h1 style="font-size:2.2rem;margin-top:6px">Moje karty</h1></div><div id="myList" class="stack"><p class="muted">Načítám…</p></div><a class="btn ghost" href="#/obnovit">Obnovit kartu e-mailem</a></div>${foot()}`;
  if(!slugs.length){ $("#myList").innerHTML=`<p class="muted">V tomto prohlížeči zatím nemáte žádnou kartu. Naskenujte QR kód v podniku, nebo si kartu obnovte e-mailem.</p>`; return; }
  const my=routeSeq; const rows=await Promise.all(slugs.map(s=>rpc("get_card",{p_token:all[s]}).catch(()=>null))); if(stale(my)) return;
  $("#myList").innerHTML=rows.map((c,i)=>c?`<a class="lcard" style="text-decoration:none;--accent:${esc(c.business.accent)}" href="#/k/${esc(c.business.slug)}"><div class="eyebrow">Věrnostní karta</div><div class="biz">${esc(c.business.name)}</div><p class="small muted" style="margin-top:8px">${Math.min(c.stamps,c.business.stamps_needed)} z ${c.business.stamps_needed} razítek${c.reward_ready?" · odměna čeká":""}</p></a>`:"").join("")||`<p class="muted">Karty se nepodařilo načíst.</p>`;
}
function viewRecover(slug){
  document.title="Obnovit kartu · Štempl";
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div><div class="eyebrow">Ztracená karta</div><h1 style="font-size:2.2rem;margin-top:6px">Obnovit kartu</h1></div>
    <form class="form panel" id="recForm" novalidate>
      <p class="muted small">Pokud jste ke kartě uložili e-mail, pošleme vám na něj odkaz. Karta se obnoví i se všemi razítky.</p>
      <label class="field">E-mail<input class="input" id="recEmail" type="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">Poslat odkaz</button>
      <div class="msg" id="recOut" role="status"></div>
    </form>
    <p class="small muted">Nemáte u karty e-mail? Ukažte obsluze v podniku svůj kód karty nebo jméno, obsluha vám kartu najde.</p></div>${foot()}`;
  $("#recForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#recOut"); out.className="msg"; const btn=e.target.querySelector("button"); btn.disabled=true;
    try{ await api("recover_card",{email:$("#recEmail").value.trim(),slug:slug||null}); out.className="msg ok"; out.textContent="Hotovo. Pokud k tomuto e-mailu existuje karta, odkaz už je na cestě. Zkontrolujte i spam."; }
    catch(err){ out.className="msg err"; out.textContent=say(err); btn.disabled=false; }
  });
}

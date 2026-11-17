"use strict";
/* ================= CUSTOMER =================
   Customer screens follow the phone's language: Czech/Slovak phones get Czech, everyone else English (L() in app-core.js). */
const cardStore={
  all(){ return store.get("cards",{}); },
  put(slug,token){ const a=this.all(); a[slug]=token; store.set("cards",a); },
  drop(slug){ const a=this.all(); delete a[slug]; store.set("cards",a); }
};
const stampWord=n=>EN?(n===1?"stamp":"stamps"):plural(n,"razítko","razítka","razítek");

/* ---------- business card: logo and contact links ---------- */
/* the logo is fetched once per version and kept in the browser, so the card refresh stays small */
async function bizLogo(b){
  if(!b.logo_v) return null;
  const k="logo."+b.slug, c=store.get(k,null);
  if(c&&c.v===b.logo_v) return c.d;
  try{ const r=await rpc("business_logo",{p_slug:b.slug}); if(r&&r.logo){ store.set(k,{v:r.logo_v,d:r.logo}); return r.logo; } }catch(e){}
  return null;
}
const logoSlot=b=>b.logo_v?`<img class="bizlogo" data-logo="${esc(b.slug)}" alt="" hidden>`:"";
function fillLogos(b){ bizLogo(b).then(d=>{ if(!d) return; $$(`img[data-logo="${b.slug}"]`).forEach(i=>{ i.src=d; i.hidden=false; }); }); }
function profileBlock(b){
  const links=[];
  if(b.web_url) links.push(`<a class="btn ghost sm" href="${esc(b.web_url)}" target="_blank" rel="noopener">${L("Web a menu","Website & menu")}</a>`);
  if(b.instagram) links.push(`<a class="btn ghost sm" href="https://www.instagram.com/${esc(b.instagram)}/" target="_blank" rel="noopener">Instagram</a>`);
  if(b.address) links.push(`<a class="btn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.name+", "+b.address)}" target="_blank" rel="noopener">${L("Navigovat","Directions")}</a>`);
  if(b.public_phone) links.push(`<a class="btn ghost sm" href="tel:${esc(b.public_phone.replace(/\s+/g,""))}">${L("Zavolat","Call")}</a>`);
  if(!links.length&&!b.hours&&!b.address) return "";
  return `<div class="panel stack bizinfo" style="gap:10px"><b>${esc(b.name)}</b>
    ${b.address?`<p class="small muted">${esc(b.address)}</p>`:""}${b.hours?`<p class="small"><span class="muted">${L("Otevřeno","Opening hours")}:</span> ${esc(b.hours)}</p>`:""}
    ${links.length?`<div class="row-btns">${links.join("")}</div>`:""}</div>`;
}

async function viewJoin(slug){
  slug=slug.toLowerCase(); loading(L("Načítám kartu…","Loading the card…")); const my=routeSeq;
  const mine=cardStore.all()[slug];
  if(mine) return showCard(mine,slug);
  let b; try{ b=await rpc("public_business",{p_slug:slug}); }catch(e){ return stale(my)||fail(say(e)); }
  if(stale(my)) return;
  if(!b) return fail(L("Tento podnik ve Štemplu nenajdeme. Zkontrolujte QR kód.","We can't find this business. Please check the QR code."));
  document.title=b.name+" · Štempl";
  if(!b.active){
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px"><div class="lcard" id="jc"><div class="cardhead">${logoSlot(b)}<div><div class="eyebrow">${L("Věrnostní karta","Loyalty card")}</div><div class="biz">${esc(b.name)}</div></div></div><p class="muted" style="margin-top:10px">${L("Věrnostní program je teď pozastavený. Zkuste to prosím později.","The loyalty programme is paused right now. Please try again later.")}</p></div><a class="btn ghost" href="#/obnovit/${esc(slug)}">${L("Už kartu mám, chci ji obnovit","I already have a card")}</a></div>`;
    fillLogos(b); return setAccent($("#jc"),b.accent);
  }
  const n=b.stamps_needed;
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div class="lcard" id="jc"><div class="cardhead">${logoSlot(b)}<div><div class="eyebrow">${L("Věrnostní karta","Loyalty card")}</div><div class="biz">${esc(b.name)}</div></div></div>
      <div class="rw"><span class="small muted">${n} ${stampWord(n)}</span><span class="small"><b>${esc(b.reward_text)}</b></span></div>
      ${stampsGrid(b.welcome_stamp?1:0,n,-1)}
      ${b.rules_text?`<p class="small muted" style="margin-top:12px">${esc(b.rules_text)}</p>`:""}
    </div>
    <form class="form panel" id="joinForm" novalidate>
      <h2 style="font-size:1.6rem">${L("Získejte kartu zdarma","Get your free card")}</h2>
      <p class="muted small">${L(`${b.welcome_stamp?"První razítko máte hned. ":""}Za každou návštěvu razítko, po ${n}. ${esc(b.reward_text.toLowerCase())}. Nic se nestahuje a karta vám zůstane natrvalo.`,
        `${b.welcome_stamp?"Your first stamp is on us. ":""}One stamp per visit; after ${n} stamps you get: ${esc(b.reward_text)}. Nothing to install, the card stays with you.`)}</p>
      <label class="field">${L("Křestní jméno","First name")} <small>${L("nepovinné, ať vás obsluha pozná","optional, so the staff know you")}</small><input class="input" id="jName" autocomplete="given-name" maxlength="60"></label>
      <label class="field">E-mail <small>${L("doporučujeme – bez něj se karta při výměně telefonu nebo vymazání prohlížeče ztratí","recommended – without it the card is lost when you change phones or clear the browser")}</small><input class="input" id="jEmail" type="email" autocomplete="email" maxlength="120"></label>
      <label class="check" id="consentRow" hidden><input type="checkbox" id="jConsent"><span>${L(`Souhlasím, aby ${esc(b.name)} uložil můj e-mail pro věrnostní program. Souhlas můžu kdykoli odvolat.`,`I agree that ${esc(b.name)} stores my e-mail for the loyalty programme. I can withdraw this at any time.`)} <a href="#/soukromi">${L("Ochrana údajů","Privacy")}</a></span></label>
      <label class="check" id="mkRow" hidden><input type="checkbox" id="jMk"><span>${L("Pošlete mi občas novinky a připomínku, když mi chybí razítko (nejvýš 2× měsíčně, odhlásit jde jedním klepnutím).","Send me news and a reminder when I am one stamp away (at most twice a month, one tap to unsubscribe).")}</span></label>
      <button class="btn accent big" type="submit">${L("Získat kartu","Get the card")}</button>
      <div class="msg err" id="jOut" role="status"></div>
    </form>
    ${profileBlock(b)}
    <p class="small muted" style="text-align:center"><button class="linkbtn" type="button" id="backToggle" aria-expanded="false" aria-controls="backBox">${L("Už kartu mám, chci ji obnovit","I already have a card")}</button></p>
    <div class="panel stack" style="gap:10px" id="backBox" hidden>
      <b>${L("Obnovit kartu","Restore your card")}</b>
      <p class="small muted">${L("Telefon ji mohl po delší době zapomenout (dělá to hlavně iPhone). Razítka nezmizela, kartu vám obnovíme.","Your phone may have forgotten it after a while (iPhones do this). Your stamps are safe, we'll restore the card.")}</p>
      <form class="form" id="backForm" novalidate><div class="two" style="grid-template-columns:1fr auto"><input class="input" id="backEmail" type="email" autocomplete="email" placeholder="${L("E-mail, který jste ke kartě dali","The e-mail you gave with the card")}" aria-label="${L("E-mail ke kartě","E-mail for the card")}"><button class="btn primary" type="submit">${L("Obnovit","Restore")}</button></div></form>
      <div class="msg small" id="backOut" role="status"></div>
      <p class="tiny muted">${L("Nedali jste ke kartě e-mail? Řekněte obsluze své jméno, kartu vám najde.","No e-mail on the card? Tell the staff your name and they will find it.")}</p>
    </div>
    </div>`;
  setAccent($("#jc"),b.accent); setAccent($("#joinForm"),b.accent); fillLogos(b);
  const em=$("#jEmail"); em.addEventListener("input",()=>{ $("#consentRow").hidden=$("#mkRow").hidden=!em.value.trim(); });
  const recover=async(email,out)=>{
    out.className="msg small";
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ out.className="msg small err"; out.textContent=say({message:"bad_email"}); return; }
    try{ await api("recover_card",{email,slug}); out.className="msg small ok"; out.textContent=L("Poslali jsme vám e-mail s odkazem na kartu. Otevřete ho v tomto telefonu (zkontrolujte i spam).","We've sent you an e-mail with a link to your card. Open it on this phone (check spam too)."); }
    catch(err){ out.className="msg small err"; out.textContent=say(err); }
  };
  $("#backToggle").addEventListener("click",e=>{ const box=$("#backBox"); box.hidden=!box.hidden; e.currentTarget.setAttribute("aria-expanded",String(!box.hidden)); if(!box.hidden){ box.scrollIntoView({behavior:"smooth",block:"center"}); $("#backEmail").focus({preventScroll:true}); } });
  $("#backForm").addEventListener("submit",e=>{ e.preventDefault(); recover($("#backEmail").value.trim(),$("#backOut")); });
  $("#joinForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#jOut"); out.textContent="";
    const email=em.value.trim();
    if(email&&!$("#jConsent").checked){ out.textContent=say({message:"consent_required"}); return; }
    const btn=e.target.querySelector("button"); btn.disabled=true;
    try{
      const c=await rpc("join_card_v2",{p_slug:slug,p_name:$("#jName").value.trim()||null,p_email:email||null,p_consent:!!$("#jConsent").checked,p_marketing:!!(email&&$("#jMk").checked)});
      cardStore.put(slug,c.token);
      /* came from the counter QR: the stamp for this visit is added right after the card is created */
      const claim=typeof pendingClaim==="function"?pendingClaim(slug):null;
      if(claim) return claimFor(slug,c.token,claim);
      showCard(c.token,slug,c,true);
    }catch(err){
      btn.disabled=false;
      if(err.message==="card_exists"){ await recover(email,out); out.textContent=say(err)+" "+out.textContent; return; }
      out.textContent=say(err);
    }
  });
}
async function viewCardToken(token){
  token=String(token).toLowerCase().replace(/[^0-9a-f]/g,""); loading(L("Načítám kartu…","Loading the card…")); const my=routeSeq;
  let c; try{ c=await rpc("get_card",{p_token:token}); }catch(e){ return stale(my)||fail(say(e)); }
  if(stale(my)) return;
  if(!c) return fail(L("Karta nenalezena. Možná byla smazána.","Card not found. It may have been deleted."),`<a class="btn ghost" href="#/obnovit">${L("Obnovit kartu e-mailem","Restore the card by e-mail")}</a>`);
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
  let last=c, boost=()=>{};
  const link=BASE+"#/c/"+token;
  const render=(isNewStamp)=>{
    const b=last.business, n=b.stamps_needed, left=Math.max(0,n-last.stamps);
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:22px">
      ${b.active===false?`<div class="note">${L("Věrnostní program podniku je teď pozastavený. Vaše razítka zůstávají uložená.","The loyalty programme is paused right now. Your stamps are kept.")}</div>`:""}
      <button class="btn accent big" id="showQr" type="button">${L("Ukázat QR obsluze","Show QR to staff")}</button>
      <div class="lcard" id="lc">
        <div class="cardhead">${logoSlot(b)}<div><div class="eyebrow">${L("Věrnostní karta","Loyalty card")}${last.name?" · "+esc(last.name):""}</div>
        <div class="biz">${esc(b.name)}</div></div></div>
        <div class="rw"><span class="small muted">${Math.min(last.stamps,n)} ${L("z","of")} ${n}${last.stamps>n?" (+"+(last.stamps-n)+L(" navíc"," extra")+")":""}</span><span class="small"><b>${esc(b.reward_text)}</b></span></div>
        ${stampsGrid(last.stamps,n,isNewStamp?Math.min(last.stamps,n)-1:-1)}
        ${last.reward_ready?`<div class="ready"><svg width="22" height="22" viewBox="0 0 100 100" style="color:currentColor;flex:none"><use href="#mark"/></svg>${L("Odměna čeká! Ukažte kartu obsluze.","Your reward is ready! Show the card to the staff.")}</div>`
          :`<p class="small muted" style="margin-top:14px">${EN?`${left} more ${stampWord(left)} to: ${esc(b.reward_text)}.`:`${left===1?"Poslední razítko a čeká vás":"Ještě "+left+" "+stampWord(left)+" a čeká vás"} ${esc(b.reward_text.toLowerCase())}.`}</p>`}
        <div class="qrbig"><button class="qr qrtap" type="button" id="qrTap" aria-label="${L("Zvětšit QR kód","Enlarge QR code")}">${qrSVG(BASE+"#/r/"+token)}</button><div class="small muted">${L("Ukažte obsluze k naskenování · ťuknutím zvětšíte","Show it to the staff to scan · tap to enlarge")}</div><div class="code">${short(token)}</div></div>
        ${b.rules_text?`<p class="small muted" style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line2)"><b>${L("Pravidla","Rules")}:</b> ${esc(b.rules_text)}</p>`:""}
      </div>
      ${profileBlock(b)}
      ${last.has_email?"":`<div class="panel stack" style="gap:10px"><b>${L("Pojistěte si kartu","Keep your card safe")}</b><p class="small muted">${L("Přidejte e-mail a kartu i s razítky obnovíte na novém telefonu nebo po smazání prohlížeče.","Add your e-mail and you can restore the card with all stamps on a new phone or after clearing the browser.")}</p>
        <form class="form" id="emForm" novalidate><input class="input" id="emIn" aria-label="${L("E-mail pro obnovu karty","E-mail to restore the card")}" type="email" autocomplete="email" placeholder="${L("vas@email.cz","you@email.com")}" maxlength="120">
        <label class="check"><input type="checkbox" id="emCon"><span>${L(`Souhlasím, aby ${esc(b.name)} uložil můj e-mail pro věrnostní program. Souhlas můžu kdykoli odvolat.`,`I agree that ${esc(b.name)} stores my e-mail for the loyalty programme. I can withdraw this at any time.`)}</span></label>
        <label class="check"><input type="checkbox" id="emMk"><span>${L("Pošlete mi občas novinky a připomínku, když mi chybí razítko (nejvýš 2× měsíčně, odhlásit jde jedním klepnutím).","Send me news and a reminder when I am one stamp away (at most twice a month, one tap to unsubscribe).")}</span></label>
        <button class="btn" type="submit">${L("Uložit e-mail","Save e-mail")}</button><div class="msg" id="emOut" role="status"></div></form></div>`}
      ${last.has_email?`<div class="panel"><label class="check" style="margin:0"><input type="checkbox" id="mkToggle"${last.marketing?" checked":""}><span><b>${L("Novinky a připomínky e-mailem","News and reminders by e-mail")}</b><br><span class="small muted">${L("Nejvýš 2× měsíčně a připomínka, když vám chybí poslední razítko.","At most twice a month, plus a reminder when you are one stamp away.")}</span></span></label><div class="msg small" id="mkOut" role="status"></div></div>`:""}
      <div class="panel stack" style="gap:10px">
        <b>${L("Karta je uložená automaticky","Your card is saved automatically")}</b>
        <p class="small muted">${L("Razítka jsou uložená u nás, ne v telefonu, a karta neexpiruje. Nejrychleji ji otevřete z plochy: Sdílet → Přidat na plochu. Nebo si uložte odkaz.","Stamps are stored with us, not on the phone, and the card never expires. Open it fastest from your home screen: Share → Add to Home Screen. Or save the link.")}</p>
        <div class="row-btns">${installBtn(L("Stáhnout kartu do telefonu","Add the card to my phone"))}<button class="btn ghost" id="copyLink" type="button">${L("Kopírovat odkaz na kartu","Copy card link")}</button></div>
        <div class="msg small" id="copyOut" role="status"></div>
        <p class="small muted">${EN?`${last.total_stamps} ${last.total_stamps===1?"visit":"visits"} in total${last.rewards_redeemed?" · rewards: "+last.rewards_redeemed:""} · card since ${fmtD(last.created_at)}`:`Celkem ${visits(last.total_stamps)}${last.rewards_redeemed?" · vydané odměny: "+last.rewards_redeemed:""} · karta od ${fmtD(last.created_at)}`}</p>
      </div>
      <p class="tiny muted" style="text-align:center"><a href="#/soukromi">${L("Ochrana osobních údajů","Privacy")}</a> · <a href="cookies.html">Cookies</a> · <a href="#/moje">${L("Moje karty","My cards")}</a></p>
      <p class="tiny muted" style="text-align:center"><button class="linkbtn" id="delBtn" type="button">${L("Smazat kartu a moje údaje","Delete my card and data")}</button></p>
      </div>`;
    setAccent($("#lc"),b.accent); setAccent($("#showQr"),b.accent); fillLogos(b);
    const bigQr=()=>{ boost(); showQrFull(BASE+"#/r/"+token,b.name,short(token)); };
    $("#showQr").addEventListener("click",bigQr); $("#qrTap").addEventListener("click",bigQr);
    $("#copyLink").addEventListener("click",()=>copy(link,$("#copyOut")));
    const ef=$("#emForm");
    if(ef) ef.addEventListener("submit",async e=>{
      e.preventDefault(); const out=$("#emOut"); out.className="msg";
      if(!$("#emCon").checked){ out.className="msg err"; out.textContent=L("Zaškrtněte souhlas s uložením e-mailu.","Please tick the box to agree."); return; }
      try{
        last=await rpc("set_card_email",{p_token:token,p_email:$("#emIn").value.trim(),p_consent:true});
        if($("#emMk").checked) last=await rpc("set_card_marketing",{p_token:token,p_on:true});
        render(false);
      }
      catch(err){ out.className="msg err"; out.textContent=say(err); }
    });
    const mt=$("#mkToggle");
    if(mt) mt.addEventListener("change",async()=>{
      const out=$("#mkOut"); out.className="msg small";
      try{ last=await rpc("set_card_marketing",{p_token:token,p_on:mt.checked}); out.className="msg small ok"; out.textContent=mt.checked?L("Zapnuto.","Switched on."):L("Vypnuto. Nic vám posílat nebudeme.","Switched off. We won't send you anything."); }
      catch(err){ mt.checked=!mt.checked; out.className="msg small err"; out.textContent=say(err); }
    });
    $("#delBtn").addEventListener("click",()=>{
      openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">${L("Smazat kartu?","Delete the card?")}</h2><p class="muted">${L("Karta, razítka i vaše jméno a e-mail se nenávratně smažou. Tohle nejde vrátit.","The card, stamps, your name and e-mail will be deleted for good. This can't be undone.")}</p><button class="btn danger big" type="button" id="delYes">${L("Ano, smazat","Yes, delete")}</button><button class="btn ghost" type="button" id="delNo">${L("Ponechat kartu","Keep the card")}</button><div class="msg err" id="delOut"></div>`);
      $("#delNo").addEventListener("click",closeSheet);
      $("#delYes").addEventListener("click",async()=>{
        try{ await rpc("forget_card",{p_token:token}); cardStore.drop(slug); closeSheet();
          app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><h2 style="font-size:1.8rem">${L("Karta je smazaná","The card is deleted")}</h2><p class="muted">${L("Smazali jsme kartu i vaše údaje. Novou kartu můžete kdykoli získat naskenováním QR kódu v podniku.","We deleted the card and your data. You can get a new card any time by scanning the QR code in the shop.")}</p><a class="btn" href="#/">${L("Na úvod","Home")}</a></div>`;
        }catch(err){ $("#delOut").textContent=say(err); }
      });
    });
  };
  render(false);
  if(fresh){ openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">${L("Karta je vaše","The card is yours")}</h2><p class="muted">${L("Při každé návštěvě ukažte QR kód obsluze. Razítko se objeví samo.","Show the QR code to the staff on every visit. The stamp appears on its own.")}</p><button class="btn primary" type="button" id="okBtn">${L("Rozumím","Got it")}</button>`); $("#okBtn").addEventListener("click",closeSheet); }
  const tick=async()=>{
    if(document.hidden) return;
    try{
      const n=await rpc("get_card",{p_token:token});
      if(!n){ cardStore.drop(slug); return; }
      const stamped=n.total_stamps>last.total_stamps, redeemed=n.rewards_redeemed>last.rewards_redeemed;
      if(stamped||redeemed||n.stamps!==last.stamps||n.has_email!==last.has_email||n.business.logo_v!==last.business.logo_v){ last=n; render(stamped); }
      if(stamped||redeemed) closeQrFull();
      if(stamped) thanks(n,token);
      else if(redeemed){ openSheet(`<h2 id="sheetTitle" style="font-size:1.6rem">${L("Odměna je vaše!","Enjoy your reward!")}</h2><p class="muted">${L("Dobrou chuť. Sbírání začíná znovu.","Collecting starts again.")}</p><button class="btn primary" type="button" id="okBtn">${L("Díky","Thanks")}</button>`); $("#okBtn").addEventListener("click",closeSheet); }
    }catch(e){}
  };
  let fastUntil=Date.now()+120000, timer=0, gone=false;
  const loop=()=>{ if(gone) return; timer=setTimeout(async()=>{ await tick(); loop(); },Date.now()<fastUntil?4000:30000); };
  const wake=()=>{ if(document.hidden||gone) return; fastUntil=Date.now()+120000; clearTimeout(timer); tick().then(loop); };
  document.addEventListener("visibilitychange",wake);
  boost=wake;
  loop(); onLeave(()=>{ gone=true; clearTimeout(timer); document.removeEventListener("visibilitychange",wake); closeQrFull(); });
}
/* QR across the whole white screen, so staff can scan it at the counter without scrolling */
function showQrFull(text,name,code){
  closeQrFull();
  const d=document.createElement("div"); d.id="qrFull"; d.className="qrfull"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true"); d.setAttribute("aria-label",L("QR kód karty","Card QR code"));
  d.innerHTML=`<div class="qrfull-name">${esc(name)}</div><div class="qrfull-qr">${qrSVG(text)}</div><div class="qrfull-code">${esc(code)}</div><button class="btn big" type="button" id="qrFullClose">${L("Zavřít","Close")}</button>`;
  document.body.appendChild(d); document.body.classList.add("noscroll");
  d.addEventListener("click",closeQrFull);
  $("#qrFullClose").focus();
  try{ if(navigator.wakeLock) navigator.wakeLock.request("screen").then(l=>{ d._lock=l; }).catch(()=>{}); }catch(e){}
}
function closeQrFull(){
  const d=document.getElementById("qrFull"); if(!d) return;
  try{ if(d._lock) d._lock.release(); }catch(e){}
  d.remove(); document.body.classList.remove("noscroll");
}
addEventListener("keydown",e=>{ if(e.key==="Escape") closeQrFull(); });
/* "Add to home screen" from a card page must open that card, also on iPhone where the home-screen app has its own storage */
function setCardManifest(name,url){
  try{
    const m={name:name+L(" – věrnostní karta"," – loyalty card"),short_name:name.slice(0,12),start_url:url,scope:BASE,display:"standalone",background_color:"#f5f2ea",theme_color:"#f5f2ea",lang:EN?"en":"cs",
      icons:[{src:BASE+"icon-192.png",sizes:"192x192",type:"image/png"},{src:BASE+"icon-512.png",sizes:"512x512",type:"image/png"}]};
    let l=document.querySelector('link[rel="manifest"]'); if(!l){ l=document.createElement("link"); l.rel="manifest"; document.head.appendChild(l); }
    l.href="data:application/manifest+json,"+encodeURIComponent(JSON.stringify(m));
  }catch(e){}
}
function thanks(c,token){
  const b=c.business, url=b.google_review_url;
  openSheet(`<h2 id="sheetTitle" style="font-size:1.7rem">${L("Díky za návštěvu!","Thanks for visiting!")}</h2>
    <p class="muted">${c.reward_ready?L("Máte plnou kartu, odměnu si vyzvedněte u obsluhy.","Your card is full – ask the staff for your reward."):L("Razítko je na kartě.","The stamp is on your card.")}${url?L(" Pomůže nám, když nám na Googlu napíšete, jak se vám u nás líbilo."," It would help us a lot if you told others on Google how you liked it."):""}</p>
    ${url?`<a class="btn accent big" id="revBtn" href="${esc(url)}" target="_blank" rel="noopener">${L("Napsat recenzi na Googlu","Write a Google review")}</a>`:""}
    <button class="btn ghost" type="button" id="laterBtn">${url?L("Teď ne","Not now"):L("Zavřít","Close")}</button>`);
  setAccent($("#sheet"),b.accent);
  if(url) $("#revBtn").addEventListener("click",()=>{ rpc("log_review_click",{p_token:token}).catch(()=>{}); setTimeout(closeSheet,300); });
  $("#laterBtn").addEventListener("click",closeSheet);
}
async function viewMyCards(){
  document.title=L("Moje karty","My cards")+" · Štempl";
  const all=cardStore.all(), slugs=Object.keys(all);
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px"><div><div class="eyebrow">Štempl</div><h1 style="font-size:2.2rem;margin-top:6px">${L("Moje karty","My cards")}</h1></div><div id="myList" class="stack"><p class="muted">${L("Načítám…","Loading…")}</p></div>${installBtn(L("Stáhnout Štempl do telefonu","Add Štempl to my phone"))}<a class="btn ghost" href="#/obnovit">${L("Obnovit kartu e-mailem","Restore a card by e-mail")}</a></div>${foot()}`;
  if(!slugs.length){ $("#myList").innerHTML=`<p class="muted">${L("V tomto prohlížeči zatím nemáte žádnou kartu. Naskenujte QR kód v podniku, nebo si kartu obnovte e-mailem.","You have no card in this browser yet. Scan the QR code in a shop, or restore a card by e-mail.")}</p>`; return; }
  const my=routeSeq; const rows=await Promise.all(slugs.map(s=>rpc("get_card",{p_token:all[s]}).catch(()=>null))); if(stale(my)) return;
  $("#myList").innerHTML=rows.map(c=>c?`<a class="lcard" style="text-decoration:none;--accent:${esc(c.business.accent)}" href="#/k/${esc(c.business.slug)}"><div class="cardhead">${logoSlot(c.business)}<div><div class="eyebrow">${L("Věrnostní karta","Loyalty card")}</div><div class="biz">${esc(c.business.name)}</div></div></div><p class="small muted" style="margin-top:8px">${Math.min(c.stamps,c.business.stamps_needed)} ${L("z","of")} ${c.business.stamps_needed} ${stampWord(c.business.stamps_needed)}${c.reward_ready?L(" · odměna čeká"," · reward ready"):""}</p></a>`:"").join("")||`<p class="muted">${L("Karty se nepodařilo načíst.","The cards could not be loaded.")}</p>`;
  rows.forEach(c=>{ if(c) fillLogos(c.business); });
}
/* link in every news e-mail */
async function viewUnsubscribe(tok){
  document.title=L("Odhlášení z novinek","Unsubscribe")+" · Štempl";
  loading(L("Odhlašuji…","Unsubscribing…"));
  try{
    const r=await rpc("marketing_unsubscribe",{p_token:String(tok).toLowerCase().replace(/[^0-9a-f]/g,"")});
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><h1 style="font-size:2rem">${L("Odhlášeno","Unsubscribed")}</h1><p class="muted">${L(`Od ${esc(r.business)} vám už žádné novinky ani připomínky nepřijdou. Karta i razítka zůstávají, sbírat můžete dál.`,`You won't get any more news or reminders from ${esc(r.business)}. Your card and stamps stay, you can keep collecting.`)}</p><a class="btn" href="#/moje">${L("Moje karty","My cards")}</a></div>`;
  }catch(e){ fail(e.message==="bad_token"?L("Odkaz je neplatný. Novinky můžete vypnout přímo na své kartě.","This link is not valid. You can switch news off on your card."):say(e)); }
}
function viewRecover(slug){
  document.title=L("Obnovit kartu","Restore card")+" · Štempl";
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div><div class="eyebrow">${L("Ztracená karta","Lost card")}</div><h1 style="font-size:2.2rem;margin-top:6px">${L("Obnovit kartu","Restore your card")}</h1></div>
    <form class="form panel" id="recForm" novalidate>
      <p class="muted small">${L("Pokud jste ke kartě uložili e-mail, pošleme vám na něj odkaz. Karta se obnoví i se všemi razítky.","If you saved an e-mail with your card, we'll send you a link. The card comes back with all stamps.")}</p>
      <label class="field">E-mail<input class="input" id="recEmail" type="email" autocomplete="email" required></label>
      <button class="btn primary" type="submit">${L("Poslat odkaz","Send the link")}</button>
      <div class="msg" id="recOut" role="status"></div>
    </form>
    <p class="small muted">${L("Nemáte u karty e-mail? Ukažte obsluze v podniku svůj kód karty nebo jméno, obsluha vám kartu najde.","No e-mail on the card? Tell the staff your card code or name and they will find it.")}</p></div>${foot()}`;
  $("#recForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#recOut"); out.className="msg"; const btn=e.target.querySelector("button"); btn.disabled=true;
    try{ await api("recover_card",{email:$("#recEmail").value.trim(),slug:slug||null}); out.className="msg ok"; out.textContent=L("Hotovo. Pokud k tomuto e-mailu existuje karta, odkaz už je na cestě. Zkontrolujte i spam.","Done. If a card exists for this e-mail, the link is on its way. Check spam too."); }
    catch(err){ out.className="msg err"; out.textContent=say(err); btn.disabled=false; }
  });
}

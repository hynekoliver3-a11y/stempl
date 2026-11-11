"use strict";
/* ================= OWNER ================= */
function billingText(bl){
  if(!bl) return {cls:"",text:""};
  if(bl.comp) return {cls:"ok",text:"Štempl máte zdarma."};
  const st=bl.status;
  if(st==="active"||st==="trialing") return {cls:"ok",text:`Předplatné je aktivní (${bl.plan==="year"?"ročně":"měsíčně"})${bl.paid_until?(bl.cancel_at_period_end?", zrušené – platí do ":", další platba ")+fmtD(bl.paid_until):""}.`};
  if(st==="past_due") return {cls:"bad",text:"Poslední platba se nepovedla. Aktualizujte kartu ve správě předplatného, jinak se razítkování za pár dní zastaví."};
  if(bl.in_trial){ const d=Math.max(0,Math.ceil((new Date(bl.trial_ends_at)-Date.now())/864e5)); return {cls:d<=3?"warn":"",text:`Zkušební verze zdarma do ${fmtD(bl.trial_ends_at)} (${d} ${plural(d,"den","dny","dní")}). Pak ${kc(PRICE.month)} měsíčně.`}; }
  return {cls:"bad",text:"Zkušební doba skončila nebo předplatné vypršelo. Zákazníci teď nemohou sbírat razítka. Aktivujte předplatné."};
}
function payUrl(plan,bl,email){
  const u=new URL(PAY[plan]); u.searchParams.set("client_reference_id",bl.id);
  if(email) u.searchParams.set("prefilled_email",email);
  u.searchParams.set("locale","cs");
  return u.toString();
}
async function viewOwner(tab){
  const s=sess.get();
  if(!s) return loginView("Přehled podniku",()=>viewOwner(tab),{owner:true});
  if(s.role==="staff") return fail("Přehled podniku je jen pro majitele. Jako obsluha můžete dávat razítka.",`<div class="row-btns"><a class="btn primary" href="#/obsluha">Obsluha</a><button class="btn ghost" type="button" id="relog">Přihlásit se jako majitel</button></div>`), $("#relog").addEventListener("click",logout);
  loading("Načítám přehled…"); const my=routeSeq;
  let st; try{ st=await rpc("owner_stats",{p_slug:s.slug,p_code:s.code}); }catch(e){ if(stale(my)) return; if(authFail(e)) return; return fail(say(e)); }
  if(stale(my)) return;
  const b=st.business, bl=st.billing; document.title="Přehled · "+b.name;
  const cardUrl=BASE+"#/k/"+b.slug, bt=billingText(bl), P=demo.on?"#/demo":"#/prehled";
  const pct=st.customers?Math.round(st.returning/st.customers*100):0;
  const todo=[["První zákazník s kartou (QR plakátek na pultu)",st.customers>0,"qr","Stáhnout plakátek"],["Odkaz na recenze na Googlu",!!b.google_review_url,"set","Doplnit"],["Kód obsluhy pro zaměstnance",!!b.has_staff_code,"set","Vytvořit"],["E-mail majitele pro obnovu přístupu",!!b.owner_email,"set","Doplnit"]];
  const paying=bl.status==="active"||bl.status==="trialing"||bl.status==="past_due";
  const showBanner=!bl.active||bl.status==="past_due"||(bl.in_trial&&!paying);
  app.innerHTML=`<div class="wrap stack" style="padding-block:22px;gap:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap"><div><div class="eyebrow">Přehled podniku</div><h1 style="font-size:clamp(2rem,5vw,3rem);margin-top:6px">${esc(b.name)}</h1></div>
      <div class="row-btns">${demo.on?`<a class="btn primary" href="#/registrace">Založit vlastní podnik zdarma</a><a class="btn ghost" href="#/">Zpět na web</a>`:`<a class="btn primary" href="#/obsluha">Režim obsluhy</a><button class="btn ghost" id="out" type="button">Odhlásit</button>`}</div></div>
    ${demo.on?`<div class="note demo"><b>Tohle je ukázka.</b> Podnik i zákazníci jsou vymyšlení a nic se neukládá. Takhle bude vypadat přehled vašeho podniku.</div>`:""}
    ${showBanner?`<div class="note ${bt.cls}" style="display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap"><span>${esc(bt.text)}</span>${bl.comp?"":`<button class="btn sm" type="button" data-go="plat">${paying?"Spravovat":"Aktivovat předplatné"}</button>`}</div>`:""}
    <div class="tabs" role="group" aria-label="Sekce">${[["stats","Čísla"],["cust","Zákazníci"],["qr","QR na pult"],["plat","Předplatné"],["set","Nastavení"]].map(([k,v])=>`<button type="button" data-t="${k}" aria-pressed="false">${v}</button>`).join("")}</div>
    <div id="t-stats" class="stack" hidden>
      <div class="tiles">
        <div class="tile"><b>${st.customers}</b><span>zákazníků s kartou</span></div>
        <div class="tile"><b>${st.returning}</b><span>se vrátilo (2+ návštěvy)${st.customers?` <em>${pct} %</em>`:""}</span></div>
        <div class="tile"><b>${st.new_30d}</b><span>nových za 30 dní</span></div>
        <div class="tile"><b>${st.stamps_30d}</b><span>razítek za 30 dní</span></div>
        <div class="tile"><b>${st.redeemed_total}</b><span>vydaných odměn</span></div>
        <div class="tile"><b>${st.review_clicks_30d}</b><span>otevřelo recenzi na Googlu (30 dní)</span></div>
      </div>
      ${todo.every(t=>t[1])?"":`<div class="panel stack" style="gap:8px"><b>První kroky</b><ul class="todo">${todo.map(t=>`<li class="${t[1]?"ok":""}"><span class="dot"></span><span class="t">${t[0]}</span>${t[1]?"":`<button class="btn sm" type="button" data-go="${t[2]}">${t[3]}</button>`}</li>`).join("")}</ul></div>`}
      ${b.google_review_url?"":`<div class="note">Chybí odkaz na recenze na Googlu, takže zákazníky zatím o recenzi neprosíme. Doplňte ho v <a href="${P}/set">Nastavení</a>.</div>`}
      <div class="panel"><b>Razítka za posledních 14 dní</b><div id="chart" style="margin-top:12px"></div></div>
      <div class="panel"><b>Poslední aktivita</b><ul class="feed" id="feed" style="margin-top:8px"></ul></div>
    </div>
    <div id="t-cust" class="stack" hidden>
      <div class="panel stack" style="gap:12px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between"><b>Zákazníci (${st.customers})</b><button class="btn ghost sm" id="csvBtn" type="button">Stáhnout do Excelu (CSV)</button></div>
        <input class="input" id="cq" type="search" placeholder="Hledat jméno, e-mail nebo kód karty" aria-label="Hledat zákazníka">
        <ul class="clist" id="clist"><li class="muted small" style="padding:12px 4px">Načítám…</li></ul>
        <div class="msg err" id="cOut"></div>
      </div>
    </div>
    <div id="t-qr" class="stack" hidden>
      <div class="panel stack"><b>Plakátek s QR kódem</b><p class="small muted">Vytiskněte a dejte na pult, ke kase nebo na zrcadlo. QR vede na: <span class="mono" style="word-break:break-all">${esc(cardUrl)}</span></p>
        <canvas id="poster" width="1240" height="1748" class="poster" aria-label="Plakátek s QR kódem"></canvas>
        <div class="row-btns"><a class="btn primary" id="dl" download="stempl-${esc(b.slug)}.png" href="#">Stáhnout plakátek (PNG)</a><a class="btn ghost" href="#/k/${esc(b.slug)}">Otevřít kartu zákazníka</a><button class="btn ghost" type="button" id="copyCard">Kopírovat odkaz na kartu</button></div><div class="msg small" id="copyCardOut" role="status"></div></div>
    </div>
    <div id="t-plat" class="stack" hidden>
      <div class="panel stack" style="gap:14px">
        <b>Předplatné</b>
        <div class="note ${bt.cls}">${esc(bt.text)}</div>
        ${demo.on?`<p class="small muted">V ukázce se nic neplatí. Skutečný podnik má prvních 14 dní zdarma, potom ${kc(PRICE.month)} měsíčně nebo ${kc(PRICE.year)} ročně.</p><div class="row-btns"><a class="btn primary" href="#/registrace">Založit vlastní podnik zdarma</a></div>`:bl.comp?"":paying?`<p class="small muted">Faktury, změnu platební karty, přechod mezi měsíčním a ročním předplatným i zrušení najdete ve správě předplatného. Přihlásíte se e-mailem${bl.billing_email?" <b>"+esc(bl.billing_email)+"</b>":""}, na který vám přijde odkaz.</p>
          <div class="row-btns"><a class="btn primary" href="${esc(PORTAL)}${bl.billing_email?"?prefilled_email="+encodeURIComponent(bl.billing_email):""}" target="_blank" rel="noopener">Spravovat předplatné a faktury</a></div>`
          :`<div class="plans">
            <div class="plan"><div class="eyebrow">Měsíčně</div><div class="big" style="font-size:2.4rem">${kc(PRICE.month)}</div><p class="small muted">měsíčně, zrušíte kdykoli</p><a class="btn primary" href="${esc(payUrl("month",bl,b.owner_email))}">Zaplatit měsíčně</a></div>
            <div class="plan hi"><div class="eyebrow">Ročně · 2 měsíce zdarma</div><div class="big" style="font-size:2.4rem">${kc(PRICE.year)}</div><p class="small muted">ročně (${kc(Math.round(PRICE.year/12))} měsíčně)</p><a class="btn primary" href="${esc(payUrl("year",bl,b.owner_email))}">Zaplatit ročně</a></div>
          </div>
          <p class="small muted">Platba kartou přes Stripe. Předplatné se obnovuje automaticky a zrušit ho můžete kdykoli, platí do konce zaplaceného období. ${esc(PROVIDER.vatNote)} <a href="#/podminky">Obchodní podmínky</a>${bl.in_trial?". Zaplacením zkušební verze končí a začíná placené období.":"."}</p>`}
      </div>
    </div>
    <div id="t-set" class="stack" hidden>
      <form class="form panel" id="setForm" novalidate>
        <b>Karta</b>
        <label class="field">Název podniku<input class="input" id="fName" value="${esc(b.name)}" maxlength="80" required></label>
        <div class="two">
          <label class="field">Typ podniku<select class="input" id="fCat">${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${k===b.category?" selected":""}>${v}</option>`).join("")}</select></label>
          <label class="field">Barva razítka<input class="input" id="fAccent" type="color" value="${esc(b.accent)}" style="padding:4px;height:48px"></label>
        </div>
        <div class="two">
          <label class="field">Odměna<input class="input" id="fReward" value="${esc(b.reward_text)}" maxlength="80" required></label>
          <label class="field">Počet razítek na odměnu<input class="input" id="fNeeded" type="number" min="3" max="30" value="${b.stamps_needed}" required></label>
        </div>
        <label class="field">Odkaz na recenzi na Googlu <small>Profil firmy na Googlu → Požádat o recenze → zkopírovat odkaz. Bez odkazu se o recenzi neprosí.</small><input class="input" id="fReview" type="url" value="${esc(b.google_review_url||"")}" placeholder="https://g.page/r/…/review"></label>
        <button class="btn primary" type="submit">Uložit</button>
        <div class="msg" id="fOut" role="status"></div>
      </form>
      <div class="panel stack" style="gap:12px">
        <b>Zaměstnanci</b>
        <p class="small muted">Všichni zaměstnanci se přihlašují na svém telefonu na <span class="mono">${esc(BASE)}#/obsluha</span> adresou <b>${esc(b.slug)}</b> a kódem obsluhy. Počet zaměstnanců ani telefonů není omezený. Kód obsluhy umí jen razítka a odměny, do přehledu a plateb nepustí. Když někdo odejde, vygenerujte nový kód – starý přestane platit.</p>
        <div id="staffCodeBox"></div>
        <div class="row-btns"><button class="btn" id="newStaff" type="button">${b.has_staff_code?"Vygenerovat nový kód obsluhy":"Vytvořit kód obsluhy"}</button></div>
      </div>
      <form class="form panel" id="ownerMail" novalidate>
        <b>E-mail majitele</b>
        <p class="small muted">Na něj pošleme nový kód, když ho zapomenete, a v pondělí krátký souhrn týdne.</p>
        <label class="check"><input type="checkbox" id="oSummary"${b.weekly_summary!==false?" checked":""}><span>Posílat týdenní souhrn (razítka, noví zákazníci, recenze)</span></label>
        <input class="input" id="oMail" type="email" value="${esc(b.owner_email||"")}" autocomplete="email" placeholder="majitel@podnik.cz">
        <button class="btn" type="submit">Uložit e-mail</button><div class="msg" id="oOut" role="status"></div>
      </form>
    </div>
  </div>${foot()}`;
  if($("#out")) $("#out").addEventListener("click",logout);
  const show=k=>{
    $$(".tabs button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.t===k?"true":"false"));
    ["stats","cust","qr","plat","set"].forEach(t=>$("#t-"+t).hidden=t!==k);
    if(k==="qr") drawPoster(b,cardUrl);
    if(k==="cust"&&!custLoaded) loadCustomers("");
    history.replaceState(null,"",P+(k==="stats"?"":"/"+k));
  };
  $$(".tabs button").forEach(t=>t.addEventListener("click",()=>show(t.dataset.t)));
  $$("[data-go]").forEach(t=>t.addEventListener("click",()=>show(t.dataset.go)));
  $("#copyCard").addEventListener("click",()=>copy(cardUrl,$("#copyCardOut")));
  $("#chart").innerHTML=`<div style="overflow-x:auto">${barChart(st.daily||[])}</div>`;
  const KIND={join:["Nová karta",""],stamp:["Razítko","stamp"],redeem:["Odměna vydána","redeem"],review_click:["Otevřel recenzi","review"]};
  const feed=st.recent||[];
  $("#feed").innerHTML=feed.length?feed.map(e=>{ const k=KIND[e.kind]||[e.kind,""]; return `<li><span><span class="pill ${k[1]}">${k[0]}</span> ${e.name?esc(e.name):e.card?'<span class="mono muted">'+esc(e.card)+'</span>':'<span class="muted">smazaná karta</span>'}</span><span class="muted">${fmtDT(e.at)}</span></li>`; }).join(""):`<li class="muted">Zatím nic. První zákazník se objeví po naskenování QR na pultu.</li>`;
  // customers
  let custLoaded=false, qTimer=0;
  async function loadCustomers(q){
    custLoaded=true;
    try{
      const list=await rpc("owner_customers",{p_slug:s.slug,p_code:s.code,p_query:q||null});
      $("#clist").innerHTML=list.length?list.map(c=>`<li><button type="button" data-id="${esc(c.id)}"><span class="nm">${c.name?esc(c.name):'<span class="mono">'+esc(c.code)+'</span>'}${c.reward_ready?' <span class="pill ok">odměna čeká</span>':""}</span><span class="vs">${c.total_stamps}</span><span class="sub">${Math.min(c.stamps,b.stamps_needed)}/${b.stamps_needed} na kartě · ${c.rewards_redeemed} ${plural(c.rewards_redeemed,"odměna","odměny","odměn")} · poslední návštěva ${c.last_stamp_at?fmtD(c.last_stamp_at):"–"}${c.email?" · "+esc(c.email):""}</span></button></li>`).join(""):`<li class="muted small" style="padding:12px 4px">${q?"Nikoho jsme nenašli.":"Zatím žádní zákazníci."}</li>`;
      $$("#clist button").forEach(x=>x.addEventListener("click",()=>openCustomer(x.dataset.id)));
    }catch(e){ if(authFail(e)) return; $("#cOut").textContent=say(e); }
  }
  $("#cq").addEventListener("input",e=>{ clearTimeout(qTimer); qTimer=setTimeout(()=>loadCustomers(e.target.value.trim()),300); });
  async function openCustomer(id){
    openSheet(`<p class="muted">Načítám…</p>`);
    try{
      const c=await rpc("owner_customer",{p_slug:s.slug,p_code:s.code,p_card:id});
      const HK={join:"Získal(a) kartu",stamp:"Návštěva (razítko)",redeem:"Vydaná odměna",review_click:"Otevřel(a) recenzi"};
      openSheet(`<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2 id="sheetTitle" style="font-size:1.6rem">${c.name?esc(c.name):"Zákazník"}</h2><span class="mono small muted">${short(c.token)}</span></div>
        ${c.email?`<p class="small muted">${esc(c.email)}</p>`:""}
        <div style="--accent:${esc(b.accent)}">${stampsGrid(c.stamps,b.stamps_needed,-1)}</div>
        <div class="kv"><div><b>${c.total_stamps}</b><span>návštěv celkem</span></div><div><b>${Math.min(c.stamps,b.stamps_needed)}/${b.stamps_needed}</b><span>na kartě</span></div><div><b>${c.rewards_redeemed}</b><span>vydaných odměn</span></div></div>
        <p class="small muted">Karta od ${fmtD(c.created_at)} · poslední návštěva ${c.last_stamp_at?fmtDT(c.last_stamp_at):"zatím žádná"}</p>
        <b>Historie</b><ul class="feed">${(c.history||[]).map(h=>`<li><span>${HK[h.kind]||h.kind}</span><span class="muted">${fmtDT(h.at)}</span></li>`).join("")||'<li class="muted">Bez záznamů</li>'}</ul>
        <button class="btn ghost" type="button" id="cClose">Zavřít</button>`);
      $("#cClose").addEventListener("click",closeSheet);
    }catch(e){ openSheet(`<p class="msg err">${esc(say(e))}</p><button class="btn ghost" type="button" id="cClose">Zavřít</button>`); $("#cClose").addEventListener("click",closeSheet); }
  }
  $("#csvBtn").addEventListener("click",async()=>{
    try{
      const rows=await rpc("export_customers",{p_slug:s.slug,p_code:s.code});
      const q=v=>{ v=v==null?"":String(v); return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
      const lines=[["Kód karty","Jméno","E-mail","Razítka na kartě","Návštěvy celkem","Vydané odměny","Karta od","Poslední návštěva"].join(";")]
        .concat(rows.map(r=>[r.code,r.name,r.email,r.stamps,r.total_stamps,r.rewards_redeemed,fmtD(r.created_at),r.last_stamp_at?fmtD(r.last_stamp_at):""].map(q).join(";")));
      downloadFile("zakaznici-"+b.slug+".csv","﻿"+lines.join("\r\n"),"text/csv;charset=utf-8");
    }catch(e){ $("#cOut").textContent=say(e); }
  });
  // settings
  $("#setForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#fOut"); out.className="msg";
    const needed=parseInt($("#fNeeded").value,10), url=$("#fReview").value.trim();
    if(!(needed>=3&&needed<=30)){ out.className="msg err"; out.textContent=ERR.bad_needed; return; }
    if(url&&!/^https:\/\//.test(url)){ out.className="msg err"; out.textContent="Odkaz na recenzi musí začínat https://"; return; }
    try{
      await rpc("update_business",{p_slug:s.slug,p_code:s.code,p_name:$("#fName").value.trim(),p_category:$("#fCat").value,p_reward:$("#fReward").value.trim(),p_needed:needed,p_review_url:url||null,p_accent:$("#fAccent").value});
      out.className="msg ok"; out.textContent="Uloženo."; s.name=$("#fName").value.trim(); sess.set(s);
    }catch(err){ out.className="msg err"; out.textContent=say(err); }
  });
  $("#newStaff").addEventListener("click",async()=>{
    try{ const r=await rpc("owner_reset_staff_code",{p_slug:s.slug,p_code:s.code});
      $("#staffCodeBox").innerHTML=`<p class="small muted">Nový kód obsluhy (zapište si ho, znovu se nezobrazí):</p><div class="bigcode">${esc(r.staff_code)}</div>`;
      $("#newStaff").textContent="Vygenerovat nový kód obsluhy";
    }catch(e){ $("#staffCodeBox").innerHTML=`<p class="msg err">${esc(say(e))}</p>`; }
  });
  $("#oSummary").addEventListener("change",async e=>{
    const out=$("#oOut"); out.className="msg";
    try{ await rpc("owner_set_summary",{p_slug:s.slug,p_code:s.code,p_on:e.target.checked}); out.className="msg ok"; out.textContent=e.target.checked?"Souhrn zapnutý.":"Souhrn vypnutý."; }
    catch(err){ out.className="msg err"; out.textContent=say(err); }
  });
  $("#ownerMail").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#oOut"); out.className="msg";
    try{ await rpc("owner_set_email",{p_slug:s.slug,p_code:s.code,p_email:$("#oMail").value.trim()}); out.className="msg ok"; out.textContent="Uloženo."; }
    catch(err){ out.className="msg err"; out.textContent=say(err); }
  });
  show(["stats","cust","qr","plat","set"].includes(tab)?tab:"stats");
}
async function drawPoster(b,url){
  const c=$("#poster"); if(!c) return; const x=c.getContext("2d"), W=c.width, H=c.height;
  const acc=/^#[0-9a-f]{6}$/i.test(b.accent||"")?b.accent:"#d9480f";
  const F="-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const rr=(X,Y,w,h,r)=>{ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); };
  const sp=v=>{ try{ x.letterSpacing=v; }catch(e){} };
  x.fillStyle="#f5f2ea"; x.fillRect(0,0,W,H);
  x.fillStyle="#16140f"; x.fillRect(0,0,W,580);
  x.fillStyle=acc; x.fillRect(0,580,W,14);
  x.textAlign="center"; x.textBaseline="alphabetic";
  sp("10px"); x.fillStyle="#cfc8ba"; x.font="600 34px "+F; x.fillText("VĚRNOSTNÍ KARTA", W/2, 128); sp("0px");
  /* business name: one or two lines, shrunk to fit */
  let size=112, lines=[];
  const wrap=()=>{ x.font="700 "+size+"px "+F; lines=[]; let line=""; b.name.split(" ").forEach(w=>{ const t=line?line+" "+w:w; if(x.measureText(t).width>W-170&&line){ lines.push(line); line=w; } else line=t; }); lines.push(line); };
  wrap(); while((lines.length>2||lines.some(l=>x.measureText(l).width>W-170))&&size>56){ size-=8; wrap(); }
  lines=lines.slice(0,2);
  x.fillStyle="#f5f2ea"; let y=lines.length===1?300:250;
  lines.forEach((l,i)=>x.fillText(l,W/2,y+i*(size+10)));
  y+=(lines.length-1)*(size+10)+64;
  /* reward pill in the business colour */
  let rs=46, rt=`${b.stamps_needed} ${plural(b.stamps_needed,"razítko","razítka","razítek")} = ${b.reward_text}`;
  x.font="600 "+rs+"px "+F; while(x.measureText(rt).width>W-260&&rs>30){ rs-=2; x.font="600 "+rs+"px "+F; }
  const pw=x.measureText(rt).width+90, ph=92;
  x.fillStyle=acc; rr((W-pw)/2,y,pw,ph,ph/2); x.fill();
  x.fillStyle=lum(acc)>.45?"#16140f":"#ffffff"; x.fillText(rt,W/2,y+ph/2+rs*.35);
  /* QR on a white card */
  const qs=700, qx=(W-qs)/2, qy=690;
  x.save(); x.shadowColor="rgba(40,28,12,.22)"; x.shadowBlur=70; x.shadowOffsetY=30; x.fillStyle="#fff"; rr(qx-54,qy-54,qs+108,qs+108,44); x.fill(); x.restore();
  if(window.StemplQR){ const q=window.StemplQR(url,"M"); const n=q.n, cs=qs/n; x.fillStyle="#111";
    for(let r=0;r<n;r++) for(let k=0;k<n;k++) if(q.dark(r,k)) x.fillRect(qx+k*cs,qy+r*cs,Math.ceil(cs),Math.ceil(cs)); }
  x.fillStyle="#16140f"; x.font="700 74px "+F; x.fillText("Naskenujte fotoaparátem", W/2, qy+qs+54+112);
  x.font="400 42px "+F; x.fillStyle="#655f55"; x.fillText("Karta je zdarma a nic se nestahuje.", W/2, qy+qs+54+180);
  sp("4px"); x.font="600 28px "+F; x.fillStyle="#8a8377"; x.fillText("ŠTEMPL", W/2, H-56); sp("0px");
  try{ $("#dl").href=c.toDataURL("image/png"); }catch(e){}
}

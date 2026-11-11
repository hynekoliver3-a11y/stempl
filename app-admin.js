"use strict";
/* ================= SELF-SERVE REGISTRATION ================= */
function viewRegister(){
  document.title="Registrace · Štempl";
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div><div class="eyebrow">14 dní zdarma, bez platební karty</div><h1 style="font-size:2.4rem;margin-top:8px">Registrace podniku</h1></div>
    <form class="form panel" id="regForm" novalidate>
      <label class="field">Název podniku<input class="input" id="rName" placeholder="Kavárna U Mostu" maxlength="80" required></label>
      <label class="field">Adresa podniku <small>bude v odkazu na kartu a slouží k přihlášení</small><input class="input mono" id="rSlug" maxlength="40" autocapitalize="off" required></label>
      <div class="two">
        <label class="field">Typ podniku<select class="input" id="rCat">${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></label>
        <label class="field">Barva razítka<input class="input" id="rAccent" type="color" value="#c2410c" style="padding:4px;height:48px"></label>
      </div>
      <div class="two">
        <label class="field">Odměna<input class="input" id="rReward" value="Káva zdarma" maxlength="80" required></label>
        <label class="field">Razítek na odměnu<input class="input" id="rNeeded" type="number" min="3" max="30" value="10" required></label>
      </div>
      <label class="field">E-mail majitele <small>pošleme na něj potvrzení a přístupy</small><input class="input" id="rEmail" type="email" autocomplete="email" maxlength="120" required></label>
      <label class="field">Telefon <small>nepovinné, kdybyste chtěli pomoct s nastavením</small><input class="input" id="rPhone" type="tel" autocomplete="tel" maxlength="30"></label>
      <div class="hp" aria-hidden="true"><label>Web<input id="rWeb" tabindex="-1" autocomplete="off"></label></div>
      <label class="check"><input type="checkbox" id="rTerms"><span>Souhlasím s <a href="#/podminky" target="_blank">obchodními podmínkami</a> a beru na vědomí <a href="#/soukromi" target="_blank">zásady ochrany osobních údajů</a>.</span></label>
      <button class="btn primary big" type="submit">Zaregistrovat podnik</button>
      <div class="msg err" id="rOut" role="status"></div>
    </form>
    <p class="small muted">Po skončení zkušební doby ${kc(PRICE.month)} měsíčně nebo ${kc(PRICE.year)} ročně. Když nezaplatíte, nic se neúčtuje, jen se razítkování pozastaví.</p></div>${foot()}`;
  let touched=false;
  $("#rSlug").addEventListener("input",()=>touched=true);
  $("#rName").addEventListener("input",()=>{ if(!touched) $("#rSlug").value=slugify($("#rName").value); });
  $("#regForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#rOut"); out.textContent="";
    const slug=slugify($("#rSlug").value), needed=parseInt($("#rNeeded").value,10), email=$("#rEmail").value.trim();
    if($("#rName").value.trim().length<2){ out.textContent=ERR.bad_name; return; }
    if(slug.length<3){ out.textContent=ERR.bad_slug; return; }
    if(!(needed>=3&&needed<=30)){ out.textContent=ERR.bad_needed; return; }
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ out.textContent=ERR.bad_email; return; }
    if(!$("#rTerms").checked){ out.textContent=ERR.terms_required; return; }
    const btn=e.target.querySelector("button[type=submit]"); btn.disabled=true;
    try{
      await api("register",{name:$("#rName").value.trim(),slug,category:$("#rCat").value,reward:$("#rReward").value.trim(),needed,accent:$("#rAccent").value,email,phone:$("#rPhone").value.trim(),website:$("#rWeb").value,accept_terms:true});
      app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><svg width="60" height="60" viewBox="0 0 100 100" style="color:var(--ok)"><use href="#mark"/></svg><h1 style="font-size:2.2rem">Zkontrolujte e-mail</h1><p class="muted">Poslali jsme potvrzovací odkaz na <b>${esc(email)}</b>. Klikněte na něj a podnik se založí. Odkaz platí 72 hodin. Pokud e-mail nevidíte, podívejte se do spamu.</p><a class="btn ghost" href="#/">Na úvod</a></div>`;
    }catch(err){ out.textContent=say(err); btn.disabled=false; }
  });
}
function codesView(r,title,intro){
  sess.set({slug:r.slug,code:r.code,name:r.name,role:"owner"});
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:32px">
    <svg width="60" height="60" viewBox="0 0 100 100" style="color:var(--ok)"><use href="#mark"/></svg>
    <h1 style="font-size:2.2rem">${esc(title)}</h1><p class="muted">${intro}</p>
    <div class="panel stack" style="gap:12px">
      <div><div class="small muted">Adresa podniku</div><div class="code" style="font-size:1.4rem;margin-top:4px">${esc(r.slug)}</div></div>
      <div><div class="small muted">Kód majitele – přehled, nastavení a platby. Nikomu ho nedávejte.</div><div class="bigcode" style="margin-top:6px">${esc(r.code)}</div></div>
      ${r.staff_code?`<div><div class="small muted">Kód obsluhy – pro všechny zaměstnance, umí jen razítka</div><div class="bigcode" style="margin-top:6px;background:var(--card);color:var(--ink);border:1.5px solid var(--line2)">${esc(r.staff_code)}</div></div>`:""}
      ${r.mailed===false?`<div class="note">Přístupy se nepodařilo poslat e-mailem, opište si je prosím teď.</div>`:`<p class="small muted">Přístupy jsme vám poslali i e-mailem. Na tomto zařízení už jste přihlášení.</p>`}
    </div>
    <div class="panel stack" style="gap:8px"><b>Co dál</b><p class="small">1. V přehledu stáhněte plakátek s QR kódem a dejte ho na pult.<br>2. Doplňte odkaz na recenze na Googlu v Nastavení.<br>3. Zaměstnanci se přihlásí na <span class="mono">#/obsluha</span> kódem obsluhy.</p></div>
    <div class="row-btns"><a class="btn primary" href="#/prehled/qr">Otevřít přehled</a><a class="btn ghost" href="#/obsluha">Režim obsluhy</a></div></div>`;
}
async function viewConfirm(token){
  loading("Potvrzuji registraci…");
  try{ const r=await api("confirm",{token}); history.replaceState(null,"","#/hotovo"); codesView(r,"Podnik je založený","Zkušební verze zdarma běží do "+fmtD(r.trial_ends_at)+". Tady jsou vaše přístupy:"); }
  catch(e){ fail(say(e),e.message==="already_confirmed"?`<a class="btn primary" href="#/prehled">Přihlásit se</a>`:""); }
}
function viewForgot(){
  document.title="Zapomenutý kód · Štempl";
  const s=sess.get();
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px"><div><div class="eyebrow">Přístup majitele</div><h1 style="font-size:2.2rem;margin-top:6px">Zapomenutý kód</h1></div>
    <form class="form panel" id="fgForm" novalidate><p class="small muted">Pošleme odkaz pro nový kód majitele na e-mail, který máte u podniku uložený.</p>
      <label class="field">Adresa podniku<input class="input" id="fgSlug" autocapitalize="off" value="${esc(s&&s.slug||"")}" required></label>
      <button class="btn primary" type="submit">Poslat odkaz</button><div class="msg" id="fgOut" role="status"></div></form>
    <p class="small muted">Nemáte u podniku e-mail? Napište nám na <a href="mailto:${esc(PROVIDER.email)}">${esc(PROVIDER.email)}</a>.</p></div>`;
  $("#fgForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#fgOut"); out.className="msg";
    try{ await api("forgot_code",{slug:$("#fgSlug").value.trim().toLowerCase()}); out.className="msg ok"; out.textContent="Pokud má podnik uložený e-mail, odkaz už je na cestě."; }
    catch(err){ out.className="msg err"; out.textContent=say(err); }
  });
}
async function viewResetCode(token){
  loading("Nastavuji nový kód…");
  try{ const r=await api("reset_code",{token}); history.replaceState(null,"","#/hotovo"); codesView(r,"Nový kód majitele","Starý kód majitele přestal platit. Kód obsluhy zůstává stejný."); }
  catch(e){ fail(say(e)); }
}
function viewPaid(){
  document.title="Platba proběhla · Štempl";
  const s=sess.get();
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:40px"><svg width="60" height="60" viewBox="0 0 100 100" style="color:var(--ok)"><use href="#mark"/></svg><h1 style="font-size:2.2rem">Děkujeme, platba proběhla</h1>
    <p class="muted" id="paidMsg">${s&&s.role==="owner"?"Aktivuji předplatné…":"Předplatné se aktivuje během chvilky. Potvrzení a fakturu vám pošle Stripe e-mailem."}</p><a class="btn primary" href="#/prehled/plat">Přehled podniku</a></div>`;
  if(!(s&&s.role==="owner")) return;
  let n=0; const iv=setInterval(async()=>{
    n++; try{ const st=await rpc("owner_stats",{p_slug:s.slug,p_code:s.code}); const st2=st.billing.status;
      if(st2==="active"||st2==="trialing"){ clearInterval(iv); $("#paidMsg").textContent="Předplatné je aktivní. Fakturu najdete ve správě předplatného a přijde vám i e-mailem."; } }catch(e){}
    if(n>=40){ clearInterval(iv); const m=$("#paidMsg"); if(m) m.textContent="Platba je přijatá, aktivace ještě běží. Zkontrolujte přehled za pár minut. Kdyby se nic nezměnilo, napište na "+PROVIDER.email+"."; }
  },3000);
  onLeave(()=>clearInterval(iv));
}

/* ================= LEGAL ================= */
function providerLine(){ return `${esc(PROVIDER.name)}, ${esc(PROVIDER.city)}${PROVIDER.ico?", IČO "+esc(PROVIDER.ico):""}, e-mail <a href="mailto:${esc(PROVIDER.email)}">${esc(PROVIDER.email)}</a>`; }
function viewTerms(){
  document.title="Obchodní podmínky · Štempl";
  app.innerHTML=`<div class="wrap mid legal" style="padding-block:32px"><div class="eyebrow">Platné od 27. 10. 2026</div><h1 style="font-size:2.4rem;margin-top:8px">Obchodní podmínky služby Štempl</h1>
  <h2>1. Kdo službu poskytuje</h2><p>Provozovatel: ${providerLine()} (dále „provozovatel“). Zákazníkem je podnikatel, který si službu zaregistruje (dále „podnik“). Služba je určena jen podnikatelům, ne spotřebitelům.</p>
  <h2>2. Co služba umí</h2><p>Štempl je webová aplikace pro digitální věrnostní karty: zákazníci podniku si kartu otevřou v mobilu, obsluha přidává razítka a vydává odměny a podnik vidí přehled zákazníků a statistiky. Aplikace může zákazníky požádat o recenzi na Googlu. Počet zaměstnanců ani zařízení podniku není omezený.</p>
  <h2>3. Registrace a zkušební doba</h2><p>Podnik se registruje online a potvrdí e-mail. Prvních 14 dní je zdarma a bez závazku. Když podnik po zkušební době nezaplatí, nic se neúčtuje, jen se pozastaví přidávání razítek a nových karet. Data zůstávají uložená.</p>
  <h2>4. Cena a platby</h2><p>Cena je ${kc(PRICE.month)} měsíčně, nebo ${kc(PRICE.year)} ročně za jeden podnik. ${esc(PROVIDER.vatNote)} Platí se předem platební kartou přes službu Stripe. Předplatné se automaticky obnovuje vždy na další období. Doklad o platbě (fakturu) zasílá Stripe e-mailem a je k dispozici ve správě předplatného.</p>
  <h2>5. Zrušení</h2><p>Podnik může předplatné kdykoli zrušit ve správě předplatného (Přehled → Předplatné). Služba pak běží do konce zaplaceného období a dál se neúčtuje. Za nevyčerpanou část období se peníze nevracejí. Když platba selže, Stripe ji zkusí opakovat. Pokud se do 7 dnů po konci období nepodaří, služba se pozastaví.</p>
  <h2>6. Povinnosti podniku</h2><p>Podnik nastavuje odměny a plní je svým zákazníkům. Za věrnostní program vůči svým zákazníkům odpovídá podnik. Podnik nesmí razítka podmiňovat napsáním recenze a chrání své přístupové kódy. Kód majitele nesmí předávat zaměstnancům, ti používají kód obsluhy.</p>
  <h2>7. Osobní údaje zákazníků podniku</h2><p>Pro osobní údaje svých zákazníků je správcem podnik, provozovatel je jejich zpracovatelem (čl. 28 GDPR). Provozovatel zpracovává údaje jen k provozu služby, podle pokynů podniku daných nastavením aplikace, zajišťuje jejich zabezpečení a mlčenlivost, využívá jen subdodavatele uvedené v <a href="#/soukromi">zásadách ochrany osobních údajů</a>, pomáhá podniku vyřizovat žádosti zákazníků a po skončení služby údaje na žádost podniku smaže nebo předá. Tento odstavec je smlouvou o zpracování osobních údajů.</p>
  <h2>8. Dostupnost a odpovědnost</h2><p>Provozovatel se snaží o nepřetržitý provoz, ale nezaručuje ho. Odstávky a změny funkcí oznamuje předem, pokud to jde. Odpovědnost provozovatele za škodu je omezena na částku, kterou podnik zaplatil za posledních 12 měsíců. Provozovatel neodpovídá za ušlý zisk ani za obsah recenzí na Googlu.</p>
  <h2>9. Ukončení ze strany provozovatele</h2><p>Provozovatel může službu podniku ukončit, pokud podnik hrubě porušuje tyto podmínky nebo zákon. Při ukončení služby provozovatelem z jiného důvodu vrátí poměrnou část zaplacené ceny.</p>
  <h2>10. Změny podmínek a rozhodné právo</h2><p>Změny podmínek oznámí provozovatel e-mailem nejméně 30 dní předem. Podnik je může odmítnout zrušením předplatného. Vztah se řídí českým právem, zejména občanským zákoníkem. Spory řeší obecné soudy ČR.</p>
  <p class="small muted" style="margin-top:24px"><a href="#/">Zpět na úvod</a></p></div>${foot()}`;
}
function viewPrivacy(){
  document.title="Ochrana osobních údajů · Štempl";
  app.innerHTML=`<div class="wrap mid legal" style="padding-block:32px"><div class="eyebrow">Platné od 27. 10. 2026</div><h1 style="font-size:2.4rem;margin-top:8px">Ochrana osobních údajů</h1>
  <h2>Zákazníci podniků (držitelé karet)</h2>
  <p>Správcem vašich údajů je podnik, jehož kartu máte. Štempl (${providerLine()}) je zpracovatel, který kartu provozuje jménem podniku.</p>
  <ul><li><b>Co ukládáme:</b> náhodný kód karty, počet razítek, odměn a čas návštěv. Křestní jméno a e-mail jen pokud je sami vyplníte, e-mail jen s vaším souhlasem. Nevyžadujeme registraci, heslo ani telefonní číslo.</li>
  <li><b>K čemu:</b> k vedení věrnostního programu (razítka a odměny) a k obnovení karty na novém telefonu (e-mail). Podnik vidí vaši kartu, počet návštěv a údaje, které jste vyplnili. Právní základ: plnění věrnostního programu, u e-mailu váš souhlas.</li>
  <li><b>Jak dlouho:</b> po dobu, kdy podnik věrnostní program provozuje, nebo dokud kartu nesmažete. Karta nevyprší kvůli neaktivitě. Souhlas s uložením e-mailu můžete kdykoli odvolat.</li>
  <li><b>Smazání:</b> kartu i se všemi údaji smažete sami tlačítkem <i>Smazat kartu a moje údaje</i> na kartě. Smazání je okamžité a nevratné.</li></ul>
  <h2>Podniky (zákazníci Štemplu)</h2>
  <p>Správcem je provozovatel. Zpracováváme název a údaje podniku, e-mail a telefon majitele a údaje o předplatném, abychom mohli službu poskytovat a fakturovat (plnění smlouvy, účetní povinnosti). Údaje o platební kartě nevidíme, zpracovává je Stripe. Účetní doklady uchováváme 10 let, ostatní údaje po dobu trvání služby.</p>
  <h2>Kdo nám pomáhá (zpracovatelé)</h2>
  <ul><li><b>Supabase</b> – databáze a serverové funkce, servery v EU.</li><li><b>Stripe</b> – platby podniků a faktury.</li><li><b>Google (Gmail)</b> – odesílání e-mailů (potvrzení registrace, obnova karty).</li><li><b>GitHub</b> – hosting webové aplikace (běžné technické záznamy o návštěvě, např. IP adresa).</li></ul>
  <p>Písma i knihovny aplikace jsou uložené přímo u nás, takže prohlížeč při běžném použití nekomunikuje s dalšími službami. Výjimkou je odkaz na recenzi na Googlu a platební stránka Stripe, které otevíráte sami.</p>
  <h2>Cookies a úložiště v prohlížeči</h2><p>Nepoužíváme reklamní ani analytické cookies. Ukládáme jen to, bez čeho aplikace nefunguje. Podrobnosti najdete v <a href="cookies.html">zásadách cookies</a>.</p>
  <h2>Vaše práva</h2><p>Máte právo na přístup k údajům, opravu, výmaz, omezení zpracování, přenositelnost a vznést námitku. Napište podniku, nebo nám na <a href="mailto:${esc(PROVIDER.email)}">${esc(PROVIDER.email)}</a>. Můžete také podat stížnost u Úřadu pro ochranu osobních údajů (uoou.gov.cz).</p>
  <p class="small muted">Recenze na Googlu jsou dobrovolné a nemají vliv na razítka ani odměny.</p>
  <p class="small muted" style="margin-top:24px"><a href="javascript:history.back()">Zpět</a></p></div>${foot()}`;
}

/* ================= ADMIN (Oliver) ================= */
function viewAdmin(){
  document.title="Správa · Štempl";
  const key=store.get("ikey","")||(sessionStorage.getItem("stempl.ikey")||"");
  if(!key){
    app.innerHTML=`<div class="wrap narrow stack" style="padding-block:32px"><div><div class="eyebrow">Jen pro provozovatele</div><h1 style="font-size:2.4rem;margin-top:8px">Správa</h1></div>
      <form class="form panel" id="akForm" novalidate><label class="field">Instalační klíč<input class="input mono" id="ak" type="password" autocomplete="off" required></label>
      <label class="check"><input type="checkbox" id="akRem"><span>Zapamatovat v tomto prohlížeči</span></label>
      <button class="btn primary" type="submit">Přihlásit</button><div class="msg err" id="akOut"></div></form></div>`;
    $("#akForm").addEventListener("submit",async e=>{
      e.preventDefault(); const k=$("#ak").value.trim();
      try{ await rpc("admin_overview",{p_installer_key:k}); if($("#akRem").checked) store.set("ikey",k); else sessionStorage.setItem("stempl.ikey",k); viewAdmin(); }
      catch(err){ $("#akOut").textContent=say(err); }
    });
    return;
  }
  adminDash(key);
}
async function adminDash(key){
  loading("Načítám správu…");
  let d; try{ d=await rpc("admin_overview",{p_installer_key:key}); }
  catch(e){ store.del("ikey"); sessionStorage.removeItem("stempl.ikey"); return fail(say(e),`<a class="btn primary" href="#/sprava" onclick="setTimeout(()=>location.reload(),0)">Znovu</a>`); }
  const now=Date.now(), biz=d.businesses||[];
  const status=bl=>{ if(bl.comp) return '<span class="pill ok">zdarma</span>'; const st=bl.status;
    if(st==="active"||st==="trialing") return `<span class="pill ok">platí ${bl.plan==="year"?"ročně":"měsíčně"}${bl.cancel_at_period_end?" · zrušeno":""}</span>`;
    if(st==="past_due") return '<span class="pill bad">neuhrazeno</span>';
    if(bl.in_trial) return `<span class="pill warn">zkušební do ${fmtD(bl.trial_ends_at)}</span>`;
    return '<span class="pill bad">neaktivní</span>'; };
  const paying=biz.filter(b=>["active","trialing","past_due"].includes(b.billing.status)).length;
  app.innerHTML=`<div class="wrap stack" style="padding-block:24px;gap:20px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap"><div><div class="eyebrow">Správa Štemplu</div><h1 style="font-size:2.4rem;margin-top:6px">Podniky</h1></div>
      <div class="row-btns"><a class="btn primary" href="#/novy">Založit podnik</a><button class="btn ghost" id="akOut" type="button">Odhlásit</button></div></div>
    <div class="tiles"><div class="tile"><b>${biz.length}</b><span>podniků</span></div><div class="tile"><b>${paying}</b><span>platících</span></div><div class="tile"><b>${kc(d.mrr||0)}</b><span>měsíční příjem (MRR)</span></div><div class="tile"><b>${d.pending_registrations||0}</b><span>nepotvrzených registrací</span></div></div>
    ${(d.unmatched||[]).length?`<div class="panel stack" style="gap:10px"><b>Platby bez podniku</b><p class="small muted">Někdo zaplatil přes obecný odkaz. Přiřaďte platbu k podniku.</p>${d.unmatched.map(u=>`<div class="row-btns" style="align-items:center"><span class="small">${fmtDT(u.at)} · ${esc(u.email||"")} ${u.business_name?"· "+esc(u.business_name):""}</span><select class="input" style="max-width:220px" data-link="${esc(u.id)}"><option value="">vyberte podnik…</option>${biz.map(b=>`<option value="${esc(b.slug)}">${esc(b.name)}</option>`).join("")}</select></div>`).join("")}</div>`:""}
    <div class="panel scrollx"><table class="table"><thead><tr><th>Podnik</th><th>Předplatné</th><th>Zákazníci</th><th>Razítka 30 d</th><th>Poslední aktivita</th><th>Akce</th></tr></thead><tbody>
      ${biz.map(b=>{ const idle=!b.last_activity||now-new Date(b.last_activity).getTime()>14*864e5;
        return `<tr><td><b>${esc(b.name)}</b><div class="tiny muted mono">${esc(b.slug)}</div><div class="tiny muted">${esc(b.owner_email||"bez e-mailu")}${b.phone?" · "+esc(b.phone):""}</div>${b.has_review_url?"":'<div><span class="pill warn">chybí odkaz na recenze</span></div>'}</td>
          <td>${status(b.billing)}</td><td>${b.customers}</td><td>${b.stamps_30d}</td>
          <td>${b.last_activity?fmtD(b.last_activity):"–"}${idle?' <span class="pill warn">14+ dní nic</span>':""}</td>
          <td><div class="row-btns"><button class="btn sm ghost" data-a="trial" data-s="${esc(b.slug)}">+14 dní</button><button class="btn sm ghost" data-a="comp" data-s="${esc(b.slug)}" data-v="${b.billing.comp?"0":"1"}">${b.billing.comp?"Zrušit zdarma":"Dát zdarma"}</button><button class="btn sm ghost" data-a="code" data-s="${esc(b.slug)}">Nový kód majitele</button><button class="btn sm danger" data-a="del" data-s="${esc(b.slug)}">Smazat</button></div></td></tr>`; }).join("")||'<tr><td colspan="6" class="muted">Zatím žádné podniky.</td></tr>'}
    </tbody></table><div class="msg" id="adOut" role="status"></div></div>
    <div class="panel"><b>Poptávky z webu</b><ul class="feed" style="margin-top:8px">${(d.leads||[]).map(l=>`<li><span><b>${esc(l.business)}</b> · ${esc(l.name)} · ${esc(l.contact)}${l.message?'<br><span class="small muted">'+esc(l.message)+'</span>':""}</span><span class="muted">${fmtD(l.created_at)}</span></li>`).join("")||'<li class="muted">Zatím žádné.</li>'}</ul></div>
  </div>`;
  $("#akOut").addEventListener("click",()=>{ store.del("ikey"); sessionStorage.removeItem("stempl.ikey"); viewAdmin(); });
  $$("[data-a]").forEach(btn=>btn.addEventListener("click",async()=>{
    const a=btn.dataset.a, slug=btn.dataset.s, out=$("#adOut"); out.className="msg";
    try{
      if(a==="trial") await rpc("admin_set_billing",{p_installer_key:key,p_slug:slug,p_comp:null,p_trial_days:14});
      if(a==="comp") await rpc("admin_set_billing",{p_installer_key:key,p_slug:slug,p_comp:btn.dataset.v==="1",p_trial_days:null});
      if(a==="del"){
        const typed=prompt("Smazat podnik "+slug+" i se všemi kartami zákazníků? Nejde to vrátit.\nPro potvrzení napište adresu podniku:");
        if(typed===null) return;
        const r=await rpc("admin_delete_business",{p_installer_key:key,p_slug:slug,p_confirm:typed});
        await adminDash(key);
        $("#adOut").className="msg ok"; $("#adOut").textContent="Podnik "+r.deleted+" smazán ("+r.cards+" karet)."+(r.subscription_to_cancel?" Pozor: má aktivní předplatné "+r.subscription_to_cancel+", zrušte ho ve Stripe.":"");
        return;
      }
      if(a==="code"){ if(!confirm("Vygenerovat nový kód majitele pro "+slug+"? Starý přestane platit.")) return;
        const r=await rpc("reset_business_code",{p_installer_key:key,p_slug:slug});
        openSheet(`<h2 id="sheetTitle" style="font-size:1.5rem">Nový kód majitele</h2><p class="muted">${esc(r.name)} (${esc(r.slug)})</p><div class="bigcode">${esc(r.code)}</div><button class="btn ghost" id="cx" type="button">Zavřít</button>`); $("#cx").addEventListener("click",()=>{ closeSheet(); }); return; }
      adminDash(key);
    }catch(e){ out.className="msg err"; out.textContent=say(e); }
  }));
  $$("[data-link]").forEach(sel=>sel.addEventListener("change",async()=>{
    if(!sel.value) return;
    try{ await rpc("admin_link_payment",{p_installer_key:key,p_slug:sel.value,p_event_id:sel.dataset.link}); adminDash(key); }
    catch(e){ $("#adOut").className="msg err"; $("#adOut").textContent=say(e); }
  }));
}
function viewNew(){
  document.title="Nový podnik · Štempl";
  app.innerHTML=`<div class="wrap narrow stack" style="padding-block:28px">
    <div><div class="eyebrow">Pro správce Štemplu</div><h1 style="font-size:2.4rem;margin-top:8px">Nový podnik</h1><p class="small muted" style="margin-top:6px"><a href="#/sprava">← Správa</a></p></div>
    <form class="form panel" id="newForm" novalidate>
      <label class="field">Instalační klíč<input class="input mono" id="nKey" type="password" autocomplete="off" value="${esc(store.get("ikey","")||sessionStorage.getItem("stempl.ikey")||"")}" required></label>
      <label class="field">Název podniku<input class="input" id="nName" placeholder="Kavárna U Mostu" maxlength="80" required></label>
      <label class="field">Adresa (v odkazu) <small>malá písmena, čísla a pomlčky</small><input class="input mono" id="nSlug" maxlength="40" autocapitalize="off" required></label>
      <div class="two">
        <label class="field">Typ podniku<select class="input" id="nCat">${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></label>
        <label class="field">Barva razítka<input class="input" id="nAccent" type="color" value="#c2410c" style="padding:4px;height:48px"></label>
      </div>
      <div class="two">
        <label class="field">Odměna<input class="input" id="nReward" value="Káva zdarma" maxlength="80" required></label>
        <label class="field">Razítek na odměnu<input class="input" id="nNeeded" type="number" min="3" max="30" value="10" required></label>
      </div>
      <div class="two">
        <label class="field">E-mail majitele <small>nepovinné</small><input class="input" id="nEmail" type="email"></label>
        <label class="field">Zkušební doba (dní)<input class="input" id="nTrial" type="number" min="0" max="365" value="14"></label>
      </div>
      <label class="field">Odkaz na recenzi na Googlu <small>nepovinné, jde doplnit později</small><input class="input" id="nReview" type="url" placeholder="https://g.page/r/…/review"></label>
      <button class="btn primary big" type="submit">Založit podnik</button>
      <div class="msg err" id="nOut" role="status"></div>
    </form><div id="nRes"></div></div>`;
  let touched=false;
  $("#nSlug").addEventListener("input",()=>touched=true);
  $("#nName").addEventListener("input",()=>{ if(!touched) $("#nSlug").value=slugify($("#nName").value); });
  $("#newForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#nOut"); out.textContent="";
    const slug=slugify($("#nSlug").value), needed=parseInt($("#nNeeded").value,10), url=$("#nReview").value.trim();
    if(slug.length<3){ out.textContent=ERR.bad_slug; return; }
    if(!(needed>=3&&needed<=30)){ out.textContent=ERR.bad_needed; return; }
    if(url&&!/^https:\/\//.test(url)){ out.textContent="Odkaz na recenzi musí začínat https://"; return; }
    try{
      const r=await rpc("create_business",{p_installer_key:$("#nKey").value.trim(),p_name:$("#nName").value.trim(),p_slug:slug,p_category:$("#nCat").value,p_reward:$("#nReward").value.trim(),p_needed:needed,p_review_url:url||null,p_accent:$("#nAccent").value,p_owner_email:$("#nEmail").value.trim()||null,p_trial_days:parseInt($("#nTrial").value,10)||0});
      $("#newForm").hidden=true;
      $("#nRes").innerHTML=`<div class="panel stack"><b>Podnik ${esc(r.name)} je založený.</b><p class="muted small">Zapište si kódy, znovu se nezobrazí.</p>
        <div><div class="small muted">Kód majitele</div><div class="bigcode">${esc(r.code)}</div></div>
        <div><div class="small muted">Kód obsluhy</div><div class="bigcode">${esc(r.staff_code)}</div></div>
        <p class="small"><b>Karta:</b> <span class="mono">${esc(BASE)}#/k/${esc(r.slug)}</span><br><b>Obsluha:</b> <span class="mono">${esc(BASE)}#/obsluha</span> · adresa <b>${esc(r.slug)}</b></p>
        <div class="row-btns"><button class="btn primary" type="button" id="goOwner">Otevřít přehled a stáhnout QR</button><a class="btn ghost" href="#/sprava">Správa</a></div></div>`;
      $("#goOwner").addEventListener("click",()=>{ sess.set({slug:r.slug,code:r.code,name:r.name,role:"owner"}); location.hash="#/prehled/qr"; });
    }catch(err){ out.textContent=say(err); }
  });
}

let hiddenAt=0;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){ hiddenAt=Date.now(); return; }
  if(hiddenAt&&Date.now()-hiddenAt>15000&&/^#\/(r|obsluha)/.test(location.hash)&&!$("#sheet").classList.contains("on")) route();
});
addEventListener("pageshow",e=>{ if(e.persisted) route(); });
if("serviceWorker" in navigator&&location.protocol==="https:") addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
route();

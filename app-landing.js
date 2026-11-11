"use strict";
/* ================= DEMO (sample data only – nothing is read from or saved to the server) ================= */
const demo={on:false,data:null};
const DEMO_SESS={slug:"ukazka",code:"DEMO",name:"Kavárna Ukázka",role:"owner"};
function demoData(){
  if(demo.data) return demo.data;
  const day=864e5, now=Date.now(), iso=t=>new Date(t).toISOString(), N=8;
  const names=["Tereza","Jakub","Adéla","Martin","Klára","Ondřej","Lucie","Tomáš","Veronika","Petr","Eliška","David","Barbora","Honza","Markéta","Filip","Anna","Vojta","Kristýna","Marek","Nikola","Šimon","Zuzana","Lukáš"];
  const hex=i=>{ let s=""; for(let k=0;k<32;k++) s+=((i*7+k*13+(i*k)%5)%16).toString(16); return s; };
  const cards=names.map((n,i)=>{
    const total=i%3===2?1:2+((i*5+3)%15), red=Math.max(0,Math.floor(total/N)-(i%6===0?1:0)), stamps=total-red*N, tok=hex(i+1);
    return {id:"d"+i,token:tok,code:tok.slice(0,8).toUpperCase(),name:n,email:i%3===0?slugify(n)+"@priklad.cz":null,stamps,total_stamps:total,rewards_redeemed:red,reward_ready:stamps>=N,
      created_at:iso(now-(3+i*5)*day),last_stamp_at:iso(now-((i*3)%19)*day-36e5*(1+i%7))};
  }).sort((a,b)=>b.total_stamps-a.total_stamps);
  const pattern=[3,5,2,6,7,9,2,4,5,3,6,8,10,4];
  const daily=pattern.map((s,i)=>({day:iso(now-(13-i)*day).slice(0,10),stamps:s}));
  const kinds=["stamp","stamp","review_click","stamp","redeem","stamp","join","stamp"];
  const recent=kinds.map((k,i)=>({kind:k,name:cards[(i*5+2)%cards.length].name,at:iso(now-(i*47+12)*6e4)}));
  const business={name:"Kavárna Ukázka",slug:"ukazka",accent:"#b45309",category:"kavarna",reward_text:"Káva zdarma",stamps_needed:N,google_review_url:"https://g.page/r/ukazka/review",has_staff_code:true,owner_email:"majitel@priklad.cz",weekly_summary:true,active:true};
  const billing={id:"demo",status:"active",plan:"year",active:true,in_trial:false,comp:false,paid_until:iso(now+212*day),cancel_at_period_end:false,billing_email:null};
  const stats={business,billing,customers:cards.length,returning:cards.filter(c=>c.total_stamps>=2).length,new_30d:cards.filter(c=>now-new Date(c.created_at)<30*day).length,
    stamps_30d:131,redeemed_total:cards.reduce((a,c)=>a+c.rewards_redeemed,0),review_clicks_30d:17,daily,recent};
  return demo.data={cards,stats};
}
async function demoRpc(fn,a){
  const D=demoData();
  if(fn==="owner_stats") return D.stats;
  if(fn==="owner_customers"){ const q=(a.p_query||"").toLowerCase(); return D.cards.filter(c=>!q||c.name.toLowerCase().includes(q)||(c.email||"").includes(q)||c.code.toLowerCase().includes(q)); }
  if(fn==="export_customers") return D.cards;
  if(fn==="owner_customer"){ const c=D.cards.find(x=>x.id===a.p_card); if(!c) throw new Error("no_card");
    const h=[]; if(c.last_stamp_at) h.push({kind:"stamp",at:c.last_stamp_at}); if(c.rewards_redeemed) h.push({kind:"redeem",at:new Date(new Date(c.last_stamp_at)-6*864e5).toISOString()});
    if(c.total_stamps>1) h.push({kind:"stamp",at:new Date(new Date(c.last_stamp_at)-9*864e5).toISOString()}); h.push({kind:"join",at:c.created_at});
    return Object.assign({history:h.filter(x=>new Date(x.at)>=new Date(c.created_at)||x.kind==="join")},c); }
  throw new Error("demo_mode");
}
function barChart(d){
  const max=Math.max(1,...d.map(x=>x.stamps)), W=700, H=180, bw=W/Math.max(1,d.length);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Razítka po dnech">${d.map((x,i)=>{ const h=Math.round((x.stamps/max)*(H-44)); const dd=new Date(x.day+"T12:00:00"); return `<g><rect x="${i*bw+7}" y="${H-24-h}" width="${bw-14}" height="${Math.max(h,2)}" rx="5" fill="${x.stamps?"var(--brand)":"rgba(22,20,15,.12)"}"/><text x="${i*bw+bw/2}" y="${H-6}" text-anchor="middle" font-size="12" fill="#655f55">${dd.getDate()}.</text>${x.stamps?`<text x="${i*bw+bw/2}" y="${H-30-h}" text-anchor="middle" font-size="13" font-weight="600" fill="#16140f">${x.stamps}</text>`:""}</g>`; }).join("")}</svg>`;
}
const IC={
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 14.4c1.6.7 2.6 2.3 3 4.6"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  chart:'<path d="M4 20V4M4 20h16"/><rect x="7.5" y="11" width="3" height="6" rx="1"/><rect x="13" y="7" width="3" height="10" rx="1"/>',
  qr:'<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18.5v2"/>',
  star:'<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/>'
};
const ic=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ================= LANDING ================= */
function viewLanding(){
  const D=demoData().stats;
  const li=(t,i)=>`<li>${ic(i)}<span>${t}</span></li>`;
  app.innerHTML=`
  <div class="wrap"><section class="hero">
    <div>
      <div class="eyebrow">Pro kavárny, bistra, restaurace a salony</div>
      <h1 style="margin-top:16px">Zákazníci,<br>kteří se <em>vracejí.</em></h1>
      <p class="lede">Věrnostní karta přímo v mobilu a víc recenzí na Googlu. QR kód na pultu, zákazník nic nestahuje a obsluha dá razítko obyčejným fotoaparátem v telefonu.</p>
      <div class="row-btns"><a class="btn light" href="#/registrace">Vyzkoušet 14 dní zdarma</a><a class="btn onink" href="#/k/ukazka">Ukázka karty</a></div>
      <p class="fine">Bez platební karty. Po zkušební době ${kc(PRICE.month)} měsíčně.</p>
      <ul class="trust">${li("Bez stahování aplikace","check")}${li("Stačí telefon obsluhy","check")}${li("Bez reklamních cookies","check")}</ul>
    </div>
    <div class="phone" aria-hidden="true"><div class="screen" id="demoScreen"></div></div>
  </section></div>

  <section class="section" id="jak"><div class="wrap">
    <div class="shead"><div class="eyebrow">Jak to funguje</div><h2>Tři kroky u pultu. Žádné zaškolování.</h2></div>
    <div class="steps">
      <div class="step"><div class="n">01</div><h3>Zákazník naskenuje QR u pultu</h3><p>V mobilu se mu otevře karta podniku. Bez aplikace, bez hesla, za pár vteřin. Karta mu zůstane natrvalo.</p></div>
      <div class="step"><div class="n">02</div><h3>Obsluha ťukne razítko</h3><p>Naskenuje QR na kartě zákazníka obyčejným fotoaparátem svého telefonu a přidá razítko. Zaměstnanců může být kolik chcete.</p></div>
      <div class="step"><div class="n">03</div><h3>Poděkujeme a poprosíme o recenzi</h3><p>Po razítku dostane každý zákazník stejné poděkování s odkazem na hodnocení na Googlu.</p></div>
    </div>
  </div></section>

  <section class="section alt"><div class="wrap split">
    <div class="shead" style="margin:0">
      <div class="eyebrow">Přehled podniku</div>
      <h2>Konečně víte, kdo se k vám vrací.</h2>
      <p>Kolik lidí má kartu, kolik z nich přišlo znovu, kolik odměn jste vydali a kolik zákazníků otevřelo recenzi. V pondělí vám přijde krátký souhrn týdne e-mailem.</p>
      <div class="row-btns"><a class="btn primary" href="#/demo">Prohlédnout ukázku přehledu</a></div>
    </div>
    <div class="bframe" aria-hidden="true">
      <div class="bar"><i></i><i></i><i></i><span>Kavárna Ukázka · ukázková data</span></div>
      <div class="in">
        <div class="tiles"><div class="tile"><b>${D.customers}</b><span>zákazníků s kartou</span></div><div class="tile"><b>${D.returning}</b><span>se vrátilo</span></div><div class="tile"><b>${D.review_clicks_30d}</b><span>otevřelo recenzi</span></div></div>
        <div><b class="small">Razítka za posledních 14 dní</b><div style="margin-top:10px">${barChart(D.daily)}</div></div>
      </div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="shead"><div class="eyebrow">Co dostanete</div><h2>Všechno v jedné ceně, bez příplatků.</h2></div>
    <div class="feats">
      <div class="feat">${ic("card")}<h3>Karta ve vašich barvách</h3><p>Vlastní název, barva razítka i odměna, třeba desátá káva zdarma. Změníte kdykoli v nastavení.</p></div>
      <div class="feat">${ic("users")}<h3>Neomezeně zaměstnanců</h3><p>Každý se přihlásí kódem obsluhy na svém telefonu. Kód umí jen razítka a odměny, do plateb nepustí.</p></div>
      <div class="feat">${ic("list")}<h3>Přehled každého zákazníka</h3><p>Kolik má návštěv, razítek a vydaných odměn. Seznam stáhnete do Excelu.</p></div>
      <div class="feat">${ic("chart")}<h3>Statistiky a týdenní souhrn</h3><p>Razítka po dnech, noví a vracející se zákazníci. Souhrn týdne chodí e-mailem.</p></div>
      <div class="feat">${ic("qr")}<h3>Plakátek s QR kódem</h3><p>Hotový k vytištění s vaším názvem a odměnou. Stačí položit na pult nebo ke kase.</p></div>
      <div class="feat">${ic("star")}<h3>Víc recenzí na Googlu</h3><p>Po každé návštěvě zákazníka poprosíme o hodnocení a vy vidíte, kolik lidí odkaz otevřelo.</p></div>
    </div>
    <div class="rules" style="margin-top:22px">
      <div class="eyebrow" style="color:var(--cream2)">Fér podle pravidel Googlu</div>
      <p>Razítko je za návštěvu, nikdy za recenzi. O hodnocení prosíme každého stejně, ne jen spokojené zákazníky. Tak vaše recenze na Googlu zůstanou.</p>
    </div>
  </div></section>

  <section class="section alt"><div class="wrap">
    <div class="shead"><div class="eyebrow">Proč ne papír</div><h2>Papírová kartička končí v šuplíku. Mobil má zákazník u sebe.</h2></div>
    <div class="versus">
      <div><h3>Papírová kartička</h3><ul>
        ${li("Zákazník ji zapomene doma nebo ztratí","x")}${li("Nevíte, kdo k vám chodí a jak často","x")}${li("Razítko si může doplnit kdokoli","x")}${li("Kartičky tisknete pořád dokola","x")}${li("Žádné recenze navíc","x")}
      </ul></div>
      <div class="win"><h3>Štempl</h3><ul>
        ${li("Karta je v mobilu, který má zákazník vždy u sebe","check")}${li("Vidíte návštěvy, vracející se zákazníky i vydané odměny","check")}${li("Razítko přidá jen přihlášená obsluha","check")}${li("Jeden plakátek s QR kódem a žádný další tisk","check")}${li("Po každé návštěvě prosba o recenzi na Googlu","check")}
      </ul></div>
    </div>
  </div></section>

  <section class="section" id="cena"><div class="wrap">
    <div class="shead"><div class="eyebrow">Cena</div><h2>Jedna cena za podnik. Prvních 14 dní zdarma.</h2></div>
    <div class="plans">
      <div class="plan"><div class="eyebrow">Měsíčně</div><div class="big">${kc(PRICE.month)}</div><p class="muted">za podnik a měsíc, zrušíte kdykoli</p><a class="btn" href="#/registrace">Začít zdarma</a></div>
      <div class="plan hi"><div class="badge">2 měsíce zdarma</div><div class="eyebrow">Ročně</div><div class="big">${kc(PRICE.year)}</div><p class="muted">za podnik a rok (vychází ${kc(Math.round(PRICE.year/12))} měsíčně)</p><a class="btn light" href="#/registrace">Začít zdarma</a></div>
    </div>
    <p class="muted small" style="margin-top:16px;max-width:760px">V ceně je neomezený počet zákazníků, zaměstnanců i razítek. Zkušební doba je bez závazku a bez platební karty. Platí se kartou přes Stripe, faktury najdete v přehledu. ${esc(PROVIDER.vatNote)}</p>
  </div></section>

  <section class="section alt"><div class="wrap">
    <div class="shead"><div class="eyebrow">Časté otázky</div><h2>Na co se majitelé ptají</h2></div>
    <div class="faq">
      <details><summary>Musí si zákazník stahovat aplikaci?</summary><p>Ne. Naskenuje QR kód fotoaparátem a karta se mu otevře v prohlížeči. Bez registrace a bez hesla, jméno a e-mail jsou nepovinné.</p></details>
      <details><summary>Co potřebuje obsluha?</summary><p>Jen vlastní telefon. Přihlásí se kódem obsluhy, naskenuje QR na kartě zákazníka a ťukne na razítko. Žádná čtečka ani propojení s pokladnou.</p></details>
      <details><summary>Co když zákazník změní telefon?</summary><p>Razítka jsou uložená u nás, ne v telefonu. Kdo si ke kartě uložil e-mail, obnoví ji odkazem. Ostatním kartu najde obsluha podle jména nebo kódu.</p></details>
      <details><summary>Nevadí Googlu, že prosíte o recenze?</summary><p>Razítko je vždy za návštěvu, ne za recenzi, a o hodnocení prosíme všechny zákazníky stejně. Odměna za recenzi by pravidla porušovala, proto ji Štempl neumí.</p></details>
      <details><summary>Co se stane po 14 dnech?</summary><p>Nic se neúčtuje samo. Když nezaplatíte, jen se pozastaví přidávání razítek a nových karet. Data zůstanou uložená a po zaplacení pokračujete tam, kde jste skončili.</p></details>
      <details><summary>Můžu předplatné kdykoli zrušit?</summary><p>Ano, v přehledu podniku na pár kliknutí. Služba pak běží do konce zaplaceného období a dál se nic neúčtuje.</p></details>
      <details><summary>Jak je to s osobními údaji zákazníků?</summary><p>Ukládáme jen to nejnutnější: kód karty, razítka a časy návštěv. E-mail jen se souhlasem zákazníka, kartu si může kdykoli sám smazat. Zpracovatelská smlouva je součástí <a href="#/podminky">obchodních podmínek</a>.</p></details>
    </div>
  </div></section>

  <section class="section" id="poptavka"><div class="wrap"><div class="band">
    <div class="stack">
      <h2>Začněte ještě dnes, nebo to nastavíme s vámi.</h2>
      <p>Registrace zabere pár minut a plakátek s QR kódem si hned stáhnete. Jste z Brna a okolí? Přijdeme, kartu nastavíme a obsluze ukážeme, jak to funguje.</p>
      <div class="row-btns"><a class="btn light" href="#/registrace">Vyzkoušet 14 dní zdarma</a><a class="btn onink" href="#/demo">Ukázka přehledu</a></div>
    </div>
    <form class="form panel" id="leadForm" novalidate>
      <b>Chci pomoct s nastavením</b>
      <label class="field">Jméno<input class="input" id="lName" autocomplete="name" required></label>
      <label class="field">Podnik<input class="input" id="lBiz" placeholder="např. Kavárna U Mostu" required></label>
      <label class="field">Telefon nebo e-mail<input class="input" id="lContact" autocomplete="email" required></label>
      <label class="field">Zpráva <small>nepovinné</small><textarea class="input" id="lMsg" rows="3"></textarea></label>
      <button class="btn primary" type="submit">Odeslat poptávku</button>
      <div class="msg" id="lOut" role="status"></div>
    </form>
  </div></div></section>${foot()}`;
  const scr=$("#demoScreen"); let s=4; const N=8;
  const draw=(isNew)=>{ scr.innerHTML=`<div class="lcard" style="--accent:#b45309"><div class="eyebrow">Věrnostní karta</div><div class="biz">Kavárna Ukázka</div><div class="rw"><span class="small muted">${Math.min(s,N)} z ${N}</span><span class="small"><b>Káva zdarma</b></span></div>${stampsGrid(s,N,isNew?s-1:-1)}</div><div class="small muted" style="text-align:center">Ukažte kartu obsluze</div>`; };
  draw(false);
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches){ const iv=setInterval(()=>{ s=s>=N?3:s+1; draw(true); },1800); onLeave(()=>clearInterval(iv)); }
  $("#leadForm").addEventListener("submit",async e=>{
    e.preventDefault(); const out=$("#lOut"); out.className="msg";
    const v={p_name:$("#lName").value.trim(),p_business:$("#lBiz").value.trim(),p_contact:$("#lContact").value.trim(),p_message:$("#lMsg").value.trim()||null};
    if(v.p_name.length<2||v.p_business.length<2||v.p_contact.length<5){ out.className="msg err"; out.textContent="Vyplňte jméno, podnik a kontakt."; return; }
    try{ await rpc("submit_lead",v); out.className="msg ok"; out.textContent="Děkujeme, ozveme se do druhého dne."; e.target.reset(); }
    catch(err){ out.className="msg err"; out.textContent=say(err); }
  });
}

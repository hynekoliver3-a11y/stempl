#!/usr/bin/env python3
"""Generates the industry pages (kavarny.html, kadernictvi.html, barbershopy.html, restaurace.html),
sitemap.xml and robots.txt. Run again after changing SITE (the public address of the web) or the texts:
    python3 tools/build-obory.py
"""
import html, pathlib

SITE = "https://hynekoliver3-a11y.github.io/Stempl-x/"   # change after buying the domain, then run again
ROOT = pathlib.Path(__file__).resolve().parent.parent
import re
NB = lambda t: re.sub(r"(?<![\w])([vszkouaiVSZKOUAI]) ", "\\1\u00a0", t)   # no single-letter word at the end of a line
E = lambda t: html.escape(NB(t))

PAGES = [
  dict(file="kavarny.html", short="Kavárny", title="Věrnostní karta pro kavárny v mobilu – Štempl",
       desc="Desátá káva zdarma bez papírových kartiček. Zákazník naskenuje QR u pultu, obsluha dá razítko telefonem a vy vidíte, kdo se vrací. 30 dní zdarma.",
       h1="Desátá káva zdarma.<br>Bez kartičky, která skončí v pračce.",
       lede="Štempl je věrnostní karta v mobilu pro kavárny. Host naskenuje QR u pultu, obsluha mu dá razítko obyčejným telefonem a vy konečně víte, kolik lidí se k vám vrací.",
       reward="Každá 10. káva zdarma", small="Po 5 razítkách malé espresso",
       points=[("Rychlé u pultu", "Razítko trvá pár vteřin, stejně jako orazítkovat papír. S tabletem v režimu Pult na nic nesahá ani obsluha."),
               ("Víc recenzí na Googlu", "Po každém razítku host dostane poděkování a odkaz na hodnocení. Stejně každý, bez podmínek, podle pravidel Googlu."),
               ("Kdo dlouho nepřišel", "V přehledu vidíte hosty, kteří přestali chodit, a se souhlasem jim pošlete připomínku.")],
       faq=[("Co když host kartu ztratí?", "Razítka jsou uložená u nás, ne v telefonu. S e-mailem si kartu obnoví sám, bez něj ji obsluha najde podle jména."),
            ("Máme papírové kartičky, co s nimi?", "Rozdělané kartičky obsluha převede do mobilu jedním tlačítkem, nikdo o razítka nepřijde.")]),
  dict(file="kadernictvi.html", short="Kadeřnictví", title="Věrnostní program pro kadeřnictví a salony – Štempl",
       desc="Věrnostní karta v mobilu pro kadeřnictví a kosmetické salony. Připomínka, když klientka dlouho nepřišla, dárek k narozeninám a víc recenzí na Googlu.",
       h1="Klientky, které se vracejí.<br>A řeknou to i na Googlu.",
       lede="Štempl je věrnostní karta v mobilu pro kadeřnictví a salony. Po každé návštěvě razítko, po několika návštěvách odměna, a vy vidíte, kdo k vám chodí pravidelně.",
       reward="Po 6 návštěvách péče o vlasy zdarma", small="Dárek k narozeninám",
       points=[("Připomínka po 30 dnech", "Klientce, která dlouho nepřišla, pošleme se souhlasem krátkou připomínku. Ani vy, ani recepce na to nemusí myslet."),
               ("Dárek k narozeninám", "Klientka si zadá měsíc narozenin a v tom měsíci ji čeká dárek, který si nastavíte."),
               ("Recenze ve správnou chvíli", "Hned po návštěvě, kdy je spokojenost největší, dostane odkaz na hodnocení na Googlu.")],
       faq=[("Musí si klientka něco instalovat?", "Ne. Naskenuje QR kód a karta se jí otevře v prohlížeči. Bez registrace a bez hesla."),
            ("Může dávat razítka i kolegyně?", "Ano, zaměstnanců může být kolik chcete. Každá se přihlásí na svém telefonu a vidíte, kdo dal které razítko.")]),
  dict(file="barbershopy.html", short="Barbershopy", title="Věrnostní karta pro barbershopy – Štempl",
       desc="Každý 8. střih zdarma a odměna za přivedeného kamaráda. Věrnostní karta v mobilu pro barbershopy, bez aplikace a bez papíru. 30 dní zdarma.",
       h1="Každý osmý střih zdarma.<br>A kamarád za doporučení.",
       lede="Štempl je věrnostní karta v mobilu pro barbershopy. Zákazník naskenuje QR, barber mu dá razítko telefonem a za přivedeného kamaráda dostanou oba razítko navíc.",
       reward="Každý 8. střih zdarma", small="Doporuč kamaráda: razítko navíc pro oba",
       points=[("Doporuč kamaráda", "Zákazník pošle odkaz kamarádovi. Když kamarád přijde poprvé, oba dostanou razítko navíc."),
               ("Bez papíru a bez aplikace", "Karta je v mobilu, který má zákazník vždy u sebe. Nic se nestahuje."),
               ("Víc recenzí na Googlu", "Po každém střihu poděkování a odkaz na hodnocení. Pro barbershop jsou recenze to hlavní, podle čeho si lidé vybírají.")],
       faq=[("Co když razítko omylem přidám dvakrát?", "Poslední razítko jde do 10 minut vrátit. Majitel může počet razítek kdykoli opravit, se záznamem v historii."),
            ("Kolik to stojí?", "490 Kč měsíčně za podnik, neomezeně zákazníků i barberů. Prvních 30 dní zdarma a bez platební karty.")]),
  dict(file="restaurace.html", short="Bistra a restaurace", title="Věrnostní karta pro bistra a restaurace – Štempl",
       desc="Desáté polední menu zdarma, víc stálých hostů a recenzí na Googlu. Věrnostní karta v mobilu pro bistra a restaurace, bez aplikace. 30 dní zdarma.",
       h1="Desáté polední menu zdarma.<br>Hosté, kteří se vracejí.",
       lede="Štempl je věrnostní karta v mobilu pro bistra a restaurace. Host naskenuje QR na stole nebo u pokladny, obsluha dá razítko telefonem a vy vidíte, kdo se k vám vrací.",
       reward="Každé 10. menu zdarma", small="Po 5 razítkách dezert",
       points=[("QR na stůl i k pokladně", "Stojánek A6 na stůl vytisknete přímo z přehledu. Host si kartu založí, zatímco čeká na jídlo."),
               ("Malá odměna v půlce", "Dezert po pěti návštěvách drží hosty u karty, dokud nedojdou k velké odměně."),
               ("Zprávy stálým hostům", "Se souhlasem pošlete nejvýš dvakrát měsíčně krátkou zprávu, třeba o novém menu.")],
       faq=[("Funguje to i bez signálu?", "Razítko se uloží v telefonu obsluhy a odešle se samo, jakmile bude připojení."),
            ("Potřebujeme tablet?", "Ne, stačí telefon obsluhy. Tablet u pokladny můžete použít v režimu Pult, kdy razítka přidává sám.")]),
]

CSS = """
:root{--paper:#f5f2ea;--card:#fffefb;--ink:#16140f;--muted:#655f55;--line:rgba(22,20,15,.12);--brand:#d9480f;--accent:#b45309;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#14120e;--card:#1e1b16;--ink:#f3efe6;--muted:#a9a296;--line:rgba(243,239,230,.14);color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 1rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
a{color:inherit}h1,h2,h3{font-family:-apple-system,"Segoe UI",Inter,Roboto,Arial,sans-serif;letter-spacing:-.03em;line-height:1.08;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding:0 18px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.logo{display:flex;gap:8px;align-items:center;font-weight:800;font-size:1.15rem;text-decoration:none}
.logo svg{width:26px;height:26px;color:var(--brand)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;font-weight:600;text-decoration:none;border:1.5px solid var(--line);background:var(--card)}
.btn.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.row{display:flex;gap:10px;flex-wrap:wrap}
@media (max-width:480px){.hide-s{display:none}}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:36px;align-items:center;padding:clamp(36px,7vw,80px) 0}
@media (max-width:820px){.hero{grid-template-columns:1fr}}
.eyebrow{font-size:.74rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
h1{font-size:clamp(2.2rem,5.4vw,3.8rem);margin-top:12px}
.lede{font-size:1.12rem;color:var(--muted);margin:18px 0 26px;max-width:36rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;box-shadow:0 30px 60px -36px rgba(0,0,0,.35)}
.card .biz{font-weight:800;font-size:1.4rem;margin-top:4px}
.stamps{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}
.stamps i{aspect-ratio:1;border-radius:50%;border:2px dashed var(--line)}
.stamps i.on{border:4px solid var(--accent);background:radial-gradient(circle,transparent 55%,transparent 56%)}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media (max-width:820px){.grid3{grid-template-columns:1fr}}
.feat{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px}
.feat h3{font-size:1.15rem;margin-bottom:8px}.feat p{color:var(--muted);margin:0}
section{padding:clamp(36px,6vw,64px) 0}
h2{font-size:clamp(1.7rem,3.6vw,2.5rem);margin-bottom:22px}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:10px}
summary{font-weight:600;cursor:pointer}details p{color:var(--muted);margin:10px 0 0}
.band{background:var(--ink);color:var(--paper);border-radius:26px;padding:clamp(26px,5vw,48px);display:grid;gap:14px}
.band .btn{background:var(--paper);color:var(--ink);border-color:var(--paper)}
.band p{opacity:.8;margin:0}
.others{display:flex;gap:8px;flex-wrap:wrap}.others a{padding:8px 14px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:.92rem}
footer{border-top:1px solid var(--line);padding:24px 0;color:var(--muted);font-size:.88rem}
"""
MARK = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="10"/><path d="M32 52l12 12 24-26" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>'

def page(p):
    others = "".join(f'<a href="{o["file"]}">{E(o["short"])}</a>' for o in PAGES if o["file"] != p["file"])
    feats = "".join(f'<div class="feat"><h3>{E(t)}</h3><p>{E(d)}</p></div>' for t, d in p["points"])
    faq = "".join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in p["faq"])
    url = SITE + p["file"]
    return f"""<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(p["title"])}</title>
<meta name="description" content="{E(p["desc"])}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="cs_CZ">
<meta property="og:site_name" content="Štempl">
<meta property="og:title" content="{E(p["title"])}">
<meta property="og:description" content="{E(p["desc"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f2ea">
<link rel="icon" href="icon-192.png" type="image/png">
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><a class="logo" href="./">{MARK}Štempl</a><div class="row"><a class="btn hide-s" href="./#/demo">Ukázka přehledu</a><a class="btn primary" href="./#/registrace">Vyzkoušet zdarma</a></div></header>
<main>
<section class="hero">
  <div><div class="eyebrow">Štempl pro {E(p["short"].lower())}</div><h1>{NB(p["h1"])}</h1><p class="lede">{E(p["lede"])}</p>
    <div class="row"><a class="btn primary" href="./#/registrace">Vyzkoušet 30 dní zdarma</a><a class="btn" href="./#/k/ukazka">Ukázka karty</a></div>
    <p class="eyebrow" style="margin-top:14px;letter-spacing:.04em;text-transform:none">Bez platební karty. Potom 490 Kč měsíčně, zrušíte kdykoli.</p></div>
  <div class="card" aria-label="Ukázka karty"><div class="eyebrow">Věrnostní karta</div><div class="biz">Váš podnik</div>
    <div class="stamps">{'<i class="on"></i>'*6}{'<i></i>'*4}</div>
    <p style="margin:0"><b>{E(p["reward"])}</b></p><p style="margin:6px 0 0;color:var(--muted)">{E(p["small"])}</p></div>
</section>
<section><h2>Jak to funguje</h2><div class="grid3">
  <div class="feat"><h3>1. QR kód u pultu</h3><p>Zákazník ho naskenuje fotoaparátem a karta se mu otevře v mobilu. Nic nestahuje.</p></div>
  <div class="feat"><h3>2. Razítko telefonem</h3><p>Obsluha naskenuje QR na kartě zákazníka a přidá razítko. Zaměstnanců může být kolik chcete.</p></div>
  <div class="feat"><h3>3. Poděkování a recenze</h3><p>Po razítku zákazník dostane poděkování a odkaz na hodnocení na Googlu.</p></div>
</div></section>
<section><h2>Proč se to hodí právě vám</h2><div class="grid3">{feats}</div></section>
<section><h2>Časté otázky</h2>{faq}
  <details><summary>Vyplatí se mi to?</summary><p>Spočítejte si to v <a href="./#/kalkulacka">kalkulačce návratnosti</a> na hlavní stránce.</p></details></section>
<section><div class="band"><h2 style="margin:0">Vyzkoušejte Štempl 30 dní zdarma</h2><p>Registrace zabere pár minut, plakátek s QR kódem si hned vytisknete. Jste z Brna? Přijdu a nastavím vám to osobně.</p>
  <div class="row"><a class="btn" href="./#/registrace">Začít zdarma</a><a class="btn" href="./#/" style="background:transparent;color:inherit">Více o Štemplu</a></div></div></section>
<section><div class="eyebrow" style="margin-bottom:10px">Štempl pro další obory</div><div class="others">{others}</div></section>
</main>
<footer>Štempl · Brno · <a href="./#/podminky">Obchodní podmínky</a> · <a href="./#/soukromi">Ochrana osobních údajů</a> · <a href="cookies.html">Cookies</a></footer>
</div>
</body>
</html>
"""

for p in PAGES:
    (ROOT / p["file"]).write_text(page(p), encoding="utf-8")
urls = [SITE] + [SITE + p["file"] for p in PAGES]
(ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
(ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /supabase/\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
print("ok:", ", ".join(p["file"] for p in PAGES), "+ sitemap.xml, robots.txt")

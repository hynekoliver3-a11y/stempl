# Štempl

Digitální věrnostní karta v mobilu pro kavárny, bistra a salony. Zákazník naskenuje QR u pultu, obsluha dává razítka telefonem, majitel vidí přehled a zákazníci dostávají prosbu o recenzi na Googlu.

## Z čeho se skládá

| Část | Kde | Poznámka |
|---|---|---|
| Web (statický, bez build kroku) | kořen repozitáře | `index.html` + `app-*.js`, `qr.js`, `jsqr.js` (skener pro iPhone), `sw.js` |
| Databáze a funkce | Supabase, projekt `stempl` (EU, Frankfurt) | tabulky jsou zamčené (RLS bez politik), vše jde přes funkce |
| Serverová funkce `stempl-api` | `supabase/functions/stempl-api/index.ts` | registrace, e-maily, poptávka z webu, denní úloha |
| Migrace | `supabase/migrations/` | co bylo v databázi změněno a kdy |

Moduly aplikace: `app-core.js` (nastavení, router, společné funkce), `app-landing.js` (úvodní stránka, ukázka), `app-customer.js` (karta zákazníka), `app-staff.js` (obsluha, skener), `app-owner.js` (přehled majitele, plakátek), `app-admin.js` (registrace, podmínky, Správa).

## Nasazení

Web je připravený pro Netlify (`netlify.toml`: bezpečnostní hlavičky, bez mezipaměti pro skripty). Stačí repozitář propojit s Netlify, publikuje se kořen, build příkaz žádný.

Po změně adresy webu:

1. V Supabase → Edge Functions → Secrets nastavit `APP_URL` na novou adresu (odkazy v e-mailech).
2. Ve Stripe změnit návratovou adresu platebních odkazů na `…/#/zaplaceno`.
3. Vytisknout nové plakátky: QR kódy i uložené karty jsou vázané na adresu webu.

Při každém nasazení zvyšte `CACHE` v `sw.js` (teď `stempl-v7`), jinak telefony s nainstalovanou aplikací uvidí starou verzi déle.

## Co doplnit před prodejem

- `PROVIDER` v `app-core.js`: `ico` a `phone` (objeví se v patičce, podmínkách a v sekci Kdo za tím stojí).
- `cookies.html`: kontakt provozovatele.
- Spustit dva příkazy na konci `supabase/migrations/20261116_audit_faze_a.sql` (úklid a odebrání starých funkcí).

## Obnova po výpadku

1. **Web nejde:** zkontrolovat stav nasazení v Netlify, případně vrátit předchozí nasazení (Deploys → Publish deploy).
2. **Karty se nenačítají / nejdou razítka:** Supabase → projekt `stempl` → zkontrolovat, že projekt běží (zdarma plán se po nečinnosti uspí) a logy funkce `stempl-api`.
3. **Nechodí e-maily:** logy `stempl-api`; ověřit secrets `SMTP_USER`, `SMTP_PASS`. Registrace a obnova karty na e-mailu závisí.
4. **Chyby u uživatelů:** Správa (`#/sprava`) → Chyby v aplikaci u uživatelů.
5. **Ztráta dat:** na placeném plánu Supabase obnovit denní zálohu; na plánu zdarma existuje jen ruční export (Správa a Přehled → Zákazníci → CSV), proto ho dělejte každý týden.

## Bezpečnost v kostce

- Přístupové kódy jsou uložené jen jako bcrypt otisk.
- Po 10 chybných přihlášeních za 15 minut se přístup z dané IP adresy k danému podniku zamkne.
- Každá karta má denní limit razítek (nastavuje majitel, výchozí 2).
- Nejvýš 15 nových karet za 10 minut z jedné IP adresy u jednoho podniku.
- Odkaz na recenzi smí vést jen na domény Googlu.
- Denní rozesílku smí spustit jen plánovač v databázi (tajný klíč).
- Každá nová veřejná funkce v databázi musí začínat ověřením kódu, jinak je dostupná komukoli.

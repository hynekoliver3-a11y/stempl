// Štempl – public actions that send e-mail:
//   register      → stores a pending registration and e-mails a confirmation link
//   confirm       → creates the business (30-day trial), returns + e-mails the access codes
//   recover_card  → e-mails a customer links to their cards (only e-mails saved with consent)
//   forgot_code   → e-mails the owner a one-time link to set a new owner code
//   reset_code    → returns + e-mails the new owner code
//   lead          → stores a request from the landing page and e-mails it to the operator
//   daily         → reminders and weekly summaries; only the database scheduler may call it (x-cron-key)
//   lock_alert    → tells the owner that someone keeps entering wrong codes (called by the database, secret key)
// Mail goes out over SMTP (default: Gmail with an app password).

import nodemailer from "npm:nodemailer@6.9.16";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://hynekoliver3-a11y.github.io/Stempl-x/").replace(/#.*$/, "");
const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465");
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = (Deno.env.get("SMTP_PASS") ?? "").replace(/\s+/g, "");
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? (SMTP_USER ? `Štempl <${SMTP_USER}>` : "");
const NOTIFY = Deno.env.get("NOTIFY_EMAIL") ?? SMTP_USER;
const TERMS_VERSION = "2026-11-16";
const PRICE_TEXT = "490 Kč měsíčně nebo 4 900 Kč ročně";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class AppError extends Error {}

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  if (!r.ok) {
    const code = String(data?.message ?? "").split(" ")[0];
    if (/^[a-z_]+$/.test(code)) throw new AppError(code);
    throw new Error(`${fn} ${r.status}: ${txt}`);
  }
  return data;
}

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  if (!SMTP_USER || !SMTP_PASS) throw new AppError("mail_not_configured");
  transport ??= nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f4efe6;font-family:Helvetica,Arial,sans-serif;color:#1c1a17">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
<div style="font-weight:800;font-size:20px;color:#d9480f;margin-bottom:18px">Štempl</div>
<div style="background:#fffdf8;border:1px solid #e6dfd3;border-radius:18px;padding:24px">
<h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>${bodyHtml}</div>
<p style="font-size:12px;color:#6e675d;margin-top:16px">Tento e-mail vám poslal Štempl, digitální věrnostní karta. Pokud jste o nic nežádali, e-mail ignorujte.</p>
</div></body></html>`;
}
const btn = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#1c1a17;color:#f4efe6;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px">${esc(label)}</a></p>`;
const code = (label: string, v: string) =>
  `<p style="margin:10px 0 4px;font-size:14px;color:#6e675d">${esc(label)}</p><p style="margin:0;font-family:Menlo,Consolas,monospace;font-size:24px;letter-spacing:4px;font-weight:700">${esc(v)}</p>`;

async function send(to: string, subject: string, title: string, html: string, text: string) {
  await mailer().sendMail({ from: MAIL_FROM, to, subject, html: layout(title, html), text });
}

/* marketing e-mail on behalf of a business: its name as sender, replies go to the owner, unsubscribe in every mail */
async function sendMarketing(m: { to: string; business: string; replyTo?: string; unsub: string; subject: string; title: string; html: string; text: string }) {
  const unsubUrl = `${APP_URL}#/odhlasit/${m.unsub}`;
  const from = SMTP_USER ? `${m.business.replace(/["<>]/g, "")} přes Štempl <${SMTP_USER}>` : MAIL_FROM;
  const foot = `<p style="font-size:12px;color:#6e675d;margin-top:18px">Tento e-mail dostáváte, protože jste u ${esc(m.business)} souhlasili s novinkami a připomínkami k věrnostní kartě. <a href="${esc(unsubUrl)}">Odhlásit z novinek</a> (karta i razítka zůstanou).</p>`;
  await mailer().sendMail({
    from, to: m.to, subject: m.subject, replyTo: m.replyTo || undefined,
    headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    html: layout(m.title, m.html + foot), text: `${m.text}\n\nOdhlásit z novinek: ${unsubUrl}`,
  });
}

function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
}

async function accessMail(r: { email: string; name: string; slug: string; code: string; staff_code?: string; trial_ends_at?: string }, isReset = false) {
  const dash = `${APP_URL}#/prehled`, staff = `${APP_URL}#/obsluha`, card = `${APP_URL}#/k/${r.slug}`;
  const trial = r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" }) : "";
  const html = isReset
    ? `<p>Nový kód majitele pro <b>${esc(r.name)}</b>. Starý kód přestal platit.</p>${code("Adresa podniku", r.slug)}${code("Nový kód majitele", r.code)}${btn(dash, "Otevřít přehled")}`
    : `<p>Podnik <b>${esc(r.name)}</b> je založený. Zkušební verze zdarma${trial ? " do " + esc(trial) : " na 30 dní"}.</p>
       ${code("Adresa podniku", r.slug)}${code("Kód majitele (přehled, nastavení, platby) – nikomu nedávejte", r.code)}
       ${r.staff_code ? code("Kód obsluhy (jen razítka) – pro všechny zaměstnance", r.staff_code) : ""}
       ${btn(dash, "Otevřít přehled a stáhnout QR na pult")}
       <p style="font-size:14px;line-height:1.5"><b>Jak začít:</b><br>1. V přehledu stáhněte plakátek s QR kódem a dejte ho na pult.<br>
       2. Zaměstnanci si na svém telefonu otevřou <a href="${esc(staff)}">${esc(staff)}</a> a přihlásí se adresou a kódem obsluhy. Zaměstnanců může být kolik chcete.<br>
       3. Razítko dají tak, že QR kód na kartě zákazníka naskenují obyčejným fotoaparátem v telefonu.<br>
       Karta pro zákazníky: <a href="${esc(card)}">${esc(card)}</a></p>`;
  const text = isReset
    ? `Nový kód majitele pro ${r.name}: ${r.code} (adresa ${r.slug}). Přehled: ${dash}`
    : `Podnik ${r.name} je založený.\nAdresa: ${r.slug}\nKód majitele: ${r.code}\n${r.staff_code ? "Kód obsluhy: " + r.staff_code + "\n" : ""}Přehled: ${dash}\nObsluha: ${staff}\nKarta: ${card}`;
  await send(r.email, isReset ? `Nový kód majitele – ${r.name}` : `Vaše přístupy do Štemplu – ${r.name}`, isReset ? "Nový kód majitele" : "Vítejte ve Štemplu", html, text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "bad_json" }); }
  const ip = clientIp(req);

  try {
    switch (body?.action) {
      case "register": {
        if (body.website) return json(200, { ok: true }); // honeypot field filled → bot
        if (!body.accept_terms) throw new AppError("terms_required");
        mailer();
        const payload = {
          slug: String(body.slug ?? "").toLowerCase().trim(),
          name: String(body.name ?? "").trim().slice(0, 80),
          category: String(body.category ?? "kavarna").slice(0, 20),
          reward: String(body.reward ?? "").trim().slice(0, 80),
          needed: Number(body.needed ?? 10),
          accent: /^#[0-9a-f]{6}$/i.test(body.accent ?? "") ? body.accent : "#c2410c",
          phone: String(body.phone ?? "").trim().slice(0, 30),
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        };
        const r = await rpc("svc_register_pending", { p_email: body.email, p_payload: payload, p_ip: ip });
        const link = `${APP_URL}#/potvrdit/${r.token}`;
        try {
          await send(r.email, "Potvrďte registraci do Štemplu", "Potvrďte registraci",
            `<p>Děkujeme za registraci podniku <b>${esc(r.name)}</b>. Kliknutím níže e-mail potvrdíte a podnik se založí. Odkaz platí 72 hodin.</p>${btn(link, "Potvrdit registraci")}<p style="font-size:13px;color:#6e675d;word-break:break-all">${esc(link)}</p>`,
            `Potvrďte registraci podniku ${r.name}: ${link}`);
        } catch (e) {
          // the address could not be mailed: drop the pending row so the person can simply try again
          await rpc("svc_register_cancel", { p_token: r.token }).catch(() => {});
          console.error("register mail", e);
          throw new AppError("mail_failed");
        }
        return json(200, { ok: true });
      }

      case "confirm": {
        const r = await rpc("svc_confirm_registration", { p_token: String(body.token ?? "") });
        let mailed = true;
        try { await accessMail(r); } catch (e) { console.error("access mail", e); mailed = false; }
        if (NOTIFY) {
          send(NOTIFY, `Nová registrace: ${r.name}`, "Nová registrace", `<p><b>${esc(r.name)}</b> (${esc(r.slug)}) – ${esc(r.email)}</p>`, `Nová registrace: ${r.name} (${r.slug}) ${r.email}`)
            .catch((e) => console.error("notify", e));
        }
        return json(200, { ok: true, slug: r.slug, name: r.name, code: r.code, staff_code: r.staff_code, email: r.email, trial_ends_at: r.trial_ends_at, mailed });
      }

      case "recover_card": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError("bad_email");
        mailer();
        const cards: any[] = await rpc("svc_card_recovery", { p_email: email, p_slug: body.slug || null, p_ip: ip }) ?? [];
        if (cards.length) {
          const list = cards.map((c) => `<p style="margin:14px 0"><b>${esc(c.business)}</b> – ${c.stamps} z ${c.needed} razítek<br><a href="${esc(APP_URL + "#/c/" + c.token)}">Otevřít kartu</a></p>`).join("");
          await send(email, "Odkaz na vaši věrnostní kartu", "Vaše věrnostní karty",
            `<p>Tady jsou odkazy na vaše karty. Otevřete je v telefonu, karta se uloží i s razítky.</p>${list}`,
            cards.map((c) => `${c.business}: ${APP_URL}#/c/${c.token}`).join("\n"));
        }
        // same answer either way, so nobody can test which e-mails are registered
        return json(200, { ok: true });
      }

      case "forgot_code": {
        mailer();
        const r = await rpc("svc_owner_reset_request", { p_slug: String(body.slug ?? ""), p_ip: ip });
        if (r) {
          const link = `${APP_URL}#/novy-kod/${r.token}`;
          await send(r.email, `Nový kód majitele – ${r.name}`, "Zapomenutý kód",
            `<p>Někdo požádal o nový kód majitele pro <b>${esc(r.name)}</b>. Pokud jste to byli vy, klikněte níže. Odkaz platí 2 hodiny. Kód obsluhy se nemění.</p>${btn(link, "Nastavit nový kód")}`,
            `Nový kód majitele pro ${r.name}: ${link}`);
        }
        return json(200, { ok: true });
      }

      case "reset_code": {
        const r = await rpc("svc_owner_reset_confirm", { p_token: String(body.token ?? "") });
        try { await accessMail(r, true); } catch (e) { console.error("reset mail", e); }
        return json(200, { ok: true, slug: r.slug, name: r.name, code: r.code });
      }

      case "lead": {
        // Request from the landing page: saved first, then e-mailed to the operator so it is not missed.
        if (body.website) return json(200, { ok: true }); // honeypot
        const lead = {
          name: String(body.name ?? "").trim().slice(0, 80),
          business: String(body.business ?? "").trim().slice(0, 120),
          contact: String(body.contact ?? "").trim().slice(0, 120),
          message: String(body.message ?? "").trim().slice(0, 1000),
        };
        if (lead.name.length < 2 || lead.business.length < 2 || lead.contact.length < 5) throw new AppError("bad_lead");
        await rpc("submit_lead", { p_name: lead.name, p_business: lead.business, p_contact: lead.contact, p_message: lead.message || null });
        if (NOTIFY) {
          try {
            await send(NOTIFY, `Poptávka z webu: ${lead.business}`, "Nová poptávka z webu",
              `<p><b>${esc(lead.business)}</b><br>${esc(lead.name)}<br>${esc(lead.contact)}</p>${lead.message ? `<p style="white-space:pre-wrap">${esc(lead.message)}</p>` : ""}${btn(`${APP_URL}#/sprava`, "Otevřít Správu")}`,
              `Poptávka z webu: ${lead.business}\n${lead.name}\n${lead.contact}\n${lead.message}`);
          } catch (e) { console.error("lead mail", e); }
        }
        return json(200, { ok: true });
      }

      case "lock_alert": {
        // The database calls this when a login gets locked. svc_lock_alert checks the secret and sends at most one mail an hour.
        const r = await rpc("svc_lock_alert", { p_slug: String(body.slug ?? ""), p_key: String(body.key ?? "") });
        if (r?.email) {
          const staffUrl = `${APP_URL}#/prehled/set`;
          await send(r.email, `Štempl: opakované chybné přihlášení – ${r.name}`, "Někdo zkouší špatné kódy",
            `<p>K podniku <b>${esc(r.name)}</b> někdo za posledních 15 minut 10× zadal špatný kód. Přihlašování z jeho zařízení jsme na 15 minut zablokovali.</p>
             <p>Pokud to byl někdo z vás (třeba nový zaměstnanec s překlepem), nemusíte nic dělat. Pokud ne, vygenerujte v Nastavení nový kód obsluhy. Starý kód tím přestane platit.</p>${btn(staffUrl, "Otevřít Nastavení")}`,
            `K podniku ${r.name} někdo 10× zadal špatný kód. Pokud jste to nebyli vy, vygenerujte nový kód obsluhy: ${staffUrl}`);
        }
        return json(200, { ok: true });
      }

      case "daily": {
        // Called once a day by the database scheduler, which sends a secret key. Anyone else is refused.
        // Safe to call more often: every mail is marked as sent in the database first.
        const okKey = await rpc("svc_cron_ok", { p_key: req.headers.get("x-cron-key") ?? "" });
        if (okKey !== true) return json(403, { error: "forbidden" });
        mailer();
        const jobs = await rpc("svc_daily_jobs", {});
        const dash = `${APP_URL}#/prehled/plat`, sent: string[] = [];
        const fmt = (v: string) => new Date(v).toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
        for (const b of jobs.trial_3d ?? []) {
          await send(b.email, `Zkušební verze Štemplu končí ${fmt(b.trial_ends_at)}`, "Zkušební verze brzy končí",
            `<p>Zkušební verze Štemplu pro <b>${esc(b.name)}</b> končí <b>${esc(fmt(b.trial_ends_at))}</b>. Kartu už má ${b.customers} ${b.customers === 1 ? "zákazník" : b.customers >= 2 && b.customers <= 4 ? "zákazníci" : "zákazníků"}.</p>
             <p>Aby mohli sbírat razítka i dál, aktivujte předplatné: ${PRICE_TEXT}. Zrušit ho můžete kdykoli.</p>${btn(dash, "Aktivovat předplatné")}`,
            `Zkušební verze Štemplu pro ${b.name} končí ${fmt(b.trial_ends_at)}. Aktivujte předplatné: ${dash}`).then(() => sent.push("t3:" + b.slug)).catch((e) => console.error("trial3", b.slug, e));
        }
        for (const b of jobs.trial_end ?? []) {
          await send(b.email, `Zkušební verze Štemplu skončila – ${b.name}`, "Zkušební verze skončila",
            `<p>Zkušební verze pro <b>${esc(b.name)}</b> skončila, takže zákazníci teď nemohou sbírat razítka. Jejich karty a razítka zůstávají uložené.</p>
             <p>Stačí aktivovat předplatné (${PRICE_TEXT}) a vše hned znovu poběží.</p>${btn(dash, "Aktivovat předplatné")}`,
            `Zkušební verze pro ${b.name} skončila. Aktivujte předplatné: ${dash}`).then(() => sent.push("te:" + b.slug)).catch((e) => console.error("trialend", b.slug, e));
        }
        for (const b of jobs.summary ?? []) {
          const diff = (n: number, p: number) => !b.has_prev ? "" : n === p ? ` <span style="color:#6e675d;font-size:13px">(stejně jako minulý týden)</span>` : ` <span style="color:${n > p ? "#256f45" : "#b42318"};font-size:13px">(${n > p ? "+" : "−"}${Math.abs(n - p)} proti minulému týdnu)</span>`;
          const row = (n: number, label: string, prev?: number) => `<tr><td style="padding:6px 0;font-size:26px;font-weight:800;width:70px">${n}</td><td style="padding:6px 0;color:#6e675d">${label}${prev === undefined ? "" : diff(n, prev)}</td></tr>`;
          const tip = !b.has_review_url ? "Doplňte v Nastavení odkaz na recenze na Googlu, ať zákazníky prosíme o hodnocení."
            : b.idle_30d > 0 ? `${b.idle_30d} ${b.idle_30d === 1 ? "stálý zákazník tu nebyl" : "stálých zákazníků tu nebylo"} přes 30 dní. Najdete je v Přehled → Zákazníci → Nebyl 30 dní.`
            : b.new_cards === 0 ? "Tento týden nepřibyla žádná karta. Připomeňte obsluze, ať se každého zeptá: Máte už naši kartu?"
            : b.reviews === 0 ? "Nikdo tento týden neotevřel recenzi. Zkontrolujte, že odkaz na recenzi v Nastavení funguje."
            : "";
          await send(b.email, `Štempl: váš týden – ${b.name}`, "Váš týden ve Štemplu",
            `<p>Za posledních 7 dní v <b>${esc(b.name)}</b>:</p><table style="border-collapse:collapse">${row(b.stamps, "razítek (návštěv)", b.stamps_prev)}${row(b.new_cards, "nových zákazníků s kartou", b.new_cards_prev)}${row(b.redeems, "vydaných odměn")}${row(b.reviews, "otevřelo formulář recenze na Googlu")}</table>
             <p>Celkem má kartu ${b.customers} zákazníků.</p>${tip ? `<p style="color:#9a4a07"><b>Tip na tento týden:</b> ${esc(tip)}</p>` : ""}
             ${btn(`${APP_URL}#/prehled`, "Otevřít přehled")}<p style="font-size:12px;color:#6e675d">Souhrn můžete vypnout v Přehled → Nastavení.</p>`,
            `${b.name} za 7 dní: ${b.stamps} razítek, ${b.new_cards} nových zákazníků, ${b.redeems} odměn, ${b.reviews} recenzí.`).then(() => sent.push("s:" + b.slug)).catch((e) => console.error("summary", b.slug, e));
        }
        /* customer reminders and owners' messages (only customers who agreed to news) */
        let mk = { reminders: 0, broadcast: 0, birthdays: 0 };
        try {
          const m = await rpc("svc_marketing_jobs", {});
          for (const r of m.reminders ?? []) {
            const card = `${APP_URL}#/c/${r.token}`;
            const almost = r.kind === "almost";
            const hello = r.name ? `${esc(r.name)}, ` : "";
            await sendMarketing({ to: r.email, business: r.business, replyTo: r.reply_to, unsub: r.unsub,
              subject: almost ? `${r.business}: chybí vám 1 razítko` : `${r.business}: dlouho jsme vás neviděli`,
              title: almost ? "Chybí vám jedno razítko" : "Dlouho jsme vás neviděli",
              html: almost
                ? `<p>${hello}na kartě v <b>${esc(r.business)}</b> máte ${r.stamps} z ${r.needed} razítek. Při příští návštěvě vás čeká <b>${esc(r.reward)}</b>.</p>${btn(card, "Otevřít kartu")}`
                : `<p>${hello}v <b>${esc(r.business)}</b> jsme vás už nějakou dobu neviděli. Na kartě máte ${r.stamps} z ${r.needed} razítek a sbírání pokračuje, kdykoli se zastavíte.</p>${btn(card, "Otevřít kartu")}`,
              text: almost ? `${r.business}: máte ${r.stamps} z ${r.needed} razítek, příště vás čeká ${r.reward}. Karta: ${card}` : `${r.business}: dlouho jsme vás neviděli. Karta: ${card}`,
            }).then(() => mk.reminders++).catch((e) => console.error("reminder", e));
          }
          for (const bc of m.broadcasts ?? []) {
            let n = 0;
            for (const r of bc.recipients ?? []) {
              await sendMarketing({ to: r.email, business: bc.business, replyTo: bc.reply_to, unsub: r.unsub,
                subject: `${bc.business}: ${bc.subject}`, title: bc.subject,
                html: `<p style="white-space:pre-wrap;line-height:1.55">${esc(bc.body)}</p>${btn(`${APP_URL}#/c/${r.token}`, "Otevřít věrnostní kartu")}`,
                text: `${bc.body}\n\nKarta: ${APP_URL}#/c/${r.token}`,
              }).then(() => n++).catch((e) => console.error("broadcast", e));
            }
            mk.broadcast += n;
            await rpc("svc_broadcast_done", { p_id: bc.id, p_count: n }).catch((e) => console.error("broadcast done", e));
          }
        } catch (e) { console.error("marketing", e); }
        /* birthday gift, at the start of the birthday month (only with news consent, once a year) */
        try {
          const bd = await rpc("svc_birthday_jobs", {});
          for (const r of bd ?? []) {
            const card = `${APP_URL}#/c/${r.token}`;
            await sendMarketing({ to: r.email, business: r.business, replyTo: r.reply_to, unsub: r.unsub,
              subject: `${r.business}: dárek k narozeninám`, title: "Všechno nejlepší!",
              html: `<p>${r.name ? esc(r.name) + ", t" : "T"}ento měsíc na vás v <b>${esc(r.business)}</b> čeká narozeninový dárek: <b>${esc(r.gift)}</b>. Stačí ukázat kartu obsluze.</p>${btn(card, "Otevřít kartu")}`,
              text: `${r.business}: tento měsíc na vás čeká narozeninový dárek – ${r.gift}. Karta: ${card}`,
            }).then(() => mk.birthdays++).catch((e) => console.error("birthday", e));
          }
        } catch (e) { console.error("birthdays", e); }
        await rpc("svc_log_job", { p_job: "daily", p_ok: true, p_detail: { sent, marketing: mk, trial_3d: (jobs.trial_3d ?? []).length, trial_end: (jobs.trial_end ?? []).length, summary: (jobs.summary ?? []).length } }).catch((e) => console.error("log job", e));
        return json(200, { ok: true, sent });
      }

      default:
        return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    if (body?.action === "daily") await rpc("svc_log_job", { p_job: "daily", p_ok: false, p_detail: { error: String((e as Error)?.message ?? e).slice(0, 300) } }).catch(() => {});
    if (e instanceof AppError) return json(400, { error: e.message });
    console.error(e);
    return json(500, { error: "server_error" });
  }
});

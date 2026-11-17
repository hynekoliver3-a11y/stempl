-- Štempl – vylepšení (17. 11. 2026)
-- Jména obsluhy u razítek, e-mail majiteli při zamčení přihlášení, odhad tržeb, přehled podezřelé aktivity,
-- ruční oprava razítek majitelem, záznam běhů denní úlohy, srovnání s minulým týdnem v souhrnu.
-- Bez příkazů, které něco ruší. Starší verze aplikace funguje dál (nové funkce mají vlastní názvy).

alter table public.events add column if not exists by_name text check (by_name is null or char_length(by_name) <= 40);
alter table public.businesses
  add column if not exists avg_spend integer check (avg_spend is null or avg_spend between 1 and 100000),
  add column if not exists lock_alert_at timestamptz;

create table if not exists public.job_runs(
  id bigint generated always as identity primary key,
  job text not null, ok boolean not null, detail jsonb, created_at timestamptz not null default now());
alter table public.job_runs enable row level security;

insert into public.app_config(k, v) values ('alert_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (k) do nothing;

/* ---------- razítka, která se počítají jako návštěvy (bez převodu z papíru a ručních oprav) ---------- */
create or replace function private.is_visit(p_kind text, p_src text) returns boolean
language sql immutable set search_path to '' as $$
  select p_kind = 'stamp' and coalesce(p_src, '') not in ('import', 'adjust');
$$;

create or replace function private.clean_name(p text) returns text
language sql immutable set search_path to '' as $$
  select nullif(left(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), 40), '');
$$;

/* ---------- e-mail majiteli při zamčení přihlášení (nejvýš jednou za hodinu) ---------- */
create or replace function private.lock_alert(p_slug text) returns void
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v_url text; v_secret text;
begin
  select * into b from public.businesses where slug = p_slug;
  if not found or b.owner_email is null then return; end if;
  if b.lock_alert_at is not null and b.lock_alert_at > now() - interval '1 hour' then return; end if;
  select v into v_url from public.app_config where k = 'api_url';
  select v into v_secret from public.app_config where k = 'alert_secret';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '3000');
  perform extensions.http(('POST', v_url || '/functions/v1/stempl-api', array[]::extensions.http_header[], 'application/json',
    jsonb_build_object('action', 'lock_alert', 'slug', p_slug, 'key', v_secret)::text)::extensions.http_request);
exception when others then null;
end $$;

create or replace function public.svc_lock_alert(p_slug text, p_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses;
begin
  if p_key is distinct from (select v from public.app_config where k = 'alert_secret') then raise exception 'forbidden'; end if;
  update public.businesses set lock_alert_at = now()
   where slug = lower(trim(coalesce(p_slug, ''))) and owner_email is not null
     and (lock_alert_at is null or lock_alert_at < now() - interval '1 hour')
   returning * into b;
  if not found then return null; end if;
  return jsonb_build_object('email', b.owner_email, 'name', b.name, 'slug', b.slug);
end $$;

create or replace function public._auth_business(p_slug text, p_code text) returns public.businesses
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v text := upper(trim(coalesce(p_code, '')));
        v_slug text := lower(trim(coalesce(p_slug, ''))); v_key text := private.rate_key('login|' || v_slug);
begin
  if private.locked('login_fail', v_key) then
    perform private.lock_alert(v_slug);
    raise exception 'locked';
  end if;
  select * into b from public.businesses where slug = v_slug;
  if not found or not (b.code_hash = extensions.crypt(v, b.code_hash)
                       or (b.staff_code_hash is not null and b.staff_code_hash = extensions.crypt(v, b.staff_code_hash))) then
    perform private.push_fail('login_fail', v_key);
    raise exception 'bad_code';
  end if;
  return b;
end $$;

/* ---------- razítko a odměna se jménem obsluhy ---------- */
create or replace function public.stamp_card_v2(p_slug text, p_code text, p_token text, p_count integer default 1, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards; n int := coalesce(p_count, 1); v_today int;
begin
  if n < 1 or n > 5 then raise exception 'bad_count'; end if;
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if c.last_stamp_at is not null and c.last_stamp_at > now() - interval '30 seconds' then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.events
   where card_id = c.id and kind = 'stamp' and not voided and src is null
     and created_at >= (date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague');
  if v_today + n > b.daily_stamp_limit then raise exception 'daily_limit'; end if;
  update public.cards set stamps = stamps + n, total_stamps = total_stamps + n, last_stamp_at = now()
    where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, by_name) select b.id, c.id, 'stamp', private.clean_name(p_by) from generate_series(1, n);
  return public._card_json(c, b);
end $$;

create or replace function public.redeem_reward_v2(p_slug text, p_code text, p_token text, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if c.stamps < b.stamps_needed then raise exception 'not_enough'; end if;
  update public.cards set stamps = stamps - b.stamps_needed, rewards_redeemed = rewards_redeemed + 1
    where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, by_name) values (b.id, c.id, 'redeem', private.clean_name(p_by));
  return public._card_json(c, b);
end $$;

create or replace function public.import_paper_v2(p_slug text, p_code text, p_token text, p_count integer, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards; n int := coalesce(p_count, 0);
begin
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  if n < 1 or n > b.stamps_needed - 1 then raise exception 'bad_import'; end if;
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if exists (select 1 from public.events where card_id = c.id and src = 'import') then raise exception 'already_imported'; end if;
  update public.cards set stamps = stamps + n where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, src, qty, by_name) values (b.id, c.id, 'stamp', 'import', n, private.clean_name(p_by));
  return public._card_json(c, b);
end $$;

/* ---------- ruční oprava počtu razítek majitelem (se záznamem v historii) ---------- */
create or replace function public.owner_adjust_stamps(p_slug text, p_code text, p_card uuid, p_stamps integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); c public.cards; d int;
begin
  if p_stamps is null or p_stamps < 0 or p_stamps > b.stamps_needed * 3 then raise exception 'bad_adjust'; end if;
  select * into c from public.cards where id = p_card and business_id = b.id for update;
  if not found then raise exception 'no_card'; end if;
  d := p_stamps - c.stamps;
  if d = 0 then return public._card_json(c, b); end if;
  update public.cards set stamps = p_stamps where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, src, qty, by_name) values (b.id, c.id, 'stamp', 'adjust', d, 'majitel');
  return public._card_json(c, b);
end $$;

create or replace function public.owner_set_spend(p_slug text, p_code text, p_avg_spend integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
begin
  if p_avg_spend is not null and (p_avg_spend < 1 or p_avg_spend > 100000) then raise exception 'bad_spend'; end if;
  update public.businesses set avg_spend = p_avg_spend where id = b.id returning * into b;
  return jsonb_build_object('avg_spend', b.avg_spend);
end $$;

/* ---------- přehled majitele ---------- */
create or replace function private.event_kind(p_kind text, p_src text) returns text
language sql immutable set search_path to '' as $$
  select case when p_src = 'import' then 'import' when p_src = 'adjust' then 'adjust' else p_kind end;
$$;

create or replace function public.owner_stats(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
begin
  return jsonb_build_object(
    'customers', (select count(*) from public.cards where business_id = b.id),
    'new_30d', (select count(*) from public.cards where business_id = b.id and created_at > now() - interval '30 days'),
    'returning', (select count(*) from public.cards where business_id = b.id and total_stamps >= 2),
    'stamps_30d', (select count(*) from public.events where business_id = b.id and private.is_visit(kind, src) and not voided and created_at > now() - interval '30 days'),
    'returning_visits_30d', (select count(*) from public.events e join public.cards c on c.id = e.card_id
                              where e.business_id = b.id and private.is_visit(e.kind, e.src) and not e.voided and e.created_at > now() - interval '30 days'
                                and e.created_at > c.created_at + interval '1 hour'),
    'redeemed_total', (select count(*) from public.events where business_id = b.id and kind = 'redeem'),
    'review_clicks_30d', (select count(*) from public.events where business_id = b.id and kind = 'review_click' and created_at > now() - interval '30 days'),
    'idle_30d', (select count(*) from public.cards where business_id = b.id and coalesce(last_stamp_at, created_at) < now() - interval '30 days'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'stamps', coalesce(x.n, 0)) order by d), '[]'::jsonb)
              from generate_series((now() at time zone 'Europe/Prague')::date - 13, (now() at time zone 'Europe/Prague')::date, interval '1 day') d
              left join (select (created_at at time zone 'Europe/Prague')::date as day, count(*) n from public.events
                         where business_id = b.id and private.is_visit(kind, src) and not voided and created_at > now() - interval '15 days' group by 1) x on x.day = d::date),
    'recent', (select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) from (
                 select jsonb_build_object('kind', private.event_kind(e.kind, e.src), 'at', e.created_at, 'card', upper(left(c.token, 6)), 'name', c.name, 'qty', e.qty, 'by', e.by_name) r
                 from public.events e left join public.cards c on c.id = e.card_id
                 where e.business_id = b.id and not e.voided order by e.created_at desc limit 15) q),
    'by_staff', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'stamps', s, 'redeems', r) order by s desc), '[]'::jsonb) from (
                 select coalesce(by_name, 'bez jména') n, count(*) filter (where private.is_visit(kind, src)) s, count(*) filter (where kind = 'redeem') r
                 from public.events where business_id = b.id and not voided and created_at > now() - interval '30 days' and kind in ('stamp', 'redeem')
                   and coalesce(src, '') not in ('welcome', 'adjust')
                 group by 1) q),
    'busy_cards_7d', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'stamps', n, 'days', d) order by n desc), '[]'::jsonb) from (
                 select c.id, upper(left(c.token, 8)) code, c.name, count(*) n,
                        count(distinct (e.created_at at time zone 'Europe/Prague')::date) d
                 from public.events e join public.cards c on c.id = e.card_id
                 where e.business_id = b.id and private.is_visit(e.kind, e.src) and not e.voided and e.created_at > now() - interval '7 days'
                 group by c.id having count(*) >= 6 order by count(*) desc limit 5) q),
    'business', jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
       'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
       'owner_email', b.owner_email, 'has_staff_code', b.staff_code_hash is not null, 'weekly_summary', b.weekly_summary,
       'daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text, 'avg_spend', b.avg_spend),
    'billing', public._billing(b));
end $$;

create or replace function public.owner_customer(p_slug text, p_code text, p_card uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); c public.cards;
begin
  select * into c from public.cards where id = p_card and business_id = b.id;
  if not found then raise exception 'no_card'; end if;
  return public._card_json(c, b) || jsonb_build_object(
    'id', c.id, 'email', case when c.consent_at is not null then c.email end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', private.event_kind(e.kind, e.src), 'at', e.created_at, 'qty', e.qty, 'by', e.by_name) order by e.created_at desc)
                 from (select * from public.events where card_id = c.id and not voided order by created_at desc limit 100) e), '[]'::jsonb));
end $$;

/* ---------- denní úloha: srovnání s minulým týdnem a záznam běhu ---------- */
create or replace function public.svc_daily_jobs() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_trial3 jsonb; v_trialend jsonb; v_summary jsonb; is_monday boolean := extract(isodow from (now() at time zone 'Europe/Prague')) = 1;
begin
  with t as (
    update public.businesses b set reminded_trial_3d = now()
     where b.reminded_trial_3d is null and not b.billing_comp and b.owner_email is not null
       and b.trial_ends_at > now() and b.trial_ends_at <= now() + interval '3 days'
       and not exists (select 1 from public.subscriptions s where s.id = b.stripe_subscription_id and s.status in ('active','trialing','past_due'))
    returning b.id, b.slug, b.name, b.owner_email, b.trial_ends_at)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name, 'email', owner_email, 'trial_ends_at', trial_ends_at,
           'customers', (select count(*) from public.cards c where c.business_id = t.id))), '[]'::jsonb) into v_trial3 from t;

  with t as (
    update public.businesses b set reminded_trial_end = now()
     where b.reminded_trial_end is null and not b.billing_comp and b.owner_email is not null
       and b.trial_ends_at <= now() and b.trial_ends_at > now() - interval '3 days'
       and not exists (select 1 from public.subscriptions s where s.id = b.stripe_subscription_id and s.status in ('active','trialing','past_due'))
    returning b.id, b.slug, b.name, b.owner_email)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name, 'email', owner_email,
           'customers', (select count(*) from public.cards c where c.business_id = t.id))), '[]'::jsonb) into v_trialend from t;

  if is_monday then
    with t as (
      update public.businesses b set last_summary_at = now()
       where b.weekly_summary and b.owner_email is not null and public._has_access(b)
         and (b.last_summary_at is null or b.last_summary_at < now() - interval '6 days')
         and b.created_at < now() - interval '3 days'
      returning b.id, b.slug, b.name, b.owner_email, b.google_review_url, b.created_at)
    select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'email', owner_email, 'has_review_url', google_review_url is not null,
             'has_prev', created_at < now() - interval '14 days',
             'stamps', (select count(*) from public.events e where e.business_id = t.id and private.is_visit(e.kind, e.src) and not e.voided and e.created_at > now() - interval '7 days'),
             'stamps_prev', (select count(*) from public.events e where e.business_id = t.id and private.is_visit(e.kind, e.src) and not e.voided and e.created_at > now() - interval '14 days' and e.created_at <= now() - interval '7 days'),
             'new_cards', (select count(*) from public.cards c where c.business_id = t.id and c.created_at > now() - interval '7 days'),
             'new_cards_prev', (select count(*) from public.cards c where c.business_id = t.id and c.created_at > now() - interval '14 days' and c.created_at <= now() - interval '7 days'),
             'redeems', (select count(*) from public.events e where e.business_id = t.id and e.kind = 'redeem' and e.created_at > now() - interval '7 days'),
             'reviews', (select count(*) from public.events e where e.business_id = t.id and e.kind = 'review_click' and e.created_at > now() - interval '7 days'),
             'idle_30d', (select count(*) from public.cards c where c.business_id = t.id and c.total_stamps >= 2 and coalesce(c.last_stamp_at, c.created_at) < now() - interval '30 days'),
             'customers', (select count(*) from public.cards c where c.business_id = t.id))), '[]'::jsonb) into v_summary from t;
  else
    v_summary := '[]'::jsonb;
  end if;

  return jsonb_build_object('trial_3d', v_trial3, 'trial_end', v_trialend, 'summary', v_summary);
end $$;

create or replace function public.svc_log_job(p_job text, p_ok boolean, p_detail jsonb default null) returns void
language sql security definer set search_path to '' as $$
  insert into public.job_runs(job, ok, detail) values (left(p_job, 40), p_ok, p_detail);
$$;

/* ---------- správa ---------- */
create or replace function public.admin_overview(p_installer_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform public._auth_installer(p_installer_key);
  return jsonb_build_object(
    'businesses', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', b.slug, 'name', b.name, 'category', b.category, 'created_at', b.created_at, 'owner_email', b.owner_email, 'phone', b.phone,
        'customers', (select count(*) from public.cards c where c.business_id = b.id),
        'stamps_30d', (select count(*) from public.events e where e.business_id = b.id and private.is_visit(e.kind, e.src) and not e.voided and e.created_at > now() - interval '30 days'),
        'cards_7d', (select count(*) from public.cards c where c.business_id = b.id and c.created_at > now() - interval '7 days'),
        'last_activity', (select max(e.created_at) from public.events e where e.business_id = b.id and not e.voided),
        'has_review_url', b.google_review_url is not null,
        'locked_recently', b.lock_alert_at is not null and b.lock_alert_at > now() - interval '7 days',
        'billing', public._billing(b)) order by b.created_at desc)
      from public.businesses b), '[]'::jsonb),
    'mrr', (select coalesce(sum(case when s.plan = 'year' then 4900.0/12 else 490 end), 0)::int
              from public.businesses b join public.subscriptions s on s.id = b.stripe_subscription_id
             where s.status in ('active','past_due') and not s.cancel_at_period_end),
    'pending_registrations', (select count(*) from public.registrations where confirmed_at is null and created_at > now() - interval '72 hours'),
    'unmatched', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'business_name', business_name, 'at', received_at) order by received_at desc)
      from public.stripe_events where type = 'checkout.session.completed' and business_id is null and subscription is not null), '[]'::jsonb),
    'leads', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'business', business, 'contact', contact, 'message', message, 'created_at', created_at) order by created_at desc)
      from public.leads), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('message', message, 'source', source, 'page', page, 'ua', ua, 'at', created_at) order by created_at desc)
      from (select * from public.client_errors order by created_at desc limit 30) x), '[]'::jsonb),
    'failed_logins_24h', (select count(*) from public.rate_hits where kind in ('login_fail','admin_fail') and created_at > now() - interval '24 hours'),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', job, 'ok', ok, 'detail', detail, 'at', created_at) order by created_at desc)
      from (select * from public.job_runs order by created_at desc limit 7) x), '[]'::jsonb));
end $$;

/* ---------- b2: funkce jen pro server (provedeno jako vylepseni_b2_service_only) ---------- */
create or replace function private.is_service() returns boolean
language sql stable set search_path to '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role';
$$;

create or replace function public.svc_log_job(p_job text, p_ok boolean, p_detail jsonb default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_service() then raise exception 'forbidden'; end if;
  insert into public.job_runs(job, ok, detail) values (left(p_job, 40), p_ok, p_detail);
end $$;

create or replace function public.svc_cron_ok(p_key text) returns boolean
language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.is_service() then raise exception 'forbidden'; end if;
  return coalesce(public._hash(coalesce(p_key, '')) = (select v from public.app_config where k = 'cron_hash'), false);
end $$;

/* ---------- Spuštěno ručně v Supabase → SQL Editor 17. 11. 2026 (obsahuje mazání, potvrzení přes nástroj nefungovalo) ----------
-- Majitel si sám zruší účet a smaže data. Tlačítko v aplikaci se doplní, až bude funkce v databázi.
create or replace function public.owner_delete_business(p_slug text, p_code text, p_confirm text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); n_cards int;
begin
  if lower(trim(coalesce(p_confirm, ''))) <> b.slug then raise exception 'confirm_mismatch'; end if;
  if exists (select 1 from public.subscriptions s where s.id = b.stripe_subscription_id
               and s.status in ('active','trialing','past_due') and not s.cancel_at_period_end) then
    raise exception 'cancel_subscription_first';
  end if;
  select count(*) into n_cards from public.cards where business_id = b.id;
  update public.stripe_events set business_id = null where business_id = b.id;
  delete from public.businesses where id = b.id;
  return jsonb_build_object('deleted', b.slug, 'cards', n_cards);
end $$;
*/

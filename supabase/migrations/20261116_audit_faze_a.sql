-- Štempl – audit, fáze A (16. 11. 2026)
-- Zkušební doba 30 dní, denní limit razítek, převod z papírové kartičky, uvítací razítko,
-- zamykání po chybných přihlášeních, limit zakládání karet podle IP, odkaz na recenzi jen na Google,
-- limit počítadla recenzí, ochrana denní úlohy klíčem, hlášení chyb z prohlížeče.
-- Všechno je zpětně kompatibilní se starší verzí aplikace.
-- V databázi provedeno 16. 11. 2026 jako migrace audit_a1_tables a audit_a2_functions.
-- Záměrně tu není žádný příkaz, který něco ruší (drop, revoke, delete): pomocné funkce jsou
-- v neveřejném schématu private a převod z papíru se zapisuje jako razítko se src = 'import'.

create extension if not exists http with schema extensions;
create schema if not exists private;

/* ---------- nové tabulky (zamčené, bez politik – jen přes funkce) ---------- */
create table if not exists public.app_config(k text primary key, v text not null);
alter table public.app_config enable row level security;

create table if not exists public.rate_hits(
  id bigint generated always as identity primary key,
  kind text not null, key text not null, created_at timestamptz not null default now());
create index if not exists rate_hits_lookup on public.rate_hits(kind, key, created_at);
alter table public.rate_hits enable row level security;

create table if not exists public.client_errors(
  id bigint generated always as identity primary key,
  message text not null, source text, page text, ua text, created_at timestamptz not null default now());
alter table public.client_errors enable row level security;

insert into public.app_config(k, v) values
  ('fail_secret', encode(extensions.gen_random_bytes(24), 'hex')),
  ('api_url', 'https://tmhzusgvgujrbihzusyt.supabase.co'),
  ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtaHp1c2d2Z3VqcmJpaHp1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MzIwNzgsImV4cCI6MjEwODUwODA3OH0.NvEwfdi0OMtpmCbIqROIvB22ALDJfif6gR5FigEQ3Tw')
on conflict (k) do nothing;

/* ---------- businesses / events ---------- */
alter table public.businesses alter column trial_ends_at set default (now() + interval '30 days');
alter table public.businesses
  add column if not exists daily_stamp_limit integer not null default 2 check (daily_stamp_limit between 1 and 20),
  add column if not exists welcome_stamp boolean not null default false,
  add column if not exists rules_text text check (rules_text is null or char_length(rules_text) <= 300);

alter table public.businesses add constraint businesses_review_google_check
  check (google_review_url is null or google_review_url ~ '^https://((www\.|maps\.|search\.)?google\.(com|cz|sk)|g\.page|g\.co|maps\.app\.goo\.gl|goo\.gl)/\S+$');

alter table public.events
  add column if not exists src text,
  add column if not exists qty integer;

/* ---------- pomocné funkce ---------- */
create or replace function private.client_ip() returns text
language plpgsql stable set search_path to '' as $$
declare h json; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then return null; end;
  if h is null then return null; end if;
  ip := coalesce(nullif(trim(h->>'cf-connecting-ip'), ''), nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''));
  return ip;
end $$;

create or replace function private.rate_key(p_scope text) returns text
language sql stable set search_path to '' as $$
  select case when private.client_ip() is null then null else public._hash(p_scope || '|' || private.client_ip()) end;
$$;

-- Zápis neúspěšného pokusu musí přežít rollback volající funkce, proto jde vlastním HTTP požadavkem.
create or replace function public._note_fail(p_secret text, p_kind text, p_key text) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_secret is distinct from (select v from public.app_config where k = 'fail_secret') then return; end if;
  if p_kind not in ('login_fail', 'admin_fail') or p_key is null or char_length(p_key) > 80 then return; end if;
  insert into public.rate_hits(kind, key) values (p_kind, p_key);
end $$;

create or replace function private.push_fail(p_kind text, p_key text) returns void
language plpgsql security definer set search_path to '' as $$
declare v_url text; v_anon text; v_secret text;
begin
  if p_key is null then return; end if;
  select v into v_url from public.app_config where k = 'api_url';
  select v into v_anon from public.app_config where k = 'anon_key';
  select v into v_secret from public.app_config where k = 'fail_secret';
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '2500');
  perform extensions.http((
    'POST', v_url || '/rest/v1/rpc/_note_fail',
    array[extensions.http_header('apikey', v_anon), extensions.http_header('Authorization', 'Bearer ' || v_anon)],
    'application/json',
    jsonb_build_object('p_secret', v_secret, 'p_kind', p_kind, 'p_key', p_key)::text)::extensions.http_request);
exception when others then null;
end $$;

create or replace function private.locked(p_kind text, p_key text) returns boolean
language sql stable set search_path to '' as $$
  select p_key is not null and (select count(*) from public.rate_hits
     where kind = p_kind and key = p_key and created_at > now() - interval '15 minutes') >= 10;
$$;

/* ---------- přihlášení: zámek po 10 chybách za 15 minut (podnik + IP), bez pg_sleep ---------- */
create or replace function public._auth_business(p_slug text, p_code text) returns public.businesses
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v text := upper(trim(coalesce(p_code, '')));
        v_slug text := lower(trim(coalesce(p_slug, ''))); v_key text := private.rate_key('login|' || v_slug);
begin
  if private.locked('login_fail', v_key) then raise exception 'locked'; end if;
  select * into b from public.businesses where slug = v_slug;
  if not found or not (b.code_hash = extensions.crypt(v, b.code_hash)
                       or (b.staff_code_hash is not null and b.staff_code_hash = extensions.crypt(v, b.staff_code_hash))) then
    perform private.push_fail('login_fail', v_key);
    raise exception 'bad_code';
  end if;
  return b;
end $$;

create or replace function public._auth_installer(p_key text) returns void
language plpgsql security definer set search_path to '' as $$
declare k public.installer; v_key text := private.rate_key('admin');
begin
  if private.locked('admin_fail', v_key) then raise exception 'locked'; end if;
  select * into k from public.installer where id = 1;
  if not found or k.key_hash <> extensions.crypt(trim(coalesce(p_key,'')), k.key_hash) then
    perform private.push_fail('admin_fail', v_key);
    raise exception 'bad_installer_key';
  end if;
end $$;

/* ---------- karta ---------- */
create or replace function public._card_json(c public.cards, b public.businesses) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'token', c.token, 'name', c.name, 'stamps', c.stamps, 'total_stamps', c.total_stamps,
    'rewards_redeemed', c.rewards_redeemed, 'last_stamp_at', c.last_stamp_at, 'created_at', c.created_at,
    'reward_ready', c.stamps >= b.stamps_needed, 'has_email', c.email is not null,
    'can_import', not exists (select 1 from public.events e where e.card_id = c.id and e.src = 'import'),
    'business', jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
       'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
       'daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text,
       'active', public._has_access(b)));
$$;

create or replace function public.public_business(p_slug text) returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('slug', slug, 'name', name, 'category', category, 'reward_text', reward_text,
    'stamps_needed', stamps_needed, 'google_review_url', google_review_url, 'accent', accent,
    'welcome_stamp', welcome_stamp, 'rules_text', rules_text,
    'active', public._has_access(b))
  from public.businesses b where slug = lower(trim(p_slug));
$$;

create or replace function public.join_card(p_slug text, p_name text default null, p_email text default null, p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; c public.cards; v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
        v_key text; v_w int;
begin
  select * into b from public.businesses where slug = lower(trim(p_slug));
  if not found then raise exception 'no_business'; end if;
  if not public._has_access(b) then raise exception 'program_paused'; end if;
  if v_email is not null and not coalesce(p_consent, false) then raise exception 'consent_required'; end if;
  if v_email is not null and exists (select 1 from public.cards where business_id = b.id and email = v_email and consent_at is not null) then
    raise exception 'card_exists';
  end if;
  if (select count(*) from public.events where business_id = b.id and kind = 'join' and created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'rate_limited';
  end if;
  -- nejvýš 15 nových karet za 10 minut z jedné IP adresy u jednoho podniku (wifi v podniku sdílí víc zákazníků)
  v_key := private.rate_key('join|' || b.slug);
  if v_key is not null then
    if (select count(*) from public.rate_hits where kind = 'join' and key = v_key and created_at > now() - interval '10 minutes') >= 15 then
      raise exception 'rate_limited';
    end if;
    insert into public.rate_hits(kind, key) values ('join', v_key);
  end if;
  v_w := case when b.welcome_stamp then 1 else 0 end;
  insert into public.cards(business_id, name, email, consent_at, stamps, total_stamps)
    values (b.id, nullif(trim(coalesce(p_name,'')), ''), v_email, case when v_email is not null then now() end, v_w, v_w)
    returning * into c;
  insert into public.events(business_id, card_id, kind) values (b.id, c.id, 'join');
  if v_w = 1 then insert into public.events(business_id, card_id, kind, src) values (b.id, c.id, 'stamp', 'welcome'); end if;
  return public._card_json(c, b);
end $$;

create or replace function public.stamp_card(p_slug text, p_code text, p_token text, p_count integer default 1) returns jsonb
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
  insert into public.events(business_id, card_id, kind) select b.id, c.id, 'stamp' from generate_series(1, n);
  return public._card_json(c, b);
end $$;

create or replace function public.undo_stamp(p_slug text, p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards; e public.events; n int;
begin
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  select * into e from public.events where card_id = c.id and kind in ('stamp','redeem') and not voided and src is null order by created_at desc, id desc limit 1;
  if not found or e.kind <> 'stamp' or e.created_at < now() - interval '10 minutes' then raise exception 'cannot_undo'; end if;
  update public.events set voided = true where card_id = c.id and kind = 'stamp' and not voided and src is null and created_at = e.created_at;
  get diagnostics n = row_count;
  if c.stamps < n then raise exception 'cannot_undo'; end if;
  update public.cards set stamps = stamps - n, total_stamps = greatest(total_stamps - n, 0), last_stamp_at = null
    where id = c.id returning * into c;
  return public._card_json(c, b) || jsonb_build_object('undone', n);
end $$;

-- Převod rozdělané papírové kartičky: jednou na kartu, se záznamem v historii.
create or replace function public.import_paper_stamps(p_slug text, p_code text, p_token text, p_count integer) returns jsonb
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
  insert into public.events(business_id, card_id, kind, src, qty) values (b.id, c.id, 'stamp', 'import', n);
  return public._card_json(c, b);
end $$;

-- Počítadlo kliknutí na recenzi: nejvýš 1 na kartu za den.
create or replace function public.log_review_click(p_token text) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.cards;
begin
  select * into c from public.cards where token = p_token;
  if not found then return; end if;
  if exists (select 1 from public.events where card_id = c.id and kind = 'review_click' and created_at > now() - interval '24 hours') then return; end if;
  insert into public.events(business_id, card_id, kind) values (c.business_id, c.id, 'review_click');
end $$;

/* ---------- majitel ---------- */
create or replace function private.review_url_ok(u text) returns boolean
language sql immutable set search_path to '' as $$
  select u is null or u ~ '^https://((www\.|maps\.|search\.)?google\.(com|cz|sk)|g\.page|g\.co|maps\.app\.goo\.gl|goo\.gl)/\S+$';
$$;

create or replace function public.update_business(p_slug text, p_code text, p_name text, p_category text, p_reward text, p_needed integer, p_review_url text, p_accent text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); v_url text := nullif(trim(coalesce(p_review_url,'')), '');
begin
  if not private.review_url_ok(v_url) then raise exception 'bad_review_url'; end if;
  update public.businesses set name = trim(p_name), category = coalesce(nullif(trim(p_category),''), category),
    reward_text = trim(p_reward), stamps_needed = p_needed,
    google_review_url = v_url, accent = coalesce(nullif(trim(p_accent),''), accent)
    where id = b.id returning * into b;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
    'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent);
end $$;

create or replace function public.owner_set_options(p_slug text, p_code text, p_daily_limit integer, p_welcome boolean, p_rules text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); v_rules text := nullif(trim(coalesce(p_rules, '')), '');
begin
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 20 then raise exception 'bad_limit'; end if;
  if v_rules is not null and char_length(v_rules) > 300 then raise exception 'bad_rules'; end if;
  update public.businesses set daily_stamp_limit = p_daily_limit, welcome_stamp = coalesce(p_welcome, false), rules_text = v_rules
    where id = b.id returning * into b;
  return jsonb_build_object('daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text);
end $$;

create or replace function public.owner_stats(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
begin
  return jsonb_build_object(
    'customers', (select count(*) from public.cards where business_id = b.id),
    'new_30d', (select count(*) from public.cards where business_id = b.id and created_at > now() - interval '30 days'),
    'returning', (select count(*) from public.cards where business_id = b.id and total_stamps >= 2),
    'stamps_30d', (select count(*) from public.events where business_id = b.id and kind = 'stamp' and src is distinct from 'import' and not voided and created_at > now() - interval '30 days'),
    'redeemed_total', (select count(*) from public.events where business_id = b.id and kind = 'redeem'),
    'review_clicks_30d', (select count(*) from public.events where business_id = b.id and kind = 'review_click' and created_at > now() - interval '30 days'),
    'idle_30d', (select count(*) from public.cards where business_id = b.id and coalesce(last_stamp_at, created_at) < now() - interval '30 days'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'stamps', coalesce(x.n, 0)) order by d), '[]'::jsonb)
              from generate_series((now() at time zone 'Europe/Prague')::date - 13, (now() at time zone 'Europe/Prague')::date, interval '1 day') d
              left join (select (created_at at time zone 'Europe/Prague')::date as day, count(*) n from public.events
                         where business_id = b.id and kind = 'stamp' and src is distinct from 'import' and not voided and created_at > now() - interval '15 days' group by 1) x on x.day = d::date),
    'recent', (select coalesce(jsonb_agg(r order by r->>'at' desc), '[]'::jsonb) from (
                 select jsonb_build_object('kind', case when e.src = 'import' then 'import' else e.kind end, 'at', e.created_at, 'card', upper(left(c.token, 6)), 'name', c.name, 'qty', e.qty) r
                 from public.events e left join public.cards c on c.id = e.card_id
                 where e.business_id = b.id and not e.voided order by e.created_at desc limit 15) q),
    'business', jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
       'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
       'owner_email', b.owner_email, 'has_staff_code', b.staff_code_hash is not null, 'weekly_summary', b.weekly_summary,
       'daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text),
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
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', case when e.src = 'import' then 'import' else e.kind end, 'at', e.created_at, 'qty', e.qty) order by e.created_at desc)
                 from (select * from public.events where card_id = c.id and not voided order by created_at desc limit 100) e), '[]'::jsonb));
end $$;

/* ---------- registrace: zkušební doba 30 dní ---------- */
create or replace function public.svc_confirm_registration(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r public.registrations; v_code text := public._rand_code(8); v_staff text := public._rand_code(8); b public.businesses; p jsonb;
begin
  select * into r from public.registrations where token_hash = public._hash(lower(trim(coalesce(p_token,'')))) for update;
  if not found then raise exception 'bad_token'; end if;
  if r.confirmed_at is not null then raise exception 'already_confirmed'; end if;
  if r.created_at < now() - interval '72 hours' then raise exception 'expired'; end if;
  p := r.payload;
  if exists (select 1 from public.businesses where slug = lower(trim(p->>'slug'))) then raise exception 'slug_taken'; end if;
  insert into public.businesses(slug, name, category, reward_text, stamps_needed, accent, code_hash, staff_code_hash, owner_email, phone, trial_ends_at, terms_accepted_at, terms_version)
    values (lower(trim(p->>'slug')), trim(p->>'name'), coalesce(nullif(trim(p->>'category'),''), 'kavarna'), trim(p->>'reward'),
            coalesce((p->>'needed')::int, 10), coalesce(nullif(p->>'accent',''), '#c2410c'),
            extensions.crypt(v_code, extensions.gen_salt('bf', 8)), extensions.crypt(v_staff, extensions.gen_salt('bf', 8)),
            r.email, nullif(trim(coalesce(p->>'phone','')), ''), now() + interval '30 days',
            coalesce((p->>'terms_accepted_at')::timestamptz, r.created_at), p->>'terms_version')
    returning * into b;
  update public.registrations set confirmed_at = now(), business_id = b.id where id = r.id;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'code', v_code, 'staff_code', v_staff, 'email', r.email, 'trial_ends_at', b.trial_ends_at);
end $$;

create or replace function public.create_business(p_installer_key text, p_name text, p_slug text, p_category text, p_reward text, p_needed integer, p_review_url text, p_accent text, p_owner_email text default null, p_trial_days integer default 30) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_code text := public._rand_code(8); v_staff text := public._rand_code(8); b public.businesses; v_url text := nullif(trim(coalesce(p_review_url,'')), '');
begin
  perform public._auth_installer(p_installer_key);
  if exists (select 1 from public.businesses where slug = lower(trim(p_slug))) then raise exception 'slug_taken'; end if;
  if not private.review_url_ok(v_url) then raise exception 'bad_review_url'; end if;
  insert into public.businesses(slug, name, category, reward_text, stamps_needed, google_review_url, accent, code_hash, staff_code_hash, owner_email, trial_ends_at)
    values (lower(trim(p_slug)), trim(p_name), coalesce(nullif(trim(p_category),''), 'kavarna'), trim(p_reward), p_needed,
            v_url, coalesce(nullif(trim(p_accent),''), '#c2410c'),
            extensions.crypt(v_code, extensions.gen_salt('bf', 8)), extensions.crypt(v_staff, extensions.gen_salt('bf', 8)),
            nullif(lower(trim(coalesce(p_owner_email,''))), ''), now() + make_interval(days => greatest(0, least(coalesce(p_trial_days,30), 365))))
    returning * into b;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'code', v_code, 'staff_code', v_staff);
end $$;

/* ---------- hlášení chyb z prohlížeče ---------- */
create or replace function public.log_client_error(p_message text, p_source text default null, p_page text default null, p_ua text default null) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  if (select count(*) from public.client_errors where created_at > now() - interval '1 hour') >= 200 then return; end if;
  insert into public.client_errors(message, source, page, ua)
    values (left(p_message, 500), left(p_source, 300), left(p_page, 120), left(p_ua, 200));
end $$;

create or replace function public.admin_overview(p_installer_key text) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  perform public._auth_installer(p_installer_key);
  return jsonb_build_object(
    'businesses', coalesce((select jsonb_agg(jsonb_build_object(
        'slug', b.slug, 'name', b.name, 'category', b.category, 'created_at', b.created_at, 'owner_email', b.owner_email, 'phone', b.phone,
        'customers', (select count(*) from public.cards c where c.business_id = b.id),
        'stamps_30d', (select count(*) from public.events e where e.business_id = b.id and e.kind = 'stamp' and e.src is distinct from 'import' and not e.voided and e.created_at > now() - interval '30 days'),
        'last_activity', (select max(e.created_at) from public.events e where e.business_id = b.id and not e.voided),
        'has_review_url', b.google_review_url is not null,
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
    'failed_logins_24h', (select count(*) from public.rate_hits where kind in ('login_fail','admin_fail') and created_at > now() - interval '24 hours'));
end $$;

/* ---------- denní úloha jen s tajným klíčem, úklid ---------- */
create or replace function public.svc_cron_ok(p_key text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce(public._hash(coalesce(p_key, '')) = (select v from public.app_config where k = 'cron_hash'), false);
$$;

do $$
declare v_key text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.app_config(k, v) values ('cron_hash', public._hash(v_key))
    on conflict (k) do update set v = excluded.v;
  perform cron.schedule('stempl-daily', '5 7 * * *', format(
    $c$select net.http_post(url := 'https://tmhzusgvgujrbihzusyt.supabase.co/functions/v1/stempl-api',
                         body := '{"action":"daily"}'::jsonb,
                         headers := '{"Content-Type":"application/json","x-cron-key":"%s"}'::jsonb)$c$, v_key));
end $$;

/* ---------- ZBÝVÁ SPUSTIT RUČNĚ v Supabase → SQL Editor (příkazy něco ruší, proto chtějí potvrzení) ----------
-- 1) denní úklid krátkodobých záznamů (otisky IP adres 2 dny, chyby z prohlížeče 30 dní)
select cron.schedule('stempl-cleanup', '40 3 * * *',
  $c$delete from public.rate_hits where created_at < now() - interval '2 days'; delete from public.client_errors where created_at < now() - interval '30 days'$c$);
-- 2) staré veřejné funkce, které aplikace už nevolá
revoke all on function public.find_card_by_email(text, text, text) from public, anon, authenticated;
revoke all on function public.lookup_card_short(text, text, text) from public, anon, authenticated;
*/

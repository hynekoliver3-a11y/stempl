-- Štempl – dočasná přihlášení zařízení (17. 11. 2026)
-- Telefon si místo kódu podniku pamatuje přihlášení zařízení ("S:" + 64 hex znaků).
-- Přihlášení platí, dokud se zařízení používá; po 30 dnech nečinnosti vyprší.
-- Majitel vidí seznam zařízení a může je odhlásit. Nový kód obsluhy odhlásí telefony obsluhy,
-- nový kód majitele odhlásí všechna zařízení.
-- Všechny stávající funkce s parametry (p_slug, p_code) přijímají v p_code buď kód, nebo přihlášení zařízení,
-- takže starší verze aplikace s uloženým kódem funguje dál.

create table if not exists public.sessions(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  token_hash text not null unique,
  role text not null check (role in ('owner', 'staff')),
  by_name text check (by_name is null or char_length(by_name) <= 40),
  device text check (device is null or char_length(device) <= 80),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz);
create index if not exists sessions_business_idx on public.sessions(business_id);
alter table public.sessions enable row level security;

create or replace function private.is_session_code(p text) returns boolean
language sql immutable set search_path to '' as $$
  select coalesce(p, '') ~ '^S:[0-9a-f]{64}$';
$$;

/* kód nebo přihlášení zařízení; roli a jméno obsluhy si pamatuje do konce dotazu */
create or replace function public._auth_business(p_slug text, p_code text) returns public.businesses
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; s public.sessions; v text := trim(coalesce(p_code, ''));
        v_slug text := lower(trim(coalesce(p_slug, ''))); v_key text := private.rate_key('login|' || v_slug); v_role text;
begin
  if private.locked('login_fail', v_key) then
    perform private.lock_alert(v_slug);
    raise exception 'locked';
  end if;
  select * into b from public.businesses where slug = v_slug;
  if found and private.is_session_code(v) then
    select * into s from public.sessions
     where token_hash = public._hash(lower(substr(v, 3))) and business_id = b.id
       and revoked_at is null and last_used_at > now() - interval '30 days';
    if found then
      if s.last_used_at < now() - interval '5 minutes' then
        update public.sessions set last_used_at = now() where id = s.id;
      end if;
      perform set_config('stempl.role', s.role, true);
      perform set_config('stempl.by', coalesce(s.by_name, ''), true);
      perform set_config('stempl.session', s.id::text, true);
      return b;
    end if;
  elsif found then
    v := upper(v);
    if b.code_hash = extensions.crypt(v, b.code_hash) then v_role := 'owner';
    elsif b.staff_code_hash is not null and b.staff_code_hash = extensions.crypt(v, b.staff_code_hash) then v_role := 'staff';
    end if;
    if v_role is not null then
      perform set_config('stempl.role', v_role, true);
      perform set_config('stempl.by', '', true);
      perform set_config('stempl.session', '', true);
      return b;
    end if;
  end if;
  perform private.push_fail('login_fail', v_key);
  if private.is_session_code(v) then raise exception 'session_expired'; end if;
  raise exception 'bad_code';
end $$;

create or replace function public._auth_owner(p_slug text, p_code text) returns public.businesses
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code);
begin
  if current_setting('stempl.role', true) is distinct from 'owner' then raise exception 'owner_only'; end if;
  return b;
end $$;

create or replace function private.by_name(p_by text) returns text
language sql stable set search_path to '' as $$
  select coalesce(nullif(current_setting('stempl.by', true), ''), private.clean_name(p_by));
$$;

create or replace function public.staff_login(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code);
begin
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
    'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
    'role', current_setting('stempl.role', true),
    'by', nullif(current_setting('stempl.by', true), ''),
    'active', public._has_access(b));
end $$;

/* přihlášení zařízení: jen s kódem podniku (ne s jiným přihlášením) */
create or replace function public.session_create(p_slug text, p_code text, p_by text default null, p_device text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v_tok text := encode(extensions.gen_random_bytes(32), 'hex'); v_role text; v_by text := private.clean_name(p_by);
begin
  if private.is_session_code(p_code) then raise exception 'bad_code'; end if;
  b := public._auth_business(p_slug, p_code);
  v_role := current_setting('stempl.role', true);
  if v_role = 'owner' and v_by is null then v_by := 'majitel'; end if;
  insert into public.sessions(business_id, token_hash, role, by_name, device)
    values (b.id, public._hash(v_tok), v_role, v_by, left(nullif(trim(coalesce(p_device, '')), ''), 80));
  return jsonb_build_object('session', 'S:' || v_tok, 'role', v_role, 'by', v_by, 'slug', b.slug, 'name', b.name, 'active', public._has_access(b));
end $$;

create or replace function public.session_rename(p_slug text, p_code text, p_by text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); v_id text := current_setting('stempl.session', true);
begin
  if coalesce(v_id, '') = '' then raise exception 'no_session'; end if;
  update public.sessions set by_name = private.clean_name(p_by) where id = v_id::uuid;
  return jsonb_build_object('by', private.clean_name(p_by));
end $$;

create or replace function public.session_logout(p_slug text, p_code text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; v_id text;
begin
  begin b := public._auth_business(p_slug, p_code); exception when others then return false; end;
  v_id := current_setting('stempl.session', true);
  if coalesce(v_id, '') <> '' then update public.sessions set revoked_at = now() where id = v_id::uuid and revoked_at is null; end if;
  return true;
end $$;

create or replace function public.owner_sessions(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); v_id text := current_setting('stempl.session', true);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'role', s.role, 'by', s.by_name, 'device', s.device,
        'created_at', s.created_at, 'last_used_at', s.last_used_at, 'current', s.id::text = v_id) order by s.last_used_at desc)
      from public.sessions s
     where s.business_id = b.id and s.revoked_at is null and s.last_used_at > now() - interval '30 days'), '[]'::jsonb);
end $$;

create or replace function public.owner_revoke_session(p_slug text, p_code text, p_id uuid default null, p_all_staff boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); n int;
begin
  update public.sessions set revoked_at = now()
   where business_id = b.id and revoked_at is null
     and ((p_id is not null and id = p_id) or (coalesce(p_all_staff, false) and role = 'staff'));
  get diagnostics n = row_count;
  return jsonb_build_object('revoked', n);
end $$;

/* nové kódy odhlásí příslušná zařízení */
create or replace function public.owner_reset_staff_code(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); v text := public._rand_code(8);
begin
  update public.businesses set staff_code_hash = extensions.crypt(v, extensions.gen_salt('bf', 8)) where id = b.id;
  update public.sessions set revoked_at = now() where business_id = b.id and role = 'staff' and revoked_at is null;
  return jsonb_build_object('staff_code', v);
end $$;

create or replace function public.svc_owner_reset_confirm(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare r public.owner_resets; b public.businesses; v_code text := public._rand_code(8);
begin
  select * into r from public.owner_resets where token_hash = public._hash(lower(trim(coalesce(p_token,'')))) for update;
  if not found or r.used_at is not null or r.created_at < now() - interval '2 hours' then raise exception 'bad_token'; end if;
  update public.owner_resets set used_at = now() where token_hash = r.token_hash;
  update public.businesses set code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 8)) where id = r.business_id returning * into b;
  update public.sessions set revoked_at = now() where business_id = b.id and revoked_at is null;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'code', v_code, 'email', b.owner_email);
end $$;

create or replace function public.reset_business_code(p_installer_key text, p_slug text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_code text := public._rand_code(8); b public.businesses;
begin
  perform public._auth_installer(p_installer_key);
  update public.businesses set code_hash = extensions.crypt(v_code, extensions.gen_salt('bf', 8))
    where slug = lower(trim(p_slug)) returning * into b;
  if not found then raise exception 'no_business'; end if;
  update public.sessions set revoked_at = now() where business_id = b.id and revoked_at is null;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'code', v_code);
end $$;

/* jméno obsluhy bere z přihlášeného zařízení, když ho má */
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
  insert into public.events(business_id, card_id, kind, by_name) select b.id, c.id, 'stamp', private.by_name(p_by) from generate_series(1, n);
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
  insert into public.events(business_id, card_id, kind, by_name) values (b.id, c.id, 'redeem', private.by_name(p_by));
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
  if not private.can_import(c) then raise exception 'import_too_late'; end if;
  update public.cards set stamps = stamps + n where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, src, qty, by_name) values (b.id, c.id, 'stamp', 'import', n, private.by_name(p_by));
  return public._card_json(c, b);
end $$;

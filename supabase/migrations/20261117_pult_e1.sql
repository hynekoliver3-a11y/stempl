-- Štempl – režim Pult (17. 11. 2026)
-- Tablet u kasy ukazuje QR s jednorázovým kódem, který platí 45 vteřin. Zákazník ho naskenuje svým telefonem
-- a razítko se připíše na jeho kartu. Každé zařízení (přihlášení) má vždy jen jeden platný kód.

create table if not exists public.pult_codes(
  device_key text primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_card uuid,
  used_name text,
  created_at timestamptz not null default now());
alter table public.pult_codes enable row level security;

create or replace function private.pult_key(b public.businesses) returns text
language sql stable set search_path to '' as $$
  select b.id::text || '|' || coalesce(nullif(current_setting('stempl.session', true), ''), 'code');
$$;

/* tablet si vyzvedne nový kód (předchozí tím přestane platit) */
create or replace function public.pult_issue(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code);
        v text := upper(encode(extensions.gen_random_bytes(10), 'hex')); k text := private.pult_key(b);
begin
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  insert into public.pult_codes(device_key, business_id, code_hash, expires_at, used_at, used_card, used_name, created_at)
    values (k, b.id, public._hash(v), now() + interval '45 seconds', null, null, null, now())
  on conflict (device_key) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
    used_at = null, used_card = null, used_name = null, created_at = now();
  return jsonb_build_object('claim', v, 'expires_at', now() + interval '45 seconds');
end $$;

/* tablet se ptá, jestli už někdo jeho kód použil */
create or replace function public.pult_status(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); r public.pult_codes; c public.cards;
begin
  select * into r from public.pult_codes where device_key = private.pult_key(b);
  if not found or r.used_at is null then return jsonb_build_object('used', false); end if;
  select * into c from public.cards where id = r.used_card;
  return jsonb_build_object('used', true, 'at', r.used_at, 'name', r.used_name,
    'stamps', c.stamps, 'needed', b.stamps_needed, 'reward_ready', c.stamps >= b.stamps_needed, 'token', c.token);
end $$;

/* zákazník svým telefonem: karta + kód z tabletu */
create or replace function public.claim_stamp(p_slug text, p_card text, p_claim text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; c public.cards; r public.pult_codes; v_today int;
begin
  select * into b from public.businesses where slug = lower(trim(coalesce(p_slug, '')));
  if not found then raise exception 'no_business'; end if;
  select * into r from public.pult_codes
   where business_id = b.id and code_hash = public._hash(upper(trim(coalesce(p_claim, '')))) for update;
  if not found then raise exception 'claim_invalid'; end if;
  if r.used_at is not null then raise exception 'claim_used'; end if;
  if r.expires_at < now() then raise exception 'claim_expired'; end if;
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  select * into c from public.cards where token = trim(coalesce(p_card, '')) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if c.last_stamp_at is not null and c.last_stamp_at > now() - interval '30 seconds' then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.events
   where card_id = c.id and kind = 'stamp' and not voided and src is null
     and created_at >= (date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague');
  if v_today + 1 > b.daily_stamp_limit then raise exception 'daily_limit'; end if;
  update public.cards set stamps = stamps + 1, total_stamps = total_stamps + 1, last_stamp_at = now()
    where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, by_name) values (b.id, c.id, 'stamp', 'pult');
  update public.pult_codes set used_at = now(), used_card = c.id, used_name = c.name where device_key = r.device_key;
  return public._card_json(c, b);
end $$;

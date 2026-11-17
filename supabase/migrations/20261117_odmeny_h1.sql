-- Štempl – odměny navíc (17. 11. 2026): malá odměna v půlce karty, narozeninový dárek, Doporuč kamaráda.

alter table public.businesses
  add column if not exists small_at integer check (small_at is null or small_at between 1 and 29),
  add column if not exists small_text text check (small_text is null or char_length(small_text) between 2 and 80),
  add column if not exists birthday_text text check (birthday_text is null or char_length(birthday_text) between 2 and 80),
  add column if not exists referral_on boolean not null default false;

alter table public.cards
  add column if not exists small_used boolean not null default false,
  add column if not exists birth_month smallint check (birth_month is null or birth_month between 1 and 12),
  add column if not exists birthday_year integer,
  add column if not exists birthday_mailed_year integer,
  add column if not exists ref_code text unique default upper(encode(extensions.gen_random_bytes(4), 'hex')),
  add column if not exists referred_by uuid references public.cards(id) on delete set null,
  add column if not exists referral_paid_at timestamptz;

/* razítka navíc za doporučení se nepočítají jako návštěvy */
create or replace function private.is_visit(p_kind text, p_src text) returns boolean
language sql immutable set search_path to '' as $$
  select p_kind = 'stamp' and coalesce(p_src, '') not in ('import', 'adjust', 'welcome', 'referral');
$$;

create or replace function private.prague_month() returns int
language sql stable set search_path to '' as $$ select extract(month from now() at time zone 'Europe/Prague')::int; $$;
create or replace function private.prague_year() returns int
language sql stable set search_path to '' as $$ select extract(year from now() at time zone 'Europe/Prague')::int; $$;

/* nastavení podniku, které vidí i zákazník */
create or replace function private.profile_json(b public.businesses) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object('logo_v', b.logo_v, 'web_url', b.web_url, 'instagram', b.instagram,
    'address', b.address, 'hours', b.hours, 'public_phone', b.public_phone,
    'small_at', case when b.small_at < b.stamps_needed then b.small_at end, 'small_text', b.small_text,
    'birthday_text', b.birthday_text, 'referral_on', b.referral_on);
$$;

create or replace function public._card_json(c public.cards, b public.businesses) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'token', c.token, 'name', c.name, 'stamps', c.stamps, 'total_stamps', c.total_stamps,
    'rewards_redeemed', c.rewards_redeemed, 'last_stamp_at', c.last_stamp_at, 'created_at', c.created_at,
    'reward_ready', c.stamps >= b.stamps_needed, 'has_email', c.email is not null,
    'marketing', c.marketing_consent_at is not null and c.email is not null,
    'can_import', private.can_import(c),
    'small_ready', b.small_at is not null and b.small_at < b.stamps_needed and b.small_text is not null
                   and not c.small_used and c.stamps >= b.small_at and c.stamps < b.stamps_needed,
    'small_used', c.small_used,
    'birth_month', c.birth_month,
    'birthday_ready', b.birthday_text is not null and c.birth_month = private.prague_month()
                      and c.birthday_year is distinct from private.prague_year(),
    'ref_code', c.ref_code,
    'referrals', (select count(*) from public.cards f where f.referred_by = c.id and f.referral_paid_at is not null),
    'business', jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
       'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
       'daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text,
       'active', public._has_access(b)) || private.profile_json(b));
$$;

/* po první skutečné návštěvě doporučeného zákazníka dostanou oba razítko navíc (doporučující nejvýš 5 za měsíc) */
create or replace function private.referral_bonus(p_card uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare c public.cards; r public.cards; b public.businesses;
begin
  select * into c from public.cards where id = p_card;
  if c.referred_by is null or c.referral_paid_at is not null then return; end if;
  select * into b from public.businesses where id = c.business_id;
  if not b.referral_on then return; end if;
  select * into r from public.cards where id = c.referred_by and business_id = c.business_id for update;
  if not found then return; end if;
  update public.cards set referral_paid_at = now(), stamps = stamps + 1 where id = c.id;
  insert into public.events(business_id, card_id, kind, src, by_name) values (b.id, c.id, 'stamp', 'referral', 'doporučení');
  if (select count(*) from public.events where card_id = r.id and src = 'referral'
        and created_at >= date_trunc('month', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague') < 5 then
    update public.cards set stamps = stamps + 1 where id = r.id;
    insert into public.events(business_id, card_id, kind, src, by_name) values (b.id, r.id, 'stamp', 'referral', 'doporučení');
  end if;
end $$;

/* společné přidání návštěvy (obsluha, Pult i QR na pultu) */
create or replace function private.add_visit(b public.businesses, p_token text, n int, p_by text) returns public.cards
language plpgsql security definer set search_path to '' as $$
declare c public.cards; v_today int;
begin
  if n < 1 or n > 5 then raise exception 'bad_count'; end if;
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  select * into c from public.cards where token = trim(coalesce(p_token, '')) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if c.last_stamp_at is not null and c.last_stamp_at > now() - interval '30 seconds' then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.events
   where card_id = c.id and kind = 'stamp' and not voided and src is null
     and created_at >= (date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague');
  if v_today + n > b.daily_stamp_limit then raise exception 'daily_limit'; end if;
  update public.cards set stamps = stamps + n, total_stamps = total_stamps + n, last_stamp_at = now()
    where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, by_name) select b.id, c.id, 'stamp', p_by from generate_series(1, n);
  if c.referred_by is not null and c.referral_paid_at is null then
    perform private.referral_bonus(c.id);
    select * into c from public.cards where id = c.id;
  end if;
  return c;
end $$;

create or replace function public.stamp_card_v2(p_slug text, p_code text, p_token text, p_count integer default 1, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  c := private.add_visit(b, p_token, coalesce(p_count, 1), private.by_name(p_by));
  return public._card_json(c, b);
end $$;

create or replace function public.stamp_card(p_slug text, p_code text, p_token text, p_count integer default 1) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  c := private.add_visit(b, p_token, coalesce(p_count, 1), private.by_name(null));
  return public._card_json(c, b);
end $$;

create or replace function public.claim_stamp(p_slug text, p_card text, p_claim text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses; c public.cards; r public.pult_codes;
begin
  select * into b from public.businesses where slug = lower(trim(coalesce(p_slug, '')));
  if not found then raise exception 'no_business'; end if;
  select * into r from public.pult_codes
   where business_id = b.id and code_hash = public._hash(upper(trim(coalesce(p_claim, '')))) for update;
  if not found then raise exception 'claim_invalid'; end if;
  if r.used_at is not null then raise exception 'claim_used'; end if;
  if r.expires_at < now() then raise exception 'claim_expired'; end if;
  c := private.add_visit(b, p_card, 1, 'pult');
  update public.pult_codes set used_at = now(), used_card = c.id, used_name = c.name where device_key = r.device_key;
  return public._card_json(c, b);
end $$;

/* hlavní odměna znovu otevře malou odměnu pro další kolo */
create or replace function public.redeem_reward_v2(p_slug text, p_code text, p_token text, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if c.stamps < b.stamps_needed then raise exception 'not_enough'; end if;
  update public.cards set stamps = stamps - b.stamps_needed, rewards_redeemed = rewards_redeemed + 1, small_used = false
    where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, by_name) values (b.id, c.id, 'redeem', private.by_name(p_by));
  return public._card_json(c, b);
end $$;

create or replace function public.redeem_reward(p_slug text, p_code text, p_token text) returns jsonb
language sql security definer set search_path to '' as $$
  select public.redeem_reward_v2(p_slug, p_code, p_token, null);
$$;

/* malá odměna: jednou za kolo, razítka zůstávají */
create or replace function public.redeem_small(p_slug text, p_code text, p_token text, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if b.small_at is null or b.small_text is null or b.small_at >= b.stamps_needed then raise exception 'no_small_reward'; end if;
  if c.small_used then raise exception 'small_used'; end if;
  if c.stamps < b.small_at then raise exception 'not_enough'; end if;
  update public.cards set small_used = true where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, src, by_name) values (b.id, c.id, 'redeem', 'small', private.by_name(p_by));
  return public._card_json(c, b);
end $$;

/* narozeninový dárek: jednou za rok v měsíci narozenin */
create or replace function public.redeem_birthday(p_slug text, p_code text, p_token text, p_by text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_business(p_slug, p_code); c public.cards;
begin
  select * into c from public.cards where token = trim(p_token) for update;
  if not found then raise exception 'no_card'; end if;
  if c.business_id <> b.id then raise exception 'wrong_business'; end if;
  if b.birthday_text is null then raise exception 'no_birthday_gift'; end if;
  if c.birth_month is distinct from private.prague_month() then raise exception 'not_birthday'; end if;
  if c.birthday_year = private.prague_year() then raise exception 'birthday_used'; end if;
  update public.cards set birthday_year = private.prague_year() where id = c.id returning * into c;
  insert into public.events(business_id, card_id, kind, src, by_name) values (b.id, c.id, 'redeem', 'birthday', private.by_name(p_by));
  return public._card_json(c, b);
end $$;

/* zákazník si zadá měsíc narozenin (změna nejdřív za 60 dní od založení karty jde vždy, jinak nejvýš jednou za rok) */
create or replace function public.set_card_birth_month(p_token text, p_month integer) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.cards; b public.businesses;
begin
  if p_month is not null and (p_month < 1 or p_month > 12) then raise exception 'bad_month'; end if;
  select * into c from public.cards where token = trim(coalesce(p_token, '')) for update;
  if not found then raise exception 'no_card'; end if;
  if c.birth_month is not null and c.birth_month is distinct from p_month and c.birthday_year = private.prague_year() then
    raise exception 'birthday_locked';
  end if;
  update public.cards set birth_month = p_month where id = c.id returning * into c;
  select * into b from public.businesses where id = c.business_id;
  return public._card_json(c, b);
end $$;

/* nová karta přes odkaz od kamaráda */
create or replace function public.join_card_v3(p_slug text, p_name text default null, p_email text default null, p_consent boolean default false,
  p_marketing boolean default false, p_ref text default null) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare j jsonb; c public.cards; b public.businesses; r public.cards;
begin
  j := public.join_card_v2(p_slug, p_name, p_email, p_consent, p_marketing);
  if nullif(trim(coalesce(p_ref, '')), '') is not null then
    select * into c from public.cards where token = j->>'token';
    select * into b from public.businesses where id = c.business_id;
    select * into r from public.cards where ref_code = upper(trim(p_ref)) and business_id = c.business_id and id <> c.id;
    if found and b.referral_on then
      update public.cards set referred_by = r.id where id = c.id returning * into c;
      j := public._card_json(c, b) || jsonb_build_object('referred', true);
    end if;
  end if;
  return j;
end $$;

/* majitel: odměny navíc */
create or replace function public.owner_set_extras(p_slug text, p_code text, p_small_at integer, p_small_text text, p_birthday_text text, p_referral boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
        v_st text := nullif(trim(coalesce(p_small_text, '')), ''); v_bt text := nullif(trim(coalesce(p_birthday_text, '')), '');
begin
  if (p_small_at is null) <> (v_st is null) then raise exception 'small_incomplete'; end if;
  if p_small_at is not null and (p_small_at < 1 or p_small_at >= b.stamps_needed) then raise exception 'bad_small_at'; end if;
  if v_st is not null and char_length(v_st) > 80 then raise exception 'bad_small_text'; end if;
  if v_bt is not null and char_length(v_bt) > 80 then raise exception 'bad_birthday_text'; end if;
  update public.businesses set small_at = p_small_at, small_text = v_st, birthday_text = v_bt, referral_on = coalesce(p_referral, false)
   where id = b.id returning * into b;
  return private.profile_json(b);
end $$;

/* denní úloha: narozeninový e-mail na začátku měsíce narozenin (jen se souhlasem s novinkami, jednou za rok) */
create or replace function public.svc_birthday_jobs() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v jsonb;
begin
  if not private.is_service() then raise exception 'forbidden'; end if;
  with pick as (
    select c.id from public.cards c join public.businesses b on b.id = c.business_id
     where b.birthday_text is not null and public._has_access(b)
       and c.marketing_consent_at is not null and c.email is not null
       and c.birth_month = private.prague_month()
       and c.birthday_mailed_year is distinct from private.prague_year()
       and c.birthday_year is distinct from private.prague_year()
     limit 300),
  upd as (update public.cards c set birthday_mailed_year = private.prague_year() from pick where c.id = pick.id
          returning c.email, c.name, c.token, c.unsub_token, c.business_id)
  select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', u.name, 'token', u.token, 'unsub', u.unsub_token,
           'business', b.name, 'gift', b.birthday_text, 'reply_to', b.owner_email)), '[]'::jsonb)
    into v from upd u join public.businesses b on b.id = u.business_id;
  return v;
end $$;

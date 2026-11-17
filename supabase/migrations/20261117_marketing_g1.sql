-- Štempl – marketingový souhlas, připomínky a zprávy zákazníkům (17. 11. 2026)
-- Zákazník může zvlášť (vedle souhlasu s uložením e-mailu) souhlasit s novinkami a připomínkami.
-- Majitel si zapne připomínky (Chybí vám 1 razítko / Dlouho jsme vás neviděli) a může poslat nejvýš 2 zprávy měsíčně.
-- Posílá je denní úloha; každý e-mail má odkaz na odhlášení. Bez souhlasu nic neodejde.

alter table public.cards
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists unsub_token text unique default encode(extensions.gen_random_bytes(12), 'hex'),
  add column if not exists last_reminder_at timestamptz;

alter table public.businesses add column if not exists reminders_on boolean not null default false;

create table if not exists public.broadcasts(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 80),
  body text not null check (char_length(body) between 10 and 1000),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent')),
  recipients int,
  created_at timestamptz not null default now(),
  sent_at timestamptz);
create index if not exists broadcasts_business_idx on public.broadcasts(business_id, created_at);
alter table public.broadcasts enable row level security;

/* karta: má marketingový souhlas? */
create or replace function public._card_json(c public.cards, b public.businesses) returns jsonb
language sql stable set search_path to '' as $$
  select jsonb_build_object(
    'token', c.token, 'name', c.name, 'stamps', c.stamps, 'total_stamps', c.total_stamps,
    'rewards_redeemed', c.rewards_redeemed, 'last_stamp_at', c.last_stamp_at, 'created_at', c.created_at,
    'reward_ready', c.stamps >= b.stamps_needed, 'has_email', c.email is not null,
    'marketing', c.marketing_consent_at is not null and c.email is not null,
    'can_import', private.can_import(c),
    'business', jsonb_build_object('slug', b.slug, 'name', b.name, 'category', b.category, 'reward_text', b.reward_text,
       'stamps_needed', b.stamps_needed, 'google_review_url', b.google_review_url, 'accent', b.accent,
       'daily_stamp_limit', b.daily_stamp_limit, 'welcome_stamp', b.welcome_stamp, 'rules_text', b.rules_text,
       'active', public._has_access(b)) || private.profile_json(b));
$$;

/* zákazník si sám zapne nebo vypne novinky a připomínky (jen s uloženým e-mailem) */
create or replace function public.set_card_marketing(p_token text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.cards; b public.businesses;
begin
  select * into c from public.cards where token = trim(coalesce(p_token, '')) for update;
  if not found then raise exception 'no_card'; end if;
  if coalesce(p_on, false) and (c.email is null or c.consent_at is null) then raise exception 'no_email'; end if;
  update public.cards set marketing_consent_at = case when coalesce(p_on, false) then now() end where id = c.id returning * into c;
  select * into b from public.businesses where id = c.business_id;
  return public._card_json(c, b);
end $$;

/* odkaz na odhlášení z e-mailu */
create or replace function public.marketing_unsubscribe(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c public.cards; b public.businesses;
begin
  update public.cards set marketing_consent_at = null where unsub_token = lower(trim(coalesce(p_token, ''))) returning * into c;
  if not found then raise exception 'bad_token'; end if;
  select * into b from public.businesses where id = c.business_id;
  return jsonb_build_object('business', b.name, 'slug', b.slug);
end $$;

/* majitel: zapnout připomínky */
create or replace function public.owner_set_reminders(p_slug text, p_code text, p_on boolean) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
begin
  update public.businesses set reminders_on = coalesce(p_on, false) where id = b.id;
  return jsonb_build_object('reminders_on', coalesce(p_on, false));
end $$;

/* majitel: přehled zpráv a kolik lidí je dostane */
create or replace function public.owner_marketing(p_slug text, p_code text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code);
begin
  return jsonb_build_object(
    'reminders_on', b.reminders_on,
    'audience', (select count(*) from public.cards where business_id = b.id and marketing_consent_at is not null and email is not null),
    'month_used', (select count(*) from public.broadcasts where business_id = b.id
                    and created_at >= date_trunc('month', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague'),
    'month_limit', 2,
    'list', coalesce((select jsonb_agg(jsonb_build_object('subject', subject, 'body', body, 'status', status, 'recipients', recipients, 'created_at', created_at, 'sent_at', sent_at) order by created_at desc)
              from (select * from public.broadcasts where business_id = b.id order by created_at desc limit 12) x), '[]'::jsonb));
end $$;

/* majitel: zařadit zprávu k odeslání (nejvýš 2 za kalendářní měsíc) */
create or replace function public.owner_broadcast(p_slug text, p_code text, p_subject text, p_body text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare b public.businesses := public._auth_owner(p_slug, p_code); v_s text := trim(coalesce(p_subject, '')); v_b text := trim(coalesce(p_body, ''));
begin
  if not public._has_access(b) then raise exception 'subscription_inactive'; end if;
  if char_length(v_s) not between 3 and 80 then raise exception 'bad_subject'; end if;
  if char_length(v_b) not between 10 and 1000 then raise exception 'bad_body'; end if;
  if (select count(*) from public.broadcasts where business_id = b.id
        and created_at >= date_trunc('month', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague') >= 2 then
    raise exception 'month_limit';
  end if;
  insert into public.broadcasts(business_id, subject, body) values (b.id, v_s, v_b);
  return public.owner_marketing(p_slug, p_code);
end $$;

/* denní úloha: připomínky a zprávy k odeslání (jen pro službu) */
create or replace function public.svc_marketing_jobs() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare v_rem jsonb; v_bc jsonb;
begin
  if not private.is_service() then raise exception 'forbidden'; end if;
  /* připomínky: nejvýš jedna za 30 dní na kartu, nejvýš 300 za běh */
  with pick as (
    select c.id, case when c.stamps = b.stamps_needed - 1 then 'almost' else 'miss' end kind
      from public.cards c join public.businesses b on b.id = c.business_id
     where b.reminders_on and public._has_access(b)
       and c.marketing_consent_at is not null and c.email is not null
       and (c.last_reminder_at is null or c.last_reminder_at < now() - interval '30 days')
       and ((c.stamps = b.stamps_needed - 1 and c.last_stamp_at < now() - interval '5 days')
            or (c.total_stamps >= 2 and coalesce(c.last_stamp_at, c.created_at) between now() - interval '60 days' and now() - interval '30 days'))
     order by c.last_stamp_at nulls first limit 300),
  upd as (
    update public.cards c set last_reminder_at = now() from pick where c.id = pick.id
    returning c.id, c.email, c.name, c.token, c.unsub_token, c.stamps, c.business_id, pick.kind)
  select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'name', u.name, 'kind', u.kind, 'token', u.token, 'unsub', u.unsub_token,
           'stamps', u.stamps, 'needed', b.stamps_needed, 'reward', b.reward_text, 'business', b.name, 'reply_to', b.owner_email)), '[]'::jsonb)
    into v_rem from upd u join public.businesses b on b.id = u.business_id;

  /* zprávy zařazené k odeslání */
  with q as (
    update public.broadcasts set status = 'sending' where status = 'queued' and created_at < now() - interval '1 minute'
    returning id, business_id, subject, body)
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'subject', q.subject, 'body', q.body, 'business', b.name, 'reply_to', b.owner_email,
           'recipients', (select coalesce(jsonb_agg(jsonb_build_object('email', c.email, 'name', c.name, 'token', c.token, 'unsub', c.unsub_token)), '[]'::jsonb)
                            from public.cards c where c.business_id = q.business_id and c.marketing_consent_at is not null and c.email is not null))), '[]'::jsonb)
    into v_bc from q join public.businesses b on b.id = q.business_id;
  return jsonb_build_object('reminders', v_rem, 'broadcasts', v_bc);
end $$;

create or replace function public.svc_broadcast_done(p_id uuid, p_count int) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_service() then raise exception 'forbidden'; end if;
  update public.broadcasts set status = 'sent', sent_at = now(), recipients = p_count where id = p_id;
end $$;

/* nová karta může rovnou souhlasit s novinkami */
create or replace function public.join_card_v2(p_slug text, p_name text default null, p_email text default null, p_consent boolean default false, p_marketing boolean default false) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare j jsonb; c public.cards; b public.businesses;
begin
  j := public.join_card(p_slug, p_name, p_email, p_consent);
  if coalesce(p_marketing, false) and nullif(trim(coalesce(p_email, '')), '') is not null then
    update public.cards set marketing_consent_at = now() where token = j->>'token' returning * into c;
    select * into b from public.businesses where id = c.business_id;
    j := public._card_json(c, b);
  end if;
  return j;
end $$;

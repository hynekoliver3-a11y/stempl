-- Registration: optional Google review link and the recommended settings for the chosen kind of business
-- (stamp limit per day, small reward halfway, birthday gift, recommend a friend), saved when the e-mail is confirmed.

create or replace function public.svc_register_pending(p_email text, p_payload jsonb, p_ip text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_email text := lower(trim(coalesce(p_email,''))); v_slug text := lower(trim(coalesce(p_payload->>'slug','')));
        v_token text := public._token(); v_needed int; v_url text := nullif(trim(coalesce(p_payload->>'review_url','')), '');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 120 then raise exception 'bad_email'; end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'bad_slug'; end if;
  if char_length(trim(coalesce(p_payload->>'name',''))) not between 2 and 80 then raise exception 'bad_name'; end if;
  if char_length(trim(coalesce(p_payload->>'reward',''))) not between 2 and 80 then raise exception 'bad_reward'; end if;
  v_needed := coalesce((p_payload->>'needed')::int, 10);
  if v_needed not between 3 and 30 then raise exception 'bad_needed'; end if;
  if v_url is not null and (char_length(v_url) > 300 or v_url !~ '^https://((www\.|maps\.|search\.)?google\.(com|cz|sk)|g\.page|g\.co|maps\.app\.goo\.gl|goo\.gl)/\S+$') then
    raise exception 'bad_review_url';
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then raise exception 'slug_taken'; end if;
  if (select count(*) from public.registrations where email = v_email and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.registrations where ip = p_ip and p_ip is not null and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.registrations where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited';
  end if;
  insert into public.registrations(token_hash, email, payload, ip) values (public._hash(v_token), v_email, p_payload, p_ip);
  return jsonb_build_object('token', v_token, 'email', v_email, 'name', trim(p_payload->>'name'));
end $function$;

create or replace function public.svc_confirm_registration(p_token text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare r public.registrations; v_code text := public._rand_code(8); v_staff text := public._rand_code(8); b public.businesses; p jsonb;
        v_needed int; v_url text; v_limit int; v_small_at int; v_small text; v_bday text;
begin
  select * into r from public.registrations where token_hash = public._hash(lower(trim(coalesce(p_token,'')))) for update;
  if not found then raise exception 'bad_token'; end if;
  if r.confirmed_at is not null then raise exception 'already_confirmed'; end if;
  if r.created_at < now() - interval '72 hours' then raise exception 'expired'; end if;
  p := r.payload;
  if exists (select 1 from public.businesses where slug = lower(trim(p->>'slug'))) then raise exception 'slug_taken'; end if;
  v_needed := coalesce((p->>'needed')::int, 10);
  -- optional extras: anything out of range is dropped instead of failing the confirmation
  v_url := nullif(trim(coalesce(p->>'review_url','')), '');
  if v_url is not null and (char_length(v_url) > 300 or v_url !~ '^https://((www\.|maps\.|search\.)?google\.(com|cz|sk)|g\.page|g\.co|maps\.app\.goo\.gl|goo\.gl)/\S+$') then v_url := null; end if;
  v_limit := case when (p->>'limit') ~ '^[0-9]{1,2}$' and (p->>'limit')::int between 1 and 20 then (p->>'limit')::int else 2 end;
  v_small := nullif(trim(coalesce(p->>'small_text','')), '');
  v_small_at := case when (p->>'small_at') ~ '^[0-9]{1,2}$' then (p->>'small_at')::int end;
  if v_small is null or char_length(v_small) not between 2 and 80 or v_small_at is null or v_small_at < 1 or v_small_at >= v_needed then
    v_small := null; v_small_at := null;
  end if;
  v_bday := nullif(trim(coalesce(p->>'birthday_text','')), '');
  if v_bday is not null and char_length(v_bday) not between 2 and 80 then v_bday := null; end if;
  insert into public.businesses(slug, name, category, reward_text, stamps_needed, accent, code_hash, staff_code_hash, owner_email, phone, trial_ends_at, terms_accepted_at, terms_version,
                                google_review_url, daily_stamp_limit, small_at, small_text, birthday_text, referral_on)
    values (lower(trim(p->>'slug')), trim(p->>'name'), coalesce(nullif(trim(p->>'category'),''), 'kavarna'), trim(p->>'reward'),
            v_needed, coalesce(nullif(p->>'accent',''), '#c2410c'),
            extensions.crypt(v_code, extensions.gen_salt('bf', 8)), extensions.crypt(v_staff, extensions.gen_salt('bf', 8)),
            r.email, nullif(trim(coalesce(p->>'phone','')), ''), now() + interval '30 days',
            coalesce((p->>'terms_accepted_at')::timestamptz, r.created_at), p->>'terms_version',
            v_url, v_limit, v_small_at, v_small, v_bday, coalesce(p->>'referral_on','') = 'true')
    returning * into b;
  update public.registrations set confirmed_at = now(), business_id = b.id where id = r.id;
  return jsonb_build_object('slug', b.slug, 'name', b.name, 'code', v_code, 'staff_code', v_staff, 'email', r.email, 'trial_ends_at', b.trial_ends_at);
end $function$;

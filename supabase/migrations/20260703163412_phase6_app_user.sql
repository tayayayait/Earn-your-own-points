ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS point_earn_notify BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS point_expiry_notify BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles (status);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _marketing_opt_in BOOLEAN := false;
BEGIN
  _marketing_opt_in := lower(COALESCE(NEW.raw_user_meta_data->>'marketing_opt_in', 'false')) = 'true';

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    marketing_opt_in,
    point_earn_notify,
    point_expiry_notify
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    _marketing_opt_in,
    true,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    marketing_opt_in = EXCLUDED.marketing_opt_in;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_home()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
  _available INTEGER := 0;
  _pending INTEGER := 0;
  _total INTEGER := 0;
  _expiring_soon INTEGER := 0;
  _profile JSONB := '{}'::jsonb;
  _brand JSONB := '{}'::jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT available, pending, total
  INTO _available, _pending, _total
  FROM public.get_balance(_user_id);

  SELECT COALESCE(SUM(amount), 0)::INTEGER
  INTO _expiring_soon
  FROM public.point_transactions
  WHERE user_id = _user_id
    AND status::text IN ('completed', 'confirmed')
    AND type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
    AND expires_at >= now()
    AND expires_at < now() + INTERVAL '30 days';

  SELECT jsonb_build_object(
    'full_name', p.full_name,
    'email', p.email,
    'tier_name', COALESCE(t.name, '기본')
  )
  INTO _profile
  FROM public.profiles p
  LEFT JOIN public.customer_tiers t ON t.id = p.tier_id
  WHERE p.id = _user_id;

  SELECT jsonb_build_object(
    'point_label', COALESCE(point_label, 'P'),
    'home_message', COALESCE(home_message, ''),
    'primary_color', primary_color
  )
  INTO _brand
  FROM public.brand_settings
  ORDER BY updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile', COALESCE(_profile, '{}'::jsonb),
    'brand', COALESCE(_brand, jsonb_build_object('point_label', 'P', 'home_message', '', 'primary_color', '#2563EB')),
    'balance', jsonb_build_object(
      'available', _available,
      'pending', _pending,
      'total', _total,
      'expiring_soon', _expiring_soon
    ),
    'pending_earnings', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'title', COALESCE(memo, '적립 예정'),
          'amount', amount,
          'confirm_at', COALESCE(policy_snapshot->>'confirm_at', created_at::TEXT)
        ) AS item
        FROM public.point_transactions
        WHERE user_id = _user_id
          AND status::text = 'pending'
          AND type::text IN ('earn', 'event_earn', 'manual_earn')
        ORDER BY created_at DESC
        LIMIT 3
      ) pending_rows
    ), '[]'::jsonb),
    'expiring_points', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'amount', amount,
          'expires_at', expires_at
        ) AS item
        FROM public.point_transactions
        WHERE user_id = _user_id
          AND status::text IN ('completed', 'confirmed')
          AND type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
          AND expires_at >= now()
          AND expires_at < now() + INTERVAL '30 days'
        ORDER BY expires_at ASC
        LIMIT 3
      ) expiring_rows
    ), '[]'::jsonb),
    'recent_transactions', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'type', type::TEXT,
          'status', status::TEXT,
          'title', COALESCE(memo, type::TEXT),
          'amount', amount,
          'balance_after', balance_after,
          'created_at', created_at
        ) AS item
        FROM public.point_transactions
        WHERE user_id = _user_id
        ORDER BY created_at DESC
        LIMIT 5
      ) recent_rows
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'name', name,
          'description', COALESCE(description, ''),
          'reward_type', reward_type,
          'reward_value', reward_value,
          'ends_at', ends_at
        ) AS item
        FROM public.point_events
        WHERE status::text IN ('scheduled', 'active')
          AND starts_at <= now()
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY priority ASC, starts_at DESC
        LIMIT 2
      ) event_rows
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_transactions(
  _date_from TIMESTAMPTZ DEFAULT NULL,
  _date_to TIMESTAMPTZ DEFAULT NULL,
  _type TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  RETURN jsonb_build_object(
    'transactions',
    COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'type', type::TEXT,
          'status', status::TEXT,
          'title', COALESCE(memo, external_transaction_id, type::TEXT),
          'amount', amount,
          'balance_after', balance_after,
          'created_at', created_at
        ) AS item
        FROM public.point_transactions
        WHERE user_id = _user_id
          AND (_date_from IS NULL OR created_at >= _date_from)
          AND (_date_to IS NULL OR created_at <= _date_to)
          AND (
            _type IS NULL
            OR (_type = 'earn' AND type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel'))
            OR (_type = 'use' AND type::text IN ('redeem', 'use', 'manual_deduct'))
            OR (_type = 'expire' AND type::text = 'expire')
            OR (_type = 'cancel' AND type::text IN ('cancel', 'earn_cancel'))
          )
          AND (
            _status IS NULL
            OR (_status = 'pending' AND status::text = 'pending')
            OR (_status = 'confirmed' AND status::text IN ('completed', 'confirmed'))
            OR (_status = 'cancelled' AND status::text IN ('cancelled', 'canceled'))
          )
        ORDER BY created_at DESC
      ) transaction_rows
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_benefits()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
  _current_tier public.customer_tiers%ROWTYPE;
  _next_tier public.customer_tiers%ROWTYPE;
  _period_months INTEGER := 12;
  _current_spend INTEGER := 0;
  _current_purchase_count INTEGER := 0;
  _required_spend INTEGER := 0;
  _required_purchase_count INTEGER := 0;
  _spend_rate NUMERIC := 100;
  _count_rate NUMERIC := 100;
  _progress_rate INTEGER := 100;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT t.*
  INTO _current_tier
  FROM public.profiles p
  LEFT JOIN public.customer_tiers t ON t.id = p.tier_id
  WHERE p.id = _user_id;

  IF _current_tier.id IS NULL THEN
    SELECT *
    INTO _current_tier
    FROM public.customer_tiers
    WHERE status::text = 'active'
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  IF _current_tier.id IS NOT NULL THEN
    SELECT *
    INTO _next_tier
    FROM public.customer_tiers
    WHERE status::text = 'active'
      AND sort_order > _current_tier.sort_order
    ORDER BY sort_order ASC
    LIMIT 1;
  END IF;

  IF _next_tier.id IS NOT NULL THEN
    _period_months := COALESCE(_next_tier.qualification_months, 12);

    SELECT
      COALESCE(SUM(amount), 0)::INTEGER,
      COUNT(*)::INTEGER
    INTO _current_spend, _current_purchase_count
    FROM public.point_transactions
    WHERE user_id = _user_id
      AND status::text IN ('completed', 'confirmed')
      AND type::text IN ('earn', 'event_earn', 'manual_earn')
      AND created_at >= now() - make_interval(months => _period_months);

    _required_spend := GREATEST(_next_tier.min_spend - _current_spend, 0);
    _required_purchase_count := GREATEST(_next_tier.min_purchase_count - _current_purchase_count, 0);
    _spend_rate := CASE
      WHEN _next_tier.min_spend <= 0 THEN 100
      ELSE (_current_spend::NUMERIC / _next_tier.min_spend::NUMERIC) * 100
    END;
    _count_rate := CASE
      WHEN _next_tier.min_purchase_count <= 0 THEN 100
      ELSE (_current_purchase_count::NUMERIC / _next_tier.min_purchase_count::NUMERIC) * 100
    END;
    _progress_rate := LEAST(100, FLOOR(LEAST(_spend_rate, _count_rate)))::INTEGER;
  END IF;

  RETURN jsonb_build_object(
    'current_tier', CASE
      WHEN _current_tier.id IS NULL THEN jsonb_build_object(
        'id', '',
        'name', '기본',
        'base_earn_rate', 0,
        'bonus_earn_rate', 0
      )
      ELSE jsonb_build_object(
        'id', _current_tier.id,
        'name', _current_tier.name,
        'base_earn_rate', _current_tier.base_earn_rate,
        'bonus_earn_rate', _current_tier.bonus_earn_rate
      )
    END,
    'next_tier', CASE
      WHEN _next_tier.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', _next_tier.id,
        'name', _next_tier.name,
        'min_spend', _next_tier.min_spend,
        'min_purchase_count', _next_tier.min_purchase_count
      )
    END,
    'progress', jsonb_build_object(
      'current_spend', _current_spend,
      'current_purchase_count', _current_purchase_count,
      'required_spend', _required_spend,
      'required_purchase_count', _required_purchase_count,
      'progress_rate', _progress_rate
    ),
    'tiers', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'name', name,
          'base_earn_rate', base_earn_rate,
          'bonus_earn_rate', bonus_earn_rate,
          'min_spend', min_spend,
          'min_purchase_count', min_purchase_count
        ) AS item
        FROM public.customer_tiers
        WHERE status::text = 'active'
        ORDER BY sort_order ASC
      ) tier_rows
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(item)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'name', name,
          'description', COALESCE(description, ''),
          'reward_type', reward_type,
          'reward_value', reward_value,
          'ends_at', ends_at
        ) AS item
        FROM public.point_events
        WHERE status::text IN ('scheduled', 'active')
          AND starts_at <= now()
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY priority ASC, starts_at DESC
      ) event_rows
    ), '[]'::jsonb),
    'redeem_policy', COALESCE((
      SELECT jsonb_build_object(
        'min_redeem_points', min_redeem_points,
        'max_redeem_ratio', max_redeem_ratio
      )
      FROM public.point_policies
      WHERE status::text IN ('scheduled', 'active')
      ORDER BY starts_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    ), jsonb_build_object('min_redeem_points', 0, 'max_redeem_ratio', 100))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_app_profile()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
  _available INTEGER := 0;
  _pending INTEGER := 0;
  _total INTEGER := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT available, pending, total
  INTO _available, _pending, _total
  FROM public.get_balance(_user_id);

  RETURN (
    SELECT jsonb_build_object(
      'profile', jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'phone', p.phone,
        'marketing_opt_in', p.marketing_opt_in,
        'point_earn_notify', p.point_earn_notify,
        'point_expiry_notify', p.point_expiry_notify,
        'status', p.status::TEXT,
        'withdrawal_requested_at', p.withdrawal_requested_at
      ),
      'balance', jsonb_build_object(
        'available', _available,
        'pending', _pending,
        'total', _total
      )
    )
    FROM public.profiles p
    WHERE p.id = _user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_app_profile(
  _full_name TEXT,
  _phone TEXT,
  _email TEXT,
  _point_earn_notify BOOLEAN,
  _point_expiry_notify BOOLEAN,
  _marketing_opt_in BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
  _phone_digits TEXT := regexp_replace(COALESCE(_phone, ''), '[^0-9]', '', 'g');
  _before JSONB;
  _after JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF length(trim(COALESCE(_full_name, ''))) < 2 OR length(trim(COALESCE(_full_name, ''))) > 30 THEN
    RAISE EXCEPTION 'invalid full name';
  END IF;

  IF position('@' in COALESCE(_email, '')) < 2 THEN
    RAISE EXCEPTION 'invalid email';
  END IF;

  IF length(_phone_digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'invalid phone';
  END IF;

  SELECT to_jsonb(p)
  INTO _before
  FROM public.profiles p
  WHERE p.id = _user_id;

  UPDATE public.profiles
  SET
    full_name = trim(_full_name),
    phone = _phone,
    email = lower(trim(_email)),
    point_earn_notify = COALESCE(_point_earn_notify, true),
    point_expiry_notify = COALESCE(_point_expiry_notify, true),
    marketing_opt_in = COALESCE(_marketing_opt_in, false)
  WHERE id = _user_id;

  SELECT to_jsonb(p)
  INTO _after
  FROM public.profiles p
  WHERE p.id = _user_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    reason
  )
  VALUES (
    _user_id,
    'user.profile.update',
    'profiles',
    _user_id::TEXT,
    _before,
    _after,
    'customer profile self update'
  );

  RETURN jsonb_build_object('profile', _after);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_app_withdrawal(_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := (select auth.uid());
  _before JSONB;
  _after JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT to_jsonb(p)
  INTO _before
  FROM public.profiles p
  WHERE p.id = _user_id;

  UPDATE public.profiles
  SET
    status = 'withdrawn',
    withdrawal_requested_at = now()
  WHERE id = _user_id;

  SELECT to_jsonb(p)
  INTO _after
  FROM public.profiles p
  WHERE p.id = _user_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    reason
  )
  VALUES (
    _user_id,
    'user.withdrawal.request',
    'profiles',
    _user_id::TEXT,
    _before,
    _after,
    COALESCE(NULLIF(trim(_reason), ''), 'customer withdrawal request')
  );

  RETURN jsonb_build_object('profile', _after);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_app_home() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_app_transactions(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_app_benefits() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_app_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_app_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_app_withdrawal(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_app_home() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_transactions(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_benefits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_app_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_app_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_app_withdrawal(TEXT) TO authenticated;

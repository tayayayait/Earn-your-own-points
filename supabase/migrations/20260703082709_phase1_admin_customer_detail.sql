CREATE TABLE IF NOT EXISTS public.admin_customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_customer_notes_body_length CHECK (char_length(trim(body)) >= 1)
);

CREATE INDEX IF NOT EXISTS admin_customer_notes_user_created_at_idx
  ON public.admin_customer_notes (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.admin_customer_notes TO authenticated;
GRANT ALL ON public.admin_customer_notes TO service_role;

ALTER TABLE public.admin_customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_customer_notes admin manage" ON public.admin_customer_notes;
CREATE POLICY "admin_customer_notes admin manage" ON public.admin_customer_notes
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.get_admin_customer_detail(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin customer detail requires admin role' USING ERRCODE = '42501';
  END IF;

  WITH
  customer AS (
    SELECT
      p.*,
      ct.name AS tier_name
    FROM public.profiles p
    LEFT JOIN public.customer_tiers ct ON ct.id = p.tier_id
    WHERE p.id = _user_id
  ),
  tx AS (
    SELECT
      pt.*,
      pt.type::text AS type_text,
      pt.status::text AS status_text,
      CASE
        WHEN pt.type::text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel') THEN pt.amount
        WHEN pt.type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel') THEN -pt.amount
        WHEN pt.type::text = 'adjust' THEN pt.amount
        ELSE 0
      END AS signed_amount
    FROM public.point_transactions pt
    WHERE pt.user_id = _user_id
  ),
  summary AS (
    SELECT
      COALESCE(
        (array_agg(balance_after ORDER BY created_at DESC) FILTER (WHERE balance_after IS NOT NULL))[1],
        SUM(signed_amount) FILTER (WHERE status_text IN ('completed', 'confirmed')),
        0
      )::INTEGER AS available_points,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text = 'pending'
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
      ), 0)::INTEGER AS pending_points,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text IN ('completed', 'confirmed')
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
          AND expires_at >= now()
          AND expires_at < now() + interval '30 days'
      ), 0)::INTEGER AS expiring_points_30d,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text IN ('completed', 'confirmed')
          AND type_text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel', 'adjust')
      ), 0)::INTEGER AS total_earned_points,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text IN ('completed', 'confirmed')
          AND type_text IN ('redeem', 'use', 'manual_deduct')
      ), 0)::INTEGER AS total_redeemed_points
    FROM tx
  ),
  transactions AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'type', type_text,
          'status', status_text,
          'amount', amount,
          'balance_after', balance_after,
          'memo', memo,
          'reference', reference,
          'expires_at', expires_at,
          'created_at', created_at
        )
        ORDER BY created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM tx
      ORDER BY created_at DESC
      LIMIT 50
    ) recent
  ),
  notes AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'body', n.body,
          'created_at', n.created_at,
          'created_by', n.created_by,
          'created_by_name', COALESCE(admin_profile.full_name, admin_profile.email),
          'created_by_email', admin_profile.email
        )
        ORDER BY n.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM public.admin_customer_notes
      WHERE user_id = _user_id
      ORDER BY created_at DESC
      LIMIT 20
    ) n
    LEFT JOIN public.profiles admin_profile ON admin_profile.id = n.created_by
  )
  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', c.id,
      'customer_code', c.customer_code,
      'full_name', c.full_name,
      'email', c.email,
      'phone', c.phone,
      'birth_date', c.birth_date,
      'status', c.status,
      'tier_id', c.tier_id,
      'tier_name', c.tier_name,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'last_transaction_at', c.last_transaction_at
    ),
    'summary', jsonb_build_object(
      'available_points', s.available_points,
      'pending_points', s.pending_points,
      'expiring_points_30d', s.expiring_points_30d,
      'total_earned_points', s.total_earned_points,
      'total_redeemed_points', s.total_redeemed_points
    ),
    'transactions', transactions.items,
    'notes', notes.items
  )
  INTO result
  FROM customer c
  CROSS JOIN summary s
  CROSS JOIN transactions
  CROSS JOIN notes;

  RETURN COALESCE(result, jsonb_build_object(
    'profile', NULL,
    'summary', jsonb_build_object(
      'available_points', 0,
      'pending_points', 0,
      'expiring_points_30d', 0,
      'total_earned_points', 0,
      'total_redeemed_points', 0
    ),
    'transactions', '[]'::jsonb,
    'notes', '[]'::jsonb
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_customer_profile(
  _user_id UUID,
  _full_name TEXT,
  _phone TEXT,
  _email TEXT,
  _birth_date DATE,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row public.profiles%ROWTYPE;
  after_payload JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin customer profile update requires admin role' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'profile update reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO before_row
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  IF before_row.status::text = 'withdrawn' THEN
    RAISE EXCEPTION 'withdrawn customer profile cannot be edited' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    full_name = NULLIF(trim(COALESCE(_full_name, '')), ''),
    phone = NULLIF(trim(COALESCE(_phone, '')), ''),
    email = NULLIF(trim(COALESCE(_email, '')), ''),
    birth_date = _birth_date,
    updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    (select auth.uid()),
    'customer.profile.update',
    'profiles',
    _user_id::text,
    to_jsonb(before_row),
    to_jsonb(p),
    _reason
  FROM public.profiles p
  WHERE p.id = _user_id;

  SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
  RETURN after_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_customer_status(
  _user_id UUID,
  _status TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row public.profiles%ROWTYPE;
  normalized_status public.user_status;
  after_payload JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin customer status update requires admin role' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'status update reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_status := _status::public.user_status;

  SELECT * INTO before_row
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET status = normalized_status, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    (select auth.uid()),
    'customer.status.update',
    'profiles',
    _user_id::text,
    to_jsonb(before_row),
    to_jsonb(p),
    _reason
  FROM public.profiles p
  WHERE p.id = _user_id;

  SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
  RETURN after_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_customer_point_transaction(
  _user_id UUID,
  _type TEXT,
  _amount INTEGER,
  _memo TEXT,
  _idempotency_key TEXT,
  _expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
  signed_amount INTEGER;
  current_balance INTEGER;
  new_balance INTEGER;
  existing_tx UUID;
  transaction_type public.tx_type;
  after_payload JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin point adjustment requires admin role' USING ERRCODE = '42501';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'point amount must be positive' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_memo, ''))) < 10 THEN
    RAISE EXCEPTION 'point adjustment memo must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT status::text INTO current_status
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_status IN ('blocked', 'withdrawn') THEN
    RAISE EXCEPTION 'blocked or withdrawn customers cannot process point adjustments' USING ERRCODE = '42501';
  END IF;

  IF _type NOT IN ('manual_earn', 'manual_deduct') THEN
    RAISE EXCEPTION 'manual customer point adjustment type is invalid' USING ERRCODE = '22023';
  END IF;

  transaction_type := _type::public.tx_type;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_tx
    FROM public.point_transactions
    WHERE idempotency_key = _idempotency_key
    LIMIT 1;

    IF existing_tx IS NOT NULL THEN
      SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
      RETURN after_payload;
    END IF;
  END IF;

  SELECT available INTO current_balance
  FROM public.get_balance(_user_id)
  LIMIT 1;

  current_balance := COALESCE(current_balance, 0);
  signed_amount := CASE WHEN transaction_type::text = 'manual_earn' THEN _amount ELSE -_amount END;
  new_balance := current_balance + signed_amount;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'insufficient customer point balance' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.point_transactions (
    user_id,
    type,
    status,
    amount,
    memo,
    created_by,
    balance_after,
    expires_at,
    idempotency_key
  )
  VALUES (
    _user_id,
    transaction_type,
    'confirmed',
    _amount,
    trim(_memo),
    (select auth.uid()),
    new_balance,
    _expires_at,
    _idempotency_key
  );

  UPDATE public.profiles
  SET last_transaction_at = now(), updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    target_id,
    after_data,
    reason
  )
  VALUES (
    (select auth.uid()),
    'customer.points.manual_adjustment',
    'point_transactions',
    _user_id::text,
    jsonb_build_object(
      'type', transaction_type::text,
      'amount', _amount,
      'balance_after', new_balance,
      'idempotency_key', _idempotency_key
    ),
    _memo
  );

  SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
  RETURN after_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_admin_customer_note(
  _user_id UUID,
  _body TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  after_payload JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin customer note requires admin role' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(COALESCE(_body, ''))) < 1 THEN
    RAISE EXCEPTION 'admin note body is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_customer_notes (user_id, body, created_by)
  VALUES (_user_id, trim(_body), (select auth.uid()));

  SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
  RETURN after_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_customer_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customer_detail(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_admin_customer_profile(UUID, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_customer_profile(UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_admin_customer_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_customer_status(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_admin_customer_point_transaction(UUID, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_customer_point_transaction(UUID, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_admin_customer_note(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_admin_customer_note(UUID, TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS point_transactions_created_at_idx
  ON public.point_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS point_transactions_status_idx
  ON public.point_transactions (status);

CREATE INDEX IF NOT EXISTS point_transactions_type_idx
  ON public.point_transactions (type);

CREATE INDEX IF NOT EXISTS point_transactions_original_transaction_id_idx
  ON public.point_transactions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_admin_transactions(
  _transaction_id TEXT DEFAULT NULL,
  _customer_id UUID DEFAULT NULL,
  _external_transaction_id TEXT DEFAULT NULL,
  _type TEXT DEFAULT NULL,
  _status TEXT DEFAULT NULL,
  _date_from DATE DEFAULT NULL,
  _date_to DATE DEFAULT NULL,
  _page INTEGER DEFAULT 1,
  _page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_transaction_id TEXT := NULLIF(trim(COALESCE(_transaction_id, '')), '');
  safe_external_id TEXT := NULLIF(trim(COALESCE(_external_transaction_id, '')), '');
  safe_type TEXT := NULLIF(trim(COALESCE(_type, '')), '');
  safe_status TEXT := NULLIF(trim(COALESCE(_status, '')), '');
  safe_page INTEGER := GREATEST(COALESCE(_page, 1), 1);
  safe_page_size INTEGER := LEAST(GREATEST(COALESCE(_page_size, 20), 1), 100);
  result JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin transaction list requires admin role' USING ERRCODE = '42501';
  END IF;

  WITH
  sequenced AS (
    SELECT
      pt.*,
      row_number() OVER (ORDER BY pt.created_at ASC, pt.id ASC)::INTEGER AS sequence_number
    FROM public.point_transactions pt
  ),
  filtered AS (
    SELECT
      pt.*,
      p.customer_code,
      p.full_name AS customer_name,
      p.email AS customer_email,
      p.phone AS customer_phone,
      p.status::text AS customer_status,
      ct.name AS tier_name,
      creator.full_name AS created_by_name,
      creator.email AS created_by_email,
      EXISTS (
        SELECT 1
        FROM public.point_transactions reversal
        WHERE reversal.original_transaction_id = pt.id
      ) AS has_reversal
    FROM sequenced pt
    JOIN public.profiles p ON p.id = pt.user_id
    LEFT JOIN public.customer_tiers ct ON ct.id = p.tier_id
    LEFT JOIN public.profiles creator ON creator.id = pt.created_by
    WHERE (_customer_id IS NULL OR pt.user_id = _customer_id)
      AND (safe_type IS NULL OR pt.type::text = safe_type)
      AND (safe_status IS NULL OR pt.status::text = safe_status)
      AND (_date_from IS NULL OR pt.created_at >= _date_from::timestamptz)
      AND (_date_to IS NULL OR pt.created_at < (_date_to + 1)::timestamptz)
      AND (
        safe_external_id IS NULL
        OR pt.external_transaction_id ILIKE '%' || safe_external_id || '%'
      )
      AND (
        safe_transaction_id IS NULL
        OR lower(pt.id::text) = lower(safe_transaction_id)
        OR upper(format(
          'PTX-%s-%s',
          to_char(pt.created_at AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD'),
          lpad(pt.sequence_number::text, 6, '0')
        )) = upper(safe_transaction_id)
      )
  ),
  total AS (
    SELECT count(*)::INTEGER AS total_count
    FROM filtered
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT safe_page_size
    OFFSET (safe_page - 1) * safe_page_size
  ),
  rows_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sequence_number', sequence_number,
          'id', id,
          'user_id', user_id,
          'customer_code', customer_code,
          'customer_name', COALESCE(customer_name, customer_email),
          'customer_email', customer_email,
          'customer_phone', customer_phone,
          'customer_status', customer_status,
          'tier_name', tier_name,
          'type', type::text,
          'status', status::text,
          'amount', amount,
          'balance_after', balance_after,
          'memo', memo,
          'reference', reference,
          'external_transaction_id', external_transaction_id,
          'original_transaction_id', original_transaction_id,
          'policy_snapshot', policy_snapshot,
          'created_at', created_at,
          'created_by_name', created_by_name,
          'created_by_email', created_by_email,
          'can_cancel',
            status::text IN ('completed', 'confirmed')
            AND original_transaction_id IS NULL
            AND NOT has_reversal
            AND type::text IN ('earn', 'event_earn', 'manual_earn', 'redeem', 'use', 'manual_deduct'),
          'can_retry', status::text = 'failed'
        )
        ORDER BY created_at DESC, id DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM page_rows
  )
  SELECT jsonb_build_object(
    'total_count', total.total_count,
    'page', safe_page,
    'page_size', safe_page_size,
    'transactions', rows_json.items
  )
  INTO result
  FROM total
  CROSS JOIN rows_json;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_admin_transaction_customers(
  _query TEXT DEFAULT NULL,
  _limit INTEGER DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_query TEXT := NULLIF(trim(COALESCE(_query, '')), '');
  safe_digits TEXT := regexp_replace(COALESCE(_query, ''), '[^0-9]', '', 'g');
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(_limit, 8), 1), 20);
  result JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin transaction customer search requires admin role' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'customer_code', p.customer_code,
        'full_name', p.full_name,
        'email', p.email
      )
      ORDER BY p.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT *
    FROM public.profiles p
    WHERE safe_query IS NOT NULL
      AND (
        p.customer_code ILIKE '%' || safe_query || '%'
        OR p.full_name ILIKE '%' || safe_query || '%'
        OR p.email ILIKE '%' || safe_query || '%'
        OR (safe_digits <> '' AND regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') ILIKE '%' || safe_digits || '%')
      )
    ORDER BY p.created_at DESC
    LIMIT safe_limit
  ) p;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transaction_detail(_transaction_id UUID)
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
    RAISE EXCEPTION 'admin transaction detail requires admin role' USING ERRCODE = '42501';
  END IF;

  WITH
  sequenced AS (
    SELECT
      pt.*,
      row_number() OVER (ORDER BY pt.created_at ASC, pt.id ASC)::INTEGER AS sequence_number
    FROM public.point_transactions pt
  ),
  current_tx AS (
    SELECT
      pt.*,
      p.customer_code,
      p.full_name AS customer_name,
      p.email AS customer_email,
      p.phone AS customer_phone,
      p.status::text AS customer_status,
      ct.name AS tier_name,
      creator.full_name AS created_by_name,
      creator.email AS created_by_email,
      EXISTS (
        SELECT 1
        FROM public.point_transactions reversal
        WHERE reversal.original_transaction_id = pt.id
      ) AS has_reversal
    FROM sequenced pt
    JOIN public.profiles p ON p.id = pt.user_id
    LEFT JOIN public.customer_tiers ct ON ct.id = p.tier_id
    LEFT JOIN public.profiles creator ON creator.id = pt.created_by
    WHERE pt.id = _transaction_id
  ),
  tx_json AS (
    SELECT jsonb_build_object(
      'sequence_number', sequence_number,
      'id', id,
      'user_id', user_id,
      'customer_code', customer_code,
      'customer_name', COALESCE(customer_name, customer_email),
      'customer_email', customer_email,
      'customer_phone', customer_phone,
      'customer_status', customer_status,
      'tier_name', tier_name,
      'type', type::text,
      'status', status::text,
      'amount', amount,
      'balance_after', balance_after,
      'memo', memo,
      'reference', reference,
      'external_transaction_id', external_transaction_id,
      'original_transaction_id', original_transaction_id,
      'policy_snapshot', policy_snapshot,
      'created_at', created_at,
      'created_by_name', created_by_name,
      'created_by_email', created_by_email,
      'can_cancel',
        status::text IN ('completed', 'confirmed')
        AND original_transaction_id IS NULL
        AND NOT has_reversal
        AND type::text IN ('earn', 'event_earn', 'manual_earn', 'redeem', 'use', 'manual_deduct'),
      'can_retry', status::text = 'failed'
    ) AS item
    FROM current_tx
  ),
  customer_json AS (
    SELECT jsonb_build_object(
      'id', user_id,
      'customer_code', customer_code,
      'full_name', customer_name,
      'email', customer_email,
      'phone', customer_phone,
      'status', customer_status,
      'tier_name', tier_name
    ) AS item
    FROM current_tx
  ),
  policy_json AS (
    SELECT jsonb_build_object(
      'policy_name', COALESCE(policy_snapshot->>'policy_name', policy_snapshot->>'name', '정책 정보 없음'),
      'policy_snapshot', policy_snapshot
    ) AS item
    FROM current_tx
  ),
  log_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', al.id,
          'action', al.action,
          'reason', al.reason,
          'created_at', al.created_at,
          'actor_name', COALESCE(actor.full_name, actor.email),
          'actor_email', actor.email
        )
        ORDER BY al.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.audit_logs al
    LEFT JOIN public.profiles actor ON actor.id = al.actor_id
    WHERE al.target_table = 'point_transactions'
      AND (
        al.target_id = _transaction_id::text
        OR al.after_data->>'original_transaction_id' = _transaction_id::text
      )
  )
  SELECT jsonb_build_object(
    'transaction', tx_json.item,
    'customer', customer_json.item,
    'policy', policy_json.item,
    'logs', log_json.items
  )
  INTO result
  FROM tx_json
  CROSS JOIN customer_json
  CROSS JOIN policy_json
  CROSS JOIN log_json;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_admin_transaction(
  _transaction_id UUID,
  _reason TEXT,
  _idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tx public.point_transactions%ROWTYPE;
  current_balance INTEGER;
  new_balance INTEGER;
  signed_delta INTEGER;
  reversal_type public.tx_type;
  reversal_id UUID;
  existing_tx UUID;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin transaction cancel requires admin role' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'transaction cancel reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_tx
  FROM public.point_transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_tx.status::text not in ('completed', 'confirmed') THEN
    RAISE EXCEPTION 'only confirmed transactions can be cancelled' USING ERRCODE = '22023';
  END IF;

  IF current_tx.original_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'reversal transactions cannot be cancelled again' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.point_transactions reversal
    WHERE reversal.original_transaction_id = current_tx.id
  ) THEN
    RAISE EXCEPTION 'transaction already has a reversal' USING ERRCODE = '23505';
  END IF;

  IF current_tx.type::text IN ('earn', 'event_earn', 'manual_earn') THEN
    reversal_type := 'earn_cancel'::public.tx_type;
    signed_delta := -current_tx.amount;
  ELSIF current_tx.type::text IN ('redeem', 'use', 'manual_deduct') THEN
    reversal_type := 'use_cancel'::public.tx_type;
    signed_delta := current_tx.amount;
  ELSE
    RAISE EXCEPTION 'transaction type is not cancellable' USING ERRCODE = '22023';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO existing_tx
    FROM public.point_transactions
    WHERE idempotency_key = _idempotency_key
    LIMIT 1;

    IF existing_tx IS NOT NULL THEN
      RETURN public.get_admin_transaction_detail(current_tx.id);
    END IF;
  END IF;

  SELECT available INTO current_balance
  FROM public.get_balance(current_tx.user_id)
  LIMIT 1;

  current_balance := COALESCE(current_balance, 0);
  new_balance := current_balance + signed_delta;

  IF new_balance < 0 THEN
    RAISE EXCEPTION 'cancellation would make point balance negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.point_transactions (
    user_id,
    type,
    status,
    amount,
    memo,
    created_by,
    balance_after,
    original_transaction_id,
    external_transaction_id,
    idempotency_key,
    policy_snapshot
  )
  VALUES (
    current_tx.user_id,
    reversal_type,
    'confirmed',
    current_tx.amount,
    trim(_reason),
    (select auth.uid()),
    new_balance,
    current_tx.id,
    current_tx.external_transaction_id,
    _idempotency_key,
    jsonb_build_object(
      'original_transaction_id', current_tx.id,
      'original_type', current_tx.type::text,
      'original_policy_snapshot', current_tx.policy_snapshot
    )
  )
  RETURNING id INTO reversal_id;

  UPDATE public.profiles
  SET last_transaction_at = now(), updated_at = now()
  WHERE id = current_tx.user_id;

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
    (select auth.uid()),
    'transaction.cancel',
    'point_transactions',
    current_tx.id::text,
    to_jsonb(current_tx),
    jsonb_build_object(
      'reversal_transaction_id', reversal_id,
      'original_transaction_id', current_tx.id,
      'type', reversal_type::text,
      'amount', current_tx.amount,
      'balance_after', new_balance
    ),
    _reason
  );

  RETURN public.get_admin_transaction_detail(current_tx.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_admin_transaction(
  _transaction_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tx public.point_transactions%ROWTYPE;
  after_tx public.point_transactions%ROWTYPE;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin transaction retry requires admin role' USING ERRCODE = '42501';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'transaction retry reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_tx
  FROM public.point_transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_tx.status::text <> 'failed' THEN
    RAISE EXCEPTION 'only failed transactions can be retried' USING ERRCODE = '22023';
  END IF;

  UPDATE public.point_transactions
  SET
    status = 'pending',
    memo = trim(COALESCE(memo, '') || E'\n[retry] ' || trim(_reason))
  WHERE id = current_tx.id
  RETURNING * INTO after_tx;

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
    (select auth.uid()),
    'transaction.retry',
    'point_transactions',
    current_tx.id::text,
    to_jsonb(current_tx),
    to_jsonb(after_tx),
    _reason
  );

  RETURN public.get_admin_transaction_detail(current_tx.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_transactions(TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_transactions(TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_admin_transaction_customers(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_admin_transaction_customers(TEXT, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_transaction_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_transaction_detail(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_admin_transaction(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_admin_transaction(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.retry_admin_transaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_admin_transaction(UUID, TEXT) TO authenticated;

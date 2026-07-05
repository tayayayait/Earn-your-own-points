CREATE OR REPLACE FUNCTION public.get_admin_customers(
  _query TEXT DEFAULT NULL,
  _tier_ids UUID[] DEFAULT NULL,
  _statuses TEXT[] DEFAULT NULL,
  _min_points INTEGER DEFAULT NULL,
  _max_points INTEGER DEFAULT NULL,
  _joined_from DATE DEFAULT NULL,
  _joined_to DATE DEFAULT NULL,
  _sort_by TEXT DEFAULT 'created_at',
  _sort_dir TEXT DEFAULT 'desc',
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
  safe_query TEXT := NULLIF(LOWER(TRIM(COALESCE(_query, ''))), '');
  safe_sort_by TEXT := CASE
    WHEN LOWER(COALESCE(_sort_by, 'created_at')) IN ('name', 'balance', 'created_at') THEN LOWER(COALESCE(_sort_by, 'created_at'))
    ELSE 'created_at'
  END;
  safe_sort_dir TEXT := CASE
    WHEN LOWER(COALESCE(_sort_dir, 'desc')) = 'asc' THEN 'asc'
    ELSE 'desc'
  END;
  safe_page INTEGER := GREATEST(COALESCE(_page, 1), 1);
  safe_page_size INTEGER := GREATEST(1, LEAST(COALESCE(_page_size, 20), 100));
  result JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin customer list requires admin role' USING ERRCODE = '42501';
  END IF;

  WITH
  tx AS (
    SELECT
      pt.user_id,
      pt.type::text AS type_text,
      pt.status::text AS status_text,
      pt.amount,
      pt.balance_after,
      pt.created_at,
      CASE
        WHEN pt.type::text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel') THEN pt.amount
        WHEN pt.type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel') THEN -pt.amount
        WHEN pt.type::text = 'adjust' THEN pt.amount
        ELSE 0
      END AS signed_amount
    FROM public.point_transactions pt
  ),
  point_summary AS (
    SELECT
      user_id,
      COALESCE(
        (array_agg(balance_after ORDER BY created_at DESC) FILTER (WHERE balance_after IS NOT NULL))[1],
        SUM(signed_amount) FILTER (WHERE status_text IN ('completed', 'confirmed')),
        0
      )::INTEGER AS balance,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text = 'pending'
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
      ), 0)::INTEGER AS pending_points,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text IN ('completed', 'confirmed')
          AND type_text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel', 'adjust')
      ), 0)::INTEGER AS total_earned,
      COALESCE(SUM(amount) FILTER (
        WHERE status_text IN ('completed', 'confirmed')
          AND type_text IN ('redeem', 'use', 'manual_deduct')
      ), 0)::INTEGER AS total_redeemed,
      MAX(created_at) AS last_transaction_at
    FROM tx
    GROUP BY user_id
  ),
  base_customers AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY p.created_at ASC, p.id ASC)::INTEGER AS row_number,
      p.id,
      p.customer_code,
      p.full_name,
      p.email,
      p.phone,
      COALESCE(p.status::text, 'active') AS status,
      p.tier_id,
      ct.name AS tier_name,
      p.created_at,
      p.updated_at,
      COALESCE(p.last_transaction_at, ps.last_transaction_at) AS last_transaction_at,
      COALESCE(ps.balance, 0)::INTEGER AS balance,
      COALESCE(ps.pending_points, 0)::INTEGER AS pending_points,
      COALESCE(ps.total_earned, 0)::INTEGER AS total_earned,
      COALESCE(ps.total_redeemed, 0)::INTEGER AS total_redeemed
    FROM public.profiles p
    LEFT JOIN public.customer_tiers ct ON ct.id = p.tier_id
    LEFT JOIN point_summary ps ON ps.user_id = p.id
  ),
  filtered AS (
    SELECT *
    FROM base_customers
    WHERE
      (
        safe_query IS NULL
        OR LOWER(COALESCE(full_name, '')) LIKE '%' || safe_query || '%'
        OR LOWER(COALESCE(email, '')) LIKE '%' || safe_query || '%'
        OR (
          REGEXP_REPLACE(safe_query, '[^0-9]', '', 'g') <> ''
          AND REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE '%' || REGEXP_REPLACE(safe_query, '[^0-9]', '', 'g') || '%'
        )
        OR LOWER(COALESCE(customer_code, '')) LIKE '%' || safe_query || '%'
        OR id::text = safe_query
      )
      AND (
        COALESCE(array_length(_tier_ids, 1), 0) = 0
        OR tier_id = ANY(_tier_ids)
      )
      AND (
        COALESCE(array_length(_statuses, 1), 0) = 0
        OR status = ANY(_statuses)
      )
      AND (_min_points IS NULL OR balance >= _min_points)
      AND (_max_points IS NULL OR balance <= _max_points)
      AND (_joined_from IS NULL OR created_at::date >= _joined_from)
      AND (_joined_to IS NULL OR created_at::date <= _joined_to)
  ),
  total AS (
    SELECT COUNT(*)::INTEGER AS total_count FROM filtered
  ),
  ordered AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN safe_sort_by = 'name' AND safe_sort_dir = 'asc' THEN LOWER(COALESCE(full_name, email, '')) END ASC NULLS LAST,
          CASE WHEN safe_sort_by = 'name' AND safe_sort_dir = 'desc' THEN LOWER(COALESCE(full_name, email, '')) END DESC NULLS LAST,
          CASE WHEN safe_sort_by = 'balance' AND safe_sort_dir = 'asc' THEN balance END ASC NULLS LAST,
          CASE WHEN safe_sort_by = 'balance' AND safe_sort_dir = 'desc' THEN balance END DESC NULLS LAST,
          CASE WHEN safe_sort_by = 'created_at' AND safe_sort_dir = 'asc' THEN created_at END ASC NULLS LAST,
          CASE WHEN safe_sort_by = 'created_at' AND safe_sort_dir = 'desc' THEN created_at END DESC NULLS LAST,
          created_at DESC,
          id ASC
      ) AS sort_position
    FROM filtered
  ),
  paged AS (
    SELECT *
    FROM ordered
    WHERE sort_position > ((safe_page - 1) * safe_page_size)
      AND sort_position <= (safe_page * safe_page_size)
    ORDER BY sort_position
  )
  SELECT jsonb_build_object(
    'total_count', total.total_count,
    'page', safe_page,
    'page_size', safe_page_size,
    'customers', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'row_number', paged.row_number,
          'id', paged.id,
          'customer_code', paged.customer_code,
          'full_name', paged.full_name,
          'email', paged.email,
          'phone', paged.phone,
          'status', paged.status,
          'tier_id', paged.tier_id,
          'tier_name', paged.tier_name,
          'balance', paged.balance,
          'pending_points', paged.pending_points,
          'total_earned', paged.total_earned,
          'total_redeemed', paged.total_redeemed,
          'last_transaction_at', paged.last_transaction_at,
          'created_at', paged.created_at
        )
        ORDER BY paged.sort_position
      ) FILTER (WHERE paged.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO result
  FROM total
  LEFT JOIN paged ON true
  GROUP BY total.total_count;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_customers(TEXT, UUID[], TEXT[], INTEGER, INTEGER, DATE, DATE, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_customers(TEXT, UUID[], TEXT[], INTEGER, INTEGER, DATE, DATE, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

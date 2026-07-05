CREATE OR REPLACE FUNCTION public.get_admin_manual_transaction_context(_user_id UUID)
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
    RAISE EXCEPTION 'admin manual transaction context requires admin role' USING ERRCODE = '42501';
  END IF;

  WITH
  customer AS (
    SELECT
      p.id,
      p.customer_code,
      p.full_name,
      p.email,
      p.phone,
      p.status::text AS status
    FROM public.profiles p
    WHERE p.id = _user_id
  ),
  balance AS (
    SELECT
      COALESCE(b.available, 0)::INTEGER AS available_points,
      COALESCE(b.pending, 0)::INTEGER AS pending_points
    FROM public.get_balance(_user_id) b
    LIMIT 1
  ),
  active_policy AS (
    SELECT
      pp.name AS policy_name,
      pp.valid_months
    FROM public.point_policies pp
    WHERE pp.status::text = 'active'
      AND (pp.starts_at IS NULL OR pp.starts_at <= now())
      AND (pp.ends_at IS NULL OR pp.ends_at >= now())
    ORDER BY pp.updated_at DESC, pp.created_at DESC
    LIMIT 1
  ),
  policy AS (
    SELECT
      COALESCE(active_policy.policy_name, '기본 정책') AS policy_name,
      COALESCE(active_policy.valid_months, 12)::INTEGER AS valid_months,
      now() + make_interval(months => COALESCE(active_policy.valid_months, 12)::INTEGER) AS default_expires_at
    FROM active_policy
    UNION ALL
    SELECT
      '기본 정책',
      12,
      now() + make_interval(months => 12)
    WHERE NOT EXISTS (SELECT 1 FROM active_policy)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'customer', jsonb_build_object(
      'id', customer.id,
      'customer_code', customer.customer_code,
      'full_name', customer.full_name,
      'email', customer.email,
      'phone', customer.phone,
      'status', customer.status
    ),
    'balance', jsonb_build_object(
      'available_points', COALESCE(balance.available_points, 0),
      'pending_points', COALESCE(balance.pending_points, 0)
    ),
    'policy', jsonb_build_object(
      'policy_name', policy.policy_name,
      'valid_months', policy.valid_months,
      'default_expires_at', policy.default_expires_at
    )
  )
  INTO result
  FROM customer
  CROSS JOIN policy
  LEFT JOIN balance ON true;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_manual_transaction_context(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_manual_transaction_context(UUID) TO authenticated;

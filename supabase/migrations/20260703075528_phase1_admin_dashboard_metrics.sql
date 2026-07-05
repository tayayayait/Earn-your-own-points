CREATE OR REPLACE FUNCTION public.percent_change(current_value NUMERIC, previous_value NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(previous_value, 0) = 0 AND COALESCE(current_value, 0) = 0 THEN 0
    WHEN COALESCE(previous_value, 0) = 0 THEN 100
    ELSE ROUND(((current_value - previous_value) / ABS(previous_value)) * 100, 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_days INTEGER;
  period_start TIMESTAMPTZ;
  previous_start TIMESTAMPTZ;
  result JSONB;
BEGIN
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin dashboard metrics require admin role' USING ERRCODE = '42501';
  END IF;

  safe_days := GREATEST(1, LEAST(COALESCE(_days, 30), 365));
  period_start := now() - make_interval(days => safe_days);
  previous_start := now() - make_interval(days => safe_days * 2);

  WITH
  tx AS (
    SELECT
      pt.*,
      pt.type::text AS type_text,
      pt.status::text AS status_text,
      COALESCE(NULLIF(p.full_name, ''), p.email, pt.user_id::text) AS customer_name,
      p.email AS customer_email,
      COALESCE(p.status::text, 'active') AS profile_status
    FROM public.point_transactions pt
    LEFT JOIN public.profiles p ON p.id = pt.user_id
  ),
  classified_tx AS (
    SELECT
      *,
      CASE
        WHEN type_text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel') THEN amount
        WHEN type_text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel') THEN -amount
        WHEN type_text = 'adjust' THEN amount
        ELSE 0
      END AS signed_amount,
      status_text IN ('completed', 'confirmed') AS is_confirmed,
      type_text IN ('earn', 'event_earn', 'manual_earn', 'use_cancel', 'adjust') AS is_earn_type,
      type_text IN ('redeem', 'use', 'manual_deduct') AS is_redeem_type
    FROM tx
  ),
  current_tx AS (
    SELECT * FROM classified_tx WHERE created_at >= period_start
  ),
  previous_tx AS (
    SELECT * FROM classified_tx WHERE created_at >= previous_start AND created_at < period_start
  ),
  profile_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(status::text, 'active') = 'active') AS total_customers,
      COUNT(*) FILTER (WHERE created_at >= period_start) AS current_customers,
      COUNT(*) FILTER (WHERE created_at >= previous_start AND created_at < period_start) AS previous_customers
    FROM public.profiles
  ),
  aggregate_kpis AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_earn_type), 0)::INTEGER AS total_earned_points,
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_redeem_type), 0)::INTEGER AS total_redeemed_points,
      COALESCE(SUM(amount) FILTER (
        WHERE is_confirmed
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
          AND expires_at >= now()
          AND expires_at < now() + interval '30 days'
      ), 0)::INTEGER AS expiring_points_30d
    FROM classified_tx
  ),
  current_kpis AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_earn_type), 0)::INTEGER AS earned,
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_redeem_type), 0)::INTEGER AS redeemed,
      COALESCE(SUM(signed_amount) FILTER (WHERE is_confirmed), 0)::INTEGER AS remaining,
      COALESCE(SUM(amount) FILTER (
        WHERE is_confirmed
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
          AND expires_at >= now()
          AND expires_at < now() + interval '30 days'
      ), 0)::INTEGER AS expiring
    FROM current_tx
  ),
  previous_kpis AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_earn_type), 0)::INTEGER AS earned,
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_redeem_type), 0)::INTEGER AS redeemed,
      COALESCE(SUM(signed_amount) FILTER (WHERE is_confirmed), 0)::INTEGER AS remaining,
      COALESCE(SUM(amount) FILTER (
        WHERE is_confirmed
          AND type_text IN ('earn', 'event_earn', 'manual_earn')
          AND expires_at >= now() - interval '30 days'
          AND expires_at < now()
      ), 0)::INTEGER AS expiring
    FROM previous_tx
  ),
  balance_by_user AS (
    SELECT
      user_id,
      COALESCE(
        (array_agg(balance_after ORDER BY created_at DESC) FILTER (WHERE balance_after IS NOT NULL))[1],
        SUM(signed_amount) FILTER (WHERE is_confirmed),
        0
      )::INTEGER AS balance,
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_earn_type), 0)::INTEGER AS earned,
      COALESCE(SUM(amount) FILTER (WHERE is_confirmed AND is_redeem_type), 0)::INTEGER AS redeemed
    FROM classified_tx
    WHERE profile_status = 'active'
    GROUP BY user_id
  ),
  remaining_total AS (
    SELECT COALESCE(SUM(balance), 0)::INTEGER AS remaining_points_total
    FROM balance_by_user
  ),
  trend_days AS (
    SELECT generate_series(
      date_trunc('day', period_start)::date,
      date_trunc('day', now())::date,
      interval '1 day'
    )::date AS day
  ),
  trend_sums AS (
    SELECT
      td.day,
      COALESCE(SUM(ct.amount) FILTER (WHERE ct.is_confirmed AND ct.is_earn_type), 0)::INTEGER AS earned,
      COALESCE(SUM(ct.amount) FILTER (WHERE ct.is_confirmed AND ct.is_redeem_type), 0)::INTEGER AS redeemed,
      COALESCE(SUM(ct.amount) FILTER (WHERE ct.is_confirmed AND ct.type_text IN ('expire', 'expired')), 0)::INTEGER AS expired,
      COALESCE(SUM(ct.amount) FILTER (WHERE ct.status_text = 'pending'), 0)::INTEGER AS pending
    FROM trend_days td
    LEFT JOIN current_tx ct ON date_trunc('day', ct.created_at)::date = td.day
    GROUP BY td.day
  ),
  trend AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', day::text,
          'earned', earned,
          'redeemed', redeemed,
          'expired', expired,
          'pending', pending
        )
        ORDER BY day
      ),
      '[]'::jsonb
    ) AS items
    FROM trend_sums
  ),
  type_breakdown AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', type_text,
          'label', CASE type_text
            WHEN 'earn' THEN '구매 적립'
            WHEN 'event_earn' THEN '이벤트 지급'
            WHEN 'manual_earn' THEN '관리자 지급'
            WHEN 'redeem' THEN '포인트 사용'
            WHEN 'use' THEN '포인트 사용'
            WHEN 'manual_deduct' THEN '관리자 차감'
            WHEN 'cancel' THEN '취소'
            WHEN 'earn_cancel' THEN '적립 취소'
            WHEN 'use_cancel' THEN '사용 취소'
            WHEN 'expire' THEN '유효기간 만료'
            WHEN 'adjust' THEN '정정'
            ELSE type_text
          END,
          'amount', amount,
          'count', count
        )
        ORDER BY amount DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT type_text, COALESCE(SUM(amount), 0)::INTEGER AS amount, COUNT(*)::INTEGER AS count
      FROM current_tx
      GROUP BY type_text
    ) grouped
  ),
  recent_transactions AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'user_id', user_id,
          'customer_name', customer_name,
          'customer_email', customer_email,
          'type', type_text,
          'status', status_text,
          'amount', amount,
          'balance_after', balance_after,
          'memo', memo,
          'created_at', created_at
        )
        ORDER BY created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM current_tx
      ORDER BY created_at DESC
      LIMIT 10
    ) recent
  ),
  customer_rankings AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', b.user_id,
          'customer_name', COALESCE(NULLIF(p.full_name, ''), p.email, b.user_id::text),
          'customer_email', p.email,
          'balance', b.balance,
          'earned', b.earned,
          'redeemed', b.redeemed
        )
        ORDER BY b.balance DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM balance_by_user
      ORDER BY balance DESC
      LIMIT 10
    ) b
    LEFT JOIN public.profiles p ON p.id = b.user_id
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_customers', pc.total_customers,
      'total_earned_points', ak.total_earned_points,
      'total_redeemed_points', ak.total_redeemed_points,
      'remaining_points_total', rt.remaining_points_total,
      'expiring_points_30d', ak.expiring_points_30d
    ),
    'changes', jsonb_build_object(
      'customers', public.percent_change(pc.current_customers, pc.previous_customers),
      'earned', public.percent_change(ck.earned, pk.earned),
      'redeemed', public.percent_change(ck.redeemed, pk.redeemed),
      'remaining', public.percent_change(ck.remaining, pk.remaining),
      'expiring', public.percent_change(ck.expiring, pk.expiring)
    ),
    'trend', trend.items,
    'type_breakdown', tb.items,
    'recent_transactions', recent.items,
    'customer_rankings', rankings.items
  )
  INTO result
  FROM profile_counts pc
  CROSS JOIN aggregate_kpis ak
  CROSS JOIN current_kpis ck
  CROSS JOIN previous_kpis pk
  CROSS JOIN remaining_total rt
  CROSS JOIN trend
  CROSS JOIN type_breakdown tb
  CROSS JOIN recent_transactions recent
  CROSS JOIN customer_rankings rankings;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.percent_change(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.percent_change(NUMERIC, NUMERIC) TO authenticated;

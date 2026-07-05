CREATE OR REPLACE FUNCTION public.has_admin_permission(_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := (select auth.uid());
  selected_admin_role public.admin_role;
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'admin') THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(profile.admin_role, 'viewer'::public.admin_role)
  INTO selected_admin_role
  FROM public.profiles profile
  WHERE profile.id = actor_id;

  selected_admin_role := COALESCE(selected_admin_role, 'viewer'::public.admin_role);

  RETURN CASE _permission_key
    WHEN 'dashboard.read' THEN TRUE
    WHEN 'customers.read' THEN TRUE
    WHEN 'customers.write' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role, 'operator'::public.admin_role)
    WHEN 'transactions.read' THEN TRUE
    WHEN 'points.write' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role, 'operator'::public.admin_role)
    WHEN 'policies.read' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role, 'viewer'::public.admin_role)
    WHEN 'policies.write' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role)
    WHEN 'events.read' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role, 'viewer'::public.admin_role)
    WHEN 'events.write' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role)
    WHEN 'reports.read' THEN TRUE
    WHEN 'integrations.read' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'integrations.write' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'brand.read' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'brand.write' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'admins.read' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'admins.write' THEN selected_admin_role = 'owner'::public.admin_role
    WHEN 'audit.read' THEN selected_admin_role IN ('owner'::public.admin_role, 'manager'::public.admin_role)
    ELSE FALSE
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_admin_permission(_permission_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_permission(_permission_key) THEN
    RAISE EXCEPTION 'permission denied: %', _permission_key
      USING ERRCODE = '42501', DETAIL = _permission_key;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_current_admin_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := (select auth.uid());
  selected_admin_role public.admin_role;
  permission_list TEXT[] := ARRAY[
    'dashboard.read',
    'customers.read',
    'customers.write',
    'transactions.read',
    'points.write',
    'policies.read',
    'policies.write',
    'events.read',
    'events.write',
    'reports.read',
    'integrations.read',
    'integrations.write',
    'brand.read',
    'brand.write',
    'admins.read',
    'admins.write',
    'audit.read'
  ];
BEGIN
  IF actor_id IS NULL OR NOT public.has_role(actor_id, 'admin') THEN
    RAISE EXCEPTION 'admin context requires admin role' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(profile.admin_role, 'viewer'::public.admin_role)
  INTO selected_admin_role
  FROM public.profiles profile
  WHERE profile.id = actor_id;

  selected_admin_role := COALESCE(selected_admin_role, 'viewer'::public.admin_role);

  RETURN jsonb_build_object(
    'user_id', actor_id,
    'admin_role', selected_admin_role::TEXT,
    'permissions', COALESCE((
      SELECT jsonb_agg(permission)
      FROM unnest(permission_list) permission
      WHERE public.has_admin_permission(permission)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_permission(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.require_admin_permission(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_admin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_admin_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_admin_context() TO authenticated;

-- get_admin_dashboard_metrics: dashboard.read
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
  PERFORM public.require_admin_permission('dashboard.read');

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

-- get_admin_customers: customers.read
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
  PERFORM public.require_admin_permission('customers.read');

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

-- get_admin_customer_detail: customers.read
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
  PERFORM public.require_admin_permission('customers.read');

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

-- update_admin_customer_profile: customers.write
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
  PERFORM public.require_admin_permission('customers.write');

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

-- update_admin_customer_status: customers.write
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
  PERFORM public.require_admin_permission('customers.write');

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

-- create_admin_customer_point_transaction: points.write
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
  PERFORM public.require_admin_permission('points.write');

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

-- add_admin_customer_note: customers.write
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
  PERFORM public.require_admin_permission('customers.write');

  IF char_length(trim(COALESCE(_body, ''))) < 1 THEN
    RAISE EXCEPTION 'admin note body is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_customer_notes (user_id, body, created_by)
  VALUES (_user_id, trim(_body), (select auth.uid()));

  SELECT public.get_admin_customer_detail(_user_id) INTO after_payload;
  RETURN after_payload;
END;
$$;

-- get_admin_transactions: transactions.read
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
  PERFORM public.require_admin_permission('transactions.read');

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

-- search_admin_transaction_customers: transactions.read
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
  PERFORM public.require_admin_permission('transactions.read');

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

-- get_admin_transaction_detail: transactions.read
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
  PERFORM public.require_admin_permission('transactions.read');

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

-- cancel_admin_transaction: points.write
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
  PERFORM public.require_admin_permission('points.write');

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

-- retry_admin_transaction: points.write
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
  PERFORM public.require_admin_permission('points.write');

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

-- get_admin_manual_transaction_context: points.write
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
  PERFORM public.require_admin_permission('points.write');

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

-- get_admin_base_policy: policies.read
CREATE OR REPLACE FUNCTION public.get_admin_base_policy()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('policies.read');

  WITH
  current_policy AS (
    SELECT *
    FROM public.point_policies
    ORDER BY
      CASE status::text
        WHEN 'active' THEN 0
        WHEN 'scheduled' THEN 1
        WHEN 'draft' THEN 2
        ELSE 3
      END,
      starts_at DESC NULLS LAST,
      updated_at DESC,
      created_at DESC
    LIMIT 1
  ),
  history AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'earning_rate', p.earning_rate,
          'earn_unit', p.earn_unit,
          'rounding_method', p.rounding_method,
          'min_redeem_points', p.min_redeem_points,
          'max_redeem_ratio', p.max_redeem_ratio,
          'redeem_unit', p.redeem_unit,
          'valid_months', p.valid_months,
          'pending_days', p.pending_days,
          'excluded_payment_methods', p.excluded_payment_methods,
          'status', p.status::text,
          'starts_at', p.starts_at,
          'ends_at', p.ends_at,
          'updated_at', p.updated_at
        )
        ORDER BY p.updated_at DESC, p.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT *
      FROM public.point_policies
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 20
    ) p
  )
  SELECT jsonb_build_object(
    'current_policy',
    (
      SELECT jsonb_build_object(
        'id', cp.id,
        'name', cp.name,
        'earning_rate', cp.earning_rate,
        'earn_unit', cp.earn_unit,
        'rounding_method', cp.rounding_method,
        'min_redeem_points', cp.min_redeem_points,
        'max_redeem_ratio', cp.max_redeem_ratio,
        'redeem_unit', cp.redeem_unit,
        'valid_months', cp.valid_months,
        'pending_days', cp.pending_days,
        'excluded_payment_methods', cp.excluded_payment_methods,
        'status', cp.status::text,
        'starts_at', cp.starts_at,
        'ends_at', cp.ends_at,
        'updated_at', cp.updated_at
      )
      FROM current_policy cp
    ),
    'history', history.items
  )
  INTO result
  FROM history;

  RETURN result;
END;
$$;

-- save_admin_base_policy: policies.write
CREATE OR REPLACE FUNCTION public.save_admin_base_policy(
  _name TEXT,
  _earning_rate NUMERIC,
  _earn_unit INTEGER,
  _rounding_method TEXT,
  _min_redeem_points INTEGER,
  _max_redeem_ratio NUMERIC,
  _redeem_unit INTEGER,
  _valid_months INTEGER,
  _pending_days INTEGER,
  _excluded_payment_methods TEXT[],
  _apply_mode TEXT,
  _scheduled_at TIMESTAMPTZ,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snapshot JSONB;
  after_snapshot JSONB;
  new_policy_id UUID;
  new_status public.policy_status;
  new_starts_at TIMESTAMPTZ;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'base policy name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF _earning_rate IS NULL OR _earning_rate < 0 OR _earning_rate > 100 THEN
    RAISE EXCEPTION 'earning rate must be between 0 and 100' USING ERRCODE = '22023';
  END IF;

  IF _earn_unit NOT IN (1, 10, 100) OR _redeem_unit NOT IN (1, 10, 100) THEN
    RAISE EXCEPTION 'policy point units must be 1, 10, or 100' USING ERRCODE = '22023';
  END IF;

  IF _rounding_method NOT IN ('floor', 'round', 'ceil') THEN
    RAISE EXCEPTION 'rounding method is invalid' USING ERRCODE = '22023';
  END IF;

  IF _max_redeem_ratio IS NULL OR _max_redeem_ratio < 0 OR _max_redeem_ratio > 100 THEN
    RAISE EXCEPTION 'max redeem ratio must be between 0 and 100' USING ERRCODE = '22023';
  END IF;

  IF _min_redeem_points IS NULL OR _min_redeem_points < 0
    OR _valid_months IS NULL OR _valid_months < 1 OR _valid_months > 60
    OR _pending_days IS NULL OR _pending_days < 0 OR _pending_days > 365 THEN
    RAISE EXCEPTION 'policy numeric bounds are invalid' USING ERRCODE = '22023';
  END IF;

  IF _apply_mode NOT IN ('immediate', 'scheduled') THEN
    RAISE EXCEPTION 'apply mode is invalid' USING ERRCODE = '22023';
  END IF;

  IF _apply_mode = 'scheduled' AND (_scheduled_at IS NULL OR _scheduled_at <= now()) THEN
    RAISE EXCEPTION 'scheduled base policy time must be in the future' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'base policy audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC), '[]'::jsonb)
  INTO before_snapshot
  FROM public.point_policies p
  WHERE p.status::text IN ('active', 'scheduled');

  IF _apply_mode = 'immediate' THEN
    UPDATE public.point_policies
    SET
      status = 'ended',
      ends_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE status::text = 'active';

    new_status := 'active';
    new_starts_at := now();
  ELSE
    new_status := 'scheduled';
    new_starts_at := _scheduled_at;
  END IF;

  INSERT INTO public.point_policies (
    name,
    earning_rate,
    earn_unit,
    rounding_method,
    min_redeem_points,
    max_redeem_ratio,
    redeem_unit,
    valid_months,
    pending_days,
    excluded_payment_methods,
    status,
    starts_at,
    created_by,
    updated_by
  )
  VALUES (
    trim(_name),
    _earning_rate,
    _earn_unit,
    _rounding_method,
    _min_redeem_points,
    _max_redeem_ratio,
    _redeem_unit,
    _valid_months,
    _pending_days,
    COALESCE(_excluded_payment_methods, ARRAY[]::TEXT[]),
    new_status,
    new_starts_at,
    (select auth.uid()),
    (select auth.uid())
  )
  RETURNING id INTO new_policy_id;

  SELECT to_jsonb(p)
  INTO after_snapshot
  FROM public.point_policies p
  WHERE p.id = new_policy_id;

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
    'policy.base.save',
    'point_policies',
    new_policy_id::text,
    before_snapshot,
    after_snapshot,
    _reason
  );

  RETURN public.get_admin_base_policy();
END;
$$;

-- disable_admin_base_policy: policies.write
CREATE OR REPLACE FUNCTION public.disable_admin_base_policy(
  _policy_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_policy public.point_policies%ROWTYPE;
  after_policy public.point_policies%ROWTYPE;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'base policy disable reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_policy
  FROM public.point_policies
  WHERE id = _policy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'base policy not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_policy.status::text = 'active' THEN
    RAISE EXCEPTION 'active policy cannot be disabled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.point_policies
  SET
    status = 'disabled',
    ends_at = COALESCE(ends_at, now()),
    updated_by = (select auth.uid()),
    updated_at = now()
  WHERE id = _policy_id
  RETURNING * INTO after_policy;

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
    'policy.base.disable',
    'point_policies',
    _policy_id::text,
    to_jsonb(current_policy),
    to_jsonb(after_policy),
    _reason
  );

  RETURN public.get_admin_base_policy();
END;
$$;

-- get_admin_tier_policies: policies.read
CREATE OR REPLACE FUNCTION public.get_admin_tier_policies()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('policies.read');

  SELECT jsonb_build_object(
    'tiers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', tier.id,
          'name', tier.name,
          'sort_order', tier.sort_order,
          'qualification_months', tier.qualification_months,
          'min_spend', tier.min_spend,
          'min_purchase_count', tier.min_purchase_count,
          'base_earn_rate', tier.base_earn_rate,
          'bonus_earn_rate', tier.bonus_earn_rate,
          'min_keep_spend', tier.min_keep_spend,
          'status', tier.status::text,
          'customer_count', COALESCE(customer_counts.customer_count, 0),
          'updated_at', tier.updated_at
        )
        ORDER BY tier.sort_order ASC, tier.created_at ASC
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM public.customer_tiers tier
  LEFT JOIN (
    SELECT tier_id, count(*)::INTEGER AS customer_count
    FROM public.profiles
    WHERE tier_id IS NOT NULL
    GROUP BY tier_id
  ) customer_counts ON customer_counts.tier_id = tier.id;

  RETURN result;
END;
$$;

-- save_admin_tier_policy: policies.write
CREATE OR REPLACE FUNCTION public.save_admin_tier_policy(
  _tier_id UUID,
  _name TEXT,
  _sort_order INTEGER,
  _qualification_months INTEGER,
  _min_spend INTEGER,
  _min_purchase_count INTEGER,
  _base_earn_rate NUMERIC,
  _bonus_earn_rate NUMERIC,
  _min_keep_spend INTEGER,
  _status TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_data JSONB;
  after_data JSONB;
  saved_id UUID;
  target_sort_order INTEGER;
  normalized_status public.policy_status;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'tier name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_tiers
    WHERE lower(name) = lower(trim(_name))
      AND (_tier_id IS NULL OR id <> _tier_id)
  ) THEN
    RAISE EXCEPTION 'tier name already exists' USING ERRCODE = '23505';
  END IF;

  IF _qualification_months < 1 OR _qualification_months > 24 THEN
    RAISE EXCEPTION 'tier qualification months must be between 1 and 24' USING ERRCODE = '22023';
  END IF;

  IF _base_earn_rate < 0 OR _base_earn_rate > 100
    OR _bonus_earn_rate < 0 OR _bonus_earn_rate > 100 THEN
    RAISE EXCEPTION 'tier earn rates must be between 0 and 100' USING ERRCODE = '22023';
  END IF;

  IF _min_spend < 0 OR _min_purchase_count < 0 OR _min_keep_spend < 0 THEN
    RAISE EXCEPTION 'tier numeric thresholds must be zero or positive' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'tier policy audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_status := _status::public.policy_status;
  IF normalized_status::text NOT IN ('active', 'paused', 'disabled') THEN
    RAISE EXCEPTION 'tier status is invalid' USING ERRCODE = '22023';
  END IF;

  IF _tier_id IS NOT NULL THEN
    SELECT to_jsonb(t) INTO before_data
    FROM public.customer_tiers t
    WHERE t.id = _tier_id
    FOR UPDATE;

    IF before_data IS NULL THEN
      RAISE EXCEPTION 'tier policy not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    before_data := NULL;
  END IF;

  SELECT COALESCE(max(sort_order), 0) + 1 INTO target_sort_order
  FROM public.customer_tiers
  WHERE _tier_id IS NULL OR id <> _tier_id;

  target_sort_order := COALESCE(NULLIF(_sort_order, 0), target_sort_order);

  IF _tier_id IS NULL
    AND EXISTS (SELECT 1 FROM public.customer_tiers WHERE sort_order = target_sort_order) THEN
    SELECT COALESCE(max(sort_order), 0) + 1 INTO target_sort_order
    FROM public.customer_tiers;
  END IF;

  IF _tier_id IS NULL THEN
    INSERT INTO public.customer_tiers (
      name,
      sort_order,
      qualification_months,
      min_spend,
      min_purchase_count,
      base_earn_rate,
      bonus_earn_rate,
      min_keep_spend,
      status,
      created_by,
      updated_by
    )
    VALUES (
      trim(_name),
      target_sort_order,
      _qualification_months,
      _min_spend,
      _min_purchase_count,
      _base_earn_rate,
      _bonus_earn_rate,
      _min_keep_spend,
      normalized_status,
      (select auth.uid()),
      (select auth.uid())
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.customer_tiers
    SET
      name = trim(_name),
      sort_order = target_sort_order,
      qualification_months = _qualification_months,
      min_spend = _min_spend,
      min_purchase_count = _min_purchase_count,
      base_earn_rate = _base_earn_rate,
      bonus_earn_rate = _bonus_earn_rate,
      min_keep_spend = _min_keep_spend,
      status = normalized_status,
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE id = _tier_id
    RETURNING id INTO saved_id;
  END IF;

  SELECT to_jsonb(t) INTO after_data
  FROM public.customer_tiers t
  WHERE t.id = saved_id;

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
    'policy.tier.save',
    'customer_tiers',
    saved_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_tier_policies();
END;
$$;

-- reorder_admin_tier_policies: policies.write
CREATE OR REPLACE FUNCTION public.reorder_admin_tier_policies(
  _tier_ids UUID[],
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tier_id UUID;
  index_value INTEGER := 0;
  before_data JSONB;
  after_data JSONB;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF COALESCE(array_length(_tier_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'tier order is required' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'tier reorder reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order), '[]'::jsonb)
  INTO before_data
  FROM public.customer_tiers t
  WHERE t.id = ANY(_tier_ids);

  FOREACH tier_id IN ARRAY _tier_ids LOOP
    index_value := index_value + 1;
    UPDATE public.customer_tiers
    SET sort_order = -index_value, updated_by = (select auth.uid()), updated_at = now()
    WHERE id = tier_id;
  END LOOP;

  index_value := 0;
  FOREACH tier_id IN ARRAY _tier_ids LOOP
    index_value := index_value + 1;
    UPDATE public.customer_tiers
    SET sort_order = index_value, updated_by = (select auth.uid()), updated_at = now()
    WHERE id = tier_id;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order), '[]'::jsonb)
  INTO after_data
  FROM public.customer_tiers t
  WHERE t.id = ANY(_tier_ids);

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    target_table,
    before_data,
    after_data,
    reason
  )
  VALUES (
    (select auth.uid()),
    'policy.tier.reorder',
    'customer_tiers',
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_tier_policies();
END;
$$;

-- disable_admin_tier_policy: policies.write
CREATE OR REPLACE FUNCTION public.disable_admin_tier_policy(
  _tier_id UUID,
  _replacement_tier_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_tier public.customer_tiers%ROWTYPE;
  after_tier public.customer_tiers%ROWTYPE;
  moved_count INTEGER;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'tier disable reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF _replacement_tier_id = _tier_id THEN
    RAISE EXCEPTION 'replacement tier cannot be the disabled tier' USING ERRCODE = '22023';
  END IF;

  IF _replacement_tier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customer_tiers
    WHERE id = _replacement_tier_id
      AND status::text <> 'disabled'
  ) THEN
    RAISE EXCEPTION 'replacement tier is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_tier
  FROM public.customer_tiers
  WHERE id = _tier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tier policy not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET tier_id = _replacement_tier_id, updated_at = now()
  WHERE tier_id = _tier_id;

  GET DIAGNOSTICS moved_count = ROW_COUNT;

  UPDATE public.customer_tiers
  SET
    status = 'disabled',
    updated_by = (select auth.uid()),
    updated_at = now()
  WHERE id = _tier_id
  RETURNING * INTO after_tier;

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
    'policy.tier.disable',
    'customer_tiers',
    _tier_id::text,
    to_jsonb(current_tier),
    jsonb_build_object(
      'tier', to_jsonb(after_tier),
      'replacement_tier_id', _replacement_tier_id,
      'moved_customer_count', moved_count
    ),
    _reason
  );

  RETURN public.get_admin_tier_policies();
END;
$$;

-- get_admin_product_policies: policies.read
CREATE OR REPLACE FUNCTION public.get_admin_product_policies()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('policies.read');

  SELECT jsonb_build_object(
    'policies',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', policy.id,
          'name', policy.name,
          'target_type', policy.target_type,
          'target_ids', policy.target_ids,
          'earning_rate', policy.earning_rate,
          'excluded', policy.excluded,
          'priority', policy.priority,
          'status', policy.status::text,
          'starts_at', policy.starts_at,
          'ends_at', policy.ends_at,
          'updated_at', policy.updated_at
        )
        ORDER BY
          CASE policy.target_type WHEN 'product' THEN 0 ELSE 1 END,
          policy.priority ASC,
          policy.updated_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM public.product_point_policies policy;

  RETURN result;
END;
$$;

-- search_admin_policy_targets: policies.read
CREATE OR REPLACE FUNCTION public.search_admin_policy_targets(
  _target_type TEXT,
  _query TEXT,
  _limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('policies.read');

  IF _target_type NOT IN ('product', 'category') THEN
    RAISE EXCEPTION 'target type is invalid' USING ERRCODE = '22023';
  END IF;

  WITH target_entries AS (
    SELECT DISTINCT policy.target_type, target_id
    FROM public.product_point_policies policy
    CROSS JOIN LATERAL unnest(policy.target_ids) AS target_id
    WHERE policy.target_type = _target_type
      AND (
        COALESCE(trim(_query), '') = ''
        OR target_id ILIKE '%' || trim(_query) || '%'
      )
    ORDER BY target_id ASC
    LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 20)
  )
  SELECT jsonb_build_object(
    'targets',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', target_id,
          'name', target_id,
          'target_type', target_type
        )
        ORDER BY target_id ASC
      ),
      '[]'::jsonb
    )
  )
  INTO result
  FROM target_entries;

  RETURN result;
END;
$$;

-- save_admin_product_policy: policies.write
CREATE OR REPLACE FUNCTION public.save_admin_product_policy(
  _policy_id UUID,
  _name TEXT,
  _target_type TEXT,
  _target_ids TEXT[],
  _earning_rate NUMERIC,
  _starts_at TIMESTAMPTZ,
  _ends_at TIMESTAMPTZ,
  _priority INTEGER,
  _excluded BOOLEAN,
  _status TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_data JSONB;
  after_data JSONB;
  saved_id UUID;
  normalized_target_ids TEXT[];
  normalized_status public.policy_status;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'product policy name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF _target_type NOT IN ('product', 'category') THEN
    RAISE EXCEPTION 'target type is invalid' USING ERRCODE = '22023';
  END IF;

  IF _target_ids IS NULL OR cardinality(_target_ids) = 0 THEN
    RAISE EXCEPTION 'target ids are required' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT trim(target_id) ORDER BY trim(target_id))
  INTO normalized_target_ids
  FROM unnest(_target_ids) AS target_id
  WHERE trim(target_id) <> '';

  IF normalized_target_ids IS NULL OR cardinality(normalized_target_ids) = 0 THEN
    RAISE EXCEPTION 'target ids are required' USING ERRCODE = '22023';
  END IF;

  IF _earning_rate IS NULL OR _earning_rate < 0 OR _earning_rate > 100 THEN
    RAISE EXCEPTION 'product policy earning rate must be between 0 and 100' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NULL OR _priority < 1 OR _priority > 999 THEN
    RAISE EXCEPTION 'product policy priority must be between 1 and 999' USING ERRCODE = '22023';
  END IF;

  IF _starts_at IS NOT NULL AND _ends_at IS NOT NULL AND _ends_at <= _starts_at THEN
    RAISE EXCEPTION 'product policy end time must be after start time' USING ERRCODE = '22023';
  END IF;

  IF _status NOT IN ('draft', 'scheduled', 'active', 'paused', 'ended', 'disabled') THEN
    RAISE EXCEPTION 'product policy status is invalid' USING ERRCODE = '22023';
  END IF;

  normalized_status := _status::public.policy_status;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'product policy audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF normalized_status::text IN ('active', 'scheduled')
    AND EXISTS (
      SELECT 1
      FROM public.product_point_policies policy
      WHERE policy.target_type = _target_type
        AND policy.priority = _priority
        AND policy.status::text IN ('active', 'scheduled')
        AND (_policy_id IS NULL OR policy.id <> _policy_id)
    ) THEN
    RAISE EXCEPTION 'priority conflict' USING ERRCODE = '23505';
  END IF;

  IF _policy_id IS NOT NULL THEN
    SELECT to_jsonb(policy) INTO before_data
    FROM public.product_point_policies policy
    WHERE policy.id = _policy_id
    FOR UPDATE;

    IF before_data IS NULL THEN
      RAISE EXCEPTION 'product policy not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    before_data := NULL;
  END IF;

  IF _policy_id IS NULL THEN
    INSERT INTO public.product_point_policies (
      name,
      target_type,
      target_ids,
      earning_rate,
      starts_at,
      ends_at,
      priority,
      excluded,
      status,
      created_by,
      updated_by
    )
    VALUES (
      trim(_name),
      _target_type,
      normalized_target_ids,
      _earning_rate,
      _starts_at,
      _ends_at,
      _priority,
      COALESCE(_excluded, false),
      normalized_status,
      (select auth.uid()),
      (select auth.uid())
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.product_point_policies
    SET
      name = trim(_name),
      target_type = _target_type,
      target_ids = normalized_target_ids,
      earning_rate = _earning_rate,
      starts_at = _starts_at,
      ends_at = _ends_at,
      priority = _priority,
      excluded = COALESCE(_excluded, false),
      status = normalized_status,
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE id = _policy_id
    RETURNING id INTO saved_id;
  END IF;

  SELECT to_jsonb(policy) INTO after_data
  FROM public.product_point_policies policy
  WHERE policy.id = saved_id;

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
    'policy.product.save',
    'product_point_policies',
    saved_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_product_policies();
END;
$$;

-- disable_admin_product_policy: policies.write
CREATE OR REPLACE FUNCTION public.disable_admin_product_policy(
  _policy_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_policy public.product_point_policies%ROWTYPE;
  after_policy public.product_point_policies%ROWTYPE;
BEGIN
  PERFORM public.require_admin_permission('policies.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'product policy disable reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_policy
  FROM public.product_point_policies
  WHERE id = _policy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product policy not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.product_point_policies
  SET
    status = 'disabled',
    ends_at = COALESCE(ends_at, now()),
    updated_by = (select auth.uid()),
    updated_at = now()
  WHERE id = _policy_id
  RETURNING * INTO after_policy;

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
    'policy.product.disable',
    'product_point_policies',
    _policy_id::text,
    to_jsonb(current_policy),
    to_jsonb(after_policy),
    _reason
  );

  RETURN public.get_admin_product_policies();
END;
$$;

-- get_admin_events: events.read
CREATE OR REPLACE FUNCTION public.get_admin_events()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('events.read');

  WITH
  events_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'name', event.name,
          'description', event.description,
          'status', event.status::text,
          'starts_at', event.starts_at,
          'ends_at', event.ends_at,
          'target_rules', event.target_rules,
          'reward_type', event.reward_type,
          'reward_value', event.reward_value,
          'customer_limit', event.customer_limit,
          'total_budget_points', event.total_budget_points,
          'spent_points', event.spent_points,
          'priority', event.priority,
          'updated_at', event.updated_at
        )
        ORDER BY
          CASE event.status::text
            WHEN 'active' THEN 0
            WHEN 'scheduled' THEN 1
            WHEN 'paused' THEN 2
            WHEN 'draft' THEN 3
            ELSE 4
          END,
          event.starts_at ASC,
          event.priority ASC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.point_events event
  ),
  overlap_events AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_id', first_event.id,
          'event_name', first_event.name,
          'overlap_event_id', second_event.id,
          'overlap_event_name', second_event.name
        )
        ORDER BY first_event.starts_at ASC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.point_events first_event
    JOIN public.point_events second_event
      ON first_event.id < second_event.id
     AND first_event.status::text IN ('active', 'scheduled', 'paused')
     AND second_event.status::text IN ('active', 'scheduled', 'paused')
     AND tstzrange(first_event.starts_at, COALESCE(first_event.ends_at, 'infinity'::timestamptz), '[]')
       && tstzrange(second_event.starts_at, COALESCE(second_event.ends_at, 'infinity'::timestamptz), '[]')
  )
  SELECT jsonb_build_object(
    'events', events_json.items,
    'overlap_events', overlap_events.items
  )
  INTO result
  FROM events_json, overlap_events;

  RETURN result;
END;
$$;

-- save_admin_event: events.write
CREATE OR REPLACE FUNCTION public.save_admin_event(
  _event_id UUID,
  _name TEXT,
  _description TEXT,
  _starts_at TIMESTAMPTZ,
  _ends_at TIMESTAMPTZ,
  _target_rules JSONB,
  _reward_type TEXT,
  _reward_value NUMERIC,
  _customer_limit INTEGER,
  _total_budget_points INTEGER,
  _priority INTEGER,
  _status TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_data JSONB;
  after_data JSONB;
  saved_id UUID;
  normalized_status public.policy_status;
BEGIN
  PERFORM public.require_admin_permission('events.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'event name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF _starts_at IS NULL THEN
    RAISE EXCEPTION 'event start time is required' USING ERRCODE = '22023';
  END IF;

  IF _ends_at IS NOT NULL AND _ends_at < _starts_at THEN
    RAISE EXCEPTION 'event end time must be after start time' USING ERRCODE = '22023';
  END IF;

  IF _reward_type NOT IN ('rate', 'fixed') THEN
    RAISE EXCEPTION 'event reward type is invalid' USING ERRCODE = '22023';
  END IF;

  IF _reward_value IS NULL OR _reward_value <= 0 THEN
    RAISE EXCEPTION 'event reward value must be positive' USING ERRCODE = '22023';
  END IF;

  IF _reward_type = 'rate' AND _reward_value > 100 THEN
    RAISE EXCEPTION 'event reward rate must be 100 or less' USING ERRCODE = '22023';
  END IF;

  IF _customer_limit IS NOT NULL AND _customer_limit <= 0 THEN
    RAISE EXCEPTION 'event customer limit must be positive' USING ERRCODE = '22023';
  END IF;

  IF _total_budget_points IS NOT NULL AND _total_budget_points < 0 THEN
    RAISE EXCEPTION 'event total budget must be zero or positive' USING ERRCODE = '22023';
  END IF;

  IF _priority IS NULL OR _priority < 1 OR _priority > 999 THEN
    RAISE EXCEPTION 'event priority must be between 1 and 999' USING ERRCODE = '22023';
  END IF;

  IF _status NOT IN ('draft', 'scheduled', 'active', 'paused', 'ended', 'disabled') THEN
    RAISE EXCEPTION 'event status is invalid' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'event audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_status := _status::public.policy_status;

  IF _event_id IS NOT NULL THEN
    SELECT to_jsonb(event) INTO before_data
    FROM public.point_events event
    WHERE event.id = _event_id
    FOR UPDATE;

    IF before_data IS NULL THEN
      RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    before_data := NULL;
  END IF;

  IF _event_id IS NULL THEN
    INSERT INTO public.point_events (
      name,
      description,
      status,
      starts_at,
      ends_at,
      target_rules,
      reward_type,
      reward_value,
      customer_limit,
      total_budget_points,
      priority,
      created_by,
      updated_by
    )
    VALUES (
      trim(_name),
      NULLIF(trim(COALESCE(_description, '')), ''),
      normalized_status,
      _starts_at,
      _ends_at,
      COALESCE(_target_rules, '{}'::jsonb),
      _reward_type,
      _reward_value,
      _customer_limit,
      _total_budget_points,
      _priority,
      (select auth.uid()),
      (select auth.uid())
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.point_events
    SET
      name = trim(_name),
      description = NULLIF(trim(COALESCE(_description, '')), ''),
      status = normalized_status,
      starts_at = _starts_at,
      ends_at = _ends_at,
      target_rules = COALESCE(_target_rules, '{}'::jsonb),
      reward_type = _reward_type,
      reward_value = _reward_value,
      customer_limit = _customer_limit,
      total_budget_points = _total_budget_points,
      priority = _priority,
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE id = _event_id
    RETURNING id INTO saved_id;
  END IF;

  SELECT to_jsonb(event) INTO after_data
  FROM public.point_events event
  WHERE event.id = saved_id;

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
    'policy.event.save',
    'point_events',
    saved_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_events();
END;
$$;

-- update_admin_event_status: events.write
CREATE OR REPLACE FUNCTION public.update_admin_event_status(
  _event_id UUID,
  _status TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_event public.point_events%ROWTYPE;
  after_event public.point_events%ROWTYPE;
  normalized_status public.policy_status;
BEGIN
  PERFORM public.require_admin_permission('events.write');

  IF _status NOT IN ('draft', 'scheduled', 'active', 'paused', 'ended', 'disabled') THEN
    RAISE EXCEPTION 'event status is invalid' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'event status reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_status := _status::public.policy_status;

  SELECT * INTO current_event
  FROM public.point_events
  WHERE id = _event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.point_events
  SET
    status = normalized_status,
    updated_by = (select auth.uid()),
    updated_at = now()
  WHERE id = _event_id
  RETURNING * INTO after_event;

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
    'policy.event.status',
    'point_events',
    _event_id::text,
    to_jsonb(current_event),
    to_jsonb(after_event),
    _reason
  );

  RETURN public.get_admin_events();
END;
$$;

-- get_admin_integrations: integrations.read
CREATE OR REPLACE FUNCTION public.get_admin_integrations()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('integrations.read');

  WITH
  api_keys_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', key.id,
          'name', key.name,
          'key_prefix', key.key_prefix,
          'key_suffix', key.key_suffix,
          'status', key.status,
          'last_used_at', key.last_used_at,
          'created_at', key.created_at
        )
        ORDER BY key.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.api_keys key
  ),
  webhooks_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', webhook.id,
          'name', COALESCE(webhook.name, webhook.url),
          'url', webhook.url,
          'event_types', webhook.event_types,
          'signing_key_prefix', webhook.signing_key_prefix,
          'signing_key_suffix', webhook.signing_key_suffix,
          'status', webhook.status,
          'last_tested_at', webhook.last_tested_at,
          'created_at', webhook.created_at
        )
        ORDER BY webhook.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.webhooks webhook
  ),
  status_json AS (
    SELECT jsonb_build_object(
      'total_requests', COUNT(log.id),
      'success_count', COUNT(log.id) FILTER (WHERE log.status_code >= 200 AND log.status_code < 300),
      'failure_count', COUNT(log.id) FILTER (
        WHERE log.status_code IS NULL OR log.status_code >= 400 OR log.error_code IS NOT NULL
      ),
      'success_rate', CASE
        WHEN COUNT(log.id) = 0 THEN 0
        ELSE ROUND(
          (
            COUNT(log.id) FILTER (WHERE log.status_code >= 200 AND log.status_code < 300)
          )::numeric / COUNT(log.id) * 100
        )
      END,
      'avg_response_time_ms', COALESCE(ROUND(AVG(log.response_time_ms)), 0),
      'recent_failure_at', MAX(log.created_at) FILTER (
        WHERE log.status_code IS NULL OR log.status_code >= 400 OR log.error_code IS NOT NULL
      )
    ) AS item
    FROM public.webhook_logs log
  ),
  failure_logs_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', failure.id,
          'webhook_id', failure.webhook_id,
          'webhook_name', failure.webhook_name,
          'request_id', failure.request_id,
          'endpoint', failure.endpoint,
          'status_code', failure.status_code,
          'error_code', failure.error_code,
          'error_message', failure.error_message,
          'response_time_ms', failure.response_time_ms,
          'retry_count', failure.retry_count,
          'created_at', failure.created_at
        )
        ORDER BY failure.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM (
      SELECT
        log.id,
        log.webhook_id,
        COALESCE(webhook.name, webhook.url, '-') AS webhook_name,
        log.request_id,
        log.endpoint,
        log.status_code,
        log.error_code,
        log.error_message,
        log.response_time_ms,
        log.retry_count,
        log.created_at
      FROM public.webhook_logs log
      LEFT JOIN public.webhooks webhook ON webhook.id = log.webhook_id
      WHERE log.status_code IS NULL OR log.status_code >= 400 OR log.error_code IS NOT NULL
      ORDER BY log.created_at DESC
      LIMIT 20
    ) failure
  )
  SELECT jsonb_build_object(
    'api_keys', api_keys_json.items,
    'webhooks', webhooks_json.items,
    'status', status_json.item,
    'failure_logs', failure_logs_json.items
  )
  INTO result
  FROM api_keys_json, webhooks_json, status_json, failure_logs_json;

  RETURN result;
END;
$$;

-- create_admin_api_key: integrations.write
CREATE OR REPLACE FUNCTION public.create_admin_api_key(
  _name TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_key TEXT;
  saved_id UUID;
  after_data JSONB;
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'api key name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'api key audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  raw_key := public.generate_admin_integration_secret('ak_live_');

  INSERT INTO public.api_keys (
    name,
    key_hash,
    key_prefix,
    key_suffix,
    status,
    created_by
  )
  VALUES (
    trim(_name),
    encode(extensions.digest(raw_key, 'sha256'), 'hex'),
    left(raw_key, 10),
    right(raw_key, 4),
    'active',
    (select auth.uid())
  )
  RETURNING id INTO saved_id;

  SELECT jsonb_build_object(
    'id', key.id,
    'name', key.name,
    'key_prefix', key.key_prefix,
    'key_suffix', key.key_suffix,
    'status', key.status
  )
  INTO after_data
  FROM public.api_keys key
  WHERE key.id = saved_id;

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
    'integration.api_key.create',
    'api_keys',
    saved_id::text,
    after_data,
    _reason
  );

  RETURN jsonb_build_object(
    'api_key_secret', raw_key,
    'integrations', public.get_admin_integrations()
  );
END;
$$;

-- regenerate_admin_api_key: integrations.write
CREATE OR REPLACE FUNCTION public.regenerate_admin_api_key(
  _api_key_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_key TEXT;
  before_data JSONB;
  after_data JSONB;
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'api key regenerate reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', key.id,
    'name', key.name,
    'key_prefix', key.key_prefix,
    'key_suffix', key.key_suffix,
    'status', key.status
  )
  INTO before_data
  FROM public.api_keys key
  WHERE key.id = _api_key_id
  FOR UPDATE;

  IF before_data IS NULL THEN
    RAISE EXCEPTION 'api key not found' USING ERRCODE = 'P0002';
  END IF;

  raw_key := public.generate_admin_integration_secret('ak_live_');

  UPDATE public.api_keys
  SET
    key_hash = encode(extensions.digest(raw_key, 'sha256'), 'hex'),
    key_prefix = left(raw_key, 10),
    key_suffix = right(raw_key, 4),
    status = 'active',
    last_rotated_at = now(),
    revoked_at = NULL,
    revoked_by = NULL
  WHERE id = _api_key_id;

  SELECT jsonb_build_object(
    'id', key.id,
    'name', key.name,
    'key_prefix', key.key_prefix,
    'key_suffix', key.key_suffix,
    'status', key.status
  )
  INTO after_data
  FROM public.api_keys key
  WHERE key.id = _api_key_id;

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
    'integration.api_key.regenerate',
    'api_keys',
    _api_key_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN jsonb_build_object(
    'api_key_secret', raw_key,
    'integrations', public.get_admin_integrations()
  );
END;
$$;

-- revoke_admin_api_key: integrations.write
CREATE OR REPLACE FUNCTION public.revoke_admin_api_key(
  _api_key_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_data JSONB;
  after_data JSONB;
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'api key revoke reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'id', key.id,
    'name', key.name,
    'key_prefix', key.key_prefix,
    'key_suffix', key.key_suffix,
    'status', key.status
  )
  INTO before_data
  FROM public.api_keys key
  WHERE key.id = _api_key_id
  FOR UPDATE;

  IF before_data IS NULL THEN
    RAISE EXCEPTION 'api key not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.api_keys
  SET
    status = 'revoked',
    revoked_at = now(),
    revoked_by = (select auth.uid())
  WHERE id = _api_key_id;

  SELECT jsonb_build_object(
    'id', key.id,
    'name', key.name,
    'key_prefix', key.key_prefix,
    'key_suffix', key.key_suffix,
    'status', key.status
  )
  INTO after_data
  FROM public.api_keys key
  WHERE key.id = _api_key_id;

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
    'integration.api_key.revoke',
    'api_keys',
    _api_key_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_integrations();
END;
$$;

-- save_admin_webhook: integrations.write
CREATE OR REPLACE FUNCTION public.save_admin_webhook(
  _webhook_id UUID,
  _name TEXT,
  _url TEXT,
  _event_types TEXT[],
  _status TEXT,
  _rotate_signing_key BOOLEAN,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_secret TEXT;
  before_data JSONB;
  after_data JSONB;
  saved_id UUID;
  allowed_event_types TEXT[] := ARRAY[
    'point.earned',
    'point.used',
    'point.canceled',
    'customer.updated',
    'event.rewarded'
  ];
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_name, ''))) < 2 OR char_length(trim(COALESCE(_name, ''))) > 50 THEN
    RAISE EXCEPTION 'webhook name must be 2 to 50 characters' USING ERRCODE = '22023';
  END IF;

  IF trim(COALESCE(_url, '')) !~ '^https://.+' THEN
    RAISE EXCEPTION 'webhook url must start with https' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(cardinality(_event_types), 0) = 0 THEN
    RAISE EXCEPTION 'webhook event types are required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(_event_types) event_type
    WHERE NOT event_type = ANY(allowed_event_types)
  ) THEN
    RAISE EXCEPTION 'webhook event type is invalid' USING ERRCODE = '22023';
  END IF;

  IF _status NOT IN ('active', 'paused', 'disabled') THEN
    RAISE EXCEPTION 'webhook status is invalid' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'webhook audit reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  IF _webhook_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', webhook.id,
      'name', webhook.name,
      'url', webhook.url,
      'event_types', webhook.event_types,
      'signing_key_prefix', webhook.signing_key_prefix,
      'signing_key_suffix', webhook.signing_key_suffix,
      'status', webhook.status
    )
    INTO before_data
    FROM public.webhooks webhook
    WHERE webhook.id = _webhook_id
    FOR UPDATE;

    IF before_data IS NULL THEN
      RAISE EXCEPTION 'webhook not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    before_data := NULL;
  END IF;

  IF _webhook_id IS NULL OR _rotate_signing_key THEN
    raw_secret := public.generate_admin_integration_secret('whsec_');
  END IF;

  IF _webhook_id IS NULL THEN
    INSERT INTO public.webhooks (
      name,
      url,
      event_types,
      signing_key,
      signing_key_prefix,
      signing_key_suffix,
      status,
      created_by,
      updated_by
    )
    VALUES (
      trim(_name),
      trim(_url),
      _event_types,
      raw_secret,
      left(raw_secret, 10),
      right(raw_secret, 4),
      _status,
      (select auth.uid()),
      (select auth.uid())
    )
    RETURNING id INTO saved_id;
  ELSE
    UPDATE public.webhooks
    SET
      name = trim(_name),
      url = trim(_url),
      event_types = _event_types,
      signing_key = COALESCE(raw_secret, signing_key),
      signing_key_prefix = COALESCE(left(raw_secret, 10), signing_key_prefix),
      signing_key_suffix = COALESCE(right(raw_secret, 4), signing_key_suffix),
      status = _status,
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE id = _webhook_id
    RETURNING id INTO saved_id;
  END IF;

  SELECT jsonb_build_object(
    'id', webhook.id,
    'name', webhook.name,
    'url', webhook.url,
    'event_types', webhook.event_types,
    'signing_key_prefix', webhook.signing_key_prefix,
    'signing_key_suffix', webhook.signing_key_suffix,
    'status', webhook.status
  )
  INTO after_data
  FROM public.webhooks webhook
  WHERE webhook.id = saved_id;

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
    'integration.webhook.save',
    'webhooks',
    saved_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN jsonb_build_object(
    'webhook_secret', raw_secret,
    'integrations', public.get_admin_integrations()
  );
END;
$$;

-- test_admin_webhook: integrations.write
CREATE OR REPLACE FUNCTION public.test_admin_webhook(
  _webhook_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_webhook public.webhooks%ROWTYPE;
  request_id TEXT;
  log_id UUID;
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'webhook test reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_webhook
  FROM public.webhooks
  WHERE id = _webhook_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook not found' USING ERRCODE = 'P0002';
  END IF;

  request_id := 'wh_test_' || encode(extensions.gen_random_bytes(8), 'hex');

  INSERT INTO public.webhook_logs (
    webhook_id,
    request_id,
    endpoint,
    event_type,
    payload,
    status_code,
    response_time_ms,
    error_code,
    error_message
  )
  VALUES (
    current_webhook.id,
    request_id,
    current_webhook.url,
    'webhook.test',
    jsonb_build_object('test', true, 'webhook_id', current_webhook.id),
    202,
    0,
    NULL,
    NULL
  )
  RETURNING id INTO log_id;

  UPDATE public.webhooks
  SET
    last_tested_at = now(),
    last_success_at = now()
  WHERE id = current_webhook.id;

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
    'integration.webhook.test',
    'webhook_logs',
    log_id::text,
    jsonb_build_object('request_id', request_id, 'status_code', 202),
    _reason
  );

  RETURN public.get_admin_integrations();
END;
$$;

-- retry_admin_webhook_log: integrations.write
CREATE OR REPLACE FUNCTION public.retry_admin_webhook_log(
  _log_id UUID,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_log public.webhook_logs%ROWTYPE;
  retry_log_id UUID;
  request_id TEXT;
BEGIN
  PERFORM public.require_admin_permission('integrations.write');

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'webhook retry reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_log
  FROM public.webhook_logs
  WHERE id = _log_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook log not found' USING ERRCODE = 'P0002';
  END IF;

  request_id := 'wh_retry_' || encode(extensions.gen_random_bytes(8), 'hex');

  UPDATE public.webhook_logs
  SET
    retry_count = retry_count + 1,
    retried_at = now()
  WHERE id = _log_id;

  INSERT INTO public.webhook_logs (
    webhook_id,
    request_id,
    endpoint,
    event_type,
    payload,
    status_code,
    response_time_ms,
    retry_count
  )
  VALUES (
    current_log.webhook_id,
    request_id,
    current_log.endpoint,
    COALESCE(current_log.event_type, 'webhook.retry'),
    COALESCE(current_log.payload, '{}'::jsonb),
    202,
    0,
    current_log.retry_count + 1
  )
  RETURNING id INTO retry_log_id;

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
    'integration.webhook.retry',
    'webhook_logs',
    _log_id::text,
    to_jsonb(current_log),
    jsonb_build_object('retry_log_id', retry_log_id, 'request_id', request_id),
    _reason
  );

  RETURN public.get_admin_integrations();
END;
$$;

-- get_admin_brand_settings: brand.read
CREATE OR REPLACE FUNCTION public.get_admin_brand_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('brand.read');

  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'service_name', setting.service_name,
        'point_label', setting.point_label,
        'logo_url', setting.logo_url,
        'primary_color', setting.primary_color,
        'secondary_color', setting.secondary_color,
        'home_message', setting.home_message,
        'updated_at', setting.updated_at
      )
      FROM public.brand_settings setting
      ORDER BY setting.updated_at DESC
      LIMIT 1
    ),
    jsonb_build_object(
      'service_name', '포인트 라운지',
      'point_label', 'P',
      'logo_url', NULL,
      'primary_color', '#2563EB',
      'secondary_color', NULL,
      'home_message', NULL,
      'updated_at', NULL
    )
  )
  INTO result;

  RETURN result;
END;
$$;

-- save_admin_brand_settings: brand.write
CREATE OR REPLACE FUNCTION public.save_admin_brand_settings(
  _service_name TEXT,
  _point_label TEXT,
  _logo_url TEXT,
  _primary_color TEXT,
  _secondary_color TEXT,
  _home_message TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
  before_data JSONB;
  after_data JSONB;
BEGIN
  PERFORM public.require_admin_permission('brand.write');

  IF char_length(trim(COALESCE(_service_name, ''))) < 2
     OR char_length(trim(COALESCE(_service_name, ''))) > 30 THEN
    RAISE EXCEPTION 'service name must be 2 to 30 characters' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_point_label, ''))) < 1
     OR char_length(trim(COALESCE(_point_label, ''))) > 12 THEN
    RAISE EXCEPTION 'point label must be 1 to 12 characters' USING ERRCODE = '22023';
  END IF;

  IF _primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'primary color must be hex' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(trim(_secondary_color), '') <> '' AND _secondary_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'secondary color must be hex' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_home_message, ''))) > 100 THEN
    RAISE EXCEPTION 'home message must be 100 characters or less' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'brand settings reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  SELECT setting.id, to_jsonb(setting)
  INTO target_id, before_data
  FROM public.brand_settings setting
  ORDER BY setting.updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF target_id IS NULL THEN
    INSERT INTO public.brand_settings (
      service_name,
      point_label,
      logo_url,
      primary_color,
      secondary_color,
      home_message,
      updated_by
    )
    VALUES (
      trim(_service_name),
      trim(_point_label),
      NULLIF(trim(COALESCE(_logo_url, '')), ''),
      upper(trim(_primary_color)),
      NULLIF(upper(trim(COALESCE(_secondary_color, ''))), ''),
      NULLIF(trim(COALESCE(_home_message, '')), ''),
      (select auth.uid())
    )
    RETURNING id INTO target_id;
  ELSE
    UPDATE public.brand_settings
    SET
      service_name = trim(_service_name),
      point_label = trim(_point_label),
      logo_url = NULLIF(trim(COALESCE(_logo_url, '')), ''),
      primary_color = upper(trim(_primary_color)),
      secondary_color = NULLIF(upper(trim(COALESCE(_secondary_color, ''))), ''),
      home_message = NULLIF(trim(COALESCE(_home_message, '')), ''),
      updated_by = (select auth.uid()),
      updated_at = now()
    WHERE id = target_id;
  END IF;

  SELECT to_jsonb(setting)
  INTO after_data
  FROM public.brand_settings setting
  WHERE setting.id = target_id;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_table,
    target_id,
    before_data,
    after_data,
    reason
  )
  SELECT
    (select auth.uid()),
    profile.admin_role,
    'settings.brand.save',
    'brand_settings',
    target_id::text,
    before_data,
    after_data,
    _reason
  FROM public.profiles profile
  WHERE profile.id = (select auth.uid());

  RETURN public.get_admin_brand_settings();
END;
$$;

-- get_admin_admins: admins.read
CREATE OR REPLACE FUNCTION public.get_admin_admins()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  PERFORM public.require_admin_permission('admins.read');

  WITH
  admins_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', profile.id,
          'full_name', profile.full_name,
          'email', profile.email,
          'admin_role', COALESCE(profile.admin_role, 'viewer'::public.admin_role)::text,
          'status', profile.status::text,
          'created_at', profile.created_at
        )
        ORDER BY
          CASE COALESCE(profile.admin_role, 'viewer'::public.admin_role)::text
            WHEN 'owner' THEN 0
            WHEN 'manager' THEN 1
            WHEN 'operator' THEN 2
            ELSE 3
          END,
          profile.created_at ASC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.profiles profile
    WHERE public.has_role(profile.id, 'admin')
  ),
  invitations_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', invitation.id,
          'email', invitation.email,
          'admin_role', invitation.admin_role::text,
          'status', CASE
            WHEN invitation.status = 'pending' AND invitation.expires_at <= now() THEN 'expired'
            ELSE invitation.status
          END,
          'expires_at', invitation.expires_at,
          'created_at', invitation.created_at
        )
        ORDER BY invitation.created_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.admin_invitations invitation
    WHERE invitation.status = 'pending'
       OR invitation.created_at >= now() - INTERVAL '30 days'
  )
  SELECT jsonb_build_object(
    'admins', admins_json.items,
    'invitations', invitations_json.items
  )
  INTO result
  FROM admins_json, invitations_json;

  RETURN result;
END;
$$;

-- invite_admin_user: admins.write
CREATE OR REPLACE FUNCTION public.invite_admin_user(
  _email TEXT,
  _admin_role TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_token TEXT;
  saved_id UUID;
  after_data JSONB;
  normalized_role public.admin_role;
BEGIN
  PERFORM public.require_admin_permission('admins.write');

  IF lower(trim(COALESCE(_email, ''))) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'valid email is required' USING ERRCODE = '22023';
  END IF;

  IF _admin_role NOT IN ('owner', 'manager', 'operator', 'viewer') THEN
    RAISE EXCEPTION 'admin role is invalid' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'admin invite reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_role := _admin_role::public.admin_role;
  raw_token := 'adm_inv_' || encode(extensions.gen_random_bytes(24), 'hex');

  INSERT INTO public.admin_invitations (
    email,
    admin_role,
    token_hash,
    token_prefix,
    token_suffix,
    status,
    expires_at,
    created_by
  )
  VALUES (
    lower(trim(_email)),
    normalized_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    left(raw_token, 12),
    right(raw_token, 4),
    'pending',
    now() + INTERVAL '24 hours',
    (select auth.uid())
  )
  RETURNING id INTO saved_id;

  SELECT jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'admin_role', invitation.admin_role::text,
    'status', invitation.status,
    'expires_at', invitation.expires_at
  )
  INTO after_data
  FROM public.admin_invitations invitation
  WHERE invitation.id = saved_id;

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
    'settings.admin.invite',
    'admin_invitations',
    saved_id::text,
    after_data,
    _reason
  );

  RETURN jsonb_build_object(
    'invite_token', raw_token,
    'admins', public.get_admin_admins()
  );
END;
$$;

-- update_admin_role: admins.write
CREATE OR REPLACE FUNCTION public.update_admin_role(
  _user_id UUID,
  _admin_role TEXT,
  _reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_data JSONB;
  after_data JSONB;
  selected_admin_role public.admin_role;
  normalized_role public.admin_role;
  other_owner_count INTEGER;
BEGIN
  PERFORM public.require_admin_permission('admins.write');

  IF _admin_role NOT IN ('owner', 'manager', 'operator', 'viewer') THEN
    RAISE EXCEPTION 'admin role is invalid' USING ERRCODE = '22023';
  END IF;

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'admin role reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  normalized_role := _admin_role::public.admin_role;

  SELECT profile.admin_role, to_jsonb(profile)
  INTO selected_admin_role, before_data
  FROM public.profiles profile
  WHERE profile.id = _user_id
  FOR UPDATE;

  IF before_data IS NULL THEN
    RAISE EXCEPTION 'admin user not found' USING ERRCODE = 'P0002';
  END IF;

  IF selected_admin_role = 'owner'::public.admin_role AND normalized_role <> 'owner'::public.admin_role THEN
    SELECT COUNT(*) INTO other_owner_count
    FROM public.profiles profile
    WHERE profile.id <> _user_id
      AND profile.admin_role = 'owner'::public.admin_role
      AND public.has_role(profile.id, 'admin');

    IF other_owner_count = 0 THEN
      RAISE EXCEPTION 'owner minimum must be maintained' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET admin_role = normalized_role
  WHERE id = _user_id;

  SELECT to_jsonb(profile)
  INTO after_data
  FROM public.profiles profile
  WHERE profile.id = _user_id;

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
    'settings.admin.role',
    'profiles',
    _user_id::text,
    before_data,
    after_data,
    _reason
  );

  RETURN public.get_admin_admins();
END;
$$;

-- get_admin_audit_logs: audit.read
CREATE OR REPLACE FUNCTION public.get_admin_audit_logs(
  _actor_id UUID DEFAULT NULL,
  _action TEXT DEFAULT NULL,
  _target_table TEXT DEFAULT NULL,
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
  result JSONB;
  safe_page INTEGER := GREATEST(COALESCE(_page, 1), 1);
  safe_page_size INTEGER := LEAST(GREATEST(COALESCE(_page_size, 20), 1), 100);
BEGIN
  PERFORM public.require_admin_permission('audit.read');

  WITH filtered_logs AS (
    SELECT log.*
    FROM public.audit_logs log
    WHERE (_actor_id IS NULL OR log.actor_id = _actor_id)
      AND (_action IS NULL OR log.action = _action)
      AND (_target_table IS NULL OR log.target_table = _target_table)
      AND (_date_from IS NULL OR log.created_at >= _date_from::timestamptz)
      AND (_date_to IS NULL OR log.created_at < (_date_to + 1)::timestamptz)
  ),
  count_json AS (
    SELECT COUNT(*)::INTEGER AS total_count FROM filtered_logs
  ),
  page_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', log.id,
          'actor_id', log.actor_id,
          'actor_name', profile.full_name,
          'actor_email', profile.email,
          'actor_role', COALESCE(log.actor_role::text, profile.admin_role::text),
          'action', log.action,
          'target_table', log.target_table,
          'target_id', log.target_id,
          'before_data', log.before_data,
          'after_data', log.after_data,
          'reason', log.reason,
          'ip_address', log.ip_address::text,
          'user_agent', log.user_agent,
          'created_at', log.created_at
        )
        ORDER BY log.created_at DESC
      ),
      '[]'::jsonb
    ) AS logs
    FROM (
      SELECT *
      FROM filtered_logs
      ORDER BY created_at DESC
      LIMIT safe_page_size
      OFFSET (safe_page - 1) * safe_page_size
    ) log
    LEFT JOIN public.profiles profile ON profile.id = log.actor_id
  )
  SELECT jsonb_build_object(
    'source', 'audit_logs',
    'logs', page_json.logs,
    'total_count', count_json.total_count
  )
  INTO result
  FROM page_json, count_json;

  RETURN result;
END;
$$;

-- get_admin_reports: reports.read
CREATE OR REPLACE FUNCTION public.get_admin_reports(
  _date_from TIMESTAMPTZ,
  _date_to TIMESTAMPTZ,
  _limit INTEGER DEFAULT 10000
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(_limit, 10000), 1), 10000);
BEGIN
  PERFORM public.require_admin_permission('reports.read');

  IF _date_from IS NULL OR _date_to IS NULL OR _date_to <= _date_from THEN
    RAISE EXCEPTION 'valid report date range is required' USING ERRCODE = '22023';
  END IF;

  WITH
  filtered_transactions AS (
    SELECT
      tx.id,
      tx.user_id,
      tx.type,
      tx.status,
      tx.amount,
      tx.balance_after,
      tx.memo,
      tx.created_at,
      profile.full_name AS customer_name,
      profile.email AS customer_email
    FROM public.point_transactions tx
    LEFT JOIN public.profiles profile ON profile.id = tx.user_id
    WHERE tx.created_at >= _date_from
      AND tx.created_at < _date_to
  ),
  confirmed_transactions AS (
    SELECT *
    FROM filtered_transactions tx
    WHERE tx.status::text IN ('completed', 'confirmed')
  ),
  date_spine AS (
    SELECT generate_series(
      date_trunc('day', _date_from),
      date_trunc('day', _date_to - INTERVAL '1 second'),
      INTERVAL '1 day'
    )::date AS report_date
  ),
  daily_totals AS (
    SELECT
      (tx.created_at AT TIME ZONE 'Asia/Seoul')::date AS report_date,
      COALESCE(SUM(CASE
        WHEN tx.type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
          THEN tx.amount
        ELSE 0
      END), 0)::BIGINT AS earned,
      COALESCE(SUM(CASE
        WHEN tx.type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel')
          THEN tx.amount
        ELSE 0
      END), 0)::BIGINT AS used
    FROM confirmed_transactions tx
    GROUP BY 1
  ),
  trend_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', spine.report_date,
          'earned', COALESCE(total.earned, 0),
          'used', COALESCE(total.used, 0)
        )
        ORDER BY spine.report_date
      ),
      '[]'::jsonb
    ) AS items
    FROM date_spine spine
    LEFT JOIN daily_totals total ON total.report_date = spine.report_date
  ),
  type_totals AS (
    SELECT
      tx.type::text AS type,
      COALESCE(SUM(ABS(tx.amount)), 0)::BIGINT AS amount,
      COUNT(*)::INTEGER AS count
    FROM confirmed_transactions tx
    GROUP BY tx.type::text
  ),
  type_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'type', type_totals.type,
          'label', CASE type_totals.type
            WHEN 'earn' THEN '적립'
            WHEN 'event_earn' THEN '이벤트 적립'
            WHEN 'manual_earn' THEN '수동 적립'
            WHEN 'use_cancel' THEN '사용 취소'
            WHEN 'redeem' THEN '사용'
            WHEN 'use' THEN '사용'
            WHEN 'manual_deduct' THEN '수동 차감'
            WHEN 'expire' THEN '만료'
            WHEN 'cancel' THEN '취소'
            WHEN 'earn_cancel' THEN '적립 취소'
            ELSE type_totals.type
          END,
          'amount', type_totals.amount,
          'count', type_totals.count
        )
        ORDER BY type_totals.amount DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM type_totals
  ),
  balance_by_user AS (
    SELECT
      tx.user_id,
      COALESCE(SUM(CASE
        WHEN tx.status::text IN ('completed', 'confirmed')
         AND tx.type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
          THEN tx.amount
        WHEN tx.status::text IN ('completed', 'confirmed')
         AND tx.type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel')
          THEN -tx.amount
        ELSE 0
      END), 0)::BIGINT AS balance
    FROM public.point_transactions tx
    GROUP BY tx.user_id
  ),
  tier_rows AS (
    SELECT
      tier.id AS tier_id,
      COALESCE(tier.name, '미지정') AS tier_name,
      COALESCE(SUM(balance.balance), 0)::BIGINT AS balance,
      COUNT(profile.id)::INTEGER AS customer_count,
      COALESCE(tier.sort_order, 999999) AS sort_order
    FROM public.profiles profile
    LEFT JOIN public.customer_tiers tier ON tier.id = profile.tier_id
    LEFT JOIN balance_by_user balance ON balance.user_id = profile.id
    GROUP BY tier.id, tier.name, tier.sort_order
  ),
  tier_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'tier_id', tier_rows.tier_id,
          'tier_name', tier_rows.tier_name,
          'balance', tier_rows.balance,
          'customer_count', tier_rows.customer_count
        )
        ORDER BY tier_rows.sort_order, tier_rows.tier_name
      ),
      '[]'::jsonb
    ) AS items
    FROM tier_rows
  ),
  period_by_user AS (
    SELECT
      tx.user_id,
      COALESCE(SUM(CASE
        WHEN tx.type::text IN ('earn', 'event_earn', 'manual_earn', 'adjust', 'use_cancel')
          THEN tx.amount
        ELSE 0
      END), 0)::BIGINT AS earned,
      COALESCE(SUM(CASE
        WHEN tx.type::text IN ('redeem', 'use', 'manual_deduct', 'expire', 'cancel', 'earn_cancel')
          THEN tx.amount
        ELSE 0
      END), 0)::BIGINT AS used
    FROM confirmed_transactions tx
    GROUP BY tx.user_id
  ),
  customer_rankings AS (
    SELECT
      profile.id AS user_id,
      COALESCE(profile.full_name, profile.email, '-') AS customer_name,
      profile.email AS customer_email,
      COALESCE(balance.balance, 0) AS balance,
      COALESCE(period.earned, 0) AS earned,
      COALESCE(period.used, 0) AS used
    FROM public.profiles profile
    LEFT JOIN balance_by_user balance ON balance.user_id = profile.id
    LEFT JOIN period_by_user period ON period.user_id = profile.id
    ORDER BY COALESCE(balance.balance, 0) DESC, COALESCE(period.earned, 0) DESC, profile.created_at DESC
    LIMIT 10
  ),
  customer_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', ranking.user_id,
          'customer_name', ranking.customer_name,
          'customer_email', ranking.customer_email,
          'balance', ranking.balance,
          'earned', ranking.earned,
          'used', ranking.used
        )
        ORDER BY ranking.balance DESC, ranking.earned DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM customer_rankings ranking
  ),
  event_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_id', event.id,
          'event_name', event.name,
          'status', event.status::text,
          'spent_points', event.spent_points,
          'total_budget_points', event.total_budget_points,
          'budget_usage_rate', CASE
            WHEN event.total_budget_points IS NOT NULL AND event.total_budget_points > 0
              THEN LEAST(100, ROUND((event.spent_points::numeric / event.total_budget_points) * 100))
            ELSE 0
          END,
          'reward_label', CASE
            WHEN event.reward_type = 'fixed' THEN CONCAT('고정 ', event.reward_value::text, 'P')
            ELSE CONCAT('추가 ', event.reward_value::text, '%')
          END
        )
        ORDER BY
          CASE event.status::text WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
          event.spent_points DESC,
          event.starts_at DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM public.point_events event
    WHERE event.starts_at < _date_to
      AND (event.ends_at IS NULL OR event.ends_at >= _date_from)
  ),
  csv_limited AS (
    SELECT *
    FROM filtered_transactions tx
    ORDER BY tx.created_at DESC, tx.id DESC
    LIMIT safe_limit
  ),
  csv_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'transaction_id', tx.id,
          'created_at', tx.created_at,
          'customer_name', COALESCE(tx.customer_name, '-'),
          'customer_email', tx.customer_email,
          'type', tx.type::text,
          'status', tx.status::text,
          'amount', tx.amount,
          'balance_after', tx.balance_after,
          'memo', tx.memo
        )
        ORDER BY tx.created_at DESC, tx.id DESC
      ),
      '[]'::jsonb
    ) AS items
    FROM csv_limited tx
  ),
  row_count_json AS (
    SELECT COUNT(*)::INTEGER AS count
    FROM filtered_transactions
  )
  SELECT jsonb_build_object(
    'trend', trend_json.items,
    'type_breakdown', type_json.items,
    'tier_balances', tier_json.items,
    'customer_rankings', customer_json.items,
    'event_performance', event_json.items,
    'csv_rows', csv_json.items,
    'export_row_count', row_count_json.count
  )
  INTO result
  FROM trend_json, type_json, tier_json, customer_json, event_json, csv_json, row_count_json;

  RETURN result;
END;
$$;

-- create_admin_report_export: reports.read
CREATE OR REPLACE FUNCTION public.create_admin_report_export(
  _date_from TIMESTAMPTZ,
  _date_to TIMESTAMPTZ,
  _row_count INTEGER,
  _reason TEXT DEFAULT 'admin report export'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_id UUID;
  filter_payload JSONB;
BEGIN
  PERFORM public.require_admin_permission('reports.read');

  IF _date_from IS NULL OR _date_to IS NULL OR _date_to <= _date_from THEN
    RAISE EXCEPTION 'valid report export date range is required' USING ERRCODE = '22023';
  END IF;

  _row_count := GREATEST(COALESCE(_row_count, 0), 0);

  IF char_length(trim(COALESCE(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'report export reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;

  filter_payload := jsonb_build_object(
    'date_from', _date_from,
    'date_to', _date_to,
    'row_count', _row_count
  );

  IF _row_count > 10000 THEN
    INSERT INTO public.report_export_jobs (
      status,
      report_type,
      filters,
      row_count,
      requested_by
    )
    VALUES (
      'queued',
      'admin_reports',
      filter_payload,
      _row_count,
      (select auth.uid())
    )
    RETURNING id INTO job_id;

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
      'report.export.queue',
      'report_export_jobs',
      job_id::text,
      filter_payload,
      _reason
    );

    RETURN jsonb_build_object(
      'mode', 'async',
      'job_id', job_id,
      'row_count', _row_count
    );
  END IF;

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
    'report.export.download',
    'point_transactions',
    NULL,
    filter_payload,
    _reason
  );

  RETURN jsonb_build_object(
    'mode', 'download',
    'job_id', NULL,
    'row_count', _row_count
  );
END;
$$;

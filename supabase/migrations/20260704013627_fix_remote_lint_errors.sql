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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin role update requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin reports require admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.update_admin_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_role(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_reports(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_reports(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

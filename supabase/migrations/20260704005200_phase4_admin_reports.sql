CREATE TABLE IF NOT EXISTS public.report_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.async_job_status NOT NULL DEFAULT 'queued',
  report_type TEXT NOT NULL DEFAULT 'admin_reports',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES public.profiles(id),
  download_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT report_export_jobs_row_count_range CHECK (row_count >= 0),
  CONSTRAINT report_export_jobs_report_type CHECK (report_type IN ('admin_reports'))
);

CREATE INDEX IF NOT EXISTS point_transactions_status_created_at_idx
  ON public.point_transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS report_export_jobs_requested_by_created_at_idx
  ON public.report_export_jobs (requested_by, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.report_export_jobs TO authenticated;
GRANT ALL ON public.report_export_jobs TO service_role;

ALTER TABLE public.report_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_export_jobs admin manage" ON public.report_export_jobs;
CREATE POLICY "report_export_jobs admin manage" ON public.report_export_jobs
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP TRIGGER IF EXISTS report_export_jobs_updated_at ON public.report_export_jobs;
CREATE TRIGGER report_export_jobs_updated_at BEFORE UPDATE ON public.report_export_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  tier_json AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'tier_id', tier.id,
          'tier_name', COALESCE(tier.name, '미지정'),
          'balance', COALESCE(SUM(balance.balance), 0),
          'customer_count', COUNT(profile.id)
        )
        ORDER BY COALESCE(tier.sort_order, 999999), COALESCE(tier.name, '미지정')
      ),
      '[]'::jsonb
    ) AS items
    FROM public.profiles profile
    LEFT JOIN public.customer_tiers tier ON tier.id = profile.tier_id
    LEFT JOIN balance_by_user balance ON balance.user_id = profile.id
    GROUP BY tier.id, tier.name, tier.sort_order
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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin report export requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_reports(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_reports(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_admin_report_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_report_export(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin base policy read requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin base policy save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin base policy disable requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_base_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_base_policy() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_base_policy(TEXT, NUMERIC, INTEGER, TEXT, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, TEXT[], TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_base_policy(TEXT, NUMERIC, INTEGER, TEXT, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, TEXT[], TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.disable_admin_base_policy(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_admin_base_policy(UUID, TEXT) TO authenticated;

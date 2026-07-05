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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin product policy read requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin policy target search requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin product policy save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin product policy disable requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_product_policies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_product_policies() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.search_admin_policy_targets(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_admin_policy_targets(TEXT, TEXT, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_product_policy(UUID, TEXT, TEXT, TEXT[], NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_product_policy(UUID, TEXT, TEXT, TEXT[], NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.disable_admin_product_policy(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_admin_product_policy(UUID, TEXT) TO authenticated;

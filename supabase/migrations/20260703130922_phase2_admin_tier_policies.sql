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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin tier policy read requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin tier policy save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin tier policy reorder requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin tier policy disable requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_tier_policies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_tier_policies() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_tier_policy(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_tier_policy(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reorder_admin_tier_policies(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_admin_tier_policies(UUID[], TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.disable_admin_tier_policy(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disable_admin_tier_policy(UUID, UUID, TEXT) TO authenticated;

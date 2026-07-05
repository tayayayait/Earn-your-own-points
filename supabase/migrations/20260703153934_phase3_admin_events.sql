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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin event read requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin event save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin event status update requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_events() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_events() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_event(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT, NUMERIC, INTEGER, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_event(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT, NUMERIC, INTEGER, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_admin_event_status(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_event_status(UUID, TEXT, TEXT) TO authenticated;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ;

ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS signing_key_prefix TEXT;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS signing_key_suffix TEXT;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ;
ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS retried_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_created_at_idx ON public.api_keys (created_at DESC);
CREATE INDEX IF NOT EXISTS webhooks_created_at_idx ON public.webhooks (created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_webhook_created_at_idx
  ON public.webhook_logs (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS webhook_logs_failure_created_at_idx
  ON public.webhook_logs (created_at DESC)
  WHERE status_code IS NULL OR status_code >= 400 OR error_code IS NOT NULL;

DROP TRIGGER IF EXISTS api_keys_updated_at ON public.api_keys;
CREATE TRIGGER api_keys_updated_at BEFORE UPDATE ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_admin_integration_secret(_prefix TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _prefix || encode(extensions.gen_random_bytes(24), 'hex');
$$;

REVOKE EXECUTE ON FUNCTION public.generate_admin_integration_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_admin_integration_secret(TEXT) TO service_role;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin integrations require admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin api key create requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin api key regenerate requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin api key revoke requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin webhook save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin webhook test requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin webhook retry requires admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_integrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_integrations() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_admin_api_key(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_admin_api_key(TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.regenerate_admin_api_key(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_admin_api_key(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.revoke_admin_api_key(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_admin_api_key(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_webhook(UUID, TEXT, TEXT, TEXT[], TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_webhook(UUID, TEXT, TEXT, TEXT[], TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.test_admin_webhook(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_admin_webhook(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.retry_admin_webhook_log(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_admin_webhook_log(UUID, TEXT) TO authenticated;

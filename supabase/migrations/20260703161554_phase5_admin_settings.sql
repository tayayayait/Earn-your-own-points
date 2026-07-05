CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  admin_role public.admin_role NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_suffix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  accepted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_invitations_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  CONSTRAINT admin_invitations_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_invitations_token_hash_idx
  ON public.admin_invitations (token_hash);
CREATE INDEX IF NOT EXISTS admin_invitations_email_status_idx
  ON public.admin_invitations (lower(email), status);
CREATE INDEX IF NOT EXISTS admin_invitations_expires_at_idx
  ON public.admin_invitations (expires_at);

GRANT SELECT, INSERT, UPDATE ON public.admin_invitations TO authenticated;
GRANT ALL ON public.admin_invitations TO service_role;

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_invitations admin manage" ON public.admin_invitations;
CREATE POLICY "admin_invitations admin manage" ON public.admin_invitations
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'));

DROP TRIGGER IF EXISTS admin_invitations_updated_at ON public.admin_invitations;
CREATE TRIGGER admin_invitations_updated_at BEFORE UPDATE ON public.admin_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin brand settings require admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin brand save requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin list requires admin role' USING ERRCODE = '42501';
  END IF;

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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin invite requires admin role' USING ERRCODE = '42501';
  END IF;

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
  current_role public.admin_role;
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
  INTO current_role, before_data
  FROM public.profiles profile
  WHERE profile.id = _user_id
  FOR UPDATE;

  IF before_data IS NULL THEN
    RAISE EXCEPTION 'admin user not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_role = 'owner'::public.admin_role AND normalized_role <> 'owner'::public.admin_role THEN
    SELECT COUNT(*) INTO other_owner_count
    FROM public.profiles profile
    WHERE profile.id <> _user_id
      AND profile.admin_role = 'owner'
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
  IF NOT public.has_role((select auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'admin audit logs require admin role' USING ERRCODE = '42501';
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.get_admin_brand_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_brand_settings() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_admin_brand_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_admin_brand_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_admins() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.invite_admin_user(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_admin_user(TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_admin_role(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_admin_role(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_audit_logs(UUID, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_audit_logs(UUID, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;

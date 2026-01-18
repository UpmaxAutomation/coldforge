-- Auto-create organization and user profile on signup
-- This trigger creates an organization when a new auth user is created

-- Function to create organization and user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  -- Get organization name from user metadata, default to email prefix
  org_name := COALESCE(
    NEW.raw_user_meta_data->>'organization_name',
    split_part(NEW.email, '@', 1) || '''s Organization'
  );

  -- Create a unique slug from organization name
  org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := org_slug || '-' || substr(NEW.id::text, 1, 8);

  -- Create the organization
  INSERT INTO public.organizations (name, slug, plan, settings)
  VALUES (org_name, org_slug, 'starter', '{}')
  RETURNING id INTO org_id;

  -- Create the user profile with owner role
  INSERT INTO public.users (id, organization_id, email, full_name, role, settings)
  VALUES (
    NEW.id,
    org_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner',
    '{}'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.organizations TO supabase_auth_admin;
GRANT ALL ON public.users TO supabase_auth_admin;

-- For existing users without organizations, this helper function can be called
CREATE OR REPLACE FUNCTION public.create_user_organization(
  user_id UUID,
  org_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  org_id UUID;
  user_email TEXT;
  final_org_name TEXT;
  org_slug TEXT;
BEGIN
  -- Check if user already has an organization
  IF EXISTS (SELECT 1 FROM public.users WHERE id = user_id AND organization_id IS NOT NULL) THEN
    SELECT organization_id INTO org_id FROM public.users WHERE id = user_id;
    RETURN org_id;
  END IF;

  -- Get user email
  SELECT email INTO user_email FROM auth.users WHERE id = user_id;

  -- Set organization name
  final_org_name := COALESCE(org_name, split_part(user_email, '@', 1) || '''s Organization');

  -- Create slug
  org_slug := lower(regexp_replace(final_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  org_slug := org_slug || '-' || substr(user_id::text, 1, 8);

  -- Create organization
  INSERT INTO public.organizations (name, slug, plan, settings)
  VALUES (final_org_name, org_slug, 'starter', '{}')
  RETURNING id INTO org_id;

  -- Check if user profile exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = user_id) THEN
    -- Update existing profile
    UPDATE public.users SET organization_id = org_id, role = 'owner' WHERE id = user_id;
  ELSE
    -- Create new profile
    INSERT INTO public.users (id, organization_id, email, role, settings)
    VALUES (user_id, org_id, user_email, 'owner', '{}');
  END IF;

  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

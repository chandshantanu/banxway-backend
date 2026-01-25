-- Fix user trigger to assign admin role to admin users
-- This replaces the previous trigger with smarter role assignment logic

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role user_role;
BEGIN
  -- Determine role based on email or metadata
  -- Check if email is in a list of admin emails or if metadata specifies role
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    -- Use role from metadata if provided during signup
    user_role := (NEW.raw_user_meta_data->>'role')::user_role;
  ELSIF NEW.email LIKE '%@admin.%' OR NEW.raw_user_meta_data->>'is_admin' = 'true' THEN
    -- Admin email pattern or admin flag
    user_role := 'admin';
  ELSE
    -- Default to viewer for regular signups
    user_role := 'viewer';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', NEW.email),
    user_role,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    role = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger already exists from migration 002, no need to recreate

-- Grant admin role to first user if there are no admins yet
DO $$
DECLARE
  admin_count INTEGER;
  first_user_id UUID;
BEGIN
  -- Count existing admins
  SELECT COUNT(*) INTO admin_count FROM public.users WHERE role = 'admin';

  -- If no admins exist, promote the first user to admin
  IF admin_count = 0 THEN
    SELECT id INTO first_user_id FROM public.users ORDER BY created_at ASC LIMIT 1;

    IF first_user_id IS NOT NULL THEN
      UPDATE public.users SET role = 'admin' WHERE id = first_user_id;
      RAISE NOTICE 'Promoted first user (ID: %) to admin role', first_user_id;
    END IF;
  END IF;
END $$;

-- Show current users and their roles
SELECT
  email,
  role,
  is_active,
  created_at
FROM public.users
ORDER BY created_at ASC;

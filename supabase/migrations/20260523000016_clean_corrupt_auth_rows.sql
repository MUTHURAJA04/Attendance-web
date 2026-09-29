-- Migration: Clean Corrupted Auth Rows for Demo Accounts
-- Removes manually injected SQL auth rows so they can be registered via official Supabase GoTrue API

-- 1. Clean corrupted identities
DELETE FROM auth.identities 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com', 'manager@restaurant.com', 'staff@restaurant.com')
);

-- 2. Clean auth users
DELETE FROM auth.users 
WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com', 'manager@restaurant.com', 'staff@restaurant.com');

-- 3. Clean profiles
DELETE FROM public.profiles 
WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com', 'manager@restaurant.com', 'staff@restaurant.com');

-- 4. Auto-confirm any existing users (e.g. kingsail108@gmail.com)
UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now());

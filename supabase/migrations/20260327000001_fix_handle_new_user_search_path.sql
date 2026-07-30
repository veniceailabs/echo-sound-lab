-- Fix: set search_path on handle_new_user to prevent SQL injection via mutable search_path
-- Ref: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.handle_new_user() SET search_path = public;

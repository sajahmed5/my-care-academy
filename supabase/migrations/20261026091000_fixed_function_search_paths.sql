-- ============================================================================
-- Fixed search_path on the JWT and feature helper functions
-- ============================================================================
-- Supabase's security advisor flags these seven as "function search path
-- mutable": without a fixed search_path, an object of the same name earlier
-- on a caller's path could be picked up in place of the intended one. Every
-- reference inside them is already schema-qualified (auth.jwt(),
-- public.has_feature()), so an empty search_path changes nothing about what
-- they do — it only closes the door.

alter function public.current_org_id() set search_path = '';
alter function public.current_user_role() set search_path = '';
alter function public.is_platform_admin() set search_path = '';
alter function public.is_console_user() set search_path = '';
alter function public.forms_enabled() set search_path = '';
alter function public.recruitment_enabled() set search_path = '';
alter function public.observations_enabled() set search_path = '';

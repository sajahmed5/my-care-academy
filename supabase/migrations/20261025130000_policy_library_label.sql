-- ============================================================================
-- "Policies & procedures (basic)" → "Policies & procedures library (CQC basics)"
-- ============================================================================
-- Report #74: beside the package names, "(basic)" read as "in the basic
-- package". It meant the CQC-basics set of policies, which is how
-- lib/policy-library.ts already labels that pack. lib/features.ts carries the
-- same label, and tests/entitlements asserts the two agree.
--
-- A label only: the key, documents.library, is unchanged, so nothing that
-- gates on it moves.

update public.features
   set label = 'Policies & procedures library (CQC basics)'
 where key = 'documents.library';

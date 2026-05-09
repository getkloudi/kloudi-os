-- Drop old JWT auth tables replaced by Better Auth
-- New tables: user, session, account, verification, organization, member, invitation
-- Safe to run even if old tables don't exist (IF EXISTS).

DROP TABLE IF EXISTS "memberships";
DROP TABLE IF EXISTS "sessions";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "organizations";

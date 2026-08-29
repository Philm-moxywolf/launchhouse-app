-- src/server/db/rls.sql
--
-- WHAT THIS IS
--   Row level security on every table that holds one founder's private material.
--
-- WHY IT EXISTS
--   One founder reading another founder's prospects is the failure that ends this
--   product, so it gets two belts. The first is the WHERE founder_id clause in
--   every query. This is the second, and it is the one that still holds when
--   somebody writes a query that forgets the first.
--
-- WHAT APPLIES IT
--   src/server/db/migrate.ts, after the generated table migrations. It is written
--   by hand rather than generated because drizzle-kit does not express policies,
--   and because the FORCE below is the load bearing word in the file.
--
-- READS  nothing.  WRITES  catalog only.
--
-- THE FORCE MATTERS MORE THAN THE ENABLE.
--   ENABLE ROW LEVEL SECURITY does not apply to the table's owner. On a managed
--   Postgres the application very often connects as the owner of the tables it
--   created, so an ENABLE without a FORCE reads as protection in a migration
--   review and does nothing at runtime. FORCE applies the policy to the owner too.
--   src/server/db/migrate.ts asserts relforcerowsecurity afterwards, because a
--   security control nobody verified is not a control.
--
-- THE POLICY FAILS CLOSED.
--   current_setting('app.founder_id', true) returns NULL when the setting was never
--   made, and founder_id = NULL is NULL, so an unset transaction sees zero rows.
--   A forgotten SET LOCAL becomes an empty result the next test catches, never a
--   query that quietly returns somebody else's rows.

ALTER TABLE "ge_file"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ge_file"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ge_file_version"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ge_file_version"  FORCE  ROW LEVEL SECURITY;
ALTER TABLE "ge_blob"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ge_blob"          FORCE  ROW LEVEL SECURITY;
ALTER TABLE "connections"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connections"      FORCE  ROW LEVEL SECURITY;

-- publish_batches is not in the build doc's list. It is here because its payload
-- column holds the exact request bodies for an Apollo enrollment, and those carry
-- named prospects with email addresses. Same material as the people folder, so the
-- same two belts. Adding a table to this list is additive; removing one is not.
ALTER TABLE "publish_batches"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "publish_batches"  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ge_file_own_rows         ON "ge_file";
DROP POLICY IF EXISTS ge_file_version_own_rows ON "ge_file_version";
DROP POLICY IF EXISTS ge_blob_own_rows         ON "ge_blob";
DROP POLICY IF EXISTS connections_own_rows     ON "connections";
DROP POLICY IF EXISTS publish_batches_own_rows ON "publish_batches";

CREATE POLICY ge_file_own_rows ON "ge_file"
  USING      (founder_id = current_setting('app.founder_id', true))
  WITH CHECK (founder_id = current_setting('app.founder_id', true));

CREATE POLICY ge_file_version_own_rows ON "ge_file_version"
  USING      (founder_id = current_setting('app.founder_id', true))
  WITH CHECK (founder_id = current_setting('app.founder_id', true));

CREATE POLICY ge_blob_own_rows ON "ge_blob"
  USING      (founder_id = current_setting('app.founder_id', true))
  WITH CHECK (founder_id = current_setting('app.founder_id', true));

CREATE POLICY connections_own_rows ON "connections"
  USING      (founder_id = current_setting('app.founder_id', true))
  WITH CHECK (founder_id = current_setting('app.founder_id', true));

CREATE POLICY publish_batches_own_rows ON "publish_batches"
  USING      (founder_id = current_setting('app.founder_id', true))
  WITH CHECK (founder_id = current_setting('app.founder_id', true));

-- The mentor board and the nightly backup need to read across founders. They do it
-- through a role that carries BYPASSRLS, granted deliberately and named in the
-- runbook, not by weakening a policy here. A policy with an OR in it is how the
-- second belt quietly stops being a belt.

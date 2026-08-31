-- What the last GoHighLevel check saw, as JSON.
--
-- createPost takes accountIds, so accounts that live only in the response of a call
-- nobody re ran leave a connected founder with nothing to post to. Before this column
-- the connected screen said "posting to: nothing yet" on every page load.
--
-- Nullable, because every existing row predates it and a founder who connected before
-- this shipped is still connected. Their next check fills it in.
ALTER TABLE "connections" ADD COLUMN IF NOT EXISTS "accounts" text;

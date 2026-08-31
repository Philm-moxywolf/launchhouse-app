-- Why the last turn on a thread was refused, or null when it committed.
--
-- The next turn puts it in front of the model. A session outlives a turn, so a
-- rolled back write still looks like a successful write in the model's own history,
-- and without this a founder was told three files existed when the turn that wrote
-- them had been undone.
--
-- Nullable, because every existing thread predates it and null is the normal state.
ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "last_refusal" text;

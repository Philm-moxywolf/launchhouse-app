CREATE TABLE "mentor_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"note" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone,
	"handled_by" text
);
--> statement-breakpoint
CREATE INDEX "mentor_requests_handled_at_idx" ON "mentor_requests" USING btree ("handled_at","at");
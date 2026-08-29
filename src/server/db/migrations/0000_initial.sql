CREATE TABLE "connections" (
	"founder_id" text NOT NULL,
	"vendor" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"ciphertext" "bytea",
	"nonce" "bytea",
	"location_id" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"token_prefix" text,
	"token_length" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "connections_founder_id_vendor_pk" PRIMARY KEY("founder_id","vendor")
);
--> statement-breakpoint
CREATE TABLE "founder" (
	"id" text PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text,
	"timezone" text NOT NULL,
	"track" text,
	"route" text,
	"wrapped_key" "bytea" NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "founder_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ge_blob" (
	"founder_id" text NOT NULL,
	"sha" char(64) NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"nonce" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ge_blob_founder_id_sha_pk" PRIMARY KEY("founder_id","sha")
);
--> statement-breakpoint
CREATE TABLE "ge_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"verb" text NOT NULL,
	"subject" text,
	"exit_code" integer,
	"version_before" bigint,
	"version_after" bigint
);
--> statement-breakpoint
CREATE TABLE "ge_file" (
	"founder_id" text NOT NULL,
	"path" text NOT NULL,
	"blob_sha" char(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"mtime" timestamp with time zone NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "ge_file_founder_id_path_pk" PRIMARY KEY("founder_id","path")
);
--> statement-breakpoint
CREATE TABLE "ge_file_version" (
	"founder_id" text NOT NULL,
	"path" text NOT NULL,
	"version" bigint NOT NULL,
	"blob_sha" char(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"verb" text,
	"deleted" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ge_file_version_founder_id_path_version_pk" PRIMARY KEY("founder_id","path","version")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"founder_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"client_msg_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"vendor" text NOT NULL,
	"operation" text NOT NULL,
	"state" text DEFAULT 'proposed' NOT NULL,
	"payload" jsonb NOT NULL,
	"preview" jsonb,
	"item_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"committed_by_session" text,
	"error_detail" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "setup_checks" (
	"founder_id" text NOT NULL,
	"check_name" text NOT NULL,
	"status" text NOT NULL,
	"evidence" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_checks_founder_id_check_name_pk" PRIMARY KEY("founder_id","check_name")
);
--> statement-breakpoint
CREATE TABLE "setup_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"step_id" text,
	"kind" text NOT NULL,
	"detail" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_steps" (
	"founder_id" text NOT NULL,
	"step_id" text NOT NULL,
	"state" text DEFAULT 'not_started' NOT NULL,
	"entered_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" text,
	CONSTRAINT "setup_steps_founder_id_step_id_pk" PRIMARY KEY("founder_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "signin_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"token_sha" char(64) NOT NULL,
	"founder_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "signin_tokens_token_sha_unique" UNIQUE("token_sha")
);
--> statement-breakpoint
CREATE TABLE "spend" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"thread_id" text,
	"turn_id" text,
	"model" text,
	"cost_usd" numeric(12, 6) NOT NULL,
	"run_reading_usd" numeric(12, 6),
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_creation_tokens" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"route_id" text NOT NULL,
	"title" text,
	"sdk_session_id" text,
	"digest" text,
	"reanchor" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_turn_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transcript_entries" (
	"session_id" text NOT NULL,
	"founder_id" text NOT NULL,
	"seq" integer NOT NULL,
	"uuid" text NOT NULL,
	"entry" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_entries_session_id_uuid_pk" PRIMARY KEY("session_id","uuid")
);
--> statement-breakpoint
CREATE TABLE "turn_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"founder_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"founder_id" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"error_code" text,
	"error_detail" text,
	"version_before" bigint,
	"version_after" bigint
);
--> statement-breakpoint
CREATE TABLE "vendor_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_founder_id" text NOT NULL,
	"credential_founder_id" text NOT NULL,
	"vendor" text NOT NULL,
	"operation" text NOT NULL,
	"status" integer,
	"duration_ms" integer,
	"request_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_blob" ADD CONSTRAINT "ge_blob_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_event" ADD CONSTRAINT "ge_event_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_file" ADD CONSTRAINT "ge_file_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ge_file_version" ADD CONSTRAINT "ge_file_version_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_batches" ADD CONSTRAINT "publish_batches_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_checks" ADD CONSTRAINT "setup_checks_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_events" ADD CONSTRAINT "setup_events_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_steps" ADD CONSTRAINT "setup_steps_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signin_tokens" ADD CONSTRAINT "signin_tokens_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend" ADD CONSTRAINT "spend_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_entries" ADD CONSTRAINT "transcript_entries_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_events" ADD CONSTRAINT "turn_events_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_founder_id_founder_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."founder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "founder_email_idx" ON "founder" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ge_event_founder_at_idx" ON "ge_event" USING btree ("founder_id","at");--> statement-breakpoint
CREATE INDEX "ge_file_version_founder_at_idx" ON "ge_file_version" USING btree ("founder_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_thread_client_msg_idx" ON "messages" USING btree ("thread_id","client_msg_id") WHERE "messages"."client_msg_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "publish_batches_founder_idx" ON "publish_batches" USING btree ("founder_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_founder_idx" ON "sessions" USING btree ("founder_id");--> statement-breakpoint
CREATE INDEX "setup_events_founder_at_idx" ON "setup_events" USING btree ("founder_id","at");--> statement-breakpoint
CREATE INDEX "signin_tokens_email_idx" ON "signin_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "spend_founder_at_idx" ON "spend" USING btree ("founder_id","at");--> statement-breakpoint
CREATE INDEX "threads_founder_idx" ON "threads" USING btree ("founder_id","created_at");--> statement-breakpoint
CREATE INDEX "transcript_entries_session_seq_idx" ON "transcript_entries" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "turn_events_thread_id_idx" ON "turn_events" USING btree ("thread_id","id");--> statement-breakpoint
CREATE INDEX "turns_founder_status_idx" ON "turns" USING btree ("founder_id","status");--> statement-breakpoint
CREATE INDEX "turns_thread_idx" ON "turns" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "turns_status_priority_idx" ON "turns" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "vendor_calls_at_idx" ON "vendor_calls" USING btree ("at");--> statement-breakpoint
CREATE INDEX "vendor_calls_mismatch_idx" ON "vendor_calls" USING btree ("session_founder_id","credential_founder_id");
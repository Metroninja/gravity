CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "tagline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "public_landing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "currency" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_stripe_session_idx" ON "payments" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "payments_course_idx" ON "payments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");
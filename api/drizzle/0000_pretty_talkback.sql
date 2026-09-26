CREATE TABLE "evals" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"world" text NOT NULL,
	"events" json NOT NULL,
	"input" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"world" text NOT NULL,
	"title" text NOT NULL,
	"events" json NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"timing" json,
	"case_name" text,
	"passed" boolean
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"events" json NOT NULL,
	"listed" boolean DEFAULT true NOT NULL
);

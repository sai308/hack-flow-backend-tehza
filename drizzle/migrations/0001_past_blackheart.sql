ALTER TYPE "mentor_request_status" ADD VALUE 'blocked';--> statement-breakpoint
ALTER TABLE "mentor_requests" ALTER COLUMN "team_id" DROP NOT NULL;
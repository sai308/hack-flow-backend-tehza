-- Add missing created_by column to hackathons (schema drift fix)
ALTER TABLE "hackathons"
  ADD COLUMN IF NOT EXISTS "created_by" uuid
    REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- Add organizer to role_name enum (was added manually, not via migration)
DO $$ BEGIN
  ALTER TYPE "public"."role_name" ADD VALUE 'organizer';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

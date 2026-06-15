-- Migration: 0009_organizer_role
-- Adds 'organizer' to the role_name enum, a created_by column to hackathons,
-- and inserts the organizer row into the roles table.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Use src/drizzle/apply-organizer-schema.ts (npm run db:fix-schema) for fresh installs.

-- 1. Add new enum value
-- (This will fail silently inside a Drizzle transaction — run apply-organizer-schema.ts instead)
ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'organizer';

-- 2. Add created_by column to hackathons (nullable FK to users)
ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Insert organizer role into roles table
INSERT INTO roles (name)
SELECT 'organizer'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'organizer');

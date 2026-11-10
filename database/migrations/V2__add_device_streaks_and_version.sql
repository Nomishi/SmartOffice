-- Flyway V2: Ensure devices table has rule engine streak columns and version in case V1 was already run on dev DB
ALTER TABLE devices ADD COLUMN IF NOT EXISTS temp_high_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS air_bad_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_absence_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_energy_action_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 0;


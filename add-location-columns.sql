-- Add location columns to alerts table
-- Run this in Supabase SQL Editor if the columns don't already exist

-- Check if columns exist and add them if they don't
DO $$ 
BEGIN
    -- Add latitude column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'latitude'
    ) THEN
        ALTER TABLE alerts ADD COLUMN latitude DOUBLE PRECISION;
        COMMENT ON COLUMN alerts.latitude IS 'GPS latitude coordinate where alert was triggered';
    END IF;

    -- Add longitude column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'longitude'
    ) THEN
        ALTER TABLE alerts ADD COLUMN longitude DOUBLE PRECISION;
        COMMENT ON COLUMN alerts.longitude IS 'GPS longitude coordinate where alert was triggered';
    END IF;

    -- Add location_accuracy column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alerts' AND column_name = 'location_accuracy'
    ) THEN
        ALTER TABLE alerts ADD COLUMN location_accuracy DOUBLE PRECISION;
        COMMENT ON COLUMN alerts.location_accuracy IS 'Accuracy of location in meters';
    END IF;
END $$;

-- Create an index on location for geospatial queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_alerts_location ON alerts(latitude, longitude);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'alerts' 
AND column_name IN ('latitude', 'longitude', 'location_accuracy')
ORDER BY column_name;

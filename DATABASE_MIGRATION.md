# Database Migration: Add Inspection Data Columns

Run these SQL commands in your Supabase SQL editor:

```sql
-- Add JSONB columns for inspection data
ALTER TABLE "WorkTrackers"
ADD COLUMN IF NOT EXISTS pre_trip_inspection_data JSONB,
ADD COLUMN IF NOT EXISTS post_trip_inspection_data JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_work_trackers_pre_trip
ON "WorkTrackers" USING gin (pre_trip_inspection_data);

CREATE INDEX IF NOT EXISTS idx_work_trackers_post_trip
ON "WorkTrackers" USING gin (post_trip_inspection_data);

-- Update RLS policies if needed (example)
-- Make sure drivers can update their own inspection data
CREATE POLICY "Drivers can update their own work tracker inspections"
ON "WorkTrackers"
FOR UPDATE
USING (user_id = (SELECT user_id FROM "Users" WHERE clerk_user_id = auth.jwt() ->> 'sub'))
WITH CHECK (user_id = (SELECT user_id FROM "Users" WHERE clerk_user_id = auth.jwt() ->> 'sub'));
```

## After running the migration:

1. Regenerate database types:

   ```bash
   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > database.types.ts
   ```

2. The WorkTracker table will now have:
   - `pre_trip_inspection_data` (JSONB) - stores PreTripInspection
   - `post_trip_inspection_data` (JSONB) - stores PostTripInspection

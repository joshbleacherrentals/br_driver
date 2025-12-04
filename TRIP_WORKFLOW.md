# Trip Workflow Implementation

## Overview

Comprehensive trip management system with status-based UI, trip mode for in-progress trips, and inspection workflows. Uses React Query for data fetching and mutations with online-only architecture.

## Architecture

### Data Management Strategy

- **React Query** for all server state management
- **Online-only**: No offline persistence or caching beyond React Query's built-in cache
- **Optimistic updates**: Via React Query mutations with automatic query invalidation
- **Real-time**: Supabase realtime subscriptions for live data updates

## Status Flow

```
draft → released → accepted → in_progress → completed/cancelled
```

### Status Definitions

- **draft**: Initial state, only visible to account managers (hidden from drivers)
- **released**: Trip published and available for driver to accept
- **accepted**: Driver has accepted the trip
- **in_progress**: Driver is actively working on the trip (Trip Mode)
- **completed**: Trip successfully completed
- **cancelled**: Trip cancelled

## Core Components

### 1. Type Definitions (`/types`)

#### `workTracker.ts`

- `WorkTrackerStatus`: Union type for all statuses
- `EnrichedWorkTracker`: Extended interface with addresses, bleacher info, and inspection fields

#### `inspection.ts`

- `PreTripInspection`: Checklist for bleacher/vehicle condition before trip
- `PostTripInspection`: Final inspection with customer signature

### 2. Utilities (`/utils`)

#### `workTrackerUtils.ts`

Status-based business logic:

- `isWorkTrackerVisible()`: Filters out drafts
- `canAcceptTrip()`: Check if trip can be accepted (status=released)
- `canStartTrip()`: Check if trip can be started (status=accepted, date=today)
- `isTripInProgress()`: Check if trip is in_progress
- `getActiveTripMode()`: Find active in-progress trip
- `getStatusLabel()`: Human-readable status labels
- `getStatusColor()`: Color codes for status badges

#### `tripActions.ts`

Status update functions using direct Supabase calls (for React Query mutations):

- `acceptTrip(supabase, workTrackerId)`: Set status to "accepted"
- `startTrip(supabase, workTrackerId)`: Set status to "in_progress"
- `completeTrip(supabase, workTrackerId)`: Set status to "completed"
- `cancelTrip(supabase, workTrackerId)`: Set status to "cancelled"

#### `mapsUtils.ts`

Multi-platform map integration:

- `openInMaps(address)`: Show alert with Apple Maps, Google Maps, Waze options
- Platform-specific URL schemes for iOS and Android

### 3. Data Layer (`/db`)

#### `workTrackers.ts`

Updated to:

- Use centralized types from `/types/workTracker.ts`
- Filter out drafts: `.neq("status", "draft")`
- Enrich with addresses and bleacher numbers

### 4. UI Components (`/components`)

#### `TripListItem.tsx`

Enhanced with:

- Status badge showing current state
- "Accept Trip" button for released trips (React Query mutation)
- "Start Trip" button for accepted trips (React Query mutation, only on trip date)
- Map integration for addresses
- Loading states from mutation.isPending

#### `TripsList.tsx`

Updated to:

- Pass `workTrackerId`, `status`, and `date` to list items
- Handle `onTripStart` callback for trip mode navigation

### 5. Screens (`/app/(tabs)`)

#### `index.tsx` (Trips Screen)

Added:

- React Query for fetching work trackers
- Check for in-progress trips on mount
- Show alert to continue existing trip
- `handleTripStart()` callback for trip mode navigation (TODO: implement screen)

## User Flows

### Flow 1: Accept a Released Trip

1. User sees trip with "New Trip" badge and "Accept Trip" button
2. User taps "Accept Trip"
3. React Query mutation calls Supabase to update status to "accepted"
4. Query invalidation triggers refetch, UI updates automatically
5. Button changes to "Start Trip" (only visible on trip date)

### Flow 2: Start a Trip

1. On trip date, accepted trip shows "Start Trip" button
2. User taps "Start Trip"
3. React Query mutation updates status to "in_progress"
4. Query invalidation triggers refetch
5. App navigates to Trip Mode screen (TODO)
6. User is locked to this trip until completion

### Flow 3: Trip Mode (TODO: Implement Screen)

When trip is in_progress, show full-screen Trip Mode with:

- Trip details (bleacher, addresses, times)
- Pre-trip inspection button
- Map links for navigation
- Post-trip inspection button
- Complete trip button

### Flow 4: Pre-Trip Inspection (TODO: Implement Form)

- Bleacher condition checklist
- Vehicle condition checklist
- Photo uploads
- Direct submission to Supabase (no caching)

### Flow 5: Post-Trip Inspection (TODO: Implement Form)

- Final bleacher condition
- Delivery confirmation
- Customer signature capture
- Photo uploads
- Submit and mark trip as completed

## Database Schema Updates

### WorkTrackers Table

Added `status` column:

```sql
ALTER TABLE "WorkTrackers"
ADD COLUMN status text
CHECK (status IN ('draft', 'released', 'accepted', 'in_progress', 'completed', 'cancelled'))
DEFAULT 'released';
```

### Future: Inspections Table (Optional)

Could store inspection data separately:

```sql
CREATE TABLE "Inspections" (
  inspection_id SERIAL PRIMARY KEY,
  work_tracker_id INT REFERENCES "WorkTrackers"(work_tracker_id),
  type TEXT CHECK (type IN ('pre_trip', 'post_trip')),
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Remaining Work

### High Priority

1. **Trip Mode Screen**: Full-screen view for in-progress trips
2. **Pre-Trip Inspection Form**: Camera, checklist (submit directly to Supabase)
3. **Post-Trip Inspection Form**: Camera, signature (submit directly to Supabase)
4. **Navigation**: Implement route to `/trip-mode/[id]`

### Medium Priority

1. **Inspection Persistence**: Store inspections in Supabase (JSONB column or separate table)
2. **Photo Uploads**: Upload to Supabase Storage
3. **Push Notifications**: Notify when trip is released

### Low Priority

1. **Trip History**: Detailed view of completed trips
2. **Earnings Dashboard**: Track payments
3. **Calendar View**: Month/week view of trips
4. **Export Reports**: PDF/CSV of completed trips

## Testing Checklist

- [ ] Draft trips are hidden from drivers
- [ ] Released trips show "Accept Trip" button
- [ ] Accepted trips show "Start Trip" only on trip date
- [ ] Status updates persist to Supabase
- [ ] React Query invalidation triggers UI refresh
- [ ] In-progress trip alert shows on app launch
- [ ] Map integration works on iOS and Android
- [ ] Status badges show correct colors
- [ ] Mutation loading states show spinners

## Notes

- All status updates use React Query mutations with automatic invalidation
- Online-only architecture - no offline persistence beyond React Query cache
- Map integration respects user's installed apps
- Trip mode enforces single-trip-at-a-time constraint

- [ ] Accepted trips show "Start Trip" only on trip date
- [ ] Status updates persist to Supabase
- [ ] In-progress trip alert shows on app launch
- [ ] Map integration works on iOS and Android
- [ ] Inspection caching survives app restarts
- [ ] Status badges show correct colors

## Notes

- All status updates use Legend State for optimistic UI + offline support
- Inspection caching prevents data loss during form filling
- Map integration respects user's installed apps
- Trip mode enforces single-trip-at-a-time constraint

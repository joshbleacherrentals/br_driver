# CLAUDE.md — Bleacher Rentals Driver App

## Overview

React Native (Expo SDK 55) mobile app for bleacher delivery drivers. Drivers accept trips, perform inspections, manage availability, and submit damage reports. The app is **fully offline-first** via PowerSync — every feature must work with zero network connectivity.

## Commands

```bash
npm start                # Expo dev server
npm run ios              # Run on iOS simulator
npm run android          # Run on Android emulator
npm run bid              # Build iOS (development)
npm run bis              # Build iOS (staging)
npm run bip              # Build iOS (production)
npm run tc               # TypeScript type-check (tsc --noEmit)
npm run lint             # ESLint
```

## Architecture Principles

### Offline-First (Non-Negotiable)

PowerSync syncs a local SQLite database with Supabase. The user can launch the app with **no network** and operate fully — all reads come from the local DB, all writes go to the local DB first, and PowerSync syncs when connectivity returns. Never write code that assumes network availability. Never block UI on a network call. Never use `fetch`/`supabase.from()` for data the local DB already has.

### Typed Database Access (Non-Negotiable)

All database queries and mutations **must** go through the Kysely-powered typed wrappers. Never write raw SQL strings.

- **Reads (reactive):** Build a Kysely query with `db.selectFrom(...)...compile()`, pass to `useTypedQuery(compiled, expect<T>())` from `@/library/powersync/typedQuery`. This returns reactive data that updates automatically when the local DB changes.
- **Writes:** Use `executeTypedMutation` or `executeTypedMutationVoid` from `@/library/powersync/typedMutation`. For multi-step writes, use `executeTypedTransaction`.
- **`db`** is the Kysely-wrapped PowerSync instance exported from `@/components/providers/SystemProvider`.
- **Schema** lives in `library/powersync/AppSchema.ts` — column definitions use `satisfies PowerSyncColsFor<"TableName">` to stay in sync with the Supabase-generated `database.types.ts`.

### Clean Architecture

- **DRY** — Extract shared logic. No copy-pasting query patterns, UI fragments, or business logic.
- **Single Responsibility** — Each file does one thing. A hook fetches data. A widget renders UI. A utility transforms values.
- **Small files** — Prefer many small, well-named files over large monoliths. Break components into sub-components. Extract helpers into utility files. If a file exceeds ~200-250 lines, consider splitting.
- **Helpers and utilities** — When a feature needs transformation, formatting, or calculation logic, create appropriately named files in `utils/` or co-located with the feature, and import them.
- **Consistent colors** — Never hardcode color hex values. Import from `@/constants/Colors` (`DARK_BLUE`, `BRAND_BLUE`, `ACCENT_BLUE`, `GREEN_ACCENT`, `Colors.light.*`, `Colors.dark.*`). If a new color is needed, add it to `constants/Colors.ts` first, then import it.

### Feature Folder Architecture

The app uses a **feature folder** pattern. Each screen owns its code in `features/`, and `app/` is a thin routing layer of one-line re-exports.

**Rules:**

- `app/` files are **one-liners**: `export { default } from "@/features/..."`
- Each feature folder contains the screen component + its **page-specific** components, hooks, and utils
- Components/hooks used by **2+ features** stay in the global `components/`, `hooks/`, or `utils/` directories
- When adding a new screen: create the feature folder first, then add a thin re-export in `app/`

## Project Structure

```
app/                          # Expo Router — thin re-exports only
├── _layout.tsx               # Root layout (Stack: drawer, auth, standalone screens)
├── (auth)/sign-in.tsx        → features/auth/SignInScreen.tsx
├── (drawer)/
│   ├── _layout.tsx           # Drawer layout (stays here — routing config)
│   └── (tabs)/
│       ├── _layout.tsx       # Tab bar config (stays here — routing config)
│       ├── index.tsx         → features/trips/TripsScreen.tsx
│       ├── pendingTrips.tsx  → features/pending-trips/PendingTripsScreen.tsx
│       ├── driverAvailability.tsx → features/availability/AvailabilityScreen.tsx
│       ├── documents.tsx     → features/documents/DocumentsScreen.tsx
│       ├── profile.tsx       → features/profile/ProfileScreen.tsx
│       ├── damage-report-history.tsx → features/damage-report-history/DamageReportHistoryScreen.tsx
│       └── trip-history.tsx  → features/trip-history/TripHistoryScreen.tsx
├── damage-report.tsx         → features/damage-report/DamageReportScreen.tsx (standalone stack screen)

features/                     # Feature folders — each screen owns its code
├── trips/
│   ├── TripsScreen.tsx
│   └── components/
│       └── ReleasedTripsBanner.tsx
├── pending-trips/
│   ├── PendingTripsScreen.tsx
│   └── components/
│       └── PendingTripsList.tsx
├── availability/
│   └── AvailabilityScreen.tsx
├── documents/
│   └── DocumentsScreen.tsx
├── profile/
│   ├── ProfileScreen.tsx
│   └── components/
│       ├── EditDriverInfo.tsx
│       ├── EditVehicleInfo.tsx
│       ├── EditProfileDocs.tsx
│       └── AddressAutoComplete.tsx
├── damage-report/
│   ├── DamageReportScreen.tsx
│   └── components/
│       └── DamageSeveritySelector.tsx
├── damage-report-history/
│   └── DamageReportHistoryScreen.tsx
├── trip-history/
│   ├── TripHistoryScreen.tsx
│   └── components/
│       └── CompletedTripItem.tsx
├── auth/
│   └── SignInScreen.tsx
└── more/
    └── MoreScreen.tsx

components/                   # Shared across 2+ features
├── providers/
│   └── SystemProvider.tsx    # PowerSync + Kysely init, attachment queues
├── ui/                       # Reusable UI primitives (BottomSheetModal, TabBarBackground, etc.)
├── widgets/                  # Shared feature widgets
│   ├── trip_item.tsx         # Used by trips, pending-trips, trip-history
│   ├── inspection.tsx        # Used by trips, damage-report
│   ├── inspectionSummaryWidget.tsx
│   ├── billOfLading.tsx
│   ├── bleacherDropdown.tsx
│   ├── bleacherDamageBadge.tsx
│   ├── onboardingBanner.tsx  # Used by 5+ screens
│   ├── loadingScreen.tsx
│   └── no-driver.tsx
├── OAuthButton.tsx
├── SignInWithApple.tsx
├── SignOutButton.tsx
└── SwipeAcceptBarV2.tsx

hooks/
├── db/                       # Database hooks (one per domain entity)
│   ├── useWorkTrackers.ts
│   ├── useInspection.ts
│   ├── useBleacher.ts
│   ├── useDriver.ts
│   ├── useAddress.ts
│   └── ...
├── useColorScheme.ts
├── useProfileCompletion.ts
└── useOTAUpdate.ts

library/
├── powersync/
│   ├── AppSchema.ts          # PowerSync schema (tables + types)
│   ├── types.ts              # PowerSyncColsFor<T> type mapping
│   ├── typedQuery.ts         # useTypedQuery — reactive typed reads
│   ├── typedMutation.ts      # executeTypedMutation — typed writes
│   ├── BackendConnector.ts   # PowerSync ↔ Supabase connector
│   └── *AttachmentQueue.ts   # Photo upload queues (offline-safe)
├── storage/                  # Supabase storage adapter
└── debug/                    # Debug logging

constants/                    # App-wide constants and theme values
services/                     # Push notifications, external services
utils/                        # Pure utility functions
```

## Tech Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Framework     | Expo SDK 55, React Native                             |
| Routing       | Expo Router (file-based)                              |
| Auth          | Clerk (`@clerk/clerk-expo`)                           |
| Database      | PowerSync (local SQLite) ↔ Supabase (remote Postgres) |
| Query Builder | Kysely via `@powersync/kysely-driver`                 |
| Server State  | TanStack React Query (only for non-PowerSync data)    |
| Photos/Files  | PowerSync Attachment Queues → Supabase Storage        |
| UI            | React Native core + Lucide icons, Reanimated          |

## Patterns to Follow

### Adding a new database query

1. Create or update a hook in `hooks/db/` (e.g., `useMyEntity.ts`)
2. Define the return type (e.g., `type MyEntity = { id: string; ... }`)
3. Build the query: `db.selectFrom("TableName").select([...]).where(...).compile()`
4. Return via: `useTypedQuery(compiled, expect<MyEntity>())`

### Adding a new mutation

```ts
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { db } from "@/components/providers/SystemProvider";

await executeTypedMutationVoid(
  db
    .updateTable("TableName")
    .set({ field: value, updated_at: new Date().toISOString() })
    .where("id", "=", entityId)
    .compile(),
);
```

### Adding a new screen

1. Create a feature folder: `features/my-feature/MyFeatureScreen.tsx`
2. Add page-specific components in `features/my-feature/components/`
3. Add page-specific hooks in `features/my-feature/hooks/`
4. Add a thin re-export in `app/`: `export { default } from "@/features/my-feature/MyFeatureScreen"`
5. Register in the appropriate `_layout.tsx` if needed

### Moving a component to shared

If a component in a feature folder starts being used by a second feature, move it to `components/widgets/` (or `components/ui/` for primitives) and update imports.

## Environment

- Three environments: `development`, `staging`, `production` (set via `APP_ENV`)
- Config in `app.config.ts` — switches bundle IDs, icons, and env vars per environment
- Supabase/PowerSync credentials come from env vars (`EXPO_PUBLIC_*`)
- EAS Build for native builds, OTA updates via `expo-updates`

## CI/CD Pipeline

Uses path-based git diff detection to automatically route JS-only vs native changes.

| Trigger                              | What happens                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| PR opened → `dev`, `staging`, `main` | Lint + typecheck + export build check (`pr-check.yml`)             |
| Push to `dev`                        | OTA update → `development` channel (`ota-dev.yml`)                 |
| Push to `staging`                    | OTA update → `preview` channel (`ota-staging.yml`)                 |
| Push to `main`                       | Fingerprint-based smart deploy (`build-production.yml`)            |
| Manual dispatch                      | Submit latest build to App Store / Play Store (`store-submit.yml`) |

**How production deploy works (push to main):**

1. Runs typecheck + lint
2. `git diff` checks if native-impacting files changed (`package.json`, `app.json`, `eas.json`, `plugins/`, `patches/`)
3. JS/assets only → **OTA update** to production channel (Vercel-style instant deploy)
4. Native files changed → **EAS Build** (iOS + Android) + OTA update
5. Store submission is always manual — run the `Store Submit` workflow after verifying the build

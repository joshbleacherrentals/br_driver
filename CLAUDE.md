@ -0,0 +1,144 @@

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

## Project Structure

```
app/                          # Expo Router file-based routing
├── _layout.tsx               # Root layout (Stack: drawer, auth, standalone screens)
├── (auth)/                   # Auth screens (Clerk)
│   └── sign-in.tsx
├── (drawer)/                 # Main app (right-side drawer for nav)
│   ├── _layout.tsx           # Drawer layout
│   └── (tabs)/               # Bottom tab navigator
│       ├── _layout.tsx       # Tab bar config
│       ├── index.tsx         # Pending Trips (default tab)
│       ├── trips.tsx         # Active/Upcoming Trips
│       ├── driverAvailability.tsx
│       ├── documents.tsx
│       ├── profile.tsx
│       └── more.tsx
├── damage-report.tsx         # Standalone screens (Stack)
├── damage-report-history.tsx
└── trip-history.tsx

components/
├── providers/                # Context providers
│   └── SystemProvider.tsx    # PowerSync + Kysely init, attachment queues
├── ui/                       # Reusable UI primitives
└── widgets/                  # Feature-specific composite components

hooks/
├── db/                       # Database hooks (one per domain entity)
│   ├── useWorkTrackers.ts    # Trips/work tracker queries
│   ├── useInspection.ts      # Inspection queries
│   ├── useBleacher.ts        # Bleacher queries
│   ├── useDriver.ts          # Driver profile queries
│   ├── useAddress.ts         # Address queries
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

1. Add the file under `app/` following Expo Router conventions
2. Register it in the appropriate `_layout.tsx` if needed
3. Keep the screen file thin — extract widgets into `components/widgets/`

## Environment

- Three environments: `development`, `staging`, `production` (set via `APP_ENV`)
- Config in `app.config.ts` — switches bundle IDs, icons, and env vars per environment
- Supabase/PowerSync credentials come from env vars (`EXPO_PUBLIC_*`)
- EAS Build for native builds, OTA updates via `expo-updates`

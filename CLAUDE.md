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
npm run changelog:generate # Rebuild the bundled release notes from versions/
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
│       ├── trip-history.tsx  → features/trip-history/TripHistoryScreen.tsx
│       └── whats-new.tsx     → features/changelog/WhatsNewScreen.tsx
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
├── changelog/                # "What's New" — release notes, bundled offline
│   ├── WhatsNewScreen.tsx
│   ├── ChangeLogProvider.tsx # Entries + unread dot, shared with the side nav
│   ├── generated/versions.ts # GENERATED from versions/*.md — do not edit
│   ├── components/
│   └── util/

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
└── SignOutButton.tsx

hooks/
├── db/                       # Database hooks (one per domain entity)
│   ├── useWorkTrackers.ts
│   ├── useInspection.ts
│   ├── useBleacher.ts
│   ├── useDriver.ts
│   ├── useAddress.ts
│   └── ...
├── useColorScheme.ts
└── useProfileCompletion.ts

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

versions/                     # Release notes, one <major.minor.patch>.md per release
scripts/changelog/            # Generator + the PR gate CI runs
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
- EAS Build for native builds. No OTA updates — every release ships as a new
  build through the App Store / Play Store.

## CI/CD Pipeline

| Trigger                              | What happens                                                           |
| ------------------------------------ | ---------------------------------------------------------------------- |
| PR opened → `dev`, `staging`, `main` | Lint + typecheck + export build check + release notes (`pr-check.yml`) |
| PR opened → any of the three         | Also: App Store version guard vs `main` (`pr-check.yml`)               |
| Push to `main`                       | Typecheck + lint + full native build (`build-production.yml`)          |
| Manual dispatch                      | Submit latest build to App Store / Play Store (`store-submit.yml`)     |

**How production build works (push to main):**

1. Runs typecheck + lint
2. Runs `eas build` for iOS + Android — always, every push, no diffing
3. Store submission is always manual — run the `Store Submit` workflow after verifying the build

## Release Notes ("What's New")

Every PR into `dev`, `staging` or `main` must add exactly one
`versions/<major.minor.patch>.md`, newer than anything on the target branch —
the same convention as the `bleacher_rentals` web app. Drivers read them under
**menu → What's New**.

Each file starts with the release date, which is what the page sorts and shows:

```md
---
date: 2026-09-02
---

### 🚚 What changed
```

**Two rules that differ from the web app:**

1. **The version is not `package.json`.** `package.json`'s version is gated by
   the App Store version guard below and bumps once per App Store release; What's
   New entries land more often than that (potentially every PR). The newest file
   in `versions/` is the changelog's own line; the store version drivers see at
   the bottom of the side navigation is unrelated.
2. **The notes are compiled into the bundle.** React Native has no filesystem to
   read them from and Metro cannot import `.md`, so
   `npm run changelog:generate` bakes them into
   `features/changelog/generated/versions.ts`, which is committed. That is what
   makes the page work offline. **Run it after touching `versions/`** — CI fails
   if the generated file is stale.

`npx tsx scripts/changelog/checkChangelog.cli.ts <branch>` is the gate CI runs;
its rules live in `features/changelog/util/checkChangelog.ts` and are unit
tested. Writing an entry is `/changelog <PR number>`
(`.claude/commands/changelog.md`).

## App Store Version Guard

`app.config.ts` takes `version` from `package.json`, which becomes
CFBundleShortVersionString. `eas.json` auto-increments the _build_ number only —
never this one — so forgetting to bump it is not caught until App Store Connect
rejects the upload with **ITMS-90062** ("must contain a higher version than the
previously approved version") and **ITMS-90186** ("train version is closed").

A job in `pr-check.yml` catches it at PR time, on **every** target branch. The
bar is always the same: **`package.json` version must be higher than main's**,
because main is what was last shipped to the App Store.

- main `1.7.0`, feature branch → dev at `1.7.0` → **fails**. The bump has to land
  on the way in, so a release never reaches main still carrying an approved
  version.
- main `1.7.0`, dev already `1.8.0`, feature branch → dev at `1.8.0` → **passes**.
  The bump happens once per release, not once per PR.

**No exceptions** — every PR into `dev`, `staging`, or `main` is held to the
same bar, JS-only changes included. Since there's no OTA path, the only way
anything ships is a new native build, and every native build needs a version
higher than the last one Apple approved.

Rules live in `features/app-version/utils/checkAppVersionBump.ts` (unit tested);
CI runs `scripts/release/checkAppVersion.cli.ts <branch>`.

This is separate from the release notes in `versions/`, which are not tied to
`package.json` for the reason above.

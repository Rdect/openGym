# Calorie Tracking Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Work inline in this session; the user has requested planning, forking and starting work.

**Goal:** Automatically combine Yazio nutrition and Samsung activity in this fork's English Android/web Calories page.

**Architecture:** A per-account server connector reads Yazio; Android reads Samsung data and sends daily snapshots to the same account. Web and Android share the Calories view. Provider credentials stay outside synchronized state.

**Tech Stack:** Existing React 19, Vite, Zustand, Node API, Capacitor 8 and Java Android shell.

**Spec:** `docs/superpowers/specs/2026-10-24-calorie-tracking-design.md`

## Global constraints

- UI language: English. Meal plans are a later milestone.
- Manual food re-entry is not the requested solution.
- Missing total burn means no deficit/surplus calculation.
- Tokens never enter synchronized profile state or exports.
- Fork updater must never install upstream APKs.
- Preserve AGPL-3.0-or-later and original attribution.

## Review focus

- Google-only Yazio account: unsupported authentication remains a visible blocked connection, never fake success (Task 2).
- Source edit/deletion or late import: replace the source/day snapshot without duplicate calories (Tasks 2–4).
- Midnight, timezone change and DST: use explicit source day and timezone, not server UTC day (Tasks 2–4).
- Missing or revoked Android permission: unknown metric remains null, not zero (Task 3).
- Offline/stale device: preserve newer provider data and show last successful import (Tasks 4–5).

## Task 1: Fork and first Calories screen

**Files:** `README.md`, `docs/FORK.md`, `frontend/src/views/Calories.jsx`, `Calories.css`, `frontend/src/lib/calories.js`, `calories.test.js`, `frontend/src/App.jsx`, `views/Home.jsx`, `views/Stats.jsx`.

**Interfaces:** `calorieDay(day, goal)` derives metrics from `{yazio:{energy,protein,carbs,fat,at},samsung:{steps,exercise,totalBurn,at}}`; missing fields return null. `calorieWeek(date)` returns seven local calendar dates.

- [x] Implement the web page, Home/Stats links and saved food target.
- [x] Test missing versus zero, invalid values, no exercise double counting, over-target intake and year boundary.
- [x] Build web and inspect the rendered page; fix calendar CSS class collision.
- [x] Create fork, document truthful status and push reviewed source only.

## Task 2: Prove and implement Yazio read connection

**Files:** create `api/integrations/yazio.js`, `api/integrations/yazio-store.js`, `api/test/yazio.test.js`; modify `api/server.js`, `api/openapi.yaml`, `frontend/src/views/Calories.jsx`; create `frontend/src/lib/calorie-api.js`.

**Interfaces:** `readYazioDay(session, date, {fetch})` returns `{energy,protein,carbs,fat,at,timezone}` with nullable metrics. Authenticated routes: `GET /api/calories/status`, `POST /api/calories/yazio/connect`, `POST /api/calories/yazio/sync`, `DELETE /api/calories/yazio/connection`. `connect` accepts only the credential flow actually validated against Yazio; do not pretend Google authorization is implemented.

- [ ] Inspect current upstream API clients and authentication; establish a supported flow for this user's Google-linked account without requesting Google passwords or copying secrets into chat.
- [x] If no supported flow can be verified, keep the source visibly blocked and continue independent Samsung work. Do not substitute sample data or silently change accounts.
- [ ] Add fixtures/tests for expired/rotated tokens, provider timeout, forbidden response, missing macros, recipe totals, amended/deleted meals and timezone boundaries. Inject fetch; no live diary writes.
- [ ] Implement read-only provider requests with bounded timeouts, one refresh retry and per-user sync locking. Return sanitized errors.
- [ ] Encrypt provider credentials using a local server key stored outside the repository/OneDrive; never serialize them into profile state, logs or exports. Disconnect deletes the connection's stored credentials and stops polling.
- [ ] Cache source/day replacements; refresh today's and yesterday's data every 15 minutes while connected and on explicit Sync now. Preserve the prior successful snapshot on failure.
- [ ] Verify account isolation and revoke behavior with tests; then compare one authorized real day's totals without publishing the response.

## Task 3: Samsung activity reader on Android

**Files:** `frontend/android/app/src/main/java/ch/duartesantos/opengym/HealthConnectPlugin.java`, `frontend/android/app/src/main/AndroidManifest.xml`; create `frontend/src/lib/calorie-health.js`, `calorie-health.test.js`.

**Interfaces:** native `requestCaloriePermissions()` and `readCalorieDay({date,timezone})` return `{steps,exercise,totalBurn,at,timezone,permissions}`. Metrics unavailable for the granted permissions are null.

- [ ] Inspect phone source availability: steps/exercise via Health Connect; full daily burn via Samsung SDK only if feasible. Do not relabel exercise energy as total burn.
- [ ] Add permission/result contract tests including denied, revoked, no records, genuine zero, overlapping source records and midnight boundaries.
- [x] Add explicit read permissions separate from existing write permissions. Filter/aggregate source records to avoid counting phone/watch or OpenGym-written workouts twice.
- [x] Implement import on app resume when permission was already granted and on Sync now; no permission dialog before the user's Connect action.
- [ ] If full Samsung SDK is needed, assess package registration/partnership and personal development limitations before adding it; keep total burn unavailable if its prerequisites are unmet.
- [ ] Compile Android and verify actual metrics/permission behavior on the user's phone; no fabricated values.

## Task 4: Snapshot synchronization and connection UI

**Files:** `frontend/src/store/useStore.js`, `frontend/src/lib/sync-merge.js`, `sync-merge.test.js`, `frontend/src/views/Calories.jsx`, `api/integrations/yazio-store.js`, `api/server.js`.

**Interfaces:** `calorieDays[date]` contains independent `yazio` and `samsung` snapshots. Each source snapshot has `at` and `_ts`; merge each source/day by timestamp, never sum snapshots. Status distinguishes disconnected, connecting, current, stale and failed.

- [ ] Add tests for simultaneous desktop/phone edits, source deletion, older-device writes, account switch, reset/export and DST.
- [ ] Implement validated per-source/day merge and authenticated server ingestion; retain distinct provider timestamps and errors outside health readings.
- [ ] Replace setup-only cards with real Connect / Sync now / Disconnect actions. On desktop, guide Samsung permission work to the paired Android app.
- [ ] Keep the user target independent of exercise energy; show provenance and freshness alongside balance. No health advice generated from partial readings.
- [ ] Verify two-device convergence and offline/reconnect behavior with existing sync tests and a real paired-device check.

## Task 5: Fork web and Android release

**Files:** `frontend/android/app/build.gradle`, fork Android resources, updater source located through `frontend/src/lib/channel.js`, `.github/workflows/fork-release.yml`, `docs/FORK.md`, `README.md`.

**Interfaces:** separate application ID `ch.rdect.opengym`, fork app label, fork-only update URL and locally protected signing key. Use a stable key for future fork upgrades; do not use upstream release credentials.

- [ ] Ensure download/update links point to Rdect/openGym. Keep original package installed until account sync is verified.
- [ ] Add regression checks for fork update origin, package identity, missing signing credentials and upgrade path.
- [ ] Run affected frontend/API/sync tests, web production build and Android assemble. Inspect 360px mobile and desktop UI.
- [ ] Publish a tagged fork release with APK, SHA-256 checksum, source, changes and accurate limitations after real imports are confirmed. Do not label a setup-only screen a working integration.
- [ ] Update web service, install fork APK with user handoff, pair to existing account, verify imported totals on both devices and persistence after restart.

## Later milestone

Diet/meal programs and broader tracking features are designed after reliable data collection is in place. No placeholder diet recommendations are included in this release.

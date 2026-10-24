# OpenGym personal tracking fork

This is an independent fork of [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym), maintained at [Rdect/openGym](https://github.com/Rdect/openGym). It is not an official Yazio or Samsung product. Original copyright notices and the AGPL-3.0-or-later license remain in place.

## Current state

The English Calories screen is available from Home and Stats on the web. It includes an editable food target, separate food/exercise/total-burn metrics, macros, a seven-day overview and source setup guidance. Unknown readings stay blank. The calorie calculation tests pass.

**Samsung reading is implemented for Android testing; real phone verification is pending.** Connect on the Calories screen to grant Steps and Total calories burned read access in Health Connect. Only Samsung-origin records are imported. Samsung's exercise energy is displayed as exercise calories, never full daily expenditure. The selected day can be refreshed manually; today's data refreshes on app resume. Disconnect stops future imports on that phone and keeps history. Previously imported readings show their timestamp.

**Yazio live authentication remains blocked.** A read-only daily-summary adapter has fixture tests, bounded requests and a single refresh retry, but is not exposed as a working account connection. No Google credentials or tokens are collected. Nutrition and full daily burn remain blank until valid source data exists. The original app's APK does not contain this fork's changes.

## Intended data flow

- Keep logging food in Yazio. A server connector imports daily calories and macros into the signed-in OpenGym account.
- Read available Samsung activity data on the Android phone and synchronize daily snapshots to the same account.
- Show both sources on web and Android, with timestamps, errors and explicit missing-data states.
- Add meal planning in a later milestone, after trustworthy imports are working.

The Yazio connection uses an unofficial API. Google account authentication is an unresolved implementation prerequisite, not a working feature. Samsung Health Connect exercise energy must not be presented as the watch's complete daily energy expenditure. A direct Samsung SDK path requires a separate feasibility and distribution check.

## Releases

Android fork identity is `ch.rdect.opengym`; development APKs use `ch.rdect.opengym.test` and the label **OpenGym Rdect Test**, signed with the local Android debug key. They install beside upstream and are for verification, not a production release. A production signing key and migration are still pending. The updater queries only Rdect/openGym. Upstream APK download links in the original documentation refer to the original application. Never publish `.env`, runtime `data/`, access tokens, signing keys or personal health data.

## Phone verification

1. Install the development APK beside the existing app. Keep Tailscale connected and pair the test app to the same OpenGym server/profile using a new pairing code.
2. In Samsung Health, enable writing Steps and exercise calories to Health Connect. These records must exist in Health Connect; data visible only in Samsung Health cannot be read by this connector.
3. Open **Calories → Your data sources → Samsung Health → Connect Samsung Health**. Grant the read permissions shown by Android. Android calls the exercise-energy permission **Total calories burned**.
4. Tap **Sync selected day**, compare steps/exercise with the source, and open the same day on the web. A blank metric means unavailable, not zero. Full daily burn and balance intentionally remain blank.
5. Test a previous day, restart/resume, and Disconnect. Health Connect may limit older history according to Android's permission window. No background service polls while the app is closed.

The synchronized map is `calorieReadings`, keyed by `source:YYYY-MM-DD`. New observations replace a whole source/day snapshot, including nulls for removed/missing records; they are never added to prior totals. Local connection consent is not included in Android backup or synchronized profile data.

See the [implementation plan](superpowers/plans/2026-10-24-calorie-tracking.md).

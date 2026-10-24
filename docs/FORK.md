# OpenGym personal tracking fork

This is an independent fork of [DuarteSantos8/openGym](https://github.com/DuarteSantos8/openGym), maintained at [Rdect/openGym](https://github.com/Rdect/openGym). It is not an official Yazio or Samsung product. Original copyright notices and the AGPL-3.0-or-later license remain in place.

## Current state

The English Calories screen is available from Home and Stats on the web. It includes an editable food target, separate food/exercise/total-burn metrics, macros, a seven-day overview and source setup guidance. Unknown readings stay blank. The calorie calculation tests pass.

**Automatic Yazio import, Samsung read integration and a fork Android release are not implemented yet.** The existing Android Health Connect integration writes workouts and weight; it does not read these new metrics. The original app's APK does not contain this fork's changes.

## Intended data flow

- Keep logging food in Yazio. A server connector imports daily calories and macros into the signed-in OpenGym account.
- Read available Samsung activity data on the Android phone and synchronize daily snapshots to the same account.
- Show both sources on web and Android, with timestamps, errors and explicit missing-data states.
- Add meal planning in a later milestone, after trustworthy imports are working.

The Yazio connection uses an unofficial API. Google account authentication is an unresolved implementation prerequisite, not a working feature. Samsung Health Connect exercise energy must not be presented as the watch's complete daily energy expenditure. A direct Samsung SDK path requires a separate feasibility and distribution check.

## Releases

Fork builds will use their own Android application identity and signing key. They must install beside upstream until migration and pairing have been verified. Upstream APK download links in the original documentation refer to the original application, not this fork. Never publish `.env`, runtime `data/`, access tokens, signing keys or personal health data.

See the [implementation plan](superpowers/plans/2026-10-24-calorie-tracking.md).

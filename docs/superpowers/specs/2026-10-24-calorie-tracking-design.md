# Calories tracking design

## Intent and scope

Turn this personal OpenGym fork into a unified fitness tracker. The user keeps Yazio's convenient meal entry, uses Samsung Health for watch and activity readings, and sees the combined information on the paired Android app and web. UI language: English. Meal plans are a later milestone.

## Selected approach

Use a direct Yazio server reader and an Android Samsung data reader. The user explicitly selected this after confirming Yazio food data appears in Samsung Health but not Health Connect. Manual food re-entry is not the requested solution. Routing nutrition through Health Connect was considered and rejected for the observed setup. A direct Samsung SDK may be necessary for full daily burn; Health Connect can supply only the records actually present.

## First release

Calories page: date selection, food energy/macros, exercise energy, steps, total daily burn when genuinely available, signed intake-minus-burn balance, user-selected food target, history and source timestamps. Connection cards guide setup and display real status. No fabricated sample health readings in the user's account. No automatic dietary prescriptions or invented calorie targets. Missing total burn means no deficit/surplus calculation. Exercise energy is a subset, not an addition to total burn.

## Boundaries

Server owns Yazio credentials and import cache per authenticated OpenGym user. Tokens never enter synchronized profile state or exports. Android owns Samsung permissions; web displays its synchronized snapshots. Connections must support revoke, expired credentials, unavailable phone/server and partial records. Google sign-in must be proven against the existing Yazio account before claiming a working connector.

## Delivery

Publish source to Rdect/openGym with attribution and license preserved. Produce fork-specific signed APK and web build after connectors pass verification. Keep existing upstream app and user data until the fork is paired and migration is confirmed. Fork updater must never install upstream APKs. Runtime configuration, local account identifiers, private hostnames and health data are excluded from publication.

## Acceptance

One genuine Yazio day's totals match the Calories page; Samsung figures match the corresponding source categories without double counting. Updates and deleted source entries replace snapshots, never accumulate. Web and Android agree after synchronization. Unknown/partial/stale data is visibly distinguished. Installation and restart preserve data. Diet-plan features are not part of this release.

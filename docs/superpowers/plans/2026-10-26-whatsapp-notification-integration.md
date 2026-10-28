# WhatsApp notification integration — proposed plan

Date: 2026-10-26
Status: planning only; option 2 selected by user. No implementation authorized by this document.

## Goal and experience

Show WhatsApp notification activity in Linux Island and let the user activate the originating notification. Open the conversation only when the originating client supports that action. Otherwise offer to open the configured WhatsApp application or, on explicit click, `https://web.whatsapp.com/` in the default browser.

The compact Island gets a small activity dot within its existing Warm Minimalist design. Expanding the Island exposes a WhatsApp item labelled “New WhatsApp activity” and an “Open WhatsApp” action. This is observed notification activity, never an account unread-message count. No sender, message body, phone number, or avatar is displayed or stored. Existing media and system controls remain usable.

Native GNOME banners and notification history remain authoritative. There is no second transient Island banner or automatic PEEK, expansion, focus change, or application launch.

## Verified source baseline

- `extension/lib/notificationAdapter.js` is a guarded stub: `notifyPeek()` accepts metadata but has no real GNOME subscription. It strips content down to app name and urgency; those fields alone cannot establish a trusted WhatsApp identity.
- `extension/extension.js` creates that adapter disabled and maps its callback to `PEEK_REQUEST`. WhatsApp activity must not reuse that callback to generate duplicate banners.
- `notificationPeekEnabled` exists and defaults to false. It must not be silently repurposed as WhatsApp integration consent.
- `docs/TASK_STATUS.md` labels task 17 PASS, but its tracker alone does not prove a live notification bridge. No target-runtime verification was performed for this plan.
- The checkout contains unrelated uncommitted work, including capsule, carousel, QML, settings schema and tests. Preserve it; review the current diff before any implementation.

## Approach and alternatives

Recommended: observe verified GNOME notification lifecycle events, filter a verified application identity, and retain a bounded, session-only reference for activation. This follows the existing GJS architecture and avoids a separate messaging service.

A launcher-only shortcut is simpler but does not fulfill the selected notification scope. An account-connected chat integration is a separate project and unnecessary for this feature.

Browser notifications may identify only the browser rather than WhatsApp. Never classify all notifications from that browser as WhatsApp or trust the human-readable title. Support only client/source combinations whose identity can be established during the feasibility step. Report unsupported combinations clearly.

## Architecture and behavior contract

1. A GNOME adapter owns subscriptions and temporary native notification references. Verify exact GNOME 46 APIs before naming or implementing hooks; do not infer compatibility from another Shell version.
2. A small pure activity model accepts verified source identity, opaque notification identity, add/update/remove events, and policy flags. It contains no message content or native Shell objects.
3. The model tracks at most 32 active notification identities. Repeated updates do not increase activity. On overflow, retain a bounded recent set; the dot still means activity, never an exact count. Removal clears the matching identity. Disconnecting a source clears its entries. Disabling the integration or extension clears everything.
4. The renderer derives its dot/item from the model. No new top-level Island state or Core1 method/signal is needed.
5. A click revalidates the native reference and attempts its verified default activation once. Missing or expired references expose the explicit application/browser fallback. Errors show a short status and leave native notifications untouched. Never derive executable commands or launch URLs from notification text.
6. Successful activation clears the Island activity state for that source; it does not claim the conversation was read or programmatically dismiss GNOME history. Remaining notifications are reconciled only through subsequent verified lifecycle events; do not immediately re-import cleared activity.
7. No activity is restored from history on extension startup. Only new events after opt-in are tracked. This makes the session-local meaning explicit and avoids importing private history.

Use a distinct persisted boolean `whatsappIntegrationEnabled`, default false, through the existing validated settings path. Do not change the frozen Core1 signatures. Initial client selection can be fixed to one runtime-verified desktop identity; a multi-client configuration UI is outside the first slice.

DND suppresses new Island indicators and unsolicited announcements; do not queue suppressed events for later display. Fullscreen hides the Island under the existing policy. Locking hides all activity UI and clears temporary references/state; after unlock, process only new events. Existing activity may remain internally during DND but must stay hidden until DND ends. If those policy hooks cannot be verified, fail closed and report integration unavailable.

## Ordered delivery slices

Execute inline, one small step per user-approved execution turn. Do not run the entire plan in one pass. The first step maps to existing M4-17A and prompt `prompts/gemini-flash-v2/17-M4-notifications.md`; subsequent steps extend M4-17B and require explicit approval of this feature scope. Existing milestone prerequisites still apply.

### 1. Native baseline and feasibility — first execution step

Files: evidence only in `docs/compatibility.md` and `tests/extension/manual-smoke.md`.

- [ ] Use an approved disposable Ubuntu 24.04 / GNOME 46 / Wayland user or VM. Do not modify the daily-use Shell or install packages without approval.
- [ ] Record OS, exact Shell version, session type, extension revision, and selected client desktop identity. Use `gnome-shell --version` and `printf '%s\n' "$XDG_SESSION_TYPE"`; record output and exit status.
- [ ] Follow M4-17A with extension disabled, then enabled with PEEK disabled. Compare native banners/history under DND, fullscreen and lock conditions.
- [ ] Inspect actual GNOME 46 sources and observe subscription, stable identity, replacement/removal, activation, DND and lock APIs. Record exact APIs and cleanup behavior without recording real message content.
- [ ] Validate one WhatsApp client using synthetic/non-sensitive notifications. Determine whether activation opens the conversation or only the app. Test browser identity separately; mark it unsupported if indistinguishable.
- [ ] Stop here. If any required hook is unavailable or unsafe, report BLOCKED and preserve native-only behavior. Do not invent a hook or move to production code.

### 2. Pure activity policy

Create `extension/lib/whatsappActivity.js` and `tests/extension/whatsapp-activity.test.js`.

- [ ] Write failing cases for verified versus unknown identity, duplicate updates, replacement/removal, source disconnect, 32-entry limit, successful activation, disabled/DND/locked events and teardown.
- [ ] Run `node tests/extension/whatsapp-activity.test.js`; record expected behavioral RED, then implement the smallest pure model and record GREEN.
- [ ] Keep all notification text, native objects and disk persistence outside the model.

### 3. Settings consent

Modify `core/settings/settings_schema.cpp`, `tests/unit/tst_settings_schema.cpp`, and `settings-app/qml/Main.qml` only after reviewing their pre-existing changes.

- [ ] Test false default, boolean-only validation and persistence/reload of `whatsappIntegrationEnabled` before implementing it.
- [ ] Add an opt-in control with clear “notification activity” wording and unsupported-client status. Keep the general notification PEEK setting independent.
- [ ] Verify with the repository's settings-schema test target in the existing configured build. Record command/output; a host test does not establish live QML acceptance.

### 4. GNOME bridge and activation

Modify `extension/lib/notificationAdapter.js` and `extension/extension.js`; create `tests/extension/notification-adapter.test.js`.

- [ ] First test subscription ownership, duplicate events, stale activation references, exception containment and disable/re-enable cleanup using injected fake sources.
- [ ] Implement only the APIs proven in step 1; introduce a distinct activity callback rather than triggering `PEEK_REQUEST`.
- [ ] Connect opt-in, policy and source lifecycle to the model. Native notification objects remain adapter-local and bounded.
- [ ] Implement default activation and an explicit fixed-target fallback through platform application APIs. No synchronous D-Bus calls in UI callbacks, subprocess shell strings, credentials or remote content fetching.
- [ ] Run `node tests/extension/notification-adapter.test.js` and `node tests/extension/whatsapp-activity.test.js`; record RED/GREEN separately from GNOME evidence.

### 5. Island presentation

Modify `extension/ui/capsule.js`, `tests/extension/capsule-rendering.test.js`, and, only if necessary, `extension/stylesheet.css` via its existing generated-token workflow. Reuse the current expanded layout; no carousel redesign.

- [ ] Write failing rendering cases for activity/no activity, unavailable integration, activation action, fullscreen/DND/lock hiding, keyboard focus and disable cleanup.
- [ ] Add a small activity dot and accessible expanded action using canonical tokens. Respect reduced motion and preserve media/system interactions.
- [ ] Run `node tests/extension/capsule-rendering.test.js`, `node tests/extension/controller.test.js`, and `python3 design-system/qa/verify_tokens.py`; record actual results.

### 6. Target acceptance and evidence

Update `tests/extension/manual-smoke.md` and `docs/compatibility.md` with actual evidence, not expected results.

- [ ] Verify exactly one native banner per incoming notification and zero Island transient banners.
- [ ] Verify no false classification from another app/browser site, duplicate replacement, notification removal, client exit, activation of expired items and unavailable launcher.
- [ ] Verify DND, fullscreen, lock/unlock, opt-in changes, Core reconnect and ten extension enable/disable cycles without leaked callbacks or stale references.
- [ ] Verify keyboard activation, reduced motion, existing media/system controls, and no message contents in logs or persistence.
- [ ] Confirm conversation activation only for clients where observed. Document app-only and unsupported-client behavior explicitly.
- [ ] Run `git diff --check` and the relevant offline baseline commands from AGENTS.md. Report command/output/exit codes and distinguish static/host checks from target runtime acceptance.

## Completion and boundaries

Done requires a verified supported client, reliable activity state, user-triggered activation/fallback, native notification behavior unchanged, and the complete target-runtime matrix above. Unit PASS alone is insufficient. If the runtime is unavailable, report PARTIAL / runtime NOT_RUN.

No chat composer, replies, full conversation history, account login handling, WhatsApp API/backend, total unread count, calls, attachments, notification daemon replacement, new palette, or Core1 signature changes are included. No builds, installation, deployment, commit, push, merge or tag are performed as part of planning.

Next action after plan review: execute only step 1, provided the required disposable runtime is available and approved.

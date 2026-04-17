# Code Analysis Report

Date: 2026-04-17
Repository: `udemy-downloader-gui`

## Scope

- Reviewed core Electron app flow (`main.js`, `preload.js`, renderer/UI files).
- Reviewed main business logic and download pipeline (`app/app.js`).
- Reviewed helpers/services (`app/helpers/*`, `app/core/services/*`).
- Reviewed localization/bootstrap/config (`app/locale/*`, `environments.js`, `sync-locales.js`).
- Reviewed CI workflows (`.github/workflows/*`) and project docs.

## Key Findings

### Critical

1. Missing imports in `app/helpers/utils.js`
   - `sanitize`, `fs`, and `Settings` are used but not declared/imported.
   - Verified with runtime check: calling `getSequenceName` throws `ReferenceError: sanitize is not defined`.

2. Subtitle selection logic bugs in `app/app.js`
   - Incorrect indexing inside `for...of` loop (`availables[key]` usage).
   - Single-language callback path uses `callback(languageKeys[0])`, which is not a valid language-key mapping.

3. High-risk Electron renderer security posture
   - `nodeIntegration: true`
   - `enableRemoteModule: true`
   - `contextIsolation: false`
   - CSP allows `'unsafe-inline'`

4. Access token exposure in UI
   - Expired-token branch displays the token value in an alert.

### Medium

1. `fs.access` permission mask bug in `app/app.js`
   - Uses `R_OK && W_OK` instead of bitwise combination.

2. Possible missing `lectureData.id` in video fallback HTML path
   - Fallback references `lectureData.id`, while lecture object creation path may omit/stomp fields.

3. Settings default hydration issue in `app/helpers/settings.js`
   - Existing `download` object path may not persist all missing keys as intended.

4. Timeout argument inconsistency in `app/core/services/udemy.service.js`
   - Method signature accepts timeout but request uses instance timeout.

## Architecture Notes

- `app/app.js` is very large and mixes UI, API orchestration, file I/O, and state transitions.
- This increases risk of regressions and makes testing difficult.

## Existing Local Context

- `PROJECT_LOCAL.md` contains prior local HLS-related notes/fixes:
  - Relative URL resolution in playlists.
  - `m4s`/`EXT-X-MAP` support context.
  - Empty-playlist handling behavior.

## Recommended Next Steps (Priority Order)

1. Fix critical runtime/import issues in `app/helpers/utils.js`.
2. Fix subtitle selection logic bugs in `app/app.js`.
3. Remove token exposure in alerts/logging paths.
4. Fix `fs.access` mask and validate fallback lecture path robustness.
5. Plan staged Electron hardening (`contextIsolation`, preload bridge, remove `remote`, CSP tightening).
6. Add smoke tests for utility methods and subtitle selection behavior.

## Current Workspace Note

- During analysis, git status showed unrelated local changes:
  - Deleted: `7. Prompt Templates and Examples.html`
  - Untracked: `PROJECT_LOCAL.md`

This report does not modify those changes.

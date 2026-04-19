# Code Analysis Report

Date: 2026-04-19 (updated)
Repository: `udemy-downloader-gui`
Version: 1.14.0

---

## Scope

Full project review: main process, renderer, services, helpers, HTML/CSS, build config, CI/CD.

---

## 1. Critical Issues

### 1.1 Security — Electron Configuration (`main.js:44-48`)

| Setting | Current | Should be |
|---------|---------|----------|
| `nodeIntegration` | `true` | `false` |
| `enableRemoteModule` | `true` | removed (deprecated since Electron 12) |
| `contextIsolation` | `false` | `true` |
| CSP (`index.html`) | `'unsafe-inline'` | nonce-based or hash |

**Risk:** Any XSS in renderer = full system access (file system, network, shell).

### 1.2 Security — Outdated Electron (`package.json`)

- Current: **Electron 11.5.0** (March 2021)
- Latest stable: **29.x+**
- 5+ years of unpatched Chromium/V8 CVEs.

### 1.3 Bug — Subtitle Single-Language Path (`app/app.js:1890`)

```js
if (languages.length === 1) {
    callback(languageKeys[0]);  // BUG: languageKeys is an object, not array
}
```

Should be `callback(languageKeys[languages[0]].join("|"))`.

### 1.4 Security — Token Exposure (`app/app.js:300`)

```js
showAlert(Settings.accessToken, translate("Token expired"));
```

Shows raw access token in dialog. Should show a generic message.

---

## 2. Architecture Problems

### 2.1 God File — `app/app.js` (2085 lines)

Mixes:
- UI event handlers (jQuery)
- API orchestration
- File I/O (fs.mkdirSync, fs.createWriteStream)
- Download state machine
- Progress tracking
- Error handling

**Impact:** Impossible to test, high regression risk, hard to maintain.

**Recommendation:** Split into modules:
- `app/controllers/download.controller.js` — download orchestration
- `app/controllers/course.controller.js` — course fetching/rendering
- `app/controllers/auth.controller.js` — login/logout
- `app/controllers/settings.controller.js` — settings UI

### 2.2 Deprecated API — `require('electron').remote`

`app/app.js:3-4` uses `remote` module, deprecated since Electron 12, removed in 14+.

**Fix:** Replace with IPC calls via preload bridge (`contextBridge.exposeInMainWorld`).

### 2.3 No Tests

Zero test files. No test framework configured. Utility functions, service layer, and subtitle logic have no coverage.

### 2.4 Synchronous File Operations in Hot Path

`utils.getSequenceName()` calls `fs.existsSync()` and `fs.renameSync()` inside download loops — blocks the event loop during batch operations.

---

## 3. Code Quality Issues

### 3.1 Typo in Setting Name (`settings.js:70`)

```js
continueDonwloadingEncrypted  // should be: continueDownloadingEncrypted
```

This typo propagates to UI form field binding. Fixing requires migration logic for existing user settings.

### 3.2 Commented-Out Dead Code

- `preload.js` — 100% commented out (22 lines)
- `app/helpers/auto_authenticator.js` — entire legacy Socket.IO handler, unused
- `main.js` — 30+ commented lines (macOS menu, event handlers)
- `app/app.js` — scattered commented blocks (L53-66, L596-616)

### 3.3 Unused Parameter

`renderCourses(response, isResearch = false)` — `isResearch` only partially used (empty-results branch); actual search results don't pass it.

### 3.4 Magic Numbers (`app/app.js:1162-1176`)

Quality-to-color mapping hardcoded inline. Should be a constant or config.

### 3.5 Inconsistent Async Patterns

- Some functions use `async/await` → good
- `fetchCourses()` uses `.then().catch()` chains mixed with async functions
- `renderDownloads()` returns a dangling promise

### 3.6 Memory Leak Risk

`timerDownloader` (progress interval) may not clear on error paths in `startDownload()`.

---

## 4. Performance

| Issue | Location | Impact |
|-------|----------|--------|
| jQuery selectors recomputed every call | `ui.js`, `app.js` | Minor DOM thrashing |
| No element caching for progress bars | `startDownload()` | Repeated lookups per tick |
| Entire M3U8 loaded into memory | `m3u8.service.js` | Fine for playlists (<1MB) |
| Sequential chapter downloads | `downloadChapter()` recursive | Expected, but no parallelism option |

---

## 5. Build & DevOps

### 5.1 `.env` Handling (`environments.js`)

```js
const envFile = fs.readFileSync(`${__dirname}/.env`, 'utf-8');
```

Crashes if `.env` doesn't exist. No try-catch. Breaks fresh clones without `.env`.

### 5.2 Dependency on GitHub Fork

```json
"mt-files-downloader": "github:FaisalUmair/mt-files-downloader-wrapper"
```

No version pinning. If repo deleted/force-pushed — build breaks.

### 5.3 No Lock on Node.js Version

No `.nvmrc` or `engines` field. Works on Node 14+ but untested on newer runtimes.

---

## 6. UX Improvements

| Area | Current | Proposed |
|------|---------|----------|
| Error messages | Generic "Error" dialogs | Contextual messages with retry actions |
| Download resume | Stop/resume per-file only | Persist download state across app restarts |
| Progress | Per-lecture + combined | Add ETA, total size, percentage |
| Dark mode | None | Detect system preference, add toggle |
| Notifications | Basic OS notification on complete | Show failed/encrypted count in notification |

---

## 7. Improvement Roadmap (Priority Order)

### Phase 1 — Bugs & Security (immediate)

1. Fix subtitle `languageKeys[0]` bug
2. Remove token exposure in alerts
3. Add try-catch to `environments.js`
4. Pin `mt-files-downloader` to specific commit SHA

### Phase 2 — Modernization (1-2 weeks)

5. Upgrade Electron to latest LTS (29.x)
6. Enable `contextIsolation: true`, disable `nodeIntegration`
7. Create proper preload bridge (`contextBridge`)
8. Replace `remote` module with IPC handlers
9. Remove dead code (commented blocks, `auto_authenticator.js`)

### Phase 3 — Architecture (2-4 weeks)

10. Split `app.js` into controller modules
11. Replace synchronous fs calls with async versions
12. Add basic test suite (Jest or Vitest) for utilities and services
13. Add ESLint with recommended config
14. Fix typo `continueDonwloadingEncrypted` with migration

### Phase 4 — UX & Features (ongoing)

15. Dark mode support
16. Persistent download queue (resume after restart)
17. Download ETA and speed graph
18. Batch download with parallel chapters
19. Modern UI framework migration (optional: React/Vue in renderer)

---

## Files to Focus On

| File | Lines | Role | Priority |
|------|-------|------|----------|
| `app/app.js` | 2085 | Main renderer logic | HIGH — split |
| `main.js` | 208 | Electron main | HIGH — security |
| `app/helpers/settings.js` | 228 | Settings persistence | MEDIUM — typo fix |
| `app/core/services/udemy.service.js` | ~410 | API layer | LOW — solid |
| `app/core/services/m3u8.service.js` | 165 | HLS parser | LOW — clean |
| `environments.js` | 14 | Env loader | HIGH — crash fix |

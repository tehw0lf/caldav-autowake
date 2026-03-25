# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Thunderbird WebExtension (Manifest V2) that fixes a known Thunderbird bug where CalDAV calendars get silently disabled on network errors. It automatically syncs and re-enables them when Thunderbird comes back online.

**Key constraint**: Sync must happen before enabling — enabling before a successful sync causes Thunderbird to immediately disable the calendar again.

## Development

This extension has no build step and no dependencies. Load it directly in Thunderbird:

1. Open Thunderbird → address bar: `about:debugging`
2. "This Thunderbird" → "Load Temporary Add-on"
3. Select `manifest.json` from the project root

Enable debug notifications during development by setting `DEBUG = true` in `background.js`.

## Pre-commit Validation

There are no lint/test/build commands. Before committing, manually verify the extension loads without errors in Thunderbird and the core flow works.

## Architecture

The extension uses the **Thunderbird Experiment API** pattern to access internal Thunderbird APIs unavailable to standard WebExtensions:

```
options/options.html+js          ← Settings UI (browser.storage.local)
background.js                    ← Standard WebExtension background script
    └── browser.calendarManager  ← Experiment API (bridged via experiments/)
            ↓
experiments/schema.json          ← WebExtension API schema (declares functions + events)
experiments/implementation.js    ← Runs in Thunderbird's chrome process with XPCOM access
```

### Two-layer architecture

- **`background.js`**: Standard WebExtension code. Reads `excludePatterns` from `browser.storage.local`, then listens for `onOnlineStateRestored` and calls `syncAndEnableCalDAVCalendars(excludePatterns)`. Also runs an 8-second delayed startup check as a fallback.

- **`options/`**: Settings page for the exclude list. Stores an array of name patterns under the key `"excludePatterns"` in `browser.storage.local`. Both files must use the same key.

- **`experiments/implementation.js`**: Chrome-process privileged code with full XPCOM/JSM access. Implements:
  - `syncAndEnableCalDAVCalendars(excludePatterns)` — finds disabled CalDAV calendars (type `"caldav"` with `http(s)://` or `dav(s)://` URI), skips any whose name matches an exclude pattern, refreshes each while still disabled (using `cal.refresh()`, which works on disabled calendars), then enables only those that synced successfully
  - `onOnlineStateRestored` event — observes the `network:offline-status-changed` XPCOM topic and fires when transitioning from offline to online

### Exclude pattern matching (`isExcluded` in `experiments/implementation.js`)

- Case-insensitive, matched against the calendar **name** (not URL)
- Trailing `*` = prefix wildcard: `nextcloud*` matches `Nextcloud Calendar`
- No other wildcard positions supported
- Experiment code cannot access `browser.storage` directly — `background.js` reads storage and passes the array as a parameter

### Important implementation details

- `cal.refresh()` executes on disabled calendars (same as right-click → Synchronize in the UI) — this is intentional and the core insight
- The extension never modifies `readOnly` — that is a user setting
- Sync timeout is 30 seconds per calendar
- The experiment uses `calIObserver.onLoad` for success and `onError` (with `errno === 0`) for success-with-no-errors

## CI/CD

On push to `main`, GitHub Actions zips the extension and publishes to addons.thunderbird.net (AMO) via the reusable workflow at `tehw0lf/workflows`. Requires `AMO_API_KEY` and `AMO_API_SECRET` secrets.

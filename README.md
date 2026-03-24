# CalDAV Auto-Wake

A Thunderbird extension that automatically syncs and re-enables disabled CalDAV calendars after Thunderbird comes back online.

## The Problem

Thunderbird has a known bug where remote CalDAV calendars get silently disabled on network errors and are never automatically re-enabled. This is especially noticeable when using extensions like KeePassXC-Mail, which toggles Thunderbird's offline mode on shutdown and back off on startup to avoid race conditions during password prompts.

The correct recovery order matters: **sync first, then enable** — enabling before a successful sync causes Thunderbird to immediately disable the calendar again.

## What It Does

- Listens for Thunderbird's offline → online transition and automatically syncs all disabled CalDAV calendars
- Only enables a calendar after its sync completes successfully
- Also runs a check 8 seconds after startup as a fallback, in case the online transition happened before the extension finished loading
- Never touches the read-only setting of any calendar
- Runs silently in the background

## Installation

Install directly from [addons.thunderbird.net](https://addons.thunderbird.net).

## Compatibility

Requires Thunderbird 102 or later.

## Development

To load the extension temporarily for development:

1. Open Thunderbird → address bar: `about:debugging`
2. "This Thunderbird" → "Load Temporary Add-on"
3. Select `manifest.json` from the project folder

To enable debug notifications, set `DEBUG = true` in `background.js`.

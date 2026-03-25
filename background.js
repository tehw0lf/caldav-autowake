"use strict";

// ---------------------------------------------------------------------------
// CalDAV Auto-Wake – background script
//
// Listens for the offline→online transition (fired by our experiment),
// then calls syncAndEnableCalDAVCalendars().
//
// Debug notifications are shown during development; set DEBUG = false to
// silence them in production.
// ---------------------------------------------------------------------------

const DEBUG = false; // ← set to false for silent production use
const EXTENSION_NAME = "CalDAV Auto-Wake";

function debugNotify(title, message) {
  if (!DEBUG) return;
  browser.notifications.create({
    type: "basic",
    title: `[${EXTENSION_NAME}] ${title}`,
    message,
  });
}

async function doSyncAndEnable() {
  debugNotify("Online detected", "Starting CalDAV sync…");

  try {
    const { excludePatterns = [] } = await browser.storage.local.get(
      "excludePatterns",
    );
    const result = await browser.calendarManager.syncAndEnableCalDAVCalendars(
      excludePatterns,
    );

    if (result.synced === 0 && result.skipped === 0) {
      debugNotify("Nothing to do", "No disabled CalDAV calendars found.");
      return;
    }

    const parts = [];
    if (result.enabled > 0) parts.push(`✓ ${result.enabled} enabled`);
    if (result.skipped > 0)
      parts.push(`✗ ${result.skipped} failed (left disabled)`);

    debugNotify(
      result.skipped === 0 ? "Done" : "Done (with errors)",
      parts.join(" · "),
    );
  } catch (err) {
    debugNotify("Error", String(err));
    console.error(`[${EXTENSION_NAME}] ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Wire up the online-state event.
// ---------------------------------------------------------------------------

browser.calendarManager.onOnlineStateRestored.addListener(() => {
  console.log(`[${EXTENSION_NAME}] Offline → online transition detected.`);
  doSyncAndEnable();
});

// Also run once at startup in case TB is already online but calendars are
// still disabled (e.g. KeePassXC-Mail restored online mode before we loaded).
// Small delay to let all extensions (incl. KeePassXC-Mail) settle first.
setTimeout(() => {
  console.log(
    `[${EXTENSION_NAME}] Startup check for disabled CalDAV calendars…`,
  );
  doSyncAndEnable();
}, 8_000); // 8 s – tweak if needed

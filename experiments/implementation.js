"use strict";

// ---------------------------------------------------------------------------
// CalDAV Auto-Wake – Experiment implementation
//
// Runs in Thunderbird's main (chrome) process. Has full access to
// Thunderbird's XPCOM/JSM internals.
// ---------------------------------------------------------------------------

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs",
);

// calICalendarManager is exposed via the service manager.
// Type IDs are stable across TB 102+.
const CAL_MANAGER_CID = "@mozilla.org/calendar/manager;1";

function getCalManager() {
  return Cc[CAL_MANAGER_CID].getService(Ci.calICalendarManager);
}

// A CalDAV calendar has type "caldav" in TB's internal registry.
// We also accept "ics" remote calendars (http/https URLs) just in case,
// but focus is on caldav.
function isRemoteCalDAV(cal) {
  const type = cal.type ? cal.type.toLowerCase() : "";
  if (type !== "caldav") return false;

  // Must have a non-empty URI with an http(s) or dav scheme.
  try {
    const uri = cal.uri ? cal.uri.spec : "";
    return /^https?:\/\//i.test(uri) || /^davs?:\/\//i.test(uri);
  } catch (_) {
    return false;
  }
}

// Try to refresh a single calendar (while it is still disabled!) and return
// a Promise that resolves to true on success or false on failure/timeout.
//
// Key insight from manual testing: TB will execute cal.refresh() even when
// the calendar is disabled – exactly like the right-click → Synchronize menu
// item does. We must NOT touch readOnly at all (user may have a calendar that
// is intentionally read-only).
function refreshCalendar(cal) {
  return new Promise((resolveOuter) => {
    let done = false;
    const TIMEOUT_MS = 30_000;

    // Single cleanup+resolve helper to avoid double-calls.
    function finish(ok) {
      if (done) return;
      done = true;
      timer.cancel();
      try {
        cal.removeObserver(observer);
      } catch (_) {}
      resolveOuter(ok);
    }

    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(
      {
        notify() {
          finish(false);
        },
      },
      TIMEOUT_MS,
      Ci.nsITimer.TYPE_ONE_SHOT,
    );

    const observer = {
      onLoad(_calendar) {
        finish(true);
      },
      onError(_calendar, errno, _msg) {
        finish(errno === 0);
      },
      // Required stubs – calIObserver interface:
      onStartBatch() {},
      onEndBatch() {},
      onAddItem() {},
      onModifyItem() {},
      onDeleteItem() {},
      onPropertyChanged() {},
      onPropertyDeleting() {},
    };

    cal.addObserver(observer);

    try {
      cal.refresh(); // works on disabled calendars, same as right-click → Synchronize
    } catch (e) {
      finish(false);
    }
  });
}

// Returns true if calName matches any pattern in excludePatterns.
// Matching is case-insensitive. A trailing '*' is treated as a prefix wildcard;
// all other characters are literals.
function isExcluded(calName, excludePatterns) {
  if (!excludePatterns || excludePatterns.length === 0) return false;
  const name = (calName || "").toLowerCase();
  for (const rawPattern of excludePatterns) {
    const pattern = (rawPattern || "").trim();
    if (!pattern) continue;
    if (pattern.endsWith("*")) {
      if (name.startsWith(pattern.slice(0, -1).toLowerCase())) return true;
    } else {
      if (name === pattern.toLowerCase()) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main Experiment class
// ---------------------------------------------------------------------------

var calendarManager = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      calendarManager: {
        // ----------------------------------------------------------------
        // Function: syncAndEnableCalDAVCalendars
        // ----------------------------------------------------------------
        async syncAndEnableCalDAVCalendars(excludePatterns) {
          const mgr = getCalManager();
          const allCalendars = mgr.getCalendars({});

          // Find CalDAV calendars that are currently disabled.
          const targets = allCalendars.filter((cal) => {
            const disabled = cal.getProperty("disabled");
            return (
              isRemoteCalDAV(cal) && (disabled === true || disabled === "true")
            );
          });

          if (targets.length === 0) {
            return { synced: 0, enabled: 0, skipped: 0 };
          }

          let synced = 0;
          let enabled = 0;
          let skipped = 0;

          for (const cal of targets) {
            const calName = cal.name || cal.id;

            // Skip calendars on the user-configured exclude list.
            if (isExcluded(calName, excludePatterns)) {
              continue;
            }

            // Step 1: Refresh while still disabled.
            //         TB executes cal.refresh() on disabled calendars
            //         (same as right-click → Synchronize in the UI).
            //         We never touch readOnly – that is a user setting.
            const ok = await refreshCalendar(cal);

            if (ok) {
              synced++;
              // Step 2: Only enable AFTER successful sync.
              cal.setProperty("disabled", false);
              enabled++;
            } else {
              // Sync failed – leave disabled, TB won't flap it again.
              skipped++;
            }
          }

          return { synced, enabled, skipped };
        },

        // ----------------------------------------------------------------
        // Event: onOnlineStateRestored
        // Fires once when Thunderbird transitions offline → online.
        // ----------------------------------------------------------------
        onOnlineStateRestored: new ExtensionCommon.EventManager({
          context,
          name: "calendarManager.onOnlineStateRestored",
          register(fire) {
            let wasOffline = Services.io.offline;

            const observer = {
              observe(subject, topic, data) {
                if (topic !== "network:offline-status-changed") return;

                const nowOffline = data === "offline";

                if (wasOffline && !nowOffline) {
                  // Transitioned offline → online.
                  wasOffline = false;
                  fire.async();
                } else {
                  wasOffline = nowOffline;
                }
              },
            };

            Services.obs.addObserver(
              observer,
              "network:offline-status-changed",
            );

            // Return cleanup function.
            return () => {
              Services.obs.removeObserver(
                observer,
                "network:offline-status-changed",
              );
            };
          },
        }).api(),
      },
    };
  }
};

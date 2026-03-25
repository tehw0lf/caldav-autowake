"use strict";

const STORAGE_KEY = "excludePatterns";

async function loadSettings() {
  const { [STORAGE_KEY]: patterns = [] } =
    await browser.storage.local.get(STORAGE_KEY);
  document.getElementById("excludeList").value = patterns.join("\n");
}

async function saveSettings() {
  const raw = document.getElementById("excludeList").value;

  // Split on newlines, trim each line, drop empty lines.
  const patterns = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  await browser.storage.local.set({ [STORAGE_KEY]: patterns });

  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
}

document.getElementById("save").addEventListener("click", saveSettings);

loadSettings();

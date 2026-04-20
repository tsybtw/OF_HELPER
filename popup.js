document.getElementById("ext-version").textContent = chrome.runtime.getManifest().version;

document.addEventListener('DOMContentLoaded', async function () {
  const browserSwitches = [];
  let previousActiveSwitchIndex = null;

  async function fetchActiveBrowsers() {
    try {
      const res = await fetch('http://localhost:3000/active-browsers');
      const data = await res.json();
      return new Set(data.numbers || []);
    } catch (_) {
      return new Set();
    }
  }

  function getMyCheckedNum() {
    const idx = browserSwitches.findIndex(sw => sw.checked);
    return idx >= 0 ? idx + 1 : null;
  }

  function updateDisabledSwitches(activeBrowserNumbers) {
    const myNum = getMyCheckedNum();
    for (let i = 1; i <= 15; i++) {
      const sw = browserSwitches[i - 1];
      const container = sw.closest('.switch-labels');
      const isOccupied = activeBrowserNumbers.has(i) && i !== myNum;
      sw.disabled = isOccupied;
      if (isOccupied) {
        sw.checked = false;
        container.classList.add('switch-occupied');
      } else {
        container.classList.remove('switch-occupied');
      }
    }
  }

  async function updateActiveBrowserCount() {
    const anyBrowserActive = browserSwitches.some(switchElement => switchElement.checked);
    const activeSwitchIndex = browserSwitches.findIndex(switchElement => switchElement.checked);
    let countChange = 0;

    if (previousActiveSwitchIndex === null && anyBrowserActive) {
      countChange = 1;
    } else if (previousActiveSwitchIndex !== null && !anyBrowserActive) {
      countChange = -1;
    }

    if (countChange !== 0) {
      const response = await fetch('http://localhost:3000/update-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: countChange })
      });

      if (!response.ok) {
        console.error('Error sending POST request:', response);
      }
    }
    previousActiveSwitchIndex = activeSwitchIndex !== -1 ? activeSwitchIndex : null;
  }

  for (let i = 1; i <= 15; i++) {
    const browserSwitch = document.getElementById(`browserSwitch${i}`);
    browserSwitches.push(browserSwitch);

    const storageKey = `browser${i}Checked`;
    const storageResult = await chrome.storage.local.get([storageKey]);
    browserSwitch.checked = storageResult[storageKey] || false;

    if (browserSwitch.checked) {
      previousActiveSwitchIndex = i - 1;
    }

    browserSwitch.addEventListener('change', async function () {
      if (this.checked) {
        browserSwitches.forEach((switchElement, index) => {
          if (switchElement !== this && switchElement.checked) {
            switchElement.checked = false;
            chrome.storage.local.set({ [`browser${index + 1}Checked`]: false });
          }
        });
      }

      const storageUpdates = {};
      for (let j = 1; j <= 15; j++) {
        storageUpdates[`browser${j}Checked`] = browserSwitches[j - 1].checked;
      }
      await chrome.storage.local.set(storageUpdates);

      if (this.checked) {
        const browserNum = parseInt(this.id.replace('browserSwitch', ''));
        chrome.runtime.sendMessage({
          action: 'reregisterWS',
          browserNumber: browserNum
        });
      } else {
        const browserNum = parseInt(this.id.replace('browserSwitch', ''));
        chrome.runtime.sendMessage({
          action: 'unregisterWS',
          browserNumber: browserNum
        });
      }

      await updateActiveBrowserCount();

      if (this.checked) {
        const response = await fetch('http://localhost:3000/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!response.ok) {
          console.error('Error sending POST request:', response);
        }
      }

      const activeBrowserNumbers = await fetchActiveBrowsers();
      updateDisabledSwitches(activeBrowserNumbers);
    });
  }

  const initialActiveBrowsers = await fetchActiveBrowsers();
  updateDisabledSwitches(initialActiveBrowsers);

  chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace !== 'local') return;
    const hasBrowserKey = Object.keys(changes).some(k => k.startsWith('browser') && k.endsWith('Checked'));
    if (!hasBrowserKey) return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      const match = key.match(/^browser(\d+)Checked$/);
      if (match) {
        const i = parseInt(match[1]);
        if (i >= 1 && i <= 15) browserSwitches[i - 1].checked = newValue || false;
      }
    }
    const nums = await fetchActiveBrowsers();
    updateDisabledSwitches(nums);
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'browsers-updated') {
      updateDisabledSwitches(new Set(request.numbers || []));
      sendResponse({ ok: true });
      return false;
    }
    if (request.type === 'getActiveBrowserCount') {
      sendResponse({ activeBrowserCount: browserSwitches.filter(s => s.checked).length });
      return false;
    }
  });

  const storageResult = await chrome.storage.local.get(['postChecked', 'fakeChecked']);
  if (storageResult.postChecked === undefined || storageResult.postChecked === true) {
    await chrome.storage.local.set({ 'postChecked': true });
  }
  if (storageResult.fakeChecked === undefined || storageResult.fakeChecked === true) {
    await chrome.storage.local.set({ 'fakeChecked': true });
  }
  await updateActiveBrowserCount();
});

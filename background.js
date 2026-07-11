const ALL_ACTIONS_DELAY = 0;
const MAX_POST_TABS = 2;
const TAB_COUNT = 30
const DELAY_GREEN_BUTTON = 500;

function updateArrowButtonOnTab(tabId, state, locked, lockedByMe) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (state, locked, lockedByMe) => {
      const fillElement = document.getElementById("fill-animation");
      const arrowPath = document.getElementById("arrow-path");
      const arrowButton = document.getElementById("auto-restart-arrow");
      if (!fillElement || !arrowPath || !arrowButton) return;

      if (state === 1) {
        fillElement.style.backgroundImage = "linear-gradient(to right, rgb(45, 155, 55) 0%, rgb(45, 155, 55) 50%, rgb(221, 109, 85) 50%, rgb(221, 109, 85) 100%)";
        fillElement.style.backgroundPosition = "0%";
        arrowPath.setAttribute("stroke", "#ffffff");
      } else if (state === 2) {
        fillElement.style.backgroundImage = "linear-gradient(to right, #9B59B6 0%, #9B59B6 50%, rgb(221, 109, 85) 50%, rgb(221, 109, 85) 100%)";
        fillElement.style.backgroundPosition = "0%";
        arrowPath.setAttribute("stroke", "#ffffff");
      } else {
        fillElement.style.backgroundPosition = "100%";
        arrowPath.setAttribute("stroke", "#dddddd");
      }

      arrowButton.style.opacity = (locked && !lockedByMe) ? "0.45" : "1";
      arrowButton.style.pointerEvents = (locked && !lockedByMe) ? "none" : "auto";
      arrowButton.setAttribute("data-arrow-state", String(state));

      arrowButton.style.transform = "scale(1.1)";
      setTimeout(() => { arrowButton.style.transform = "scale(1)"; }, 150);
    },
    args: [state, locked, lockedByMe]
  }).catch(() => { });
}

function getArrowStateInt(autoEnabled, singleEnabled) {
  if (singleEnabled) return 2;
  if (autoEnabled) return 1;
  return 0;
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.autoRestartEnabled || changes.singleTabMode || changes._arrowLocked || changes._arrowLockedBy)) {
    chrome.storage.local.get(['autoRestartEnabled', 'singleTabMode', '_arrowLocked', '_arrowLockedBy'], (result) => {
      const autoEnabled = result.autoRestartEnabled || false;
      const singleEnabled = result.singleTabMode || false;
      const state = getArrowStateInt(autoEnabled, singleEnabled);
      const locked = result._arrowLocked || false;
      const lockedByMe = result._arrowLockedBy === currentBrowserNumber;

      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && tab.url.includes("onlyfans.com")) {
            updateArrowButtonOnTab(tab.id, state, locked, lockedByMe);
          }
        });
      });
    });
  }
});


async function executeScriptIfValid(activeTab, details) {
  if (activeTab && activeTab.url && !activeTab.url.startsWith("chrome://")) {
    await chrome.scripting.executeScript(details);
  }
}

const protectedTabs = {
  ids: new Set(),

  add: function (tabId) {
    const tabIdStr = String(tabId);
    this.ids.add(tabIdStr);
    return tabIdStr;
  },

  delete: function (tabId) {
    const tabIdStr = String(tabId);
    this.ids.delete(tabIdStr);
  },

  has: function (tabId) {
    const tabIdStr = String(tabId);
    const isProtected = this.ids.has(tabIdStr);
    return isProtected;
  }
};

let timerVisibility = true;
let closedTabIds = new Set();
let closedTabsCount = 0;
let lastCheckTime = 0;
let lastClosedTime = null;
let isStop = false;
let processing = false;

let currentBrowserNumber = 1;
let currentCmdId = null;
let lastTabCount = 0;
let switchTabsEnabled = false;
let switchTabsCurrentPhase = null;
let switchTabsInFlight = false;
let lastSwitchStateSignature = null;
let switchStateFetchInProgress = false;

const DEDUPE_TTL_MS = 1000;
const recentCommands = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of recentCommands.entries()) {
    if (now - ts > DEDUPE_TTL_MS) recentCommands.delete(k);
  }
}, DEDUPE_TTL_MS * 2);

const injectedTabs = new Set();

async function injectCSS(tabId) {
  if (injectedTabs.has(tabId)) return;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: "#ModalAlert, #ModalAlert___BV_modal_outer_{ display: none !important; visibility: hidden !important; opacity: 0 !important; position: fixed !important; top: -9999px !important; left: -9999px !important; z-index: -9999 !important; width: 0 !important; height: 0 !important; overflow: hidden !important; }"
    });
    injectedTabs.add(tabId);
  } catch (_) { }
}

async function getMyBrowserNumber() {
  const items = await chrome.storage.local.get(null);
  const activeBrowser = Object.keys(items)
    .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
    .map(key => parseInt(key.match(/\d+/)[0]))[0];
  return activeBrowser || null;
}

async function autoAssignBrowserNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    try {
      const syncData = await chrome.storage.sync.get(['preferredBrowserNumber']);
      const preferred = syncData.preferredBrowserNumber || null;
      const res = await fetch('http://localhost:3000/active-browsers');
      const { numbers } = await res.json();
      const taken = new Set(numbers || []);
      let chosen = (preferred && !taken.has(preferred)) ? preferred : null;
      if (!chosen) for (let i = 1; i <= 15; i++) { if (!taken.has(i)) { chosen = i; break; } }
      if (!chosen) continue;
      await chrome.storage.local.set({ [`browser${chosen}Checked`]: true });
      currentBrowserNumber = chosen;
      try { chrome.runtime.sendMessage({ type: 'ws-update-browser-number', browserNumber: chosen }); } catch (_) { }
      return;
    } catch (_) { }
  }
  await chrome.storage.local.set({ browser1Checked: true });
  currentBrowserNumber = 1;
  try { chrome.runtime.sendMessage({ type: 'ws-update-browser-number', browserNumber: 1 }); } catch (_) { }
}

getMyBrowserNumber().then(num => {
  if (num) {
    currentBrowserNumber = num;
    console.log(`Browser number initialized: ${currentBrowserNumber}`);
  } else {
    currentBrowserNumber = 1;
    autoAssignBrowserNumber();
  }
});

chrome.storage.local.get(['lastTabCount', 'timerVisibility'], (res) => {
  if (typeof res.lastTabCount === 'number') {
    lastTabCount = res.lastTabCount;
  }
  if (typeof res.timerVisibility === 'boolean') {
    timerVisibility = res.timerVisibility;
  }
  try { updateTabCounterOnActiveTab(false); } catch (_) { }
});

let persistTimer = null;
function persistTabCount(count) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.local.set({ lastTabCount: count });
  }, 1000);
}

setInterval(async () => {
  if (switchStateFetchInProgress) return;
  switchStateFetchInProgress = true;
  try {
    const resp = await fetch('http://localhost:8765/switch-tabs-state');
    const state = await resp.json();
    if (!state || state.success === false) return;
    switchTabsEnabled = !!state.enabled;

    const myKey = String(currentBrowserNumber);
    const active = state.active || null;
    const expected = Array.isArray(state.expected) ? state.expected : [];
    const results = state.results || {};
    const myResult = results[myKey];

    const signature = JSON.stringify({ enabled: switchTabsEnabled, active, expected, result: myResult });
    if (signature === lastSwitchStateSignature) return;
    lastSwitchStateSignature = signature;

    if (!switchTabsEnabled || !active) {
      switchTabsCurrentPhase = null; switchTabsInFlight = false; return;
    }

    if (expected.includes(myKey) && myResult !== true && !switchTabsInFlight) {
      switchTabsCurrentPhase = active;
      switchTabsInFlight = true;
      performPhaseSwitch(active).finally(() => { switchTabsInFlight = false; });
    }
  } catch (e) { } finally {
    switchStateFetchInProgress = false;
  }
}, 1000);

async function performPhaseSwitch(phase) {
  if (!switchTabsEnabled) return;
  try {
    await switchToTargetTab(phase === 'first' ? 'first' : 'last');
    await reportSwitchResult(true, phase);
  } catch (e) {
    await reportSwitchResult(false, phase);
  }
}

async function reportSwitchResult(success, phase) {
  try {
    await fetch('http://localhost:8765/switch-tabs-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser: String(currentBrowserNumber), phase, success })
    });
  } catch (e) { }
}

async function switchToTargetTab(which) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const ofTabs = tabs.filter(t => t.url && t.url.startsWith('https://onlyfans.com'));
      if (ofTabs.length === 0) return reject(new Error('No OF tabs'));
      const target = which === 'first' ? ofTabs.reduce((a, b) => a.index < b.index ? a : b) : ofTabs.reduce((a, b) => a.index > b.index ? a : b);
      chrome.tabs.update(target.id, { active: true }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve();
      });
    });
  });
}

function checkAndCloseTab(tabId) {
  const hasInterval = !!(window.__ofhIntervals && window.__ofhIntervals[tabId]);

  const cleanupInterval = (tabId) => {
    try {
      if (window.__ofhIntervals && window.__ofhIntervals[tabId]) {
        clearInterval(window.__ofhIntervals[tabId]);
        delete window.__ofhIntervals[tabId];
      }
    } catch (_) { }
  };

  if (hasInterval) {
    cleanupInterval(tabId);
  }

  const editor = document.querySelector(".tiptap.ProseMirror");
  if (editor?.getAttribute("data-is-empty") === "true" || !editor) {
    chrome.runtime.sendMessage({ action: "closeTab", tabId });
    return;
  }

  const pressBind = () => {
    try {
      if (window.__ofhIntervals && window.__ofhIntervals[tabId]) {
        clearInterval(window.__ofhIntervals[tabId]);
        delete window.__ofhIntervals[tabId];
      }
    } catch (_) { }

    const intervalId = setInterval(async () => {
      const selector = document.querySelector(
        '[at-attr="submit_post"]'
      );

      if (!selector) {
        cleanupInterval(tabId);
        return;
      }

      if (selector?.disabled === false) {
        const { syncStop = false, singleStop = false } = await new Promise(resolve => {
          chrome.storage.local.get(['syncStop', 'singleStop'], resolve);
        });
        if (!syncStop && !singleStop) {
          selector.click();
          chrome.storage.local.get(['tabsToClose'], (result) => {
            const tabsToClose = result.tabsToClose || [];
            if (!tabsToClose.includes(tabId)) {
              tabsToClose.push(tabId);
              chrome.storage.local.set({ tabsToClose: tabsToClose });
            }
          });
        }

        setTimeout(() => {
          const confirmButton = Array.from(
            document.querySelectorAll("button.g-btn")
          ).find((b) => b.textContent.trim() === "Yes");
          confirmButton?.click();
          cleanupInterval(tabId);
          return
        }, 500);
      }
    }, 5000);

    try {
      window.__ofhIntervals = window.__ofhIntervals || {};
      window.__ofhIntervals[tabId] = intervalId;
    } catch (_) { }
  };

  const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');
  const runPressBind = () => {
    const secondTargetNode = document.querySelector(".b-reminder-form.m-error");
    const innerDiv = secondTargetNode ? secondTargetNode.querySelector("div") : null;
    if (!document.querySelector(".b-reminder-form.m-error") || (innerDiv && innerDiv.textContent.includes("10"))) {
      pressBind();
    }
  };

  if (!mediaWrapperExists) {
    chrome.storage.local.get('pht', (data) => {
      const phtIds = Array.isArray(data.pht) ? data.pht : [];
      const isWithoutPhoto = phtIds.some((id) => Number(id) === Number(tabId));
      if (isWithoutPhoto) runPressBind();
    });
    return;
  }

  runPressBind();
}

let _tabPollCounter = 0;
setInterval(() => {
  _tabPollCounter++;
  chrome.tabs.query({}, function (tabs) {
    const onlyFansTabsCount = tabs.filter(tab =>
      tab.url && tab.url.startsWith('https://onlyfans.com')
    ).length;

    if (onlyFansTabsCount !== lastTabCount || _tabPollCounter % 15 === 0) {
      getMyBrowserNumber().then(browserNum => {
        if (browserNum != null) currentBrowserNumber = browserNum;
        sendReadyRequest(browserNum ?? currentBrowserNumber, onlyFansTabsCount);
      });
      lastTabCount = onlyFansTabsCount;
    }
  });
}, 2000);

function updateTabCounterOnActiveTab(isReset) {
  chrome.tabs.query({ url: "https://onlyfans.com/*" }, function (ofTabs) {
    const onlyFansTabsCount = Array.isArray(ofTabs) ? ofTabs.length : 0;

    chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
      if (!activeTabs || activeTabs.length === 0) return;
      const activeTab = activeTabs[0];

      if (!activeTab || !activeTab.url || !activeTab.url.startsWith('https://onlyfans.com')) {
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (isVisible) => {
          const ids = [
            "tabCounter", "cont1", "cont2", "cont3",
            "switch-button", "fakeMakeButton", "version", "clear-button", "reload-button", "stories-container", "bottom-overlay", "joy", "text-size-slider", "tag-rotation-dial", "tag-reset-button"
          ];
          ids.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            el.style.opacity = isVisible ? '1' : '0';
            el.style.pointerEvents = isVisible ? 'auto' : 'none';
          });
        },
        args: [timerVisibility]
      }).catch(console.error);

      let timeSinceLastClosed = "00:00";
      let color = "rgb(45, 155, 55)";

      if (isReset) {
        lastClosedTime = new Date();
        closedTabsCount = 0;
        chrome.storage.local.set({ timerVisibility });
      }

      if (lastClosedTime) {
        const now = new Date();
        const diffMs = now - lastClosedTime;
        const diffSecs = Math.floor(diffMs / 1000);
        const minutes = String(Math.floor(diffSecs / 60)).padStart(2, "0");
        const seconds = String(diffSecs % 60).padStart(2, "0");
        timeSinceLastClosed = `${minutes}:${seconds}`;

        if (diffSecs < 15) {
          color = "rgb(45, 155, 55)";
        } else if (diffSecs < 30) {
          color = "yellow";
        } else {
          color = "rgb(221, 109, 85)";
          checkTabs();
        }
      }

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (count, closedCount, time, color) => {
          const update = () => {
            let counter = document.getElementById("tabCounter");
            if (!counter) {
              counter = document.createElement("div");
              counter.id = "tabCounter";
              Object.assign(counter.style, {
                position: "fixed",
                bottom: "65px",
                left: "7px",
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: "20px",
                borderRadius: "5px",
                zIndex: "99999"
              });
              document.body.appendChild(counter);
            }
            counter.style.color = color;
            counter.textContent = `${count} / ${closedCount} / ${time}`;
          };

          if (document.readyState === "loading") {
            if (!window.__OFH_TAB_COUNTER_LISTENER) {
              window.__OFH_TAB_COUNTER_LISTENER = true;
              document.addEventListener("DOMContentLoaded", () => {
                update();
              }, { once: true });
            }
          } else {
            update();
          }
        },
        args: [onlyFansTabsCount, closedTabsCount, timeSinceLastClosed, color]
      }).catch(console.error);

      persistTabCount(onlyFansTabsCount);
    });
  });

  function checkTabs() {
    if (Date.now() - lastCheckTime < 5000 || processing) return;
    processing = true;
    lastCheckTime = Date.now();

    chrome.tabs.query(
      { url: "https://onlyfans.com/*", status: "complete" },
      (tabs) => {
        chrome.tabs.query(
          { active: true, currentWindow: true },
          ([activeTab]) => {
            processing = false;
            if (!activeTab || !tabs?.length) return;

            const tabsToProcess = tabs
              .filter((tab) => tab.id !== activeTab.id)
              .slice(0, 5);

            for (const tab of tabsToProcess) {
              if (protectedTabs.has(tab.id)) {
                continue;
              }

              if (
                tab.url === "https://onlyfans.com/posts/create" &&
                tab.url !== "https://onlyfans.com/my/collections/user-lists/blocked" &&
                tabs.length >= TAB_COUNT
              ) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: checkAndCloseTab,
                  args: [tab.id],
                });
              } else if (
                tab.url.startsWith("https://onlyfans.com") &&
                tab.url !== "https://onlyfans.com/posts/create" &&
                tab.url !== "https://onlyfans.com/my/collections/user-lists/blocked" &&
                tabs.length >= 5
              ) {
                closedTabIds.add(tab.id);
                chrome.tabs.remove(tab.id);
              }
            }

            chrome.tabs.query({ url: "https://onlyfans.com/*" }, (tbs) => {
              persistTabCount(Array.isArray(tbs) ? tbs.length : onlyFansTabsCount);
            });
          }
        );
      }
    );
  }
}

async function sendReadyRequest(browserNumber, tabCount) {
  try {
    const response = await fetch('http://localhost:8765/ready-browser-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        browser_number: browserNumber,
        tab_count: tabCount
      })
    });

    if (!response.ok) {
      console.error('Failed to send ready request');
    }
  } catch (error) {
    console.error('Error sending ready request:', error);
  }
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const browserKeyChanged = Object.keys(changes).some(
      key => key.startsWith('browser') && key.endsWith('Checked')
    );
    if (browserKeyChanged) {
      getMyBrowserNumber().then(num => {
        currentBrowserNumber = num;
        console.log(`Browser number updated: ${currentBrowserNumber}`);
      });
    }
  }
  if (namespace === 'local' && changes.timerVisibility) {
    if (typeof changes.timerVisibility.newValue === 'boolean') {
      timerVisibility = changes.timerVisibility.newValue;
      try { updateTabCounterOnActiveTab(false); } catch (_) { }
    }
  }
});

function openNewTab() {
  chrome.runtime.sendMessage({ action: "openNewTab" });
}

async function toggleColors(noDelay = false) {
  function waitForElement(selector, callback) {
    if (noDelay) {
      const element = document.querySelector(selector);
      if (element) {
        callback(element);
      }
    } else {
      const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          callback(element);
          clearInterval(interval);
        }
      }, 500);
    }
  }

  waitForElement('button[at-attr="submit_post"]', (button) => {
    button.style.backgroundColor = "rgba(138,150,163,.75)";
    button.style.opacity = ".4";
  });

  waitForElement(".g-btn.m-flat.m-link.m-default-font-weight.m-no-uppercase.m-reset-width.b-dot-item", (element) => {
    element.style.opacity = ".4";
  });

  waitForElement(".g-btn.m-btn-icon.m-reset-width.m-flat.m-with-round-hover.m-size-sm-hover", (element) => {
    element.style.opacity = ".4";
  });

  const deleteButtonSelectors = [
    ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size",
    "#make_post_form > div.b-make-post.m-with-free-options > div > div.b-dropzone__previews.b-make-post__schedule-expire-wrapper.g-sides-gaps > div > button"
  ];

  function getDeleteButtons() {
    const set = new Set();
    deleteButtonSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => set.add(el));
    });
    return [...set];
  }

  function styleDeleteButtons(elements) {
    elements.forEach((element) => {
      element.style.opacity = ".4";
      element.style.background = "rgba(138, 150, 163, .75)";
    });
  }

  if (noDelay) {
    styleDeleteButtons(getDeleteButtons());
  } else {
    const checkDropzoneElements = setInterval(() => {
      const elements = getDeleteButtons();
      if (elements.length >= 2) {
        setTimeout(() => {
          styleDeleteButtons(getDeleteButtons());
          clearInterval(checkDropzoneElements);
        }, 1000);
      }
    }, 500);
  }
}

async function stopOn() {
  await chrome.storage.local.set({ syncStop: true });
}

async function stopOff() {
  await chrome.storage.local.set({ syncStop: false });
}

async function instantPostOn() {
  await chrome.storage.local.set({ postChecked: true });
  const button = document.getElementById("instantPost");
  if (button) button.style.background = "#2D9B37";
}

async function instantPostOff() {
  await chrome.storage.local.set({ postChecked: false });
  const button = document.getElementById("instantPost");
  if (button) button.style.background = "#DD6D55";
}

async function fakeColorsOn() {
  await chrome.storage.local.set({ fakeChecked: true });
  const button = document.getElementById("fakeButton");
  if (button) button.style.background = "#6E8C6E";
}

async function fakeColorsOff() {
  await chrome.storage.local.set({ fakeChecked: false });
  const button = document.getElementById("fakeButton");
  if (button) button.style.background = "#8C6E6E";
}


function updateMentionPosition(newX, newY) {
  try {
    const container = document.querySelector('.b-photo-editor__container');
    if (!container) return;
    const vue = container.__vue__;
    if (!vue || !vue.$parent || !vue.$parent.$parent) return;
    const canvas = vue.$parent.$parent.canvas;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (!objects || objects.length < 2) return;
    const target = objects[1];
    if (!target) return;

    target.set({ left: newX, top: newY });
    if (canvas.renderAll) canvas.renderAll();

    var canvasRect = canvas.lowerCanvasEl.getBoundingClientRect();
    var joyX = (newX / canvasRect.width) * 100 - 5;
    var joyY = (newY / canvasRect.height) * 100 - 5;
    var joyHandle = document.querySelector('#joy div');
    if (joyHandle) {
      joyHandle.style.left = joyX + 'px';
      joyHandle.style.top = joyY + 'px';
    }
  } catch (_) { }
}

let __textScaleOriginal = null;
function updateTextScale(scalePercent) {
  try {
    const container = document.querySelector('.b-photo-editor__container');
    if (!container) return;
    const vue = container.__vue__;
    if (!vue || !vue.$parent || !vue.$parent.$parent) return;
    const canvas = vue.$parent.$parent.canvas;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (!objects || objects.length < 2) return;
    const targetObject = objects[1];
    if (!targetObject || typeof targetObject.scaleX !== 'number') return;
    if (__textScaleOriginal == null) {
      __textScaleOriginal = targetObject.scaleX || 1;
    }
    const percent = Number(scalePercent);
    if (!isFinite(percent) || percent <= 0) return;
    const scale = (percent / 100) * (__textScaleOriginal || 1);
    targetObject.set({ scaleX: scale, scaleY: scale });
    canvas.renderAll();
  } catch (_) { }
}

function updateTextRotation(angleDeg) {
  try {
    const container = document.querySelector('.b-photo-editor__container');
    if (!container) return;
    const vue = container.__vue__;
    if (!vue || !vue.$parent || !vue.$parent.$parent) return;
    const canvas = vue.$parent.$parent.canvas;
    if (!canvas) return;
    const objects = canvas.getObjects();
    if (!objects || objects.length < 2) return;
    const target = objects[1];
    if (!target) return;
    target.set({ angle: Number(angleDeg) - 90 });
    canvas.renderAll();
  } catch (_) { }
}

async function processImageAndUpload(imageTag, storyColor, blacklistContent, savedSettings = null, photoHash = null) {
  function createJoystick() {
    const containerSize = 100;
    const handleSize = 10;
    const joystickContainer = document.createElement("div");
    joystickContainer.id = "joy";
    Object.assign(joystickContainer.style, {
      position: "fixed",
      top: "45px",
      left: "10px",
      width: containerSize + "px",
      height: containerSize + "px",
      border: "2px solid #000",
      boxSizing: "border-box",
      zIndex: "10000",
      background: "rgba(28, 28, 28, 0.92)",
      borderRadius: "10px",
      color: "#fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      fontFamily: "'Josefin Sans', sans-serif",
      transition: "opacity 0.3s ease"
    });

    const joystickHandle = document.createElement("div");
    const initialX = (savedSettings && savedSettings.joyX !== undefined) ? savedSettings.joyX : (containerSize - handleSize) / 2;
    const initialY = (savedSettings && savedSettings.joyY !== undefined) ? savedSettings.joyY : (containerSize - handleSize) / 2;

    Object.assign(joystickHandle.style, {
      width: handleSize + "px",
      height: handleSize + "px",
      borderRadius: "50%",
      background: "#fff",
      position: "absolute",
      left: initialX + "px",
      top: initialY + "px",
      zIndex: "10000",
      cursor: "pointer"
    });

    joystickContainer.appendChild(joystickHandle);
    document.body.appendChild(joystickContainer);

    let offsetX = 0;
    let offsetY = 0;
    let currentX = initialX;
    let currentY = initialY;
    let dragging = false;
    let containerRect = null;
    let animationFrameId = null;

    function sendJoystickData(newTagX, newTagY) {
      fetch("http://localhost:3000/joystick-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: newTagX, y: newTagY })
      }).catch(console.error);
    }

    joystickHandle.addEventListener("pointerdown", function (e) {
      dragging = true;
      containerRect = joystickContainer.getBoundingClientRect();
      const handleRect = joystickHandle.getBoundingClientRect();
      offsetX = e.clientX - handleRect.left;
      offsetY = e.clientY - handleRect.top;
      joystickHandle.setPointerCapture(e.pointerId);
    });

    document.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      if (animationFrameId) return;

      animationFrameId = requestAnimationFrame(() => {
        if (!dragging || !containerRect) return;

        let newLeft = e.clientX - containerRect.left - offsetX;
        let newTop = e.clientY - containerRect.top - offsetY;

        newLeft = Math.max(0, Math.min(newLeft, containerSize - handleSize));
        newTop = Math.max(0, Math.min(newTop, containerSize - handleSize));

        currentX = newLeft;
        currentY = newTop;

        joystickHandle.style.left = currentX + "px";
        joystickHandle.style.top = currentY + "px";

        animationFrameId = null;
      });
    });

    document.addEventListener("pointerup", function (e) {
      if (!dragging) return;
      dragging = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      const canvas = document.querySelector(".upper-canvas");
      if (canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        const whiteCenterX = currentX + handleSize / 2;
        const whiteCenterY = currentY + handleSize / 2;
        const percentX = whiteCenterX / containerSize;
        const percentY = whiteCenterY / containerSize;
        const newTagX = percentX * canvasRect.width;
        const newTagY = percentY * canvasRect.height;
        sendJoystickData(newTagX, newTagY);

        fetch('http://localhost:3000/tag-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: settingsTagKey, settings: { joyX: currentX, joyY: currentY, canvasX: newTagX, canvasY: newTagY } })
        }).catch(() => { });
      }
    });
  }



  const waitForElement = (selector, maxAttempts = 30, interval = 500) => new Promise((resolve, reject) => {
    let attempts = 0;
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) { resolve(element); return; }
      attempts++;
      if (attempts >= maxAttempts) { reject(new Error(`Element not found: ${selector}`)); return; }
      setTimeout(checkElement, interval);
    };
    checkElement();
  });

  const waitForAnyElement = (selectors, maxAttempts = 30, interval = 500) => new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      for (const selector of selectors) {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector();
        if (el) return resolve(el);
      }
      attempts++;
      if (attempts >= maxAttempts) return reject(new Error('Elements not found'));
      setTimeout(check, interval);
    };
    check();
  });

  const waitForElementWithText = (selector, text, maxAttempts = 30, interval = 500) => new Promise((resolve, reject) => {
    let attempts = 0;
    const checkElements = () => {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const textElement = element.querySelector(".b-stickers__text");
        if (textElement && textElement.textContent.trim() === text) { resolve(element); return; }
      }
      attempts++;
      if (attempts >= maxAttempts) { reject(new Error(`Element with text "${text}" not found`)); return; }
      setTimeout(checkElements, interval);
    };
    checkElements();
  });

  const waitForButtonWithText = (selector, text, maxAttempts = 30, interval = 500) => new Promise((resolve, reject) => {
    let attempts = 0;
    const checkButtons = () => {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        if (button.textContent.trim() === text) { resolve(button); return; }
      }
      attempts++;
      if (attempts >= maxAttempts) { reject(new Error(`Button "${text}" not found`)); return; }
      setTimeout(checkButtons, interval);
    };
    checkButtons();
  });

  const cleanTag = imageTag.trim();
  const settingsTagKey = photoHash ? cleanTag.replace(/^@/, '') + '_' + photoHash : cleanTag.replace(/^@/, '');

  let currentUsername = "";
  try {
    const userUsernameElement = await waitForElement(".g-user-username");
    if (userUsernameElement) {
      currentUsername = userUsernameElement.textContent.trim().replace(/^@/, '');
    }
  } catch (e) {
    console.log("Could not find username, continuing...");
  }

  if (currentUsername && currentUsername === cleanTag.replace(/^@/, '')) {
    return Promise.resolve('skipped');
  }

  if (blacklistContent && currentUsername) {
    const lines = blacklistContent.split(/\r?\n/);
    const targetTagLower = cleanTag.toLowerCase().replace(/^@/, '');
    const currentModelLower = currentUsername.toLowerCase();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (trimmedLine.includes('-')) {
        const parts = trimmedLine.split('-');
        if (parts.length >= 2) {
          const blacklistedTag = parts[0].trim().toLowerCase().replace(/^@/, '');
          if (blacklistedTag === targetTagLower) {
            const modelsPart = parts[1];
            const bannedModels = modelsPart.split(',').map(m => m.trim().toLowerCase().replace(/^@/, ''));
            if (bannedModels.includes(currentModelLower)) {
              console.log(`[STORY SKIP] Tag @${blacklistedTag} blacklisted for @${currentUsername}`);
              return Promise.resolve('skipped');
            }
          }
        }
      } else {
        const globalBanTag = trimmedLine.toLowerCase().replace(/^@/, '');
        if (globalBanTag === targetTagLower) {
          console.log(`[STORY SKIP] Tag @${globalBanTag} is globally blacklisted`);
          return Promise.resolve('skipped');
        }
      }
    }
  }

  const fileSearchTag = cleanTag.replace(/\./g, "-");

  const findAndLoadImage = async (tag) => {
    const extensions = [".png", ".jpg", ".jpeg", ".heic"];
    for (const ext of extensions) {
      try {
        const imageUrl = chrome.runtime.getURL(`server/crop/images/${tag}${ext}`);
        const response = await fetch(imageUrl);
        if (response.ok) {
          const blob = await response.blob();
          return { blob: blob, filename: `${tag}${ext}`, extension: ext.substring(1) };
        }
      } catch (error) { }
    }
    try {
      const imageUrl = chrome.runtime.getURL(`server/crop/images/${tag}`);
      const response = await fetch(imageUrl);
      if (response.ok) {
        const blob = await response.blob();
        const mimeType = blob.type;
        let extension = "png";
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
        else if (mimeType.includes("heic")) extension = "heic";
        return { blob: blob, filename: `${tag}.${extension}`, extension: extension };
      }
    } catch (error) { }
    return null;
  };

  return (async () => {
    try {
      const button = await waitForElement("#add-story-btn");
      const imageData = await findAndLoadImage(fileSearchTag);
      if (!imageData) throw new Error(`Image not found: ${fileSearchTag}`);

      let mimeType = "image/png";
      if (imageData.extension === "jpg" || imageData.extension === "jpeg") mimeType = "image/jpeg";
      else if (imageData.extension === "heic") mimeType = "image/heic";

      const file = new File([imageData.blob], imageData.filename, { type: mimeType });
      button.click();

      const fileInput = await waitForElement('input[type="file"]');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));

      let mentionButton = await waitForAnyElement([
        ".g-btn.m-with-round-hover.m-light.m-icon.m-icon-only.m-white.m-sm-size.has-tooltip",
        () => {
          const btns = document.querySelectorAll(".g-btn.m-with-round-hover.m-light.m-icon.m-icon-only.m-white.m-sm-size");
          return btns.length > 3 ? btns[3] : null;
        }
      ], 60, 500);

      await new Promise(resolve => setTimeout(resolve, 2000));
      mentionButton.click();

      const mentionLink = await waitForElementWithText(".b-stickers__link.d-flex.align-items-center.w-100.m-bg-light", "Mention");
      mentionLink.click();

      const textarea = await waitForElement('textarea[placeholder="Mention"]');
      textarea.value = cleanTag;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        if (storyColor && typeof storyColor === 'string') {
          const toRGB = (str) => {
            try {
              if (!str) return null;
              const s = String(str).replace(/\s+/g, '');
              const m = s.match(/rgba?\((\d+),(\d+),(\d+)/i);
              if (!m) return null;
              return `${parseInt(m[1], 10)},${parseInt(m[2], 10)},${parseInt(m[3], 10)}`;
            } catch (_) { return null; }
          };
          const targetRGB = toRGB(storyColor);

          const controls = await waitForElement('.b-photo-editor__controls-editor');
          const firstButton = controls.querySelector('button');
          if (firstButton) {
            firstButton.click();
            await new Promise(r => setTimeout(r, 300));
          }

          const maxAttempts = 5;
          let attempts = 0;
          let clicked = false;
          while (!clicked && attempts < maxAttempts) {
            const container = document.querySelector('.b-tabs__nav.m-colorpicker-tabs');
            const items = container ? container.querySelectorAll('.b-tabs__nav__item') : [];
            if (items && items.length) {
              for (const li of items) {
                const bg = (li.style && li.style.backgroundColor) || window.getComputedStyle(li).backgroundColor;
                const liRGB = toRGB(bg);
                if (liRGB && targetRGB && liRGB === targetRGB) {
                  const btn = li.querySelector('button') || li;
                  try {
                    btn.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                  } catch (_) { }
                  btn.click();
                  let confirm = 0;
                  while (confirm < 5) {
                    const currentBtn = container.querySelector('button.m-current');
                    if (currentBtn === btn || (btn.classList && btn.classList.contains('m-current'))) {
                      clicked = true;
                      break;
                    }
                    await new Promise(r => setTimeout(r, 100));
                    confirm++;
                  }
                  if (clicked) break;
                }
              }
            }
            if (!clicked) await new Promise(r => setTimeout(r, 500)), attempts++;
          }
        }
      } catch (e) { console.warn('Color selection skipped:', e); }

      const doneButton = await waitForButtonWithText(".g-btn.m-rounded.m-reset-width", "Done");
      doneButton.click();

      createJoystick();

      try {
        const joy = document.getElementById('joy');
        const joyRect = joy ? joy.getBoundingClientRect() : null;
        const sliderContainer = document.createElement('div');
        sliderContainer.id = 'text-size-slider';
        Object.assign(sliderContainer.style, {
          position: 'fixed',
          zIndex: '10001',
          background: 'rgba(28, 28, 28, 0.92)',
          border: '2px solid #000',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px',
          pointerEvents: 'auto',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          fontFamily: "'Josefin Sans', sans-serif",
          transition: 'opacity 0.3s ease',
          top: (joyRect ? joyRect.top : 45) + 'px',
          left: (joyRect ? (joyRect.right + 10) : 120) + 'px',
          height: (joyRect ? joyRect.height : 100) + 'px',
          width: '44px'
        });

        const input = document.createElement('input');
        input.type = 'range';
        input.min = '50';
        input.max = '500';
        input.step = '10';
        input.value = (savedSettings && savedSettings.scale !== undefined) ? String(savedSettings.scale) : '100';
        input.id = 'size-slider';
        Object.assign(input.style, {
          writingMode: 'vertical-lr',
          direction: 'rtl',
          appearance: 'none',
          width: '20px',
          height: Math.max(20, (joyRect ? joyRect.height : 100) - 12) + 'px',
          padding: '0',
          margin: '0',
          pointerEvents: 'auto'
        });

        sliderContainer.appendChild(input);
        document.body.appendChild(sliderContainer);

        if (!document.getElementById('text-size-slider-style')) {
          const style = document.createElement('style');
          style.id = 'text-size-slider-style';
          style.textContent = `
                #size-slider::-webkit-slider-runnable-track { background: #cfd6dd; border-radius: 6px; width: 6px; }
                #size-slider::-webkit-slider-thumb { appearance: none; background: #ffffff; border-radius: 50%; width: 10px; height: 10px; margin-left: -2px; }
            `;
          document.head.appendChild(style);
        }

        input.addEventListener('change', function () {
          const scale = Number(this.value);
          fetch('http://localhost:3000/text-scale', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scalePercent: scale })
          }).catch(() => { });

          fetch('http://localhost:3000/tag-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: settingsTagKey, settings: { scale: scale } })
          }).catch(() => { });
        });
      } catch (_) { }

      // Rotation dial
      try {
        const joyEl = document.getElementById('joy');
        const sliderEl = document.getElementById('text-size-slider');
        const joyRect = joyEl ? joyEl.getBoundingClientRect() : null;
        const sliderRect = sliderEl ? sliderEl.getBoundingClientRect() : null;
        const dialSize = joyRect ? joyRect.height : 100;
        const dialLeft = sliderRect ? (sliderRect.right + 10) : 174;
        const dialTop = joyRect ? joyRect.top : 45;

        const dial = document.createElement('div');
        dial.id = 'tag-rotation-dial';
        Object.assign(dial.style, {
          position: 'fixed',
          top: dialTop + 'px',
          left: dialLeft + 'px',
          width: dialSize + 'px',
          height: dialSize + 'px',
          background: 'rgba(28, 28, 28, 0.92)',
          border: '2px solid #000',
          borderRadius: '10px',
          zIndex: '10001',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
          cursor: 'pointer',
          color: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: '10px',
          transition: 'opacity 0.3s ease',
          gap: '2px'
        });

        // Clock SVG canvas
        const clockSize = Math.round(dialSize * 0.76);
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', clockSize);
        svg.setAttribute('height', clockSize);
        svg.setAttribute('viewBox', `0 0 ${clockSize} ${clockSize}`);
        const cx = clockSize / 2;
        const cy = clockSize / 2;
        const r = cx - 2;

        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('fill', 'rgba(255,255,255,0.08)');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '1.5');
        svg.appendChild(circle);

        // Tick marks
        for (let t = 0; t < 12; t++) {
          const angle = (t / 12) * Math.PI * 2 - Math.PI / 2;
          const inner = r - 4;
          const outer = r - 1;
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', cx + Math.cos(angle) * inner);
          line.setAttribute('y1', cy + Math.sin(angle) * inner);
          line.setAttribute('x2', cx + Math.cos(angle) * outer);
          line.setAttribute('y2', cy + Math.sin(angle) * outer);
          line.setAttribute('stroke', 'rgba(255,255,255,0.5)');
          line.setAttribute('stroke-width', '1');
          svg.appendChild(line);
        }

        const hand = document.createElementNS(svgNS, 'line');
        hand.setAttribute('x1', cx); hand.setAttribute('y1', cy);
        hand.setAttribute('x2', cx); hand.setAttribute('y2', cy - r + 6);
        hand.setAttribute('stroke', '#fbdf56');
        hand.setAttribute('stroke-width', '2');
        hand.setAttribute('stroke-linecap', 'round');
        svg.appendChild(hand);

        const centerDot = document.createElementNS(svgNS, 'circle');
        centerDot.setAttribute('cx', cx); centerDot.setAttribute('cy', cy);
        centerDot.setAttribute('r', '2.5');
        centerDot.setAttribute('fill', '#fbdf56');
        svg.appendChild(centerDot);

        const degLabel = document.createElement('div');
        degLabel.textContent = '90°';
        Object.assign(degLabel.style, { fontSize: '10px', color: '#fbdf56', lineHeight: '1', marginTop: '1px' });

        dial.appendChild(svg);
        dial.appendChild(degLabel);
        document.body.appendChild(dial);

        let isDragging = false;
        let currentAngle = (savedSettings && savedSettings.angle !== undefined) ? savedSettings.angle : 90;

        function updateHand(angleDeg) {
          const rad = (angleDeg - 90) * Math.PI / 180;
          hand.setAttribute('x2', cx + Math.cos(rad) * (r - 6));
          hand.setAttribute('y2', cy + Math.sin(rad) * (r - 6));
          degLabel.textContent = Math.round(angleDeg) + '°';
        }

        updateHand(currentAngle);

        function getAngleFromEvent(e) {
          const rect = dial.getBoundingClientRect();
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = e.clientY - (rect.top + rect.height / 2);
          let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
          if (angle < 0) angle += 360;
          return angle % 360;
        }

        dial.addEventListener('pointerdown', (e) => {
          isDragging = true;
          dial.setPointerCapture(e.pointerId);
          currentAngle = getAngleFromEvent(e);
          updateHand(currentAngle);
        });

        dial.addEventListener('pointermove', (e) => {
          if (!isDragging) return;
          currentAngle = getAngleFromEvent(e);
          updateHand(currentAngle);
        });

        dial.addEventListener('pointerup', (e) => {
          if (!isDragging) return;
          isDragging = false;
          currentAngle = getAngleFromEvent(e);
          updateHand(currentAngle);
          const angle = Math.round(currentAngle);
          fetch('http://localhost:3000/text-rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ angleDeg: angle })
          }).catch(() => { });

          fetch('http://localhost:3000/tag-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: settingsTagKey, settings: { angle: angle } })
          }).catch(() => { });
        });
      } catch (_) { }

      try {
        const dialEl = document.getElementById('tag-rotation-dial');
        const dialRect = dialEl ? dialEl.getBoundingClientRect() : null;
        const btnLeft = dialRect ? (dialRect.right + 10) : 284;
        const btnTop = dialRect ? dialRect.top : 45;

        const resetBtn = document.createElement('button');
        resetBtn.id = 'tag-reset-button';
        resetBtn.textContent = 'Reset';
        Object.assign(resetBtn.style, {
          position: 'fixed',
          top: btnTop + 'px',
          left: btnLeft + 'px',
          height: (dialRect ? dialRect.height : 100) + 'px',
          background: 'rgba(221, 109, 85, 0.92)',
          border: '2px solid #000',
          borderRadius: '10px',
          zIndex: '10001',
          color: '#fff',
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: '14px',
          cursor: 'pointer',
          padding: '0 15px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          transition: 'background 0.3s ease'
        });

        resetBtn.onmouseover = () => resetBtn.style.background = 'rgba(227, 133, 113, 0.95)';
        resetBtn.onmouseout = () => resetBtn.style.background = 'rgba(221, 109, 85, 0.92)';

        resetBtn.addEventListener('click', () => {
          fetch('http://localhost:3000/tag-settings-reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: settingsTagKey })
          }).catch(() => { });
        });

        document.body.appendChild(resetBtn);
      } catch (_) { }

      return;
    } catch (error) {
      console.error(error);
      return 'skipped';
    }
  })();
}

function postStories() {
  function checkButtonExists() {
    const button = document.querySelector('.g-btn.m-btn-editor-style.m-rounded.m-reset-width.d-inline-flex');
    return button !== null;
  }

  function clickButton() {
    const button = document.querySelector('.g-btn.m-btn-editor-style.m-rounded.m-reset-width.d-inline-flex');
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  if (checkButtonExists()) {
    clickButton();

    const idsToHide = [
      "tabCounter", "cont1", "cont2", "cont3",
      "switch-button", "fakeMakeButton", "version", "clear-button",
      "reload-button", "stories-container", "bottom-overlay",
      "joy", "text-size-slider", "tag-rotation-dial", "tag-reset-button"
    ];

    idsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
      }
    });
  }
  return true;
}

async function reloadPage() {
  window.location.reload();
}

async function clearPosts() {

  window.history.pushState(null, "", "https://onlyfans.com/posts/queue");
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

  await new Promise(resolve => setTimeout(resolve, 200));

  window.history.pushState(null, "", "https://onlyfans.com/posts/create");
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

  return new Promise((resolve, reject) => {
    const clearButton = document.querySelector(
      "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button.m-btn-clear-draft.g-btn.m-border.m-rounded.m-sm-width.m-reset-width"
    );

    if (clearButton) {
      clearButton.click();
      setTimeout(() => {
        location.reload();
        resolve();
      }, 1000);
      return;
    }

    const observer = new MutationObserver((mutationsList, observer) => {
      for (let mutation of mutationsList) {
        if (mutation.type === "childList") {
          const clearButton = document.querySelector(
            "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button.m-btn-clear-draft.g-btn.m-border.m-rounded.m-sm-width.m-reset-width"
          );
          if (clearButton) {
            clearButton.click();
            observer.disconnect();
            setTimeout(() => {
              location.reload();
              resolve();
            }, 1000);
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject();
    }, 5000);
  });
}

function clickOnNewPost() {
  const anchorElement = document.querySelector(
    'a[data-name="PostsCreate"][href="/posts/create"]',
  );
  if (anchorElement) {
    anchorElement.click();
  }
}

function clearPhotoBindAll() {
  let elements = document.querySelectorAll(
    ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size.has-tooltip",
  );
  let divs = document.querySelectorAll(
    "#make_post_form > div.b-make-post.m-with-free-options > div > div.b-make-post__main-wrapper > div.b-make-post__media-wrapper > div > div > div > div > div > div",
  );
  divs.forEach(function (div) {
    elements.forEach(function (element) {
      if (div.contains(element)) {
        element.click();
      }
    });
  });
}

async function fetchAndPasteBind() {
  const extractTagLocally = () => {
    try {
      const editor = document.querySelector(".tiptap.ProseMirror");
      if (!editor) return null;
      let text = "";
      editor.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) text += node.textContent + " ";
        else text += node.innerText + " ";
      });
      const match = text.match(/@[a-zA-Z0-9._-]+/);
      if (match) return match[0].replace(/[.,!?]$/, "");
    } catch (e) { }
    return null;
  };

  const tag = extractTagLocally();
  if (!tag) return;

  try {
    const response = await fetch(`http://localhost:8444/get-image-by-tag?tag=${encodeURIComponent(tag)}`);
    if (!response.ok) return;

    const blob = await response.blob();
    const contentType = response.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/');

    let fileExtension = 'png';
    let mimeType = 'image/png';
    if (!isImage) {
      fileExtension = 'mp4';
      mimeType = 'video/mp4';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      fileExtension = 'jpg';
      mimeType = 'image/jpeg';
    } else if (contentType.includes('gif')) {
      fileExtension = 'gif';
      mimeType = 'image/gif';
    } else if (contentType.includes('webp')) {
      fileExtension = 'webp';
      mimeType = 'image/webp';
    }

    const file = new File([blob], `media.${fileExtension}`, { type: mimeType });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const targetElement = document.querySelector(
      ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto"
    ) || document.querySelector(".tiptap.ProseMirror");

    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const evtInit = { bubbles: true, cancelable: true, dataTransfer, clientX: cx, clientY: cy };

      targetElement.dispatchEvent(new DragEvent("dragstart", evtInit));
      setTimeout(() => {
        targetElement.dispatchEvent(new DragEvent("dragenter", evtInit));
        targetElement.dispatchEvent(new DragEvent("dragover", evtInit));
        setTimeout(() => {
          targetElement.dispatchEvent(new DragEvent("drop", evtInit));
          targetElement.dispatchEvent(new DragEvent("dragend", evtInit));
        }, 100);
      }, 100);
    }
  } catch (e) {
    console.error("fetchAndPasteBind error:", e);
  }
}

async function pasteBind() {
  const tempContainer = document.createElement("div");
  tempContainer.style.position = "absolute";
  tempContainer.style.left = "-9999px";
  document.body.appendChild(tempContainer);

  const pasteToTempContainer = async () => {
    return new Promise((resolve) => {
      const tempElement = document.createElement("div");
      tempElement.contentEditable = true;
      tempContainer.appendChild(tempElement);
      tempElement.focus();

      const pasteHandler = async (e) => {
        e.preventDefault();
        const items = e.clipboardData?.items || e.originalEvent?.clipboardData?.items;

        for (let item of items) {
          if (
            item.type.indexOf("image/") === 0 ||
            item.type.indexOf("video/") === 0 ||
            item.type === "image/gif"
          ) {
            const blob = item.getAsFile();
            const media =
              item.type.indexOf("image/") === 0
                ? document.createElement("img")
                : document.createElement("video");

            if (media instanceof HTMLVideoElement) {
              media.controls = true;
              media.autoplay = false;
            }

            const blobUrl = URL.createObjectURL(blob);
            media.src = blobUrl;
            media.onload = media.onloadedmetadata = () => URL.revokeObjectURL(blobUrl);
            tempElement.appendChild(media);
          }
        }

        setTimeout(() => {
          resolve();
        }, 500);
      };

      tempElement.addEventListener("paste", pasteHandler);
      document.execCommand("paste");
    });
  };

  const simulateDragAndDrop = (sourceElement, targetElement) => {
    const dataTransfer = new DataTransfer();

    const mediaElement = sourceElement.querySelector("img, video");

    if (mediaElement) {
      const convertMediaToBlob = async (element) => {
        if (element instanceof HTMLImageElement) {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const w = element.naturalWidth;
          const h = element.naturalHeight;
          if (!w || !h) return null;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(element, 0, 0);
          return new Promise((resolve) => canvas.toBlob(blob => resolve(blob)));
        } else if (element instanceof HTMLVideoElement) {
          const response = await fetch(element.src);
          return response.blob();
        }
      };

      convertMediaToBlob(mediaElement).then((blob) => {
        if (!blob) return;
        const fileExtension =
          mediaElement instanceof HTMLImageElement ? "png" : "mp4";
        const mimeType =
          mediaElement instanceof HTMLImageElement ? "image/png" : "video/mp4";
        const file = new File([blob], `media.${fileExtension}`, {
          type: mimeType,
        });

        dataTransfer.items.add(file);

        const rect = targetElement.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const evtInit = { bubbles: true, cancelable: true, dataTransfer, clientX: cx, clientY: cy };

        sourceElement.dispatchEvent(new DragEvent("dragstart", evtInit));
        setTimeout(() => {
          targetElement.dispatchEvent(new DragEvent("dragenter", evtInit));
          targetElement.dispatchEvent(new DragEvent("dragover", evtInit));
          setTimeout(() => {
            targetElement.dispatchEvent(new DragEvent("drop", evtInit));
            targetElement.dispatchEvent(new DragEvent("dragend", evtInit));
          }, 100);
        }, 100);
      });
    }
  };

  await pasteToTempContainer();

  const tempElement = tempContainer.querySelector(
    'div[contenteditable="true"]',
  );
  const targetElement = document.querySelector(
    ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto",
  );

  if (targetElement && tempElement) {
    simulateDragAndDrop(tempElement, targetElement);
  } else {
    console.error("Target element or temporary element not found");
  }

  setTimeout(() => {
    document.body.removeChild(tempContainer);
  }, 1000);
}

async function createBrowser(browserType, index, totalIndex, repeat) {
  async function fetchWithRetry(resource, options, timeout = 5000, retries = 3) {
    for (let i = 0; i < retries; i++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        if (e.name === "AbortError" && i < retries - 1) {
          continue;
        }
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw e;
      }
    }
  }

  const number = parseInt(browserType.replace(/\D/g, "")) || 0;

  if (index !== 0 && repeat !== true) {
    return;
  }

  const requestConfig = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      totalIndex,
      number,
      repeat,
    }),
  };

  try {
    await fetchWithRetry("http://localhost:3000/create-browser", requestConfig, 5000);
  } catch (error) {
    console.error("Failed to create browser:", error);
  }
}

async function addTextToPost(text, imageUrl, browserType, exp, txt, pht, blacklistTag, modelTags, timeTextInput, isApart, cmdId, browserNumber) {
  let isUploading = false;
  let imageInserted = false;
  let textInserted = false;
  let isProcessing = false;

  const waitForPageStability = () => {
    return new Promise((resolve) => {
      const checkStability = () => {
        const editor = document.querySelector(".tiptap.ProseMirror");
        const isStable = editor && editor.offsetHeight > 0 && document.readyState === 'complete';

        if (isStable) {
          resolve();
        } else {
          setTimeout(checkStability, 100);
        }
      };
      checkStability();
    });
  };

  await waitForPageStability();

  async function handleTimeInsertion(textInput, isApart, browserType) {
    try {
      const clickEvent = new Event("click", {
        bubbles: true,
        cancelable: true,
      });

      function checkButtonsAndContinue() {
        const button1 = document.querySelector(
          ".g-btn.m-with-round-hover.m-icon.m-icon-only.m-gray.m-sm-size.b-make-post__datepicker-btn",
        );
        const button2 = document.querySelector(
          ".g-btn.m-with-round-hover.m-icon.m-icon-only.m-gray.m-sm-size.b-make-post__datepicker-btn.has-tooltip",
        );

        if (button1 || button2) {
          continueExecution(textInput);
        }
      }

      function loadScript(src) {
        return new Promise((resolve, reject) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
          }

          const script = document.createElement('script');
          script.src = src;
          script.onload = () => resolve();
          script.onerror = (e) => reject(e);
          document.head.appendChild(script);
        });
      }

      function checkIfQTimeInPastOrPresent(textInput) {
        if (!textInput.startsWith('q')) {
          return false;
        }

        const currentDate = new Date();
        const currentHours = currentDate.getHours();
        const currentMinutes = currentDate.getMinutes();

        let hours, minutes, period;
        const timeString = textInput.substring(1);

        period = timeString.charAt(timeString.length - 1);

        if (timeString.length === 4) {
          hours = parseInt(timeString.substring(0, 1));
          minutes = parseInt(timeString.substring(1, 3));
        } else if (timeString.length === 5) {
          hours = parseInt(timeString.substring(0, 2));
          minutes = parseInt(timeString.substring(2, 4));
        } else {
          return false;
        }

        let hours24Format = hours;
        if (period === 'a' && hours === 12) {
          hours24Format = 0;
        } else if (period === 's' && hours !== 12) {
          hours24Format += 12;
        }

        const currentTotalMinutes = currentHours * 60 + currentMinutes;
        const inputTotalMinutes = hours24Format * 60 + minutes;

        return inputTotalMinutes <= currentTotalMinutes;
      }

      async function continueExecution(textInput) {
        let closeButton = document.querySelector(
          "#make_post_form > div.b-make-post > div > div.b-dropzone__previews.b-make-post__schedule-expire-wrapper.g-sides-gaps > div.b-post-piece.b-dropzone__preview.m-schedule.m-loaded.g-pointer-cursor.m-row > button",
        );
        if (closeButton) {
          closeButton.dispatchEvent(clickEvent);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (textInput === "0" && (!isApart || browserType === "browser1")) {
          return;
        }

        if (textInput === "n") {
          textInput = "0";
        }

        if (checkIfQTimeInPastOrPresent(textInput)) {
          return;
        }

        if (textInput.length === 1 || textInput.length === 2 || textInput.length === 3) {
          await loadScript(chrome.runtime.getURL('inject.js'));
        }

        const button1 = document.querySelector(
          ".g-btn.m-with-round-hover.m-icon.m-icon-only.m-gray.m-sm-size.b-make-post__datepicker-btn",
        );
        button1.dispatchEvent(clickEvent);

        let currentDate = new Date();

        currentDate.setMinutes(currentDate.getMinutes());

        let monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];

        let currentMonthIndex = currentDate.getMonth();

        let nextMonthIndex = (currentMonthIndex + 1) % 12;
        var nextMonthName = monthNames[nextMonthIndex];

        let currentDayOfMonth = currentDate.getDate();
        let currentTimeInHours = currentDate.getHours();
        let currentTimeInMinutes = currentDate.getMinutes();

        let period = "";
        let hours = 0;
        let newHours = 0;
        let newMinutes = "";

        let nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);

        let nextDayOfMonth = nextDate.getDate();

        let dayAfterTomorrow = new Date(currentDate);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

        let dayAfterTomorrowDayOfMonth = dayAfterTomorrow.getDate();

        if (textInput.includes("-")) {
          var parts = textInput.split("-");
          var textInputNum = parseInt(parts[0], 10);
          newMinutes = parseInt(parts[1], 10);
          newMinutes = currentTimeInMinutes + newMinutes

          if (currentTimeInMinutes >= 50) {
            newHours = newHours + 1
          }

          if (newMinutes >= 60) {
            newMinutes -= 60;
            newHours = newHours + 1
          }
          if (newMinutes < 10) {
            newMinutes = "0" + newMinutes;
          }

          textInput = textInputNum.toString();
          newMinutes = newMinutes.toString();
        }

        if (
          textInput.length === 1 ||
          textInput.length === 2 ||
          textInput.length === 3
        ) {

          hours = currentTimeInHours + parseInt(textInput, 10);
          if (isApart) {
            let number = parseInt(browserType.replace(/\D/g, ""), 10);
            hours = hours + number - 1;
          }

          if (hours > 24) {
            const additionalDays = Math.floor(hours / 24);
            let futureDate = new Date(currentDate);
            let currentMonth = currentDate.getMonth();

            futureDate.setDate(futureDate.getDate() + additionalDays);
            currentDayOfMonth = futureDate.getDate();
            newHours = hours % 24;

            if (newHours === 0) {
              newHours = 12;
              period = "a";
            } else if (newHours === 12) {
              period = "s";
            } else if (newHours < 12) {
              period = "a";
            } else {
              newHours = newHours - 12;
              period = "s";
            }

            setTimeout(() => {
              const next = document.querySelector(
                "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__navigation--next",
              );

              const currentMonthElement = document.querySelector(
                "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__current--month",
              );

              if (next && currentMonthElement) {
                if (futureDate.getMonth() !== currentMonth) {
                  next.dispatchEvent(clickEvent);
                }
              }
            }, 1000);
          }

          else if (hours === 24) {
            currentDayOfMonth = currentDayOfMonth + 1
            if (currentDayOfMonth !== nextDayOfMonth) {
              currentDayOfMonth = nextDayOfMonth;
              setTimeout(() => {
                const next = document.querySelector(
                  "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__navigation--next",
                );
                let currentMonthElement = document.querySelector(
                  "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__current--month",
                );
                let currentMonthName =
                  currentMonthElement.innerText.split(" ")[0];
                if (nextMonthName !== currentMonthName) {
                  next.dispatchEvent(clickEvent);
                }
              }, 1000);
            }

            newHours = 12;

            period = "a";
          } else if (hours < 24) {
            newHours = hours;

            if (newHours < 12) {
              period = "a";
            }

            if (newHours == 12) {
              period = "s";
            }

            if (newHours == 0) {
              newHours = 12;
            }

            if (newHours > 12) {
              newHours = newHours - 12;
              period = "s";
            }
          }
        } else if (textInput.length > 6) {
          let parts = textInput.split("_");
          if (parts.length === 3) {
            let getMonth = parseInt(parts[0], 10);
            currentDayOfMonth = parseInt(parts[1], 10);
            newHours = parseInt(parts[2].slice(0, -3), 10);
            newMinutes = parts[2].slice(-3, -1);
            period = textInput[textInput.length - 1];
            let currentMonth = currentDate.getMonth() + 1;
            let monthDifference = 0;
            if (getMonth < currentMonth) {
              monthDifference = 12 - currentMonth + getMonth;
            } else {
              monthDifference = getMonth - currentMonth;
            }
            setTimeout(function () {
              const next3 = document.querySelector(
                "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__navigation--next",
              );
              if (!next3) return;
              let i = 0;
              function clickNext() {
                if (i < monthDifference) {
                  next3.dispatchEvent(clickEvent);
                  i++;
                  setTimeout(clickNext, 40);
                }
              }
              clickNext();
            }, 500);
          }
        } else if (textInput.length === 5 || textInput.length === 6) {
          period = textInput[textInput.length - 1];
          let increment = textInput[0] === "w" ? 1 : textInput[0] === "e" ? 2 : 0;
          currentDayOfMonth += increment;

          let targetDayOfMonth =
            increment === 1
              ? nextDayOfMonth
              : increment === 2
                ? dayAfterTomorrowDayOfMonth
                : currentDayOfMonth;

          if (currentDayOfMonth !== targetDayOfMonth) {
            currentDayOfMonth = targetDayOfMonth;
            setTimeout(() => {
              const next = document.querySelector(
                "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__navigation--next",
              );
              const currentMonthElement = document.querySelector(
                "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__current--month",
              );
              if (!currentMonthElement || !next) return;
              const currentMonthName = currentMonthElement.innerText.split(" ")[0];
              if (nextMonthName !== currentMonthName) {
                next.dispatchEvent(clickEvent);
              }
            }, 1000);
          }
        }

        if (textInput.length === 5) {
          newHours = parseInt(textInput.substring(1, 2), 10);
          newMinutes = textInput.substring(2, 4);
        } else if (textInput.length === 6) {
          newHours = parseInt(textInput.substring(1, 3), 10);
          newMinutes = textInput.substring(3, 5);
        }

        if (isApart && textInput.length !== 1 && textInput.length !== 2) {
          let number = parseInt(browserType.replace(/\D/g, ""), 10);
          newHours = newHours + number - 1;

          if (textInput[0] === "q" && newHours >= 12 && period === "s") {
            currentDayOfMonth = currentDayOfMonth + 1;
            if (currentDayOfMonth !== nextDayOfMonth) {
              currentDayOfMonth = nextDayOfMonth;
            }

            if (newHours != 12) {
              newHours = newHours - 12;
            }
            period = "a";
          }

          else if (textInput[0] === "w" && newHours >= 12 && period === "s") {
            currentDayOfMonth = currentDayOfMonth + 2;
            if (currentDayOfMonth !== dayAfterTomorrowDayOfMonth) {
              currentDayOfMonth = dayAfterTomorrowDayOfMonth;
            }

            if (newHours != 12) {
              newHours = newHours - 12;
            }
            period = "a";
          }
          else if (newHours > 12) {
            newHours = newHours - 12;
            if (period === "a") {
              period = "s";
            }
          }
        }

        setTimeout(() => {
          const divs = document.querySelectorAll(
            ".vdatetime-calendar__month__day",
          );
          for (const div of divs) {
            const span = div.querySelector("span span");
            if (span && parseInt(span.innerText, 10) === currentDayOfMonth) {
              div.dispatchEvent(clickEvent);
            }
          }
        }, 1000);

        setTimeout(() => {
          const button4 = document.querySelector(
            "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__tabs > div.vdatetime-popup__tab.time",
          );
          if (button4) {
            button4.dispatchEvent(clickEvent);
          }
        }, 1000);

        setTimeout(() => {
          const container = document.querySelector(
            "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-time-picker__list.vdatetime-time-picker__list--suffix",
          );
          if (container) {
            const divs = container.querySelectorAll(
              ".vdatetime-time-picker__item",
            );

            for (const div of divs) {
              const text = div.innerText;
              if (text === "AM" && period === "a") {
                div.dispatchEvent(clickEvent);
              }
              if (text === "PM" && period === "s") {
                div.dispatchEvent(clickEvent);
              }
            }
          }
        }, 1000);

        setTimeout(() => {
          const container = document.querySelector(
            "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-time-picker__list.vdatetime-time-picker__list--hours",
          );

          if (container) {
            const divs = container.querySelectorAll(
              ".vdatetime-time-picker__item",
            );

            for (const div of divs) {
              const number = parseInt(div.innerText, 10);

              if (!isNaN(number) && number === newHours) {
                div.dispatchEvent(clickEvent);

                if (newMinutes !== "") {
                  setTimeout(() => {
                    const container2 = document.querySelector(
                      "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-time-picker__list.vdatetime-time-picker__list--minutes",
                    );
                    if (container2) {
                      const divs = container2.querySelectorAll(
                        ".vdatetime-time-picker__item",
                      );

                      for (const div of divs) {
                        const text = div.innerText;
                        if (text === newMinutes) {
                          div.dispatchEvent(clickEvent);
                        }
                      }
                    }
                  }, 200);
                }

                setTimeout(() => {
                  const button5 = document.querySelector(
                    "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__actions > div.vdatetime-popup__actions__button.vdatetime-popup__actions__button--confirm > button",
                  );
                  if (button5) {
                    button5.click();
                  }
                }, 200);
                break;
              }
            }
          }
        }, 1000);
      }

      checkButtonsAndContinue();
    } catch (error) {
      console.log("Error: ", error);
    }
  }

  const getCurrentUsername = () => {
    const usernameElement = document.querySelector('.g-user-username');
    if (usernameElement) {
      const username = usernameElement.textContent.trim().replace(/^@/, '');
      return username;
    }
    return null;
  };

  if (blacklistTag) {
    if (modelTags.length === 0) {
      imageInserted = true;
      textInserted = true;
      await sendUpdateRequest();
      return;
    }

    const currentUsername = getCurrentUsername();
    if (currentUsername && modelTags.includes(currentUsername)) {
      imageInserted = true;
      textInserted = true;
      await sendUpdateRequest();
      return;
    }
  }

  await handleTimeInsertion(timeTextInput, isApart, browserType).catch(err => console.error("Time insertion error:", err))

  function simulateDragAndDrop(sourceElement, targetElement, file, onDropped) {
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const rect = targetElement.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const evtInit = { bubbles: true, cancelable: true, dataTransfer, clientX: cx, clientY: cy };

      sourceElement.dispatchEvent(new DragEvent("dragstart", evtInit));

      setTimeout(() => {
        targetElement.dispatchEvent(new DragEvent("dragenter", evtInit));
        targetElement.dispatchEvent(new DragEvent("dragover", evtInit));

        setTimeout(() => {
          targetElement.dispatchEvent(new DragEvent("drop", evtInit));
          sourceElement.dispatchEvent(new DragEvent("dragend", evtInit));
          if (typeof onDropped === 'function') onDropped();
        }, 100);
      }, 100);
    } catch (error) { }
  }

  async function sendUpdateRequest() {
    const shouldSendRequest = (imageInserted || !pht) && (textInserted || !txt);
    if (!shouldSendRequest) return;

    chrome.runtime.sendMessage({
      type: 'ws-confirm',
      cmdId: cmdId,
      browserNumber: browserNumber
    });
  }

  async function handleImageUpload(pht) {
    if (isUploading || !pht) {
      if (!pht) {
        imageInserted = true;
      }
      return;
    }

    isUploading = true;

    try {
      const cleanImageUrl = imageUrl.split('?')[0].split('#')[0];
      const fileExtension = cleanImageUrl.split(".").pop().toLowerCase();
      let fileType = "image/png";
      let mediaElement;

      if (fileExtension === "gif") {
        fileType = "image/gif";
        mediaElement = new Image();
      } else if (fileExtension === "mp4") {
        fileType = "video/mp4";
        mediaElement = document.createElement("video");
      } else {
        mediaElement = new Image();
      }

      mediaElement.src = imageUrl;

      await new Promise((resolve, reject) => {
        const loadHandler = async () => {
          mediaElement.onload = mediaElement.onloadedmetadata = null;
          try {
            const fetchRes = await fetch(imageUrl);
            if (!fetchRes.ok) throw new Error(`Fetch failed: ${fetchRes.status}`);
            const mediaBlob = await fetchRes.blob();
            const file = new File([mediaBlob], `media.${fileExtension}`, {
              type: fileType,
            });

            const editor = document.querySelector(
              ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto"
            );

            if (editor) {
              editor.focus();
              simulateDragAndDrop(mediaElement, editor, file, resolve);
            } else {
              resolve();
            }
          } catch (e) {
            reject(e);
          }
        };

        mediaElement.onload = mediaElement.onloadedmetadata = loadHandler;
        mediaElement.onerror = (e) => reject(e);

        setTimeout(() => {
          reject(new Error("Media loading timeout"));
        }, 20000);
      }).finally(() => {
        isUploading = false;
        imageInserted = true;
      });
    } catch (e) {
      isUploading = false;
      imageInserted = true;
    }
  }

  const formatText = (text) => {
    if (!text) return '';

    const patterns = [
      {
        regex: /\*{3}(.*?)\*{3}/g,
        replacement: '<span class="m-editor-fc__blue-1"><em><strong>$1</strong></em></span>'
      },
      {
        regex: /\*{2}(.*?)\*{2}/g,
        replacement: '<strong>$1</strong>'
      },
      {
        regex: /\*{1}(.*?)\*{1}/g,
        replacement: '<em>$1</em>'
      }
    ];

    patterns.forEach(({ regex, replacement }) => {
      text = text.replace(regex, replacement);
    });

    return text
  };

  const clickEvent = new Event("click", {
    bubbles: true,
    cancelable: true,
  });

  async function startProcessing() {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const waitForElement = (selector, maxAttempts = 60, interval = 1000) => {
        return new Promise((resolve) => {
          let attempts = 0;

          const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
              resolve(element);
              return true;
            }

            attempts++;
            if (attempts >= maxAttempts) {
              resolve(null);
              return true;
            }

            return false;
          };

          if (checkElement()) return;

          const intervalId = setInterval(() => {
            if (checkElement()) {
              clearInterval(intervalId);
            }
          }, interval);
        });
      };

      const waitForPageReady = () => {
        return new Promise((resolve) => {
          const checkReady = () => {
            const editor = document.querySelector(".tiptap.ProseMirror");
            const expireButton = document.querySelector(".b-make-post__expire-period-btn");
            const isPageReady = editor && expireButton && document.readyState === 'complete';

            if (isPageReady) {
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      };

      await waitForPageReady();

      const expireButton = await waitForElement(".b-make-post__expire-period-btn");
      if (!expireButton) {
        throw new Error("Expire period button not found");
      }

      const promises = [];

      if (imageUrl) {
        promises.push(handleImageUpload(pht));
      } else {
        imageInserted = true;
      }

      if (txt) {
        promises.push((async () => {
          const textarea = await waitForElement(".tiptap.ProseMirror");
          if (textarea) {
            await new Promise(resolve => {
              const checkTextareaReady = () => {
                if (textarea.offsetHeight > 0 && textarea.offsetWidth > 0) {
                  resolve();
                } else {
                  setTimeout(checkTextareaReady, 50);
                }
              };
              checkTextareaReady();
            });

            textarea.innerHTML = formatText(text);
            textInserted = true;
          } else {
            textInserted = true;
          }
        })());
      } else {
        textInserted = true;
      }

      await Promise.all(promises);

      if (exp) {

        const expireButtonAgain = await waitForElement(".b-make-post__expire-period-btn");
        if (expireButtonAgain) {
          expireButtonAgain.dispatchEvent(clickEvent);

          await new Promise(resolve => setTimeout(resolve, 500));

          const durationButton = await waitForElement(
            "#post___BV_modal_body_ > div.b-tabs__nav.m-nv.m-tab-rounded.mb-0.m-single-current > ul > li:nth-child(2) > button"
          );

          if (durationButton) {
            durationButton.dispatchEvent(clickEvent);

            const saveButton = await waitForElement(
              "#post___BV_modal_footer_ > button:nth-child(2)"
            );

            if (saveButton) {
              saveButton.dispatchEvent(clickEvent);
            }
          }
        }
      }

      await sendUpdateRequest();

    } catch (error) {
    } finally {
      isProcessing = false;
    }
  }
  startProcessing();
}

function listenForButtonClicks(arg, tabId) {
  const button1 = document.querySelector(
    "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button:nth-child(2)",
  );
  const button2 = document.querySelector(
    "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button",
  );

  if (!button1 && !button2) {
    return;
  }

  let disabledCount = 0;
  let timeoutId = "";

  function clickPost(tabId) {
    const intervalId = setInterval(() => {
      const anchorElement = document.querySelector(
        'a[data-name="PostsCreate"][href="/posts/create"]',
      );
      if (anchorElement) {
        if (!anchorElement.classList.contains("m-disabled")) {
          anchorElement.click();
          if (tabId) {
            tabId = tabId.toString();
            chrome.storage.local.set({ [tabId]: true });
          }
          clearInterval(intervalId);
        } else {
          disabledCount++;
          if (disabledCount >= 10) {
            clearInterval(intervalId);
          }
        }
      }
    }, 1000);
  }

  function handleClick() {
    if (this._clickListenerAdded) {
      timeoutId = setTimeout(function () {
        clickPost(tabId);
      }, 500);
    }
  }

  function manageListener(button) {
    if (button) {
      if (arg === false) {
        if (timeoutId) clearTimeout(timeoutId);
        if (button._clickListenerAdded) {
          button.removeEventListener("click", handleClick);
          button._clickListenerAdded = false;
        }
      } else if (arg === true && !button._clickListenerAdded) {
        button.addEventListener("click", handleClick);
        button._clickListenerAdded = true;
      }
    }
  }
  [button1, button2].forEach(manageListener);
}

let lastTabId;

chrome.tabs.onRemoved.addListener(function (tabId) {
  injectedTabs.delete(tabId);
  protectedTabs.delete(tabId);

  if (closedTabIds.has(tabId)) {
    closedTabIds.delete(tabId);
    closedTabsCount++;
    lastClosedTime = new Date();
  }

  const tabIdStr = String(tabId);
  const keysToRemove = [
    tabIdStr,
    `blacklisted_${tabIdStr}`
  ];

  chrome.storage.local.remove(keysToRemove, function () { });

  chrome.storage.local.get("tabIds", function (data) {
    const tabIds = data.tabIds || [];
    const index = tabIds.indexOf(tabId);
    if (index > -1) {
      tabIds.splice(index, 1);
      chrome.storage.local.set({ tabIds: tabIds });
    }
  });

  chrome.tabs.query({}, function (tabs) {
    const onlyFansTabsCount = tabs.filter(tab =>
      tab.url && tab.url.startsWith('https://onlyfans.com')
    ).length;

    getMyBrowserNumber().then(browserNum => {
      sendReadyRequest(browserNum, onlyFansTabsCount);
    });
    lastTabCount = onlyFansTabsCount;
  });

  updateTabCounterOnActiveTab(false);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get('pht', (data) => {
    const pht = Array.isArray(data.pht) ? data.pht : [];
    const tid = Number(tabId);
    if (pht.some((id) => Number(id) === tid)) {
      chrome.storage.local.set({ pht: pht.filter((id) => Number(id) !== tid) });
    }
  });
});


chrome.tabs.onCreated.addListener(function (tab) {
  if (tab.url && tab.url.startsWith('https://onlyfans.com')) {
    chrome.tabs.query({}, function (tabs) {
      const onlyFansTabsCount = tabs.filter(tab =>
        tab.url && tab.url.startsWith('https://onlyfans.com')
      ).length;

      getMyBrowserNumber().then(browserNum => {
        sendReadyRequest(browserNum, onlyFansTabsCount);
      });
      lastTabCount = onlyFansTabsCount;
    });
  }
});



function sendActivityInfo(browser) {
  fetch("http://localhost:3000/activity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ browser }),
  })
    .then((response) => response.text())
    .catch((error) => console.error("Error:", error));
}


async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'WebSocket connection to local server'
    });
  }
}

const commandQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (commandQueue.length > 0) {
    const payload = commandQueue.shift();
    await processCommand(payload);
    await new Promise(resolve => setTimeout(resolve, ALL_ACTIONS_DELAY));
  }

  isProcessingQueue = false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ws-command') {
    commandQueue.push(message.payload);
    processQueue();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'ws-get-browser-number') {
    getMyBrowserNumber().then(browserNum => {
      currentBrowserNumber = browserNum;
      chrome.storage.local.get(['singleTabMode', 'autoRestartEnabled', 'singleTabScreenshotDelay'], (res) => {
        let mode = 'off';
        if (res.singleTabMode) mode = 'single';
        else if (res.autoRestartEnabled) mode = 'auto';
        sendResponse({ browserNumber: browserNum, arrowMode: mode });

        fetch('http://localhost:3000/updateSingleTabSettings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshotDelay: res.singleTabScreenshotDelay !== undefined ? res.singleTabScreenshotDelay : 5000 })
        }).catch(() => { });
      });
    });
    return true;
  }
  if (message.type === 'ws-displaced') {
    (async () => {
      try {
        const res = await fetch('http://localhost:3000/active-browsers');
        const data = await res.json();
        const taken = new Set(data.numbers || []);
        let freeNum = null;
        for (let i = 1; i <= 15; i++) {
          if (!taken.has(i)) { freeNum = i; break; }
        }
        if (freeNum) {
          const storageUpdates = {};
          for (let j = 1; j <= 15; j++) {
            storageUpdates[`browser${j}Checked`] = j === freeNum;
          }
          await chrome.storage.local.set(storageUpdates);
          currentBrowserNumber = freeNum;
          chrome.runtime.sendMessage({ type: 'ws-update-browser-number', browserNumber: freeNum });
        }
      } catch (_) { }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

ensureOffscreen();

async function processCommand(lastEntry) {

  const waitForTabAndExecute = async (tabId, functionToExecute, args) => {
    return new Promise((resolve) => {
      function checkAndExecute() {
        chrome.tabs.get(tabId, async (tab) => {
          if (chrome.runtime.lastError) {
            resolve();
            return;
          }

          if (tab.status === "complete") {
            await executeScriptIfValid(tab, {
              target: { tabId: tab.id },
              func: functionToExecute,
              args: args,
            });
            resolve();
          } else {
            setTimeout(checkAndExecute, 250);
          }
        });
      }
      checkAndExecute();
    });
  };

  const result = await chrome.storage.local.get(null);
  const instantPost = result.postChecked !== false;
  currentBrowserNumber = await getMyBrowserNumber();

  try {
    if (typeof instantPost === "boolean") {
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: listenForButtonClicks,
          args: [instantPost, activeTab.id],
        });
      });
    }

    if (!lastEntry) return;

    if (lastEntry.type === "arrow-lock-state") {
      chrome.storage.local.set({
        _arrowLocked: lastEntry.locked,
        _arrowLockedBy: lastEntry.lockedBy
      });

      if (lastEntry.lockedBy === currentBrowserNumber) {
        chrome.storage.local.set({
          autoRestartEnabled: lastEntry.mode === 'auto',
          singleTabMode: lastEntry.mode === 'single'
        });
      } else {
        chrome.storage.local.set({
          autoRestartEnabled: false,
          singleTabMode: false
        });
      }
      return;
    }

    if (lastEntry.type === "stats-settings-update") {
      const allData = lastEntry.data || {};
      chrome.storage.local.get(null, (items) => {
        const activeBrowser = Object.keys(items)
          .filter(k => k.startsWith('browser') && k.endsWith('Checked') && items[k])
          .map(k => parseInt(k.match(/\d+/)[0]))[0] || 1;
        const mySettings = allData[`statsSettings_${activeBrowser}`];
        if (mySettings) {
          chrome.storage.local.set({ statsSettings: mySettings });
          chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
            const activeTab = currentWindow && currentWindow.tabs && currentWindow.tabs.find(t => t.active);
            if (!activeTab) return;
            chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: (settings) => {
                const menu = document.getElementById('stats-settings-menu');
                if (!menu) return;
                const ownTrackEl = menu.querySelector('#cb-own-track');
                const renewsEl = menu.querySelector('#cb-renews');
                if (ownTrackEl) ownTrackEl.checked = settings.subtractOwnTracking || false;
                if (renewsEl) renewsEl.checked = settings.subtractRenews || false;
              },
              args: [mySettings]
            }).catch(() => { });
          });
        }
      });
      return;
    }

    if (lastEntry.type === "stories-settings-update") {

      chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
        const activeTab = currentWindow && currentWindow.tabs && currentWindow.tabs.find(t => t.active);
        if (!activeTab) return;
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (settings) => {
            const menu = document.getElementById('stories-settings-menu');
            if (!menu) return;
            const ssEnabledEl = menu.querySelector('[data-server-key="screenshotEnabled"]');
            const ssDelayEl = menu.querySelector('[data-server-key="screenshotDelay"]');
            const swDelayEl = menu.querySelector('[data-server-key="switchDelay"]');
            if (ssEnabledEl) ssEnabledEl.checked = settings.screenshotEnabled !== undefined ? settings.screenshotEnabled : true;
            if (ssDelayEl) ssDelayEl.value = settings.screenshotDelay !== undefined ? settings.screenshotDelay : 1000;
            if (swDelayEl) swDelayEl.value = settings.switchDelay !== undefined ? settings.switchDelay : 3000;
          },
          args: [lastEntry]
        }).catch(() => { });
      });
      return;
    }

    if (lastEntry.action === "RUN_GLOBAL_STATS") {
      try {
        const settingsKey = `statsSettings`;
        const settingsResult = await chrome.storage.local.get([settingsKey]);
        const settings = settingsResult[settingsKey] || { trackingNames: [], subtractOwnTracking: false, subtractRenews: false };

        const tabConfig = [
          { type: 'left', url: "https://onlyfans.com/my/statistics/reach/trial-links" },
          { type: 'center', url: "https://onlyfans.com/my/statistics/fans/subscriptions" },
          { type: 'right', url: "https://onlyfans.com/my/statistics/reach/tracking-links" }
        ];

        if (settings.trackingNames && settings.trackingNames.length > 0) {
          tabConfig.push({ type: 'tracking-details', url: "https://onlyfans.com/my/settings/subscription/tracking-links" });
        }

        const tabs = await Promise.all(tabConfig.map(config => new Promise(resolve => {
          chrome.tabs.create({ url: config.url, active: false }, tab => {
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
              if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve({ tab, type: config.type });
              }
            });
          });
        })));

        const extractStats = async (type, settings) => {
          const wait = (ms) => new Promise(r => setTimeout(r, ms));

          const returnZero = () => {
            if (type === 'center') return { total: 0, renews: 0 };
            if (type === 'right') return { total: 0, addedTracking: 0, isBroken: false };
            if (type === 'tracking-details') return { foundDetails: {} };
            return 0;
          };

          sessionStorage.removeItem('OF_NETWORK_DATA');

          if (type !== 'tracking-details') {
            let dropdownBtn = null;
            for (let i = 0; i < 20; i++) {
              dropdownBtn = document.querySelector('button.dropdown-toggle.b-holder-options');
              if (dropdownBtn) break;
              await wait(500);
            }
            if (!dropdownBtn) return returnZero();
            dropdownBtn.click();

            let customItem = null;
            for (let i = 0; i < 20; i++) {
              customItem = Array.from(document.querySelectorAll('.v-list-item')).find(el => el.textContent.trim() === 'Custom');
              if (customItem) break;
              await wait(500);
            }
            if (!customItem) return returnZero();
            customItem.click();
          }

          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const expectedMonthStr = monthNames[yesterday.getMonth()] + " " + yesterday.getFullYear();
          const expectedDayStr = String(yesterday.getDate());

          if (type !== 'tracking-details') {
            let dateClicked = false;
            for (let i = 0; i < 20; i++) {
              await wait(500);
              const timeSpan = document.querySelector('.b-streaks-swither__time');
              if (!timeSpan) continue;

              const currentMonthStr = timeSpan.textContent.trim();
              if (currentMonthStr === expectedMonthStr) {
                const dayCells = Array.from(document.querySelectorAll('.v-calendar-weekly__day:not(.v-outside)'));
                const targetCell = dayCells.find(cell => {
                  const span = cell.querySelector('.v-calendar-weekly__day-label span');
                  return span && span.textContent.trim() === expectedDayStr;
                });

                if (targetCell) {
                  targetCell.click();
                  await wait(500);

                  // After clicking the start date, the DOM might re-render, so we query again
                  const newTimeSpan = document.querySelector('.b-streaks-swither__time');
                  if (newTimeSpan && newTimeSpan.textContent.trim() !== expectedMonthStr) {
                    // Just in case it jumped to another month
                    const arrows = document.querySelectorAll('.b-streaks-swither__btn button');
                    const cDate = new Date(newTimeSpan.textContent.trim());
                    const eDate = new Date(expectedMonthStr);
                    if (cDate < eDate && arrows[1] && !arrows[1].disabled) arrows[1].click();
                    else if (cDate > eDate && arrows[0] && !arrows[0].disabled) arrows[0].click();
                    await wait(500);
                  }

                  const newDayCells = Array.from(document.querySelectorAll('.v-calendar-weekly__day:not(.v-outside)'));
                  const targetCellSecond = newDayCells.find(cell => {
                    const span = cell.querySelector('.v-calendar-weekly__day-label span');
                    return span && span.textContent.trim() === expectedDayStr;
                  });

                  if (targetCellSecond) {
                    targetCellSecond.click();
                    dateClicked = true;
                    break;
                  }
                }
              } else {
                const currentDateObj = new Date(currentMonthStr);
                const expectedDateObj = new Date(expectedMonthStr);
                const arrows = document.querySelectorAll('.b-streaks-swither__btn button');

                if (currentDateObj < expectedDateObj) {
                  const rightArrow = arrows[1];
                  if (rightArrow && !rightArrow.disabled) rightArrow.click();
                  else break;
                } else {
                  const leftArrow = arrows[0];
                  if (leftArrow && !leftArrow.disabled) leftArrow.click();
                  else break;
                }
              }
            }

            if (!dateClicked) return returnZero();

            const applyBtn = document.querySelector('.vdatetime-popup__actions__button--confirm button');
            if (applyBtn) {
              applyBtn.click();
            } else {
              return returnZero();
            }
          }

          const pad = n => n < 10 ? '0' + n : n;
          const dateStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

          const getInterceptedData = async (pathMatches) => {
            for (let i = 0; i < 50; i++) {
              const str = sessionStorage.getItem('OF_NETWORK_DATA');
              if (str) {
                const data = JSON.parse(str);
                const matchKey = Object.keys(data).find(k => pathMatches.every(m => k.includes(m)));
                if (matchKey) return data[matchKey];
              }
              await wait(200);
            }
            return null;
          };

          if (type === 'left') {
            const data = await getInterceptedData(['/api2/v2/users/me/stats/overview', 'by=trials', dateStr]);
            if (data && data.trials && data.trials.claims) {
              return data.trials.claims.total || 0;
            }
            return 0;
          }

          if (type === 'center') {
            const dataTotal = await getInterceptedData(['/api2/v2/subscriptions/subscribers/chart', 'by=total', dateStr]);
            const total = (dataTotal && dataTotal.subscribes && dataTotal.subscribes[0]) ? dataTotal.subscribes[0].count : 0;

            let renews = 0;
            const renewsBtn = document.getElementById('Renews');
            if (renewsBtn) {
              renewsBtn.click();
              const dataRenew = await getInterceptedData(['/api2/v2/subscriptions/subscribers/chart', 'by=renew', dateStr]);
              if (dataRenew && dataRenew.subscribes && dataRenew.subscribes[0]) {
                renews = dataRenew.subscribes[0].count || 0;
              }
            }
            return { total, renews };
          }

          if (type === 'right') {
            const dataChart = await getInterceptedData(['/api2/v2/campaigns/chart', dateStr]);
            const total = dataChart ? (dataChart.total || 0) : 0;

            let addedTracking = 0;
            let isBroken = false;
            const trackingNames = settings.trackingNames || [];

            if (trackingNames.length > 0) {
              const dataList = await getInterceptedData(['/api2/v2/campaigns', 'limit=', dateStr]);
              if (dataList && dataList.list && dataList.list.length > 0) {
                dataList.list.forEach(item => {
                  if (trackingNames.includes(item.campaignName)) {
                    addedTracking += (item.countSubscribers || 0);
                  }
                });
              } else if (total > 0 && (!dataList || !dataList.list || dataList.list.length === 0)) {
                addedTracking = '❌';
                isBroken = true;
              }
            }
            return { total, addedTracking, isBroken };
          }

          if (type === 'tracking-details') {
            const trackingNames = new Set(settings.trackingNames || []);
            const foundDetails = {};

            if (trackingNames.size === 0) return { foundDetails };

            let prevHeight = 0;
            for (let scrollTries = 0; scrollTries < 50; scrollTries++) {
              window.scrollTo(0, document.body.scrollHeight);
              await wait(600);

              const str = sessionStorage.getItem('OF_NETWORK_DATA');
              if (str) {
                const data = JSON.parse(str);

                Object.keys(data).forEach(key => {
                  if (key.includes('/api2/v2/campaigns') && key.includes('stats=true')) {
                    const response = data[key];
                    if (response && response.list) {
                      response.list.forEach(item => {
                        if (trackingNames.has(item.campaignName)) {
                          foundDetails[item.campaignName] = item.countSubscribers || 0;
                          trackingNames.delete(item.campaignName);
                        }
                      });
                    }
                  }
                });
              }

              if (trackingNames.size === 0) break;

              const currentHeight = document.body.scrollHeight;
              if (currentHeight === prevHeight) {
                let hasSpinner = document.querySelector('.v-progress-circular');
                if (!hasSpinner) {
                  await wait(1000);
                  if (document.body.scrollHeight === prevHeight) break;
                }
              }
              prevHeight = currentHeight;
            }
            return { foundDetails };
          }
        };

        const results = await Promise.all(tabs.map(({ tab, type }) => new Promise(resolve => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractStats,
            args: [type, settings]
          }, (injectionResults) => {
            let val = type === 'left' ? 0 : (type === 'center' ? { total: 0, renews: 0 } : (type === 'tracking-details' ? { foundDetails: {} } : { total: 0, addedTracking: 0, isBroken: false }));
            if (injectionResults && injectionResults[0] && injectionResults[0].result !== undefined) {
              val = injectionResults[0].result;
            }
            chrome.tabs.remove(tab.id);
            resolve({ type, val });
          });
        })));

        const leftResult = results.find(r => r.type === 'left').val;
        const centerResult = results.find(r => r.type === 'center').val;
        const rightResult = results.find(r => r.type === 'right').val;
        const detailsResult = results.find(r => r.type === 'tracking-details');
        const trackingDetails = detailsResult && detailsResult.val && detailsResult.val.foundDetails ? detailsResult.val.foundDetails : {};

        let net = centerResult.total - leftResult - rightResult.total;
        let isNetInaccurate = false;

        if (settings.subtractOwnTracking) {
          if (rightResult.isBroken || rightResult.addedTracking === '❌') {
            isNetInaccurate = true;
          } else {
            net -= rightResult.addedTracking;
          }
        }

        if (settings.subtractRenews) net -= centerResult.renews;

        const payload = {
          net: isNetInaccurate ? `${net}?` : net,
          center: centerResult.total,
          renews: centerResult.renews,
          right: rightResult.total,
          addedTracking: rightResult.addedTracking,
          left: leftResult,
          trackingDetails: trackingDetails
        };

        chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
          const activeTab = currentWindow && currentWindow.tabs && currentWindow.tabs.find(t => t.active);
          if (activeTab) {
            chrome.tabs.sendMessage(activeTab.id, {
              action: "STATS_COLLECTION_FINISHED",
              success: true,
              data: payload
            });
          }
        });
      } catch (e) {
        console.error("collectStats error", e);
        chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
          const activeTab = currentWindow && currentWindow.tabs && currentWindow.tabs.find(t => t.active);
          if (activeTab) {
            chrome.tabs.sendMessage(activeTab.id, {
              action: "STATS_COLLECTION_FINISHED",
              success: false
            });
          }
        });
      }
      return;
    }

    if (lastEntry.type === "switch-right-update") {

      chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
        const activeTab = currentWindow && currentWindow.tabs && currentWindow.tabs.find(t => t.active);
        if (!activeTab) return;
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (activated) => {

            window.__switchRightActivated = activated;
            const btn = document.getElementById('switch-button');
            if (btn) {
              if (activated) {
                btn.style.boxShadow = "0 0 0 2px #FFD700 inset, 0 0 8px rgba(255,215,0,0.7)";
                btn.setAttribute("data-right-activated", "true");
              } else {
                btn.style.boxShadow = "";
                btn.setAttribute("data-right-activated", "false");
              }
            }
          },
          args: [lastEntry.activated]
        }).catch(() => { });
      });
      return;
    }
    if (lastEntry.selectedBrowsers) {
      const allowed = String(lastEntry.selectedBrowsers).split(/\s+/).map(Number);
      if (!allowed.includes(currentBrowserNumber)) {
        return;
      }
    }

    const browserType = `browser${currentBrowserNumber}`;
    let isDelete = lastEntry.isDelete || false;

    function validateDelete(answer) {
      const pattern = /^(del|вуд)-?\d+$/;
      return pattern.test(answer);
    }

    function validateSwitch(answer) {
      const pattern = /^(sw|ыц|іц)-?\d+$/;
      return pattern.test(answer);
    }

    function extractNumber(textInput) {
      const pattern = /-?\d+/;
      const match = textInput.match(pattern);
      return match ? Number(match[0]) : null;
    }

    if (lastEntry && (lastEntry.id === "23" || (lastEntry.id === "11" && lastEntry.textInput === "clear")) && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: clearPosts,
        });
        return
      })
    }

    if (lastEntry && (lastEntry.id === "24" || (lastEntry.id === "11" && lastEntry.textInput === "reload")) && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: reloadPage,
        });
        return
      })
    }

    if (lastEntry && lastEntry.id === "11" && lastEntry.textInput === "bl" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);

        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: () => {
            try {
              const usernameEl = document.querySelector(".g-user-username");
              if (usernameEl && usernameEl.innerText) {
                const username = usernameEl.innerText;

                fetch("http://localhost:3000/add-to-blacklist", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ username: username }),
                }).then(res => {
                  if (res.ok) console.log("Sent to blacklist:", username);
                }).catch(err => console.error("Error sending to blacklist:", err));
              }
            } catch (e) {
              console.error("Error extracting username:", e);
            }
          },
        });
      });
      return;
    }

    async function processTags(selections, sequence) {
      const tagsFilePath = 'server/files/tags.txt';
      let firstCreatedTab = null;
      let colorQueue = [];
      try {
        if (Array.isArray(sequence) && sequence.length > 0) {
          colorQueue = sequence.slice();
        } else if (Array.isArray(selections)) {
          selections.forEach(sel => {
            const cnt = Number(sel && sel.count);
            const col = sel && sel.color;
            if (cnt > 0 && typeof col === 'string') {
              for (let i = 0; i < cnt; i++) colorQueue.push(col);
            }
          });
        }
      } catch (_) { }
      try { chrome.storage.local.set({ storiesStop: false, storiesRunning: true }); } catch (_) { }

      let blacklistContent = "";
      try {
        const blResponse = await fetch('http://localhost:3000/get-blacklist');
        if (blResponse.ok) {
          blacklistContent = await blResponse.text();
        }
      } catch (e) {
        console.error("Failed to fetch blacklist for stories:", e);
      }

      try {
        const tagsResponse = await fetch(chrome.runtime.getURL(tagsFilePath));
        const tagsText = await tagsResponse.text();
        const tags = tagsText.split('\n').filter(tag => tag.trim() !== '');

        let currentUsername = "";
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs.length > 0) {
            const res = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                const el = document.querySelector(".g-user-username");
                return el ? el.textContent.trim().replace(/^@/, '') : "";
              }
            });
            if (res && res[0] && res[0].result) currentUsername = res[0].result;
          }
        } catch (e) { }

        async function isTagSkipped(tag, currentUsername, blacklistContent) {
          const cleanTag = tag.trim();
          const targetTagLower = cleanTag.toLowerCase().replace(/^@/, '');

          if (currentUsername && currentUsername.toLowerCase() === targetTagLower) {
            return true;
          }

          if (blacklistContent && currentUsername) {
            const lines = blacklistContent.split(/\r?\n/);
            const currentModelLower = currentUsername.toLowerCase();

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;

              if (trimmedLine.includes('-')) {
                const parts = trimmedLine.split('-');
                if (parts.length >= 2) {
                  const blacklistedTag = parts[0].trim().toLowerCase().replace(/^@/, '');
                  if (blacklistedTag === targetTagLower) {
                    const bannedModels = parts[1].split(',').map(m => m.trim().toLowerCase().replace(/^@/, ''));
                    if (bannedModels.includes(currentModelLower)) {
                      return true;
                    }
                  }
                }
              } else {
                const globalBanTag = trimmedLine.toLowerCase().replace(/^@/, '');
                if (globalBanTag === targetTagLower) {
                  return true;
                }
              }
            }
          }

          const fileSearchTag = cleanTag.replace(/\./g, "-");
          const extensions = [".png", ".jpg", ".jpeg", ".heic"];
          for (const ext of extensions) {
            try {
              const response = await fetch(chrome.runtime.getURL(`server/crop/images/${fileSearchTag}${ext}`));
              if (response.ok) return false;
            } catch (e) { }
          }
          try {
            const response = await fetch(chrome.runtime.getURL(`server/crop/images/${fileSearchTag}`));
            if (response.ok) return false;
          } catch (e) { }

          return true;
        }

        let isStoriesEnabled = true;
        let isSyncCanvasEnabled = true;
        try {
          const res = await chrome.storage.local.get(['storiesEnabled', 'storiesSyncCanvasEnabled']);
          isStoriesEnabled = res.storiesEnabled !== false;
          isSyncCanvasEnabled = res.storiesSyncCanvasEnabled !== false;
        } catch (e) { }

        for (let i = 0; i < tags.length; i++) {
          const tag = tags[i];
          let skipped = await isTagSkipped(tag, currentUsername, blacklistContent);

          if (!isStoriesEnabled) {
            skipped = true;
          }

          const tabUrl = skipped ? "https://onlyfans.com/posts/create" : "https://onlyfans.com/";
          const tab = await chrome.tabs.create({ url: tabUrl, active: true });

          protectedTabs.add(tab.id);

          if (i === 0) {
            firstCreatedTab = tab;
          }

          await new Promise(resolve => {
            const listener = (tabId, changeInfo) => {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            };
            chrome.tabs.onUpdated.addListener(listener);
          });

          const stopState = await chrome.storage.local.get(['storiesStop']);
          if (stopState && stopState.storiesStop) { break; }

          const cleanTag = tag.trim().replace(/^@/, '');
          const fileSearchTag = cleanTag.replace(/\./g, "-");
          let photoHash = null;
          try {
            const exts = [".png", ".jpg", ".jpeg", ".heic", ""];
            for (const ext of exts) {
              const imgRes = await fetch(chrome.runtime.getURL(`server/crop/images/${fileSearchTag}${ext}`));
              if (imgRes.ok) {
                const blob = await imgRes.blob();
                const bitmap = await createImageBitmap(blob);
                const oc = new OffscreenCanvas(9, 8);
                const ctx = oc.getContext('2d');
                ctx.drawImage(bitmap, 0, 0, 9, 8);
                const { data } = ctx.getImageData(0, 0, 9, 8);
                let bits = '';
                for (let y = 0; y < 8; y++) {
                  for (let x = 0; x < 8; x++) {
                    const i = (y * 9 + x) * 4;
                    const g1 = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    const i2 = (y * 9 + x + 1) * 4;
                    const g2 = data[i2] * 0.299 + data[i2 + 1] * 0.587 + data[i2 + 2] * 0.114;
                    bits += g1 > g2 ? '1' : '0';
                  }
                }
                let hex = '';
                for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
                photoHash = hex;
                break;
              }
            }
          } catch (e) { }
          const settingsTagKey = photoHash ? cleanTag + '_' + photoHash : cleanTag;

          const hexHamming = (a, b) => {
            if (!a || !b || a.length !== b.length) return Infinity;
            const lut = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
            let d = 0;
            for (let i = 0; i < a.length; i++) d += lut[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
            return d;
          };
          const PHASH_THRESHOLD = 8;

          await new Promise(resolve => {
            fetch('http://localhost:3000/tag-settings')
              .then(res => res.json())
              .catch(() => ({}))
              .then(ts => {
                if (!isStoriesEnabled) {
                  return resolve();
                }
                let savedSettings = null;
                if (photoHash) {
                  const prefix = cleanTag + '_';
                  let minDist = Infinity;
                  for (const [key, val] of Object.entries(ts)) {
                    if (!key.startsWith(prefix)) continue;
                    const dist = hexHamming(photoHash, key.slice(prefix.length));
                    if (dist < minDist) { minDist = dist; savedSettings = val; }
                  }
                  if (minDist > PHASH_THRESHOLD) savedSettings = null;
                  // Fallback: migrate old-format key (stored without hash suffix)
                  if (!savedSettings && ts[cleanTag]) savedSettings = ts[cleanTag];
                } else {
                  savedSettings = ts[settingsTagKey] || null;
                }
                const hookFabricFunc = (tagStr, syncEnabled, photoHash) => {
                  if (window.__OFH_SYNC_ENABLED === undefined) {
                    window.__OFH_SYNC_ENABLED = syncEnabled;
                  }
                  const hookFabricCanvas = () => {
                    try {
                      const container = document.querySelector('.b-photo-editor__container');
                      if (!container) return setTimeout(hookFabricCanvas, 500);
                      const vue = container.__vue__;
                      if (!vue || !vue.$parent || !vue.$parent.$parent) return setTimeout(hookFabricCanvas, 500);
                      const canvas = vue.$parent.$parent.canvas;
                      if (!canvas) return setTimeout(hookFabricCanvas, 500);

                      if (canvas.__OFH_HOOKED) return;
                      canvas.__OFH_HOOKED = true;

                      const extractData = (target) => {
                        let angle = Math.round(target.angle || 0) + 90;
                        if (angle < 0) angle += 360;
                        angle = angle % 360;

                        if (window.__OFH_TEXT_SCALE_BASE == null) {
                          window.__OFH_TEXT_SCALE_BASE = target.scaleX || 1;
                        }
                        let scale = Math.round((target.scaleX / window.__OFH_TEXT_SCALE_BASE) * 100);

                        const canvasRect = canvas.lowerCanvasEl.getBoundingClientRect();
                        let joyX = (target.left / canvasRect.width) * 100 - 5;
                        let joyY = (target.top / canvasRect.height) * 100 - 5;
                        return { angle, scale, joyX, joyY };
                      };

                      const updateUI = (e) => {
                        const target = e.target;
                        if (!target) return;
                        const objects = canvas.getObjects();
                        if (objects.length < 2 || target !== objects[1]) return;

                        const { angle, scale, joyX, joyY } = extractData(target);

                        const slider = document.getElementById('size-slider');
                        if (slider) slider.value = scale;

                        const dialHand = document.querySelector('#tag-rotation-dial svg line[stroke="#fbdf56"]');
                        if (dialHand) {
                          const cx = parseFloat(dialHand.getAttribute('x1') || 38);
                          const cy = parseFloat(dialHand.getAttribute('y1') || 38);
                          const length = cx - 8;
                          const rad = (angle - 90) * Math.PI / 180;
                          const x2 = cx + length * Math.cos(rad);
                          const y2 = cy + length * Math.sin(rad);
                          dialHand.setAttribute('x2', x2);
                          dialHand.setAttribute('y2', y2);
                        }
                        const dialLabel = document.querySelector('#tag-rotation-dial div');
                        if (dialLabel) {
                          dialLabel.textContent = angle + '°';
                        }

                        const joyHandle = document.querySelector('#joy div');
                        if (joyHandle) {
                          joyHandle.style.left = joyX + 'px';
                          joyHandle.style.top = joyY + 'px';
                        }
                      };

                      const syncServer = (e) => {
                        const target = e.target;
                        if (!target) return;
                        const objects = canvas.getObjects();
                        if (objects.length < 2 || target !== objects[1]) return;

                        const { angle, scale, joyX, joyY } = extractData(target);

                        if (window.__OFH_SYNC_ENABLED !== false) {
                          fetch('http://localhost:3000/text-scale', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scalePercent: scale })
                          }).catch(() => { });

                          fetch('http://localhost:3000/text-rotate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ angleDeg: angle })
                          }).catch(() => { });

                          fetch('http://localhost:3000/joystick-data', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ x: target.left, y: target.top })
                          }).catch(() => { });

                          fetch('http://localhost:3000/tag-settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tag: photoHash ? tagStr + '_' + photoHash : tagStr, settings: { scale: scale, angle: angle, joyX: joyX, joyY: joyY, canvasX: target.left, canvasY: target.top } })
                          }).catch(() => { });
                        }
                      };
                      canvas.on('object:moving', updateUI);
                      canvas.on('object:scaling', updateUI);
                      canvas.on('object:rotating', updateUI);
                      canvas.on('object:modified', (e) => {
                        updateUI(e);
                        syncServer(e);
                      });

                    } catch (err) {
                      setTimeout(hookFabricCanvas, 500);
                    }
                  };
                  hookFabricCanvas();
                };

                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: processImageAndUpload,
                  args: [tag, colorQueue[i] || null, blacklistContent, savedSettings, photoHash]
                }, () => {
                  if (savedSettings) {
                    chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      world: 'MAIN',
                      func: (settings) => {
                        let attempts = 0;
                        const checkAndApply = () => {
                          attempts++;
                          if (attempts > 50) return;
                          try {
                            const container = document.querySelector('.b-photo-editor__container');
                            if (!container) return setTimeout(checkAndApply, 100);
                            const vue = container.__vue__;
                            if (!vue || !vue.$parent || !vue.$parent.$parent) return setTimeout(checkAndApply, 100);
                            const canvas = vue.$parent.$parent.canvas;
                            if (!canvas) return setTimeout(checkAndApply, 100);
                            const objects = canvas.getObjects();
                            if (!objects || objects.length < 2) return setTimeout(checkAndApply, 100);
                            const target = objects[1];
                            if (!target) return setTimeout(checkAndApply, 100);

                            let changed = false;
                            if (settings.canvasX !== undefined && settings.canvasY !== undefined) {
                              target.set({ left: settings.canvasX, top: settings.canvasY });
                              changed = true;
                            }
                            if (settings.scale !== undefined) {
                              if (window.__OFH_TEXT_SCALE_BASE == null) window.__OFH_TEXT_SCALE_BASE = target.scaleX || 1;
                              const scale = (settings.scale / 100) * window.__OFH_TEXT_SCALE_BASE;
                              target.set({ scaleX: scale, scaleY: scale });
                              changed = true;
                            }
                            if (settings.angle !== undefined) {
                              target.set({ angle: settings.angle - 90 });
                              changed = true;
                            }
                            if (changed && canvas.renderAll) {
                              target.setCoords();
                              canvas.renderAll();
                            }
                          } catch (e) {
                            setTimeout(checkAndApply, 100);
                          }
                        };
                        checkAndApply();
                      },
                      args: [savedSettings]
                    }, () => {
                      chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        world: 'MAIN',
                        func: hookFabricFunc,
                        args: [cleanTag, isSyncCanvasEnabled, photoHash]
                      }, () => resolve());
                    });
                  } else {
                    chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      world: 'MAIN',
                      func: hookFabricFunc,
                      args: [cleanTag, isSyncCanvasEnabled]
                    }, () => resolve());
                  }
                });
              });
          });
        }

        if (firstCreatedTab) {
          await chrome.tabs.update(firstCreatedTab.id, { active: true });
        }

      } catch (error) {
        console.error('Error in processTags:', error);

        if (firstCreatedTab) {
          await chrome.tabs.update(firstCreatedTab.id, { active: true });
        }
      }
      try { chrome.storage.local.set({ storiesRunning: false }); } catch (_) { }
      try { setStoriesDoneIcon('check'); } catch (_) { }
    }

    if (lastEntry && lastEntry.id === "25" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      processTags(lastEntry.selections || [], lastEntry.sequence || []).catch(error => console.error(error));
      return;
    }

    if (lastEntry && lastEntry.id === "26" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      const delay = lastEntry.switchDelay !== undefined ? lastEntry.switchDelay : 2000;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const tabs = currentWindow.tabs;
        const currentTabIndex = tabs.findIndex(tab => tab.active);
        const currentTab = tabs[currentTabIndex];

        await executeScriptIfValid(currentTab, {
          target: { tabId: currentTab.id },
          func: postStories
        });

        setTimeout(() => {
          if (currentTabIndex < tabs.length - 1) {
            const nextTabIndex = currentTabIndex + 1;
            chrome.tabs.update(tabs[nextTabIndex].id, { active: true });
          } else {
            chrome.tabs.create({ url: 'https://onlyfans.com' });
          }
        }, delay);
      });
      return
    }

    if (lastEntry && lastEntry.id === "28" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      try {
        await chrome.storage.local.set({ storiesStop: true });
      } catch (_) { }
      return;
    }

    if (lastEntry && lastEntry.id === "29" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          world: 'MAIN',
          func: (p) => {
            try {
              var container = document.querySelector('.b-photo-editor__container');
              if (!container) return;
              var vue = container.__vue__;
              if (!vue || !vue.$parent || !vue.$parent.$parent) return;
              var canvas = vue.$parent.$parent.canvas;
              if (!canvas) return;
              var objects = canvas.getObjects();
              if (!objects || objects.length < 2) return;
              var target = objects[1];
              if (!target || typeof target.scaleX !== 'number') return;
              if (window.__OFH_TEXT_SCALE_BASE == null) {
                window.__OFH_TEXT_SCALE_BASE = target.scaleX || 1;
              }
              var scale = (Number(p) / 100) * (window.__OFH_TEXT_SCALE_BASE || 1);
              target.set({ scaleX: scale, scaleY: scale });
              var slider = document.getElementById('size-slider');
              if (slider) slider.value = p;
              if (canvas.renderAll) canvas.renderAll();
            } catch (_) { }
          },
          args: [lastEntry.scalePercent],
        });
        return
      })
    }

    if (lastEntry && lastEntry.id === "34" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      const targetTag = lastEntry.textInput;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        if (activeTab) {
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            world: 'MAIN',
            func: (tagToReset) => {
              try {
                const container = document.querySelector('.b-photo-editor__container');
                if (container && container.__vue__ && container.__vue__.$parent && container.__vue__.$parent.$parent) {
                  const canvas = container.__vue__.$parent.$parent.canvas;
                  if (canvas) {
                    const objects = canvas.getObjects();
                    if (objects && objects.length >= 2) {
                      const target = objects[1];
                      if (target) {
                        target.set({
                          left: canvas.width / 2,
                          top: canvas.height / 2,
                          angle: 0
                        });
                        if (window.__OFH_TEXT_SCALE_BASE != null) {
                          target.set({ scaleX: window.__OFH_TEXT_SCALE_BASE, scaleY: window.__OFH_TEXT_SCALE_BASE });
                        } else {
                          target.set({ scaleX: 1, scaleY: 1 });
                        }
                        target.setCoords();
                        canvas.renderAll();
                      }
                    }
                  }
                }
              } catch (e) { }
            },
            args: [targetTag]
          });

          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => {
              try {
                const slider = document.getElementById('size-slider');
                if (slider) slider.value = '100';

                const joy = document.getElementById('joy');
                if (joy) {
                  const handle = joy.querySelector('div');
                  if (handle) {
                    handle.style.left = '45px';
                    handle.style.top = '45px';
                  }
                }

                const dialLabel = document.querySelector('#tag-rotation-dial div');
                if (dialLabel) {
                  dialLabel.textContent = '90°';
                }

                const dialHand = document.querySelector('#tag-rotation-dial svg line[stroke="#fbdf56"]');
                if (dialHand) {
                  dialHand.setAttribute('x2', '38');
                  dialHand.setAttribute('y2', '6');
                }
              } catch (e) { }
            }
          });
        }
      });
      sendWsConfirm(lastEntry.cmdId, currentBrowserNumber);
      return;
    }

    if (lastEntry && lastEntry.id === "31" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          world: 'MAIN',
          func: (angleDeg) => {
            try {
              var container = document.querySelector('.b-photo-editor__container');
              if (!container) return;
              var vue = container.__vue__;
              if (!vue || !vue.$parent || !vue.$parent.$parent) return;
              var canvas = vue.$parent.$parent.canvas;
              if (!canvas) return;
              var objects = canvas.getObjects();
              if (!objects || objects.length < 2) return;
              var target = objects[1];
              if (!target) return;
              target.set({ angle: Number(angleDeg) - 90 });
              var dialHand = document.querySelector('#tag-rotation-dial svg line[stroke="#fbdf56"]');
              if (dialHand) {
                var cx = parseFloat(dialHand.getAttribute('x1') || 38);
                var cy = parseFloat(dialHand.getAttribute('y1') || 38);
                var length = cx - 8;
                var rad = (Number(angleDeg) - 90) * Math.PI / 180;
                var x2 = cx + length * Math.cos(rad);
                var y2 = cy + length * Math.sin(rad);
                dialHand.setAttribute('x2', x2);
                dialHand.setAttribute('y2', y2);
              }
              var dialLabel = document.querySelector('#tag-rotation-dial div');
              if (dialLabel) {
                dialLabel.textContent = Number(angleDeg) + '°';
              }
              if (canvas.renderAll) canvas.renderAll();
            } catch (_) { }
          },
          args: [lastEntry.angleDeg],
        });
        return;
      });
    }

    if (lastEntry && lastEntry.id === "30" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      try {
        const raw = (lastEntry.tag || '').toString();
        const slug = raw.replace(/^@/, '').trim();
        if (!slug) return;

        const injectPassiveInterceptors = (tabId, slug) => {
          try {
            chrome.scripting.executeScript({
              target: { tabId },
              world: 'MAIN',
              func: (slug) => {
                try {
                  if (window.__OFH_PASSIVE_HOOKED) return;
                  window.__OFH_PASSIVE_HOOKED = true;

                  const slugLc = String(slug || '').toLowerCase();
                  const matchesTarget = (url) => {
                    try {
                      const u = String(url || '').toLowerCase();
                      if (!u.includes('/api2/v2/users/')) return false;
                      if (u.includes(`/api2/v2/users/${encodeURIComponent(slugLc)}`)) return true;
                      const tail = u.split('/api2/v2/users/')[1] || '';
                      const base = tail.split(/[?#]/)[0] || '';
                      return /^([a-z0-9_.-]+|\d+)$/.test(base);
                    } catch (_) { return false; }
                  };

                  const formatDate = (iso) => {
                    try {
                      const d = new Date(iso);
                      if (isNaN(d)) return '';
                      const day = d.getUTCDate();
                      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                      const month = monthNames[d.getUTCMonth()];
                      const year = d.getUTCFullYear();
                      const baseDate = `${day} ${month}, ${year}`;

                      const now = new Date();
                      let diffYears = now.getUTCFullYear() - d.getUTCFullYear();
                      let diffMonths = now.getUTCMonth() - d.getUTCMonth();
                      let diffDays = now.getUTCDate() - d.getUTCDate();

                      if (diffDays < 0) {
                        diffMonths--;
                        const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
                        diffDays += prevMonth.getUTCDate();
                      }
                      if (diffMonths < 0) {
                        diffYears--;
                        diffMonths += 12;
                      }

                      const diffParts = [];
                      if (diffYears > 0) diffParts.push(`${diffYears}y`);
                      if (diffMonths > 0) diffParts.push(`${diffMonths}m`);
                      if (diffDays > 0) diffParts.push(`${diffDays}d`);
                      const diffStr = diffParts.length > 0 ? `\n${diffParts.join(' ')}` : '';

                      return baseDate + diffStr;
                    } catch (_) { return ''; }
                  };

                  const showBanner = (text) => {
                    try {
                      if (!text) return;
                      if (window.__OFH_FIRST_SHOWN) return;
                      window.__OFH_FIRST_SHOWN = true;
                      if (!document.getElementById('ofh-josefin-link')) {
                        const link = document.createElement('link');
                        link.id = 'ofh-josefin-link';
                        link.rel = 'stylesheet';
                        link.href = 'https://fonts.googleapis.com/css2?family=Josefin+Sans&display=swap';
                        document.head.appendChild(link);
                      }
                      let el = document.getElementById('ofh-first-published-banner');
                      if (!el) {
                        el = document.createElement('div');
                        el.id = 'ofh-first-published-banner';
                        Object.assign(el.style, {
                          position: 'absolute', top: '60px', left: '50%', transform: 'translateX(-50%)',
                          background: 'rgba(28,28,28,0.92)', color: '#fff', border: '2px solid #000', borderRadius: '10px',
                          padding: '8px 14px', zIndex: '2147483647', fontFamily: '"Josefin Sans", sans-serif', fontSize: '16px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.35)', textAlign: 'center', whiteSpace: 'pre-wrap'
                        });
                        document.body.appendChild(el);
                      }
                      el.textContent = text;
                    } catch (_) { }
                  };

                  try {
                    const originalFetch = window.fetch;
                    window.fetch = async function (...args) {
                      const response = await originalFetch.apply(this, args);
                      try {
                        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                        if (matchesTarget(url)) {
                          const clone = response.clone();
                          clone.text().then(text => {
                            try {
                              const data = JSON.parse(text || '{}');
                              if (data && data.firstPublishedPostDate) {
                                const t = formatDate(data.firstPublishedPostDate);
                                if (t) showBanner(t);
                              }
                            } catch (_) { }
                          }).catch(() => { });
                        }
                      } catch (_) { }
                      return response;
                    };
                  } catch (_) { }

                  try {
                    const XHR = XMLHttpRequest.prototype;
                    const originalOpen = XHR.open;
                    const originalSend = XHR.send;
                    XHR.open = function (method, url) {
                      try { this.__ofhUrl = url; } catch (_) { }
                      return originalOpen.apply(this, arguments);
                    };
                    XHR.send = function (body) {
                      try {
                        const url = this.__ofhUrl || '';
                        if (matchesTarget(url)) {
                          this.addEventListener('load', function () {
                            try {
                              const text = String(this.responseText || '');
                              const data = JSON.parse(text || '{}');
                              if (data && data.firstPublishedPostDate) {
                                const t = formatDate(data.firstPublishedPostDate);
                                if (t) showBanner(t);
                              }
                            } catch (_) { }
                          });
                        }
                      } catch (_) { }
                      return originalSend.apply(this, arguments);
                    };
                  } catch (_) { }
                } catch (_) { }
              },
              args: [slug]
            });
          } catch (_) { }
        };

        chrome.tabs.query({ url: "https://onlyfans.com/*" }, (tabs) => {
          const existing = tabs.find(t => t.url && /https:\/\/onlyfans\.com\/[^\/?#]+/i.test(t.url) && t.url.replace(/\/?[#?].*$/, '').toLowerCase().endsWith(`/${slug.toLowerCase()}`));
          const targetTabIdRef = { value: existing ? existing.id : null };

          if (existing) {
            chrome.tabs.update(existing.id, { active: true }, () => {
              injectPassiveInterceptors(existing.id, slug);
            });
          } else {
            chrome.tabs.create({ url: `https://onlyfans.com/${encodeURIComponent(slug)}` }, (newTab) => {
              if (newTab) targetTabIdRef.value = newTab.id;
              injectPassiveInterceptors(newTab.id, slug);
            });
          }

          const onUpd = (tabId, changeInfo) => {
            if (!changeInfo || (changeInfo.status !== 'loading' && changeInfo.status !== 'complete')) return;
            if (targetTabIdRef.value !== null && tabId !== targetTabIdRef.value) return;
            injectPassiveInterceptors(tabId, slug);
            if (changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpd);
            }
          };
          try { chrome.tabs.onUpdated.addListener(onUpd); } catch (_) { }
        });
      } catch (_) { }
      return;
    }

    if (lastEntry && lastEntry.id === "27" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          world: 'MAIN',
          func: updateMentionPosition,
          args: [lastEntry.x, lastEntry.y],
        });
        return
      })
    }

    if (lastEntry && lastEntry.id === "11" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        if (lastEntry.textInput === "reset") {
          updateTabCounterOnActiveTab(true);
          return;
        } else if (lastEntry.textInput === "hide") {
          timerVisibility = false;
          chrome.storage.local.set({ timerVisibility });
          return;
        }
        else if (lastEntry.textInput === "show") {
          timerVisibility = true;
          chrome.storage.local.set({ timerVisibility });
          return;
        } else if (lastEntry.textInput === "checkActivity") {
          sendActivityInfo(browserType);
          return;
        } else if (lastEntry.textInput === "open") {
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: openNewTab,
          });
          return;
        } else if (lastEntry.textInput === "add") {
          try {
            const selection = (lastEntry.selectedBrowsers || '').trim();
            const selected = String(selection)
              .split(/\s+/)
              .map(s => parseInt(s, 10))
              .filter(n => !isNaN(n));
            let myNumber = 0;
            try { myNumber = parseInt(String(browserType).replace(/\D/g, ''), 10) || 0; } catch (_) { myNumber = 0; }
            if (selected.length === 0 || (myNumber && selected.includes(myNumber))) {
              await collectFromSelectedBrowsers();
            }
          } catch (_) { }
          return;
        } else if (validateDelete(lastEntry.textInput)) {
          const number = extractNumber(lastEntry.textInput);
          new Promise((resolve) => {
            chrome.tabs.query(
              { currentWindow: true, active: true },
              function (tabs) {
                if (!tabs || !tabs[0]) { resolve(0); return; }
                resolve(tabs[0].index);
              },
            );
          }).then((currentTabIndex) => {
            chrome.tabs.query({}, function (tabs) {
              let tabsToClose = [];
              if (number > 0) {
                tabsToClose = tabs
                  .slice(currentTabIndex + 1, currentTabIndex + 1 + number)
                  .filter((tab) => tab.url.startsWith("https://onlyfans.com"))
                  .map((tab) => tab.id);
              } else if (number < 0) {
                tabsToClose = tabs
                  .slice(Math.max(0, currentTabIndex + number), currentTabIndex)
                  .filter((tab) => tab.url.startsWith("https://onlyfans.com"))
                  .map((tab) => tab.id);
              } else if (number === 0 && tabs.length > 1) {
                if (
                  tabs[currentTabIndex].url.startsWith("https://onlyfans.com")
                ) {
                  chrome.tabs.remove(tabs[currentTabIndex].id);
                }
                return;
              }

              if (tabsToClose.length > 0) {
                chrome.tabs.remove(tabsToClose);
              }
            });
          });
        } else if (validateSwitch(lastEntry.textInput)) {
          const number = extractNumber(lastEntry.textInput);
          new Promise((resolve) => {
            chrome.tabs.query(
              { currentWindow: true, active: true },
              function (tabs) {
                if (!tabs || !tabs[0]) { resolve(0); return; }
                resolve(tabs[0].index);
              },
            );
          }).then((currentTabIndex) => {
            chrome.tabs.query({}, function (tabs) {
              let targetIndex =
                number > 0
                  ? Math.min(tabs.length - 1, currentTabIndex + number)
                  : number < 0
                    ? Math.max(0, currentTabIndex + number)
                    : tabs.length > 1
                      ? 0
                      : currentTabIndex;
              while (
                targetIndex < tabs.length &&
                !tabs[targetIndex].url.startsWith("https://onlyfans.com")
              ) {
                targetIndex++;
              }
              if (targetIndex < tabs.length) {
                chrome.tabs.update(tabs[targetIndex].id, { active: true });
              }
            });
          });
        } else {
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: clickOnNewPost,
          });
        }
      });
      return
    }

    if (lastEntry && lastEntry.id === "12" && browserType !== "") {
      currentCmdId = lastEntry.cmdId;
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      const text = lastEntry.textInput;
      let exp = lastEntry.exp;
      let txt = lastEntry.txt;
      let pht = lastEntry.pht;
      let addPhoto = lastEntry.addPhoto;
      let imageUrl = "-";
      let index = 0;
      let totalIndex = 0;
      let repeat = lastEntry.repeat;
      if (addPhoto) {
        index = lastEntry.index;
        totalIndex = lastEntry.totalIndex;
        let pattern = text.match(/@[a-zA-Z0-9._-]+/)[0];
        pattern = pattern.substring(1);
        if (pattern.endsWith(".")) {
          pattern = pattern.replace(/\.*$/, "");
        }
        pattern = pattern.replace(/\./g, "-");
        async function findCorrectImageUrl(pattern) {
          const extensions = ["png", "gif", "mp4"];
          for (const ext of extensions) {
            const url = chrome.runtime.getURL(
              `server/crop/images/${pattern}.${ext}`,
            );
            try {
              const response = await fetch(url, { method: "HEAD" });
              if (response.ok) {
                return url;
              }
            } catch (e) {
              continue;
            }
          }

          return null;
        }

        imageUrl = await findCorrectImageUrl(pattern);
        chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
          if (!currentWindow || !currentWindow.tabs) return;
          const activeTab = currentWindow.tabs.find((tab) => tab.active);
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: createBrowser,
            args: [browserType, index, totalIndex, repeat],
          });
        });
      }

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);

        if ((!pht || !addPhoto) && activeTab) {
          const { pht: phtIds = [] } = await chrome.storage.local.get('pht');
          const arr = Array.isArray(phtIds) ? phtIds : [];
          const id = Number(activeTab.id);
          if (!arr.some((x) => Number(x) === id)) {
            await chrome.storage.local.set({ pht: [...arr, id] });
          }
        }

        await waitForTabAndExecute(
          activeTab.id,
          addTextToPost,
          [text, imageUrl, browserType, exp, txt, pht, lastEntry.blacklistTag, lastEntry.modelTags || [], lastEntry.timeInput || null, lastEntry.isApart || false, currentCmdId, currentBrowserNumber]
        );
      });
      return
    }


    if (lastEntry && lastEntry.id === "14" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: openNewTab,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "15" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pressBind,
          args: [activeTab.id],
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "19" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);

        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (tabId) => { window.__OFH_CURRENT_TAB_ID__ = tabId; },
          args: [activeTab.id]
        });

        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pressBindFix,
          args: [activeTab, browserType, lastEntry.singleTabMode || false],
        });

        if (lastEntry.singleTabMode) {
          let hasNavigatedAway = false;
          let confirmed = false;

          const finish = () => {
            if (confirmed) return;
            confirmed = true;
            chrome.tabs.onUpdated.removeListener(listener);

            closedTabsCount++;
            lastClosedTime = new Date();
            updateTabCounterOnActiveTab(false);

            sendWsConfirm(lastEntry.cmdId, currentBrowserNumber);
          };

          const listener = (tabId, changeInfo, tab) => {
            if (tabId !== activeTab.id) return;

            if (changeInfo.url) {
              if (!changeInfo.url.includes('/posts/create')) {
                hasNavigatedAway = true;
              } else if (hasNavigatedAway && changeInfo.url.includes('/posts/create')) {
                // URL is back on /posts/create — now wait for full load to inject hiding
              }
            }

            if (hasNavigatedAway && changeInfo.status === 'complete' &&
              tab && tab.url && tab.url.includes('/posts/create')) {
              // Inject element-hiding script after page fully loaded
              chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: () => {
                  const selector1 = "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button.m-btn-clear-draft.g-btn.m-border.m-rounded.m-sm-width.m-reset-width";
                  const selector2 = "#content > div.l-wrapper > div > div > div > div > div.stories-list.g-negative-sides-gaps";
                  const observer = new MutationObserver(() => {
                    const element1 = document.querySelector(selector1);
                    if (element1) {
                      element1.click();
                      element1.style.display = "none";
                    }
                    const element2 = document.querySelector(selector2);
                    if (element2) {
                      element2.parentNode.removeChild(element2);
                    }
                    if (element1 && element2) {
                      observer.disconnect();
                    }
                  });
                  observer.observe(document, { childList: true, subtree: true });
                  setTimeout(() => observer.disconnect(), 10000);
                }
              }).catch(() => { });
              finish();
            }
          };

          chrome.tabs.onUpdated.addListener(listener);

        } else {
          sendWsConfirm(lastEntry.cmdId, currentBrowserNumber);
        }
      });
      return
    }

    if (lastEntry && lastEntry.id === "100" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: instantPostOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "101" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: instantPostOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "102" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: fakeColorsOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "103" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: fakeColorsOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "104" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const allTabs = currentWindow.tabs;
        const activeTab = allTabs.find((tab) => tab.active);

        if (activeTab) {
          allTabs.forEach(async (tab) => {
            if (tab.index >= activeTab.index) {
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: toggleColors,
                args: [true]
              });
            }
          });
        }
      });
      return
    }

    if (lastEntry && lastEntry.id === "20" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        if (!currentWindow || !currentWindow.tabs) return;
        const previousTab = currentWindow.tabs.find(
          (tab) => tab.index === activeTab.index - 1,
        );
        await waitForTabAndExecute(
          activeTab.id,
          rememberId,
          [activeTab, previousTab]
        );
      });
      return;
    }

    if (lastEntry && lastEntry.id === "21" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.storage.local.get(
        ["savedTabId", "deleteTabId", "autoRestartEnabled"],
        async function (result) {
          if (result.savedTabId) {
            chrome.tabs.update(
              result.savedTabId,
              { active: true },
              async () => {
                chrome.windows.getCurrent(
                  { populate: true },
                  async (currentWindow) => {
                    const allTabs = currentWindow.tabs;
                    const activeTab = allTabs.find((tab) => tab.active);

                    if (activeTab) {
                      if (isDelete) {
                        const tabsToClose = allTabs.filter(
                          (tab) => tab.index > activeTab.index,
                        );

                        for (const tab of tabsToClose) {
                          await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                              const button =
                                document.querySelector("#split-button1");
                              if (button) {
                                const rect = button.getBoundingClientRect();
                                const leftPartX = rect.left + 5;
                                const leftPartY = rect.top + rect.height / 2;

                                button.dispatchEvent(
                                  new MouseEvent("click", {
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: leftPartX,
                                    clientY: leftPartY,
                                  }),
                                );
                              }
                            },
                          });
                        }
                        await new Promise((resolve) =>
                          setTimeout(resolve, 2000),
                        );

                        const tabIdsToClose = tabsToClose.map((tab) => tab.id);
                        if (tabIdsToClose.length > 0) {
                          chrome.tabs.remove(tabIdsToClose);
                        }

                        await executeScriptIfValid(activeTab, {
                          target: { tabId: activeTab.id },
                          func: clearPosts,
                        });
                      } else if (result.autoRestartEnabled && !lastEntry.skipAutoRestart) {
                        setTimeout(() => {
                          chrome.scripting.executeScript({
                            target: { tabId: activeTab.id },
                            func: () => {
                              const autoButton = document.getElementById("autopost-button");
                              if (autoButton) {
                                chrome.runtime.sendMessage({ action: "clickAndMove" });
                              }
                            }
                          });
                        }, 2000);
                      }

                      const fakeCheckedResult =
                        await chrome.storage.local.get("fakeChecked");

                      if (fakeCheckedResult.fakeChecked === true) {
                        allTabs.forEach(async (tab) => {
                          if (tab.index >= activeTab.index) {
                            chrome.scripting.executeScript({
                              target: { tabId: tab.id },
                              func: toggleColors,
                              args: [false]
                            });
                          }
                        });
                      }
                    }
                  },
                );
              },
            );
          }

          if (result.deleteTabId) {
            chrome.tabs.remove(result.deleteTabId);
          }
        },
      );
      return
    }

    if (lastEntry && lastEntry.id === "22" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0]) return;
        const currentTabId = tabs[0].id;
        chrome.tabs.query({ url: "https://onlyfans.com/*" }, function (matchingTabs) {
          if (matchingTabs.length > 1) {
            const firstMatchingTab = matchingTabs[0];
            if (currentTabId !== firstMatchingTab.id) {
              chrome.tabs.update(firstMatchingTab.id, { active: true }, () => {
                setTimeout(() => {
                  chrome.tabs.update(currentTabId, { active: true });
                }, 1000);
                chrome.scripting.executeScript({
                  target: { tabId: firstMatchingTab.id },
                  func: checkAndCloseTab,
                  args: [firstMatchingTab.id],
                });
              });
            }
          }
        });
      });
      return;
    }

    if (lastEntry && lastEntry.id === "33" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        if (activeTab && lastEntry.url) {
          chrome.tabs.update(activeTab.id, { url: lastEntry.url });

          let confirmed = false;
          const finish = (tabId) => {
            if (confirmed) return;
            confirmed = true;
            chrome.tabs.onUpdated.removeListener(listener);

            // Inject element-hiding script (same as multi-tab openNewTab flow)
            const targetTabId = tabId || activeTab.id;
            chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              func: () => {
                const selector1 = "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button.m-btn-clear-draft.g-btn.m-border.m-rounded.m-sm-width.m-reset-width";
                const selector2 = "#content > div.l-wrapper > div > div > div > div > div.stories-list.g-negative-sides-gaps";
                const observer = new MutationObserver(() => {
                  const element1 = document.querySelector(selector1);
                  if (element1) {
                    element1.click();
                    element1.style.display = "none";
                  }
                  const element2 = document.querySelector(selector2);
                  if (element2) {
                    element2.parentNode.removeChild(element2);
                  }
                  if (element1 && element2) {
                    observer.disconnect();
                  }
                });
                observer.observe(document, { childList: true, subtree: true });
                setTimeout(() => observer.disconnect(), 10000);
              }
            }).catch(() => { });

            sendWsConfirm(lastEntry.cmdId, currentBrowserNumber);
          };

          const listener = (tabId, changeInfo, tab) => {
            if (tabId === activeTab.id && changeInfo.status === 'complete') {
              finish(tabId);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          setTimeout(() => finish(activeTab.id), 15000); // safety fallback
        } else {
          sendWsConfirm(lastEntry.cmdId, currentBrowserNumber);
        }
      });
      return;
    }

    if (lastEntry && lastEntry.id === "32" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['singleStop'], resolve);
      });

      if (result.singleStop) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
          if (!activeTabs || !activeTabs[0]) return;
          const currentTabId = activeTabs[0].id;
          chrome.tabs.query({ url: "https://onlyfans.com/*" }, function (ofTabs) {
            const tabsToClose = ofTabs
              .filter(tab => tab.id !== currentTabId)
              .map(tab => tab.id);

            if (tabsToClose.length > 0) {
              chrome.tabs.remove(tabsToClose);
            }
          });
        });
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
          if (!tabs || !tabs[0]) return;
          const currentTabId = tabs[0].id;
          chrome.tabs.query({ url: "https://onlyfans.com/*" }, async function (matchingTabs) {
            const otherTabs = matchingTabs.filter(tab => tab.id !== currentTabId);
            if (otherTabs.length > 0) {
              for (const tab of otherTabs) {
                await new Promise(resolve => {
                  chrome.tabs.update(tab.id, { active: true }, () => {
                    chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: checkAndCloseTab,
                      args: [tab.id],
                    }).catch(() => { });
                    setTimeout(resolve, 500);
                  });
                });
              }
              chrome.tabs.update(currentTabId, { active: true });
            }
          });
        });
      }
      return;
    }

    if (lastEntry && lastEntry.id === "16" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pasteBind,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "116" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      if (lastEntry.targetBrowser && (lastEntry.targetBrowser === browserType || lastEntry.targetBrowser === "all")) {
        chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
          if (!currentWindow || !currentWindow.tabs) return;
          const activeTab = currentWindow.tabs.find((tab) => tab.active);
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: fetchAndPasteBind,
          });
        });
      }
      return;
    }

    if (lastEntry && lastEntry.id === "117" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: stopOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "118" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: stopOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "18" && browserType !== "") {
      if (shouldSkipDuplicate(lastEntry, browserType)) return;

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        if (!currentWindow || !currentWindow.tabs) return;
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: clearPhotoBindAll,
        });
      });
      return
    }

    return
  } catch (error) {
    console.error("Error: ", error);
  }
}

async function setBind(tab, DELAY_GREEN_BUTTON) {

  if (tab.url.startsWith("https://onlyfans.com")) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function (DELAY_GREEN_BUTTON) {

        function animateButton(button, buttonText, callback) {
          button.style.transform = "scaleX(0.9)";
          buttonText.style.transform = "scaleX(1.1)";
          setTimeout(() => {
            button.style.transform = "scaleX(1)";
            buttonText.style.transform = "scaleX(1)";
            if (callback) {
              callback();
            }
          }, 250);
        }

        async function makeRequest(url, delay) {
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ delay }),
            });

            if (response.ok) {
              console.log("Data sent successfully to the server");
            } else {
              console.error("Failed to send data to the server");
            }
          } catch (error) {
            console.error("Error:", error);
          }
        }

        async function singleStop() {
          const result = await chrome.storage.local.get(['singleStop']);
          const newState = !result.singleStop;
          await chrome.storage.local.set({ singleStop: newState });
        }

        async function syncStopRequestOn() {
          await makeRequest("http://localhost:3000/syncStop-on");
        }

        async function syncStopRequestOff() {
          await makeRequest("http://localhost:3000/syncStop-off");
        }

        async function clearRequest() {
          await makeRequest("http://localhost:3000/clearPhotoAll", 0);
        }

        async function bindRequest() {
          await makeRequest("http://localhost:3000/bind", DELAY_GREEN_BUTTON);
        }

        async function stopRequest() {
          await makeRequest("http://localhost:3000/stopPosting", 0);
        }

        async function quickSwitch() {
          await makeRequest("http://localhost:3000/quickSwitch", 0);
        }

        async function holdSwitch() {
          await makeRequest("http://localhost:3000/holdSwitch", 0);
        }

        async function quickClear() {
          await makeRequest("http://localhost:3000/quickClear", 0);
        }

        async function quickReload() {
          await makeRequest("http://localhost:3000/quickReload", 0);
        }

        async function quickStories() {
          try {
            let picker = document.getElementById('story-color-picker');
            if (!picker) {
              const colors = [
                'rgb(255, 255, 255)',
                'rgb(0, 0, 0)',
                'rgb(105, 129, 140)',
                'rgb(255, 81, 220)',
                'rgb(255, 64, 129)',
                'rgb(250, 50, 64)',
                'rgb(255, 128, 64)',
                'rgb(252, 168, 0)',
                'rgb(112, 207, 39)',
                'rgb(0, 200, 100)',
                'rgb(0, 177, 204)',
                'rgb(33, 150, 243)',
                'rgb(121, 83, 245)',
                'rgb(168, 50, 191)'
              ];

              const state = {
                colors,
                perColorBadges: Array(colors.length).fill(null).map(() => []),
                globalOrder: [],
              };
              window.__storyPickerState = state;

              picker = document.createElement('div');
              picker.id = 'story-color-picker';
              picker.style.position = 'fixed';
              picker.style.left = '50%';
              picker.style.transform = 'translateX(-50%)';
              picker.style.bottom = '145px';
              picker.style.zIndex = '100000';
              picker.style.display = 'flex';
              picker.style.gap = '0.5px';
              picker.style.alignItems = 'flex-end';

              const badgeBaseBottom = 38;
              const badgeStep = 30;
              const highlightShadow = '0 0 0 2px #FFD700 inset, 0 0 8px rgba(255,215,0,0.7)';

              function renumberAll() {
                state.globalOrder.forEach((entry, idx) => {
                  entry.el.textContent = String(idx + 1);
                });
              }

              function repositionColor(ci) {
                const arr = state.perColorBadges[ci] || [];
                for (let j = 0; j < arr.length; j++) {
                  const badge = arr[j];
                  badge.style.bottom = `${badgeBaseBottom + j * badgeStep}px`;
                }
              }

              colors.forEach((color, index) => {
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';
                wrapper.style.width = '34px';
                wrapper.style.height = '34px';
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.justifyContent = 'center';

                const baseDot = document.createElement('div');
                baseDot.style.width = '30px';
                baseDot.style.height = '30px';
                baseDot.style.borderRadius = '50%';
                baseDot.style.backgroundColor = color;
                baseDot.style.cursor = 'pointer';
                baseDot.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.35) inset, 0 1px 2px rgba(0,0,0,0.25)';
                baseDot.style.transition = 'box-shadow 0.2s ease';
                const baseDefaultShadow = baseDot.style.boxShadow;
                baseDot.addEventListener('mouseenter', () => {
                  baseDot.style.boxShadow = highlightShadow;
                });
                baseDot.addEventListener('mouseleave', () => {
                  baseDot.style.boxShadow = baseDefaultShadow;
                });

                baseDot.addEventListener('click', () => {
                  const badge = document.createElement('div');
                  badge.textContent = '?';
                  badge.style.position = 'absolute';
                  const positionIndex = (state.perColorBadges[index] || []).length;
                  badge.style.bottom = `${badgeBaseBottom + positionIndex * badgeStep}px`;
                  badge.style.left = '50%';
                  badge.style.transform = 'translateX(-50%)';
                  badge.style.width = '24px';
                  badge.style.height = '24px';
                  badge.style.borderRadius = '50%';
                  badge.style.background = color;
                  badge.style.color = (color === 'rgb(255, 255, 255)') ? '#000' : '#fff';
                  badge.style.fontSize = '12px';
                  badge.style.fontFamily = '"Josefin Sans", sans-serif';
                  badge.style.display = 'flex';
                  badge.style.alignItems = 'center';
                  badge.style.justifyContent = 'center';
                  badge.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.35) inset, 0 1px 2px rgba(0,0,0,0.25)';
                  badge.style.transition = 'box-shadow 0.2s ease';
                  badge.style.cursor = 'default';
                  badge.setAttribute('data-color-index', String(index));

                  const badgeDefaultShadow = badge.style.boxShadow;
                  badge.addEventListener('mouseenter', () => {
                    badge.style.boxShadow = highlightShadow;
                  });
                  badge.addEventListener('mouseleave', () => {
                    badge.style.boxShadow = badgeDefaultShadow;
                  });

                  badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    const ci = index;
                    badge.remove();
                    const arr = state.perColorBadges[ci];
                    const arrIdx = arr ? arr.indexOf(badge) : -1;
                    if (arr && arrIdx >= 0) arr.splice(arrIdx, 1);
                    const goIdx = state.globalOrder.findIndex(entry => entry.el === badge);
                    if (goIdx >= 0) state.globalOrder.splice(goIdx, 1);
                    repositionColor(ci);
                    renumberAll();
                    updateStoriesDoneIconFromState();
                  });

                  wrapper.appendChild(badge);
                  state.perColorBadges[index].push(badge);
                  state.globalOrder.push({ colorIndex: index, el: badge });
                  renumberAll();
                  updateStoriesDoneIconFromState();
                });

                wrapper.appendChild(baseDot);
                picker.appendChild(wrapper);
              });

              document.body.appendChild(picker);
              try { chrome.storage.local.set({ storiesMenuOpen: true }); } catch (_) { }
              updateStoriesDoneIconFromState();
            } else {
              const willShow = (picker.style.display === 'none');
              picker.style.display = willShow ? 'flex' : 'none';
              try { chrome.storage.local.set({ storiesMenuOpen: !!willShow }); } catch (_) { }
              updateStoriesDoneIconFromState();
            }
          } catch (e) {
            console.error('stories-button error:', e);
          }
        }

        async function quickStoriesStart() {
          const picker = document.getElementById('story-color-picker');
          const state = window.__storyPickerState || {};
          const colors = Array.isArray(state.colors) ? state.colors : [];
          const perColorCounts = (state.perColorBadges || []).map(arr => (Array.isArray(arr) ? arr.length : 0));
          const selections = colors.map((color, idx) => ({ color, count: perColorCounts[idx] || 0 }))
            .filter(s => s.count > 0);
          const sequence = (state.globalOrder || []).map(entry => colors[entry.colorIndex]).filter(Boolean);
          await fetch("http://localhost:3000/quickStories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selections, sequence })
          });
          if (picker) picker.remove();
          delete window.__storyPickerState;
          chrome.storage.local.set({ storiesStop: false, storiesRunning: true, storiesMenuOpen: false }, () => {
            setStoriesDoneIcon('stop');
          });
        }

        async function quickStoriesDone() {
          let switchDelay = 3000;
          let screenshotDelay = 1000;
          let screenshotEnabled = true;
          try {
            const data = await fetch('http://localhost:3000/stories-settings').then(r => r.json());
            switchDelay = data.switchDelay !== undefined ? parseInt(data.switchDelay) : 3000;
            screenshotDelay = data.screenshotDelay !== undefined ? parseInt(data.screenshotDelay) : 1000;
            screenshotEnabled = data.screenshotEnabled !== undefined ? data.screenshotEnabled : true;
          } catch (_) { }

          await fetch("http://localhost:3000/quickStoriesDone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              switchDelay: switchDelay,
              screenshotDelay: screenshotDelay,
              screenshotEnabled: screenshotEnabled
            })
          });
        }

        function createStoriesSettingsMenu() {
          if (document.getElementById('stories-settings-menu')) return;

          const menu = document.createElement('div');
          menu.id = 'stories-settings-menu';
          Object.assign(menu.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(28, 28, 28, 0.95)',
            border: '2px solid #000',
            borderRadius: '10px',
            padding: '20px',
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            color: 'white',
            fontFamily: "'Josefin Sans', sans-serif",
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            minWidth: '280px'
          });

          const title = document.createElement('div');
          title.textContent = 'Stories Settings';
          title.style.textAlign = 'center';
          title.style.fontSize = '18px';
          title.style.marginBottom = '5px';
          menu.appendChild(title);

          function createCheckbox(labelText, storageKey, defaultValue, { useServer = false } = {}) {
            const container = document.createElement('div');
            Object.assign(container.style, {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginBottom: '5px'
            });

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.fontSize = '15px';
            label.style.color = '#fff';
            label.style.cursor = 'pointer';
            label.style.margin = '0';
            label.style.lineHeight = '1';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.dataset.serverKey = storageKey;
            Object.assign(input.style, {
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              accentColor: 'rgb(221, 109, 85)',
              margin: '0'
            });

            label.addEventListener('click', () => input.click());

            if (useServer) {
              // Value will be set by the caller after fetching from server
              input.checked = defaultValue;
              input.addEventListener('change', () => {
                fetch('http://localhost:3000/stories-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ [storageKey]: input.checked })
                }).catch(() => { });
              });
            } else {
              chrome.storage.local.get([storageKey], (res) => {
                input.checked = res[storageKey] !== undefined ? res[storageKey] : defaultValue;
              });
              input.addEventListener('change', () => {
                chrome.storage.local.set({ [storageKey]: input.checked });
              });
            }

            container.appendChild(label);
            container.appendChild(input);
            return container;
          }

          function createInput(labelText, storageKey, defaultValue, { useServer = false } = {}) {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.fontSize = '14px';
            label.style.color = '#ccc';

            const input = document.createElement('input');
            input.type = 'number';
            input.dataset.serverKey = storageKey;
            Object.assign(input.style, {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid #444',
              borderRadius: '5px',
              padding: '8px',
              color: 'white',
              fontFamily: "'Josefin Sans', sans-serif",
              outline: 'none'
            });

            if (useServer) {
              input.value = defaultValue;
              input.addEventListener('change', () => {
                fetch('http://localhost:3000/stories-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ [storageKey]: parseInt(input.value) || 0 })
                }).catch(() => { });
              });
            } else {
              chrome.storage.local.get([storageKey], (res) => {
                input.value = res[storageKey] !== undefined ? res[storageKey] : defaultValue;
              });
              input.addEventListener('change', () => {
                chrome.storage.local.set({ [storageKey]: parseInt(input.value) || 0 });
              });
            }

            container.appendChild(label);
            container.appendChild(input);
            return container;
          }

          menu.appendChild(createCheckbox('Enable stories', 'storiesEnabled', true));
          menu.appendChild(createCheckbox('Sync Manual Canvas', 'storiesSyncCanvasEnabled', true));
          menu.appendChild(createCheckbox('Enable Screenshots', 'screenshotEnabled', true, { useServer: true }));
          menu.appendChild(createInput('Screenshot Delay (ms)', 'screenshotDelay', 1000, { useServer: true }));
          menu.appendChild(createInput('Switch Delay (ms)', 'switchDelay', 3000, { useServer: true }));

          fetch('http://localhost:3000/stories-settings')
            .then(r => r.json())
            .then(data => {
              const ssEnabledEl = menu.querySelector('[data-server-key="screenshotEnabled"]');
              const ssDelayEl = menu.querySelector('[data-server-key="screenshotDelay"]');
              const swDelayEl = menu.querySelector('[data-server-key="switchDelay"]');
              if (ssEnabledEl) ssEnabledEl.checked = data.screenshotEnabled !== undefined ? data.screenshotEnabled : true;
              if (ssDelayEl) ssDelayEl.value = data.screenshotDelay !== undefined ? data.screenshotDelay : 1000;
              if (swDelayEl) swDelayEl.value = data.switchDelay !== undefined ? data.switchDelay : 3000;
            })
            .catch(() => { });

          const closeBtn = document.createElement('button');
          closeBtn.textContent = 'Close';
          Object.assign(closeBtn.style, {
            marginTop: '10px',
            padding: '8px',
            backgroundColor: 'rgb(221, 109, 85)',
            border: 'none',
            borderRadius: '5px',
            color: 'white',
            cursor: 'pointer',
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '14px',
            transition: 'background 0.3s'
          });

          closeBtn.onmouseover = () => closeBtn.style.backgroundColor = '#e38571';
          closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'rgb(221, 109, 85)';

          closeBtn.addEventListener('click', () => {
            menu.remove();
          });

          menu.appendChild(closeBtn);
          document.body.appendChild(menu);

          const clickOutside = (e) => {
            if (!menu.contains(e.target) && e.target !== menu) {
              menu.remove();
              document.removeEventListener('mousedown', clickOutside);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', clickOutside), 0);
        }

        async function quickStoriesStop() {
          await makeRequest("http://localhost:3000/quickStoriesStop", 0);
          chrome.storage.local.set({ storiesStop: true }, () => {
          });
        }

        function createSingleTabSettingsMenu() {
          if (document.getElementById('single-tab-settings-menu')) return;

          const menu = document.createElement('div');
          menu.id = 'single-tab-settings-menu';
          Object.assign(menu.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(28, 28, 28, 0.95)',
            border: '2px solid #000',
            borderRadius: '10px',
            padding: '20px',
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            color: 'white',
            fontFamily: "'Josefin Sans', sans-serif",
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            minWidth: '280px'
          });

          const title = document.createElement('div');
          title.textContent = 'Single Tab Settings';
          title.style.textAlign = 'center';
          title.style.fontSize = '18px';
          title.style.marginBottom = '5px';
          menu.appendChild(title);

          function createInput(labelText, storageKey, defaultValue) {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.fontSize = '14px';
            label.style.color = '#ccc';

            const input = document.createElement('input');
            input.type = 'number';
            Object.assign(input.style, {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid #444',
              borderRadius: '5px',
              padding: '8px',
              color: 'white',
              fontFamily: "'Josefin Sans', sans-serif",
              outline: 'none'
            });

            chrome.storage.local.get([storageKey], (res) => {
              input.value = res[storageKey] !== undefined ? res[storageKey] : defaultValue;
            });

            input.addEventListener('change', () => {
              const val = parseInt(input.value) || 0;
              chrome.storage.local.set({ [storageKey]: val }, () => {
                chrome.storage.local.get(['singleTabScreenshotDelay', 'singleTabFakeButtonDelay'], (allRes) => {
                  fetch('http://localhost:3000/updateSingleTabSettings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      screenshotDelay: allRes.singleTabScreenshotDelay !== undefined ? allRes.singleTabScreenshotDelay : 5000,
                      fakeButtonDelay: allRes.singleTabFakeButtonDelay !== undefined ? allRes.singleTabFakeButtonDelay : 3000
                    })
                  }).catch(() => { });
                });
              });
            });

            container.appendChild(label);
            container.appendChild(input);
            return container;
          }

          menu.appendChild(createInput('Fake Button Delay (ms)', 'singleTabFakeButtonDelay', 3000));
          menu.appendChild(createInput('Screenshot Delay (ms)', 'singleTabScreenshotDelay', 5000));

          const closeBtn = document.createElement('button');
          closeBtn.textContent = 'Close';
          Object.assign(closeBtn.style, {
            marginTop: '10px',
            padding: '8px',
            backgroundColor: 'rgb(221, 109, 85)',
            border: 'none',
            borderRadius: '5px',
            color: 'white',
            cursor: 'pointer',
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '14px',
            transition: 'background 0.3s'
          });

          closeBtn.onmouseover = () => closeBtn.style.backgroundColor = '#e38571';
          closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'rgb(221, 109, 85)';

          closeBtn.addEventListener('click', () => {
            menu.remove();
          });

          menu.appendChild(closeBtn);
          document.body.appendChild(menu);

          const clickOutside = (e) => {
            if (!menu.contains(e.target) && e.target !== menu) {
              menu.remove();
              document.removeEventListener('mousedown', clickOutside);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', clickOutside), 0);
        }

        async function openGlobalScreenshotMenu() {
          if (document.getElementById('global-ss-menu')) return;

          const menu = document.createElement('div');
          menu.id = 'global-ss-menu';
          Object.assign(menu.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(28, 28, 28, 0.95)',
            border: '2px solid #000',
            borderRadius: '10px',
            padding: '20px',
            zIndex: '2147483647',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            color: 'white',
            fontFamily: "'Josefin Sans', sans-serif",
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            minWidth: '280px'
          });

          const title = document.createElement('div');
          title.textContent = 'Auto Screenshot Settings';
          title.style.textAlign = 'center';
          title.style.fontSize = '18px';
          title.style.marginBottom = '5px';
          menu.appendChild(title);

          const fields = [
            { label: 'SS Delay (ms)', key: 'ss_delay' },
            { label: 'Lightshot Delay (ms)', key: 'lightshot_delay' },
            { label: 'TG Delay (ms)', key: 'tg_delay' }
          ];

          let config = {};
          try {
            const response = await fetch('http://localhost:3000/ss-config');
            config = await response.json();
          } catch (e) { }

          const inputs = {};

          function createInput(labelText, key, defaultValue) {
            const container = document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '5px';

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.fontSize = '14px';
            label.style.color = '#ccc';

            const input = document.createElement('input');
            input.type = 'number';
            Object.assign(input.style, {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid #444',
              borderRadius: '5px',
              padding: '8px',
              color: 'white',
              fontFamily: "'Josefin Sans', sans-serif",
              outline: 'none'
            });
            input.value = config[key] !== undefined ? config[key] : defaultValue;

            inputs[key] = input;

            input.addEventListener('change', () => {
              const val = parseInt(input.value) || 0;
              config[key] = val;
              fetch('http://localhost:3000/ss-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
              }).catch(() => { });
            });

            container.appendChild(label);
            container.appendChild(input);
            return container;
          }

          fields.forEach(f => {
            menu.appendChild(createInput(f.label, f.key, 0));
          });

          const closeBtn = document.createElement('button');
          closeBtn.textContent = 'Close';
          Object.assign(closeBtn.style, {
            marginTop: '10px',
            padding: '8px',
            backgroundColor: 'rgb(221, 109, 85)',
            border: 'none',
            borderRadius: '5px',
            color: 'white',
            cursor: 'pointer',
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '14px',
            transition: 'background 0.3s'
          });

          closeBtn.onmouseover = () => closeBtn.style.backgroundColor = '#e38571';
          closeBtn.onmouseout = () => closeBtn.style.backgroundColor = 'rgb(221, 109, 85)';

          closeBtn.addEventListener('click', () => menu.remove());

          menu.appendChild(closeBtn);
          document.body.appendChild(menu);

          const clickOutside = (e) => {
            if (!menu.contains(e.target) && e.target !== menu) {
              menu.remove();
              document.removeEventListener('mousedown', clickOutside);
            }
          };
          setTimeout(() => document.addEventListener('mousedown', clickOutside), 0);
        }

        async function handleStoriesAction() {
          try {
            const picker = document.getElementById('story-color-picker');
            const menuOpen = !!(picker && picker.style.display !== 'none');

            if (menuOpen) {
              await quickStoriesStart();
              return;
            }

            const res = await chrome.storage.local.get(['storiesRunning']);

            if (res && res.storiesRunning) {
              await chrome.storage.local.set({ storiesRunning: false, storiesMenuOpen: false });
              setStoriesDoneIcon('check');
              await quickStoriesStop();
            } else {
              await quickStoriesDone();
            }
          } catch (e) {
            console.error('stories-done-button error:', e);
          }
        }

        function setStoriesDoneIcon(mode) {
          try {
            const btn = document.getElementById('stories-done-button');
            if (!btn) return;
            const startSvg = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 5L19 12L8 19V5Z" fill="white"/>
              </svg>`;
            const checkSvg = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 14L8.23309 16.4248C8.66178 16.7463 9.26772 16.6728 9.60705 16.2581L18 6" stroke="white" stroke-width="2" stroke-linecap="round"/>
              </svg>`;
            const stopSvg = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="6" y="6" width="12" height="12" fill="white" rx="1.5"/>
              </svg>`;
            if (mode === 'start') btn.innerHTML = startSvg;
            else if (mode === 'stop') btn.innerHTML = stopSvg;
            else btn.innerHTML = checkSvg;
          } catch (_) { }
        }

        function updateStoriesDoneIconFromState() {
          try {
            chrome.storage.local.get(['storiesRunning', 'storiesMenuOpen'], (res) => {
              if (res && res.storiesRunning) { setStoriesDoneIcon('stop'); return; }
              if (res && res.storiesMenuOpen) { setStoriesDoneIcon('start'); return; }
              setStoriesDoneIcon('check');
            });
          } catch (_) { }
        }

        async function bindFixRequest() {
          await makeRequest("http://localhost:3000/bindFix", 0);
        }

        async function pasteRequest() {
          await makeRequest("http://localhost:3000/paste", 0);
        }

        async function fakeRequest() {
          await makeRequest("http://localhost:3000/fake", 0);
        }

        async function updatePostIndicator(postIndicatorButton) {
          const postStorageResult = await chrome.storage.local.get([
            "postChecked",
          ]);
          if (postStorageResult.postChecked === true) {
            postIndicatorButton.style.background = "#2D9B37";
          } else {
            postIndicatorButton.style.background = "#DD6D55";
          }
        }

        async function updateFakeIndicator(fakeIndicatorButton) {
          const fakeStorageResult = await chrome.storage.local.get([
            "fakeChecked",
          ]);
          if (fakeStorageResult.fakeChecked === true) {
            fakeIndicatorButton.style.background = "#6E8C6E";
          } else {
            fakeIndicatorButton.style.background = "#8C6E6E";
          }
        }

        async function togglePostIndicator() {
          const postStorageResult = await chrome.storage.local.get([
            "postChecked",
          ]);
          const currentPostChecked = postStorageResult.postChecked;

          if (currentPostChecked === true) {
            await makeRequest("http://localhost:3000/post-off", 0);
          } else {
            await makeRequest("http://localhost:3000/post-on", 0);
          }
        }

        async function toggleFakeIndicator() {
          const fakeStorageResult = await chrome.storage.local.get([
            "fakeChecked",
          ]);
          const currentFakeChecked = fakeStorageResult.fakeChecked;

          if (currentFakeChecked === true) {
            await makeRequest("http://localhost:3000/fake-off", 0);
          } else {
            await makeRequest("http://localhost:3000/fake-on", 0);
          }
        }

        function createFakeColorsButton(container) {
          const fakeColorsBtn = document.createElement("button");
          fakeColorsBtn.style.position = "absolute";
          fakeColorsBtn.style.right = "2.5%";
          fakeColorsBtn.style.background = "grey";
          fakeColorsBtn.style.width = "25%";
          fakeColorsBtn.style.border = "none";
          fakeColorsBtn.style.display = "flex";
          fakeColorsBtn.style.justifyContent = "center";
          fakeColorsBtn.style.alignItems = "center";
          fakeColorsBtn.style.cursor = "pointer";
          fakeColorsBtn.style.padding = "4px";
          fakeColorsBtn.style.borderRadius = "10px";
          fakeColorsBtn.style.transition = "background 0.5s ease";
          fakeColorsBtn.id = "fakeButton";
          container.appendChild(fakeColorsBtn);
          return fakeColorsBtn;
        }

        function createFakeMakeButton(container) {
          const fakeMakeBtn = document.createElement("button");
          fakeMakeBtn.style.position = "fixed";
          fakeMakeBtn.style.right = "3px";
          fakeMakeBtn.style.width = "8px";
          fakeMakeBtn.style.bottom = "16px";
          fakeMakeBtn.style.height = "85px";
          fakeMakeBtn.style.background = "rgb(108, 117, 125)";
          fakeMakeBtn.style.border = "none";
          fakeMakeBtn.style.display = "flex";
          fakeMakeBtn.style.justifyContent = "center";
          fakeMakeBtn.style.alignItems = "center";
          fakeMakeBtn.style.cursor = "pointer";
          fakeMakeBtn.style.borderRadius = "10px";
          fakeMakeBtn.style.transition = "background 0.5s ease";
          fakeMakeBtn.style.zIndex = "99999";
          fakeMakeBtn.id = "fakeMakeButton";
          container.appendChild(fakeMakeBtn);

          fakeMakeBtn.addEventListener("mouseenter", function () {
            this.style.background = "#e38571";
          });

          fakeMakeBtn.addEventListener("mouseleave", function () {
            this.style.background = "rgb(108, 117, 125)";
          });

          return fakeMakeBtn;
        }

        function createIndicatorButton(container, color) {
          const indicatorButton = document.createElement("button");
          indicatorButton.style.background = color;
          indicatorButton.style.width = "25%";
          indicatorButton.style.padding = "4px";
          indicatorButton.style.border = "none";
          indicatorButton.style.cursor = "pointer";
          indicatorButton.style.borderRadius = "10px";
          indicatorButton.style.display = "flex";
          indicatorButton.style.justifyContent = "center";
          indicatorButton.style.alignItems = "center";
          indicatorButton.style.transition = "background 0.3s ease";
          indicatorButton.id = "instantPost";
          container.appendChild(indicatorButton);
          return indicatorButton;
        }

        async function sendAddMediaByTagRequest(target = null) {
          try {
            chrome.runtime.sendMessage({
              action: "addMediaByTag",
              target: target
            });
          } catch (e) {
            console.error("add-media-by-tag request error:", e);
          }
        }

        function addSplitButton(
          container,
          textLeft,
          textRight,
          callbackLeft,
          callbackRight,
          id,
          splitText,
          margin,
          width
        ) {
          const button = document.createElement("button");
          button.id = id;

          const isStopButton = id === "split-button0";
          let leftPart, rightPart;

          function updateStopButtonState(singleStopState, syncStopState) {
            const leftText = singleStopState ? "single resume" : "single stop";
            const rightText = syncStopState ? "sync resume" : "sync stop";
            const leftColor = singleStopState ? "rgb(120, 90, 90)" : "#5a6268";
            const rightColor = syncStopState ? "rgb(140, 110, 110)" : "#6c757d";

            button.style.background = `linear-gradient(to right, ${leftColor} 50%, ${rightColor} 50%)`;
            button.style.backgroundSize = "205% 100%";
            button.style.backgroundPosition = "center";
            updateButtonTexts(leftText, rightText);
          }

          function updateButtonTexts(newLeftText, newRightText) {
            if (splitText) {
              leftPart.innerHTML = '';
              rightPart.innerHTML = '';
              newLeftText.split(" ").forEach(word => {
                const wordDiv = document.createElement("div");
                wordDiv.style.cssText = `line-height: 1.2; text-align: center;`;
                wordDiv.textContent = word;
                leftPart.appendChild(wordDiv);
              });
              newRightText.split(" ").forEach(word => {
                const wordDiv = document.createElement("div");
                wordDiv.style.cssText = `line-height: 1.2; text-align: center;`;
                wordDiv.textContent = word;
                rightPart.appendChild(wordDiv);
              });
            } else {
              leftPart.textContent = newLeftText;
              rightPart.textContent = newRightText;
            }
          }

          button.style.cssText = `
            background: linear-gradient(to right, #5a6268 50%, #6c757d 50%);
            background-size: 205% 100%;
            background-position: center;
            color: white;
            border: none;
            cursor: pointer;
            padding: 0;
            width: ${width};
            height: 50px;
            border-radius: 10px;
            display: flex;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
            font-family: 'Josefin Sans', sans-serif;
            margin: ${margin};
            font-size: 14px;
            align-items: center;
            transition: all 0.5s ease, transform 0.2s ease;
          `;

          leftPart = createButtonPart(textLeft, splitText);
          rightPart = createButtonPart(textRight, splitText);

          let fillAnim = null;
          if (id === "split-button1") {
            fillAnim = document.createElement("div");
            Object.assign(fillAnim.style, {
              position: "absolute",
              top: "0",
              left: "0",
              width: "0%",
              height: "100%",
              backgroundColor: "rgba(160, 160, 160, 0.5)",
              zIndex: "0",
              pointerEvents: "none",
              transition: "none"
            });
            rightPart.style.position = "relative";
            rightPart.insertBefore(fillAnim, rightPart.firstChild);
          }

          const divider = document.createElement("div");
          divider.style.cssText = `
            width: 2px;
            height: 60%;
            background: rgba(255, 255, 255, 0.3);
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            z-index: 2;
            transition: opacity 0.5s ease;
          `;

          button.appendChild(leftPart);
          button.appendChild(rightPart);
          button.appendChild(divider);

          let animationTimeout;
          const handleHover = (side) => {
            clearTimeout(animationTimeout);
            button.style.backgroundPosition = side;
            divider.style.opacity = "0";
            if (side === "left") {
              leftPart.style.opacity = "1";
              rightPart.style.opacity = "0";
            } else {
              leftPart.style.opacity = "0";
              rightPart.style.opacity = "1";
            }
          };

          const resetState = () => {
            button.style.backgroundPosition = "center";
            leftPart.style.opacity = "1";
            rightPart.style.opacity = "1";
            divider.style.opacity = "1";
          };

          leftPart.addEventListener("mouseover", () => handleHover("left"));
          leftPart.addEventListener("mouseout", () => { animationTimeout = setTimeout(resetState, 100); });
          rightPart.addEventListener("mouseover", () => handleHover("right"));
          rightPart.addEventListener("mouseout", () => { animationTimeout = setTimeout(resetState, 100); });

          leftPart.addEventListener("click", (e) => {
            e.stopPropagation();
            animateButton(button, leftPart, callbackLeft);
          });

          if (id === "split-button1") {
            let holdTimer = null;
            let holdTriggered = false;

            const startHold = (e) => {
              if (e.button !== 0) return;
              holdTriggered = false;

              fillAnim.style.transition = "width 1s linear";
              fillAnim.style.width = "100%";

              holdTimer = setTimeout(async () => {
                holdTriggered = true;

                button.style.transform = "scale(1.05)";
                setTimeout(() => button.style.transform = "scale(1)", 100);

                await sendAddMediaByTagRequest("all");
                resetHoldAnim();
              }, 1000);
            };

            const endHold = (e) => {
              if (e.button !== 0) return;
              clearTimeout(holdTimer);

              if (!holdTriggered) {
                animateButton(button, rightPart, callbackRight);
              }
              resetHoldAnim();
            };

            const resetHoldAnim = () => {
              fillAnim.style.transition = "width 0.2s ease-out";
              fillAnim.style.width = "0%";
              setTimeout(() => {
                if (fillAnim.style.width === "0%") fillAnim.style.transition = "none";
              }, 200);
            };

            rightPart.addEventListener("mousedown", startHold);
            rightPart.addEventListener("mouseup", endHold);
            rightPart.addEventListener("mouseleave", () => {
              clearTimeout(holdTimer);
              resetHoldAnim();
            });
            rightPart.addEventListener("click", (e) => e.stopPropagation());

            button.addEventListener("contextmenu", async (event) => {
              event.preventDefault();
              const rect = button.getBoundingClientRect();
              if ((event.clientX - rect.left) > rect.width / 2) {
                animateButton(button, rightPart);
                await sendAddMediaByTagRequest(null);
              }
            });

          } else {
            rightPart.addEventListener("click", (e) => {
              e.stopPropagation();
              animateButton(button, rightPart, callbackRight);
            });
          }

          if (isStopButton) {
            chrome.storage.local.get(['singleStop', 'syncStop'], function (result) {
              updateStopButtonState(result.singleStop, result.syncStop);
            });
            chrome.storage.onChanged.addListener(function (changes, namespace) {
              if (namespace === 'local' && (changes.singleStop || changes.syncStop)) {
                chrome.storage.local.get(['singleStop', 'syncStop'], function (result) {
                  updateStopButtonState(result.singleStop, result.syncStop);
                });
              }
            });
          }

          container.appendChild(button);
          return { button };
        }

        function createButtonPart(text, splitText = false) {
          const part = document.createElement("div");
          part.style.cssText = `
            flex: 1;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            transition: all 0.5s ease;
            z-index: 1;
            opacity: 1;
          `;

          if (splitText) {
            part.style.flexDirection = 'column';
            const words = text.split(" ");
            words.forEach(word => {
              const wordDiv = document.createElement("div");
              wordDiv.style.cssText = `
                line-height: 1.2;
                text-align: center;
              `;
              wordDiv.textContent = word;
              part.appendChild(wordDiv);
            });
          } else {
            part.textContent = text;
          }

          return part;
        }

        if (!window.buttonsAdded) {
          const container = document.createElement("div");
          Object.assign(container.style, {
            position: "fixed",
            bottom: "10px",
            left: "5px",
            right: "15px",
            transform: "none",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            fontFamily: "'Josefin Sans', sans-serif",
            color: "white",
            fontSize: "20px",
            flexShrink: "0",
            justifyContent: "space-between",
            zIndex: "10000",
            transition: "all 0.3s"
          });
          container.id = "cont1";

          const container2 = document.createElement("div");
          Object.assign(container2.style, {
            position: "fixed",
            bottom: "2px",
            left: "15px",
            right: "15px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            fontFamily: "'Josefin Sans', sans-serif",
            color: "white",
            flexShrink: "0",
            justifyContent: "center",
            zIndex: "10000",
            transition: "all 0.3s"
          });
          container2.id = "cont2";

          const containerNew = document.createElement("div");
          Object.assign(containerNew.style, {
            position: "fixed",
            bottom: "70px",
            left: "5px",
            right: "15px",
            display: "flex",
            flexDirection: "row",
            alignItems: "end",
            fontFamily: "'Josefin Sans', sans-serif",
            color: "white",
            flexShrink: "0",
            justifyContent: "end",
            zIndex: "10000",
            transition: "all 0.3s",
          });
          containerNew.id = "cont3";

          const versionContainer = document.createElement("div");
          versionContainer.id = "version";
          Object.assign(versionContainer.style, {
            position: "fixed",
            bottom: "0px",
            left: "7px",
            color: "white",
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: "10px",
            zIndex: "9999"
          });

          function updateVersionText(activeBrowser) {
            const VERSION = chrome.runtime.getManifest().version;
            versionContainer.textContent = `version: ${VERSION} | browser: ${activeBrowser}`;
          }

          function updateTextColor() {
            const rootStyles = getComputedStyle(document.documentElement);
            const bgColor = rootStyles.getPropertyValue('--bg-color').trim();

            if (bgColor === '#161618') {
              versionContainer.style.color = 'white';
            } else if (bgColor === '#fff') {
              versionContainer.style.color = 'black';
            }
          }

          document.addEventListener('DOMContentLoaded', updateTextColor);

          const observer = new MutationObserver(updateTextColor);
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style']
          });

          chrome.storage.local.get(null, function (items) {
            const activeBrowser = Object.keys(items)
              .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
              .map(key => parseInt(key.match(/\d+/)[0]))[0] || "not set";
            updateVersionText(activeBrowser);
          });

          chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace === 'local') {
              const browserChanges = Object.keys(changes).filter(key =>
                key.startsWith('browser') && key.endsWith('Checked')
              );

              if (browserChanges.length > 0) {
                chrome.storage.local.get(null, function (items) {
                  const activeBrowser = Object.keys(items)
                    .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
                    .map(key => parseInt(key.match(/\d+/)[0]))[0] || "not set";
                  updateVersionText(activeBrowser);
                });
              }
            }
          });

          let link = document.createElement("link");
          link.href =
            "https://fonts.googleapis.com/css2?family=Josefin+Sans&display=swap";
          link.rel = "stylesheet";
          document.head.appendChild(link);

          async function toggleSyncStop() {
            const result = await new Promise((resolve) => {
              chrome.storage.local.get(['syncStop'], resolve);
            });
            const currentState = result.syncStop;
            if (currentState) {
              await syncStopRequestOff();
            } else {
              await syncStopRequestOn();
            }
          }

          addSplitButton(
            container,
            "single stop",
            "sync stop",
            async () => {
              await singleStop();
            },
            async () => {
              await toggleSyncStop();
            },
            "split-button0",
            true,
            "5px 2px 5px 0px",
            "33.33%"
          );

          document.body.appendChild(container);
          document.body.appendChild(container2);

          addSplitButton(
            container,
            "clear media",
            "add media",
            async () => {
              await clearRequest();
            },
            async () => {
              await pasteRequest();
            },
            "split-button1",
            true,
            "5px 2px 5px 2px",
            "33.33%"
          );

          addSplitButton(
            container,
            "next tab post",
            "post",
            async () => {
              await bindFixRequest();
            },
            async () => {
              await bindRequest();
            },
            "split-button2",
            false,
            "5px 0px 5px 2px",
            "33.33%"
          );


          addSplitButton(
            containerNew,
            "stop posting",
            "stop auto",
            async () => {
              await stopRequest();
            },
            async () => {
              chrome.storage.local.set({ isStop: true });
            },
            "stop-button",
            true,
            "0px 4px 0px 4px",
            "calc(((100% - 8px) / 3) + 0.01px)",
          );

          let postIndicatorButton = createIndicatorButton(container2);
          let fakeColors = createFakeColorsButton(container2);
          let fakeMakeButton = createFakeMakeButton(document.body);

          postIndicatorButton.style.background = "#2D9B37";
          postIndicatorButton.innerHTML = "";
          updateFakeIndicator(fakeColors);

          function createStatsSettingsMenu() {
            if (document.getElementById('stats-settings-menu')) return;

            const menu = document.createElement('div');
            menu.id = 'stats-settings-menu';
            Object.assign(menu.style, {
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'rgba(28, 28, 28, 0.95)',
              border: '2px solid #000',
              borderRadius: '10px',
              padding: '20px',
              zIndex: '2147483647',
              display: 'flex',
              flexDirection: 'column',
              gap: '15px',
              color: 'white',
              fontFamily: "'Josefin Sans', sans-serif",
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
              minWidth: '280px'
            });

            const title = document.createElement('div');
            title.textContent = 'Stats Settings';
            title.style.textAlign = 'center';
            title.style.fontSize = '18px';
            title.style.marginBottom = '5px';
            menu.appendChild(title);

            // Checkboxes
            const createCheckbox = (id, labelText) => {
              const wrapper = document.createElement('div');
              Object.assign(wrapper.style, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginBottom: '5px'
              });

              const label = document.createElement('label');
              label.htmlFor = id;
              label.textContent = labelText;
              label.style.fontSize = '15px';
              label.style.color = '#fff';
              label.style.cursor = 'pointer';
              label.style.margin = '0';
              label.style.lineHeight = '1';

              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.id = id;
              Object.assign(cb.style, {
                width: '18px',
                height: '18px',
                cursor: 'pointer',
                accentColor: 'rgb(221, 109, 85)',
                margin: '0'
              });

              wrapper.appendChild(label);
              wrapper.appendChild(cb);
              return { wrapper, cb };
            };

            const ownTrackCb = createCheckbox('cb-own-track', 'Subtract own tracking');
            const renewsCb = createCheckbox('cb-renews', 'Subtract renews');

            menu.appendChild(ownTrackCb.wrapper);
            menu.appendChild(renewsCb.wrapper);

            // Tracking links
            const addWrapper = document.createElement('div');
            addWrapper.style.display = 'flex';
            addWrapper.style.gap = '5px';

            const addInput = document.createElement('input');
            addInput.type = 'text';
            addInput.placeholder = 'Link name (e.g. test)';
            Object.assign(addInput.style, {
              flex: '1',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid #444',
              borderRadius: '5px',
              padding: '8px',
              color: 'white',
              fontFamily: "'Josefin Sans', sans-serif",
              outline: 'none'
            });

            const addBtn = document.createElement('button');
            addBtn.textContent = 'Add';
            Object.assign(addBtn.style, {
              padding: '8px 15px',
              borderRadius: '5px',
              border: 'none',
              backgroundColor: 'rgb(221, 109, 85)',
              color: 'white',
              cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '14px',
              transition: 'background 0.3s'
            });
            addBtn.onmouseover = () => addBtn.style.backgroundColor = '#e38571';
            addBtn.onmouseout = () => addBtn.style.backgroundColor = 'rgb(221, 109, 85)';

            addWrapper.appendChild(addInput);
            addWrapper.appendChild(addBtn);
            menu.appendChild(addWrapper);

            const listContainer = document.createElement('div');
            Object.assign(listContainer.style, {
              maxHeight: '100px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px'
            });
            menu.appendChild(listContainer);

            // Save & Sync
            const actionWrapper = document.createElement('div');
            actionWrapper.style.display = 'flex';
            actionWrapper.style.gap = '10px';
            actionWrapper.style.marginTop = '10px';

            const syncBtn = document.createElement('button');
            syncBtn.textContent = 'Sync All';
            Object.assign(syncBtn.style, {
              flex: '1', padding: '8px', borderRadius: '5px', border: 'none',
              backgroundColor: 'rgb(221, 109, 85)', color: 'white', cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif", fontSize: '14px', transition: 'background 0.3s'
            });
            syncBtn.onmouseover = () => syncBtn.style.backgroundColor = '#e38571';
            syncBtn.onmouseout = () => syncBtn.style.backgroundColor = 'rgb(221, 109, 85)';

            actionWrapper.appendChild(syncBtn);
            menu.appendChild(actionWrapper);

            const closeMenuBtn = document.createElement('button');
            closeMenuBtn.textContent = 'Close';
            Object.assign(closeMenuBtn.style, {
              marginTop: '5px',
              padding: '8px',
              backgroundColor: 'rgb(221, 109, 85)',
              border: 'none',
              borderRadius: '5px',
              color: 'white',
              cursor: 'pointer',
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '14px',
              transition: 'background 0.3s'
            });
            closeMenuBtn.onmouseover = () => closeMenuBtn.style.backgroundColor = '#e38571';
            closeMenuBtn.onmouseout = () => closeMenuBtn.style.backgroundColor = 'rgb(221, 109, 85)';
            closeMenuBtn.addEventListener('click', () => {
              menu.remove();
            });
            menu.appendChild(closeMenuBtn);

            document.body.appendChild(menu);

            const clickOutside = (e) => {
              if (!menu.contains(e.target) && e.target !== menu) {
                menu.remove();
                document.removeEventListener('mousedown', clickOutside);
              }
            };
            setTimeout(() => document.addEventListener('mousedown', clickOutside), 0);

            // Async data loading
            chrome.storage.local.get(null, (items) => {
              const activeBrowser = Object.keys(items)
                .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
                .map(key => parseInt(key.match(/\d+/)[0]))[0] || 1;

              const storageKey = `statsSettings`;

              let currentList = [];

              const applySettings = (settings) => {
                ownTrackCb.cb.checked = settings.subtractOwnTracking || false;
                renewsCb.cb.checked = settings.subtractRenews || false;
                currentList = settings.trackingNames || [];
                window.currentStatsList = currentList;
                if (window.renderStatsList) window.renderStatsList();
              };

              const localSettings = items[storageKey];
              if (localSettings) applySettings(localSettings);

              const saveData = () => {
                const newSettings = {
                  trackingNames: currentList,
                  subtractOwnTracking: ownTrackCb.cb.checked,
                  subtractRenews: renewsCb.cb.checked
                };
                chrome.storage.local.set({ [storageKey]: newSettings });
              };

              ownTrackCb.cb.addEventListener('change', saveData);
              renewsCb.cb.addEventListener('change', saveData);

              window.currentStatsList = currentList;
              window.renderStatsList = () => {
                listContainer.innerHTML = '';
                window.currentStatsList.forEach((name, index) => {
                  const item = document.createElement('div');
                  Object.assign(item.style, {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  });
                  const nameSpan = document.createElement('span');
                  nameSpan.textContent = name;
                  const delBtn = document.createElement('button');
                  delBtn.textContent = 'x';
                  Object.assign(delBtn.style, {
                    background: 'transparent',
                    border: 'none',
                    color: '#DD6D55',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  });
                  delBtn.onclick = () => {
                    window.currentStatsList.splice(index, 1);
                    currentList = window.currentStatsList;
                    window.renderStatsList();
                    saveData();
                  };
                  item.appendChild(nameSpan);
                  item.appendChild(delBtn);
                  listContainer.appendChild(item);
                });
              };
              window.renderStatsList();

              addBtn.onclick = () => {
                const val = addInput.value.trim();
                if (val && !window.currentStatsList.includes(val)) {
                  window.currentStatsList.push(val);
                  currentList = window.currentStatsList;
                  addInput.value = '';
                  window.renderStatsList();
                  saveData();
                }
              };

              syncBtn.onclick = () => {
                const newSettings = {
                  trackingNames: currentList,
                  subtractOwnTracking: ownTrackCb.cb.checked,
                  subtractRenews: renewsCb.cb.checked
                };
                fetch('http://localhost:3000/stats-settings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ syncAll: true, settings: newSettings })
                }).then(() => {
                  syncBtn.textContent = 'Synced!';
                  setTimeout(() => { syncBtn.textContent = 'Sync All'; }, 1500);
                }).catch(() => { });
              };
            });
          }

          postIndicatorButton.addEventListener("mousedown", (e) => {
            if (e.button === 2) {
              e.preventDefault();
              createStatsSettingsMenu();
            }
          });
          postIndicatorButton.addEventListener("contextmenu", (e) => {
            e.preventDefault();
          });

          postIndicatorButton.addEventListener("click", async () => {
            if (postIndicatorButton.dataset.loading === "true") return;
            postIndicatorButton.dataset.loading = "true";
            postIndicatorButton.style.opacity = "0.5";
            try {
              await fetch("http://localhost:3000/fake", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "RUN_GLOBAL_STATS" })
              });
            } catch (e) { }
          });

          chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === "STATS_COLLECTION_FINISHED") {
              postIndicatorButton.dataset.loading = "false";
              postIndicatorButton.style.opacity = "1";

              if (msg.success) {
                const { net, center, left, right } = msg.data;

                let statsWidget = document.getElementById("ofh-stats-widget");
                if (!statsWidget) {
                  statsWidget = document.createElement("div");
                  statsWidget.id = "ofh-stats-widget";
                  Object.assign(statsWidget.style, {
                    position: "fixed",
                    left: "5px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: "10000",
                    width: "max-content",
                    height: "auto",
                    cursor: "pointer"
                  });
                  statsWidget.onclick = () => {
                    statsWidget.remove();
                  };
                  document.body.appendChild(statsWidget);
                }

                statsWidget.innerHTML = `
                  <div style="font-family: 'Josefin Sans', sans-serif; background: rgba(28, 28, 28, 0.95); border-radius: 8px; border: 1px solid #444; box-shadow: 0 4px 15px rgba(0,0,0,0.5); padding: 10px; display: flex; flex-direction: column; gap: 6px; color: #fff; font-size: 14px;">
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold; color: #4CAF50;">${msg.data.center}</span>
                      <span style="color: #ccc;">Total</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold;">${(Number(msg.data.right) || 0) + (Number(msg.data.left) || 0)}</span>
                      <span style="color: #ccc;">Links</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold; color: #ff9900;">${msg.data.net}</span>
                      <span style="color: #ccc;">Net</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold; color: #2196F3;">${msg.data.renews}</span>
                      <span style="color: #ccc;">Renews</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold;">${msg.data.right}</span>
                      <span style="color: #ccc;">Tracking</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold;">${msg.data.left}</span>
                      <span style="color: #ccc;">Trial</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; gap: 20px;">
                      <span style="font-weight: bold; color: #E91E63; ${msg.data.addedTracking === '❌' ? 'margin-left: -3px;' : ''}">${msg.data.addedTracking}</span>
                      <span style="color: #ccc;">Added Tracking</span>
                    </div>
                  </div>
                `;

                if (msg.data.trackingDetails && Object.keys(msg.data.trackingDetails).length > 0) {
                  const detailsContainer = document.createElement("div");
                  Object.assign(detailsContainer.style, {
                    fontFamily: "'Josefin Sans', sans-serif",
                    background: "rgba(28, 28, 28, 0.95)",
                    borderRadius: "8px",
                    border: "1px solid #444",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
                    padding: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    color: "#fff",
                    fontSize: "13px",
                    marginTop: "6px"
                  });

                  for (const [name, subs] of Object.entries(msg.data.trackingDetails)) {
                    const row = document.createElement("div");
                    row.style.display = "flex";
                    row.style.justifyContent = "space-between";
                    row.style.gap = "20px";

                    const subsSpan = document.createElement("span");
                    subsSpan.style.fontWeight = "bold";
                    subsSpan.style.color = "#4CAF50";
                    subsSpan.textContent = subs;

                    const nameSpan = document.createElement("span");
                    nameSpan.style.color = "#ccc";
                    nameSpan.textContent = name;

                    row.appendChild(subsSpan);
                    row.appendChild(nameSpan);
                    detailsContainer.appendChild(row);
                  }

                  statsWidget.appendChild(detailsContainer);
                }
              } else {
                postIndicatorButton.style.background = "#DD6D55";
                setTimeout(() => {
                  postIndicatorButton.style.background = "#2D9B37";
                }, 2000);
              }
            }
          });
          fakeColors.addEventListener("click", async () => {
            await toggleFakeIndicator();
            await updateFakeIndicator(fakeColors);
          });
          fakeMakeButton.addEventListener("click", async () => {
            await fakeRequest();
          });

          const arrowButton = document.createElement("div");
          arrowButton.id = "auto-restart-arrow";
          Object.assign(arrowButton.style, {
            position: "relative",
            width: "30px",
            height: "30px",
            margin: "0 2px 0 2px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: "5px",
            backgroundColor: "rgb(221, 109, 85)",
            overflow: "hidden",
            transition: "background-color 0.5s ease, transform 0.15s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
          });

          const svgArrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svgArrow.setAttribute("width", "14");
          svgArrow.setAttribute("height", "14");
          svgArrow.setAttribute("viewBox", "0 0 24 24");
          svgArrow.setAttribute("fill", "none");
          svgArrow.style.zIndex = "2";
          svgArrow.style.position = "relative";

          const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          arrowPath.setAttribute("d", "M14 5l7 7-7 7M3 12h18");
          arrowPath.setAttribute("stroke", "#dddddd");
          arrowPath.setAttribute("stroke-width", "3");
          arrowPath.setAttribute("stroke-linecap", "round");
          arrowPath.setAttribute("stroke-linejoin", "round");
          arrowPath.id = "arrow-path";
          arrowPath.style.transition = "stroke 0.3s ease";
          arrowPath.style.zIndex = "2";

          svgArrow.appendChild(arrowPath);
          arrowButton.appendChild(svgArrow);

          const fillElement = document.createElement("div");
          fillElement.id = "fill-animation";
          Object.assign(fillElement.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            backgroundImage: "linear-gradient(to right, rgb(45, 155, 55) 0%, rgb(45, 155, 55) 50%, rgb(221, 109, 85) 50%, rgb(221, 109, 85) 100%)",
            backgroundSize: "200% 100%",
            backgroundPosition: "100%",
            transition: "background-position 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            zIndex: "1",
            pointerEvents: "none"
          });
          arrowButton.appendChild(fillElement);

          const autoButton = document.createElement("button");
          autoButton.id = "autopost-button";
          Object.assign(autoButton.style, {
            backgroundColor: "rgb(221, 109, 85)",
            color: "white",
            border: "none",
            cursor: "pointer",
            zIndex: "9999",
            fontFamily: "'Josefin Sans', sans-serif",
            borderRadius: "10px",
            width: "calc(((100% - 8px) / 3) - 34px)",
            height: "30px",
            padding: "0",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            transition: "background-color 0.3s ease"
          });
          autoButton.textContent = "auto";

          const toggleAutoRestart = () => {
            chrome.storage.local.get(['singleTabMode'], (result) => {
              if (result.singleTabMode) {
                createSingleTabSettingsMenu();
              } else {
                chrome.runtime.sendMessage({ action: "toggleAutoRestartState" });
              }
            });
          };

          const toggleSingleTabMode = (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ action: "toggleSingleTabMode" });
          };

          arrowButton.addEventListener("click", toggleAutoRestart);
          arrowButton.addEventListener("contextmenu", toggleSingleTabMode);

          chrome.storage.local.get(["autoRestartEnabled", "singleTabMode", "_arrowLocked", "_arrowLockedBy"], (result) => {
            const autoEnabled = result.autoRestartEnabled || false;
            const singleEnabled = result.singleTabMode || false;
            let state = 0;
            if (singleEnabled) state = 2;
            else if (autoEnabled) state = 1;

            const locked = result._arrowLocked || false;
            chrome.runtime.sendMessage({ type: "ws-get-browser-number" }, (response) => {
              const myNum = response ? response.browserNumber : null;
              const lockedByMe = result._arrowLockedBy === myNum;

              if (state === 1) {
                fillElement.style.backgroundImage = "linear-gradient(to right, rgb(45, 155, 55) 0%, rgb(45, 155, 55) 50%, rgb(221, 109, 85) 50%, rgb(221, 109, 85) 100%)";
                fillElement.style.backgroundPosition = "0%";
                arrowPath.setAttribute("stroke", "#ffffff");
              } else if (state === 2) {
                fillElement.style.backgroundImage = "linear-gradient(to right, #9B59B6 0%, #9B59B6 50%, rgb(221, 109, 85) 50%, rgb(221, 109, 85) 100%)";
                fillElement.style.backgroundPosition = "0%";
                arrowPath.setAttribute("stroke", "#ffffff");
              } else {
                fillElement.style.backgroundPosition = "100%";
                arrowPath.setAttribute("stroke", "#dddddd");
              }

              arrowButton.style.opacity = (locked && !lockedByMe) ? "0.45" : "1";
              arrowButton.style.pointerEvents = (locked && !lockedByMe) ? "none" : "auto";
              arrowButton.setAttribute("data-arrow-state", String(state));
            });
          });

          autoButton.addEventListener("mouseover", function () {
            autoButton.style.backgroundColor = "#e38571";
          });

          autoButton.addEventListener("mouseout", function () {
            autoButton.style.backgroundColor = "rgb(221, 109, 85)";
          });

          autoButton.addEventListener("click", function () {
            chrome.runtime.sendMessage({ action: "clickAndMove" });
          });

          autoButton.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            openGlobalScreenshotMenu();
          });

          containerNew.appendChild(arrowButton);
          containerNew.appendChild(autoButton);

          function createActionButton(id, position, svgContent, clickHandler) {
            const button = document.createElement("button");
            Object.assign(button.style, {
              position: "fixed",
              backgroundColor: "rgb(90, 98, 104)",
              border: "none",
              borderRadius: "10px",
              padding: "7px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              zIndex: "99999",
              transition: "all 0.3s",
              outline: "none",
              ...position
            });
            button.id = id;
            button.innerHTML = svgContent;


            function handleMouseOver() {
              button.style.backgroundColor = "#e38571";
            }

            function handleMouseOut() {
              button.style.backgroundColor = "rgb(90, 98, 104)";
            }

            button.addEventListener("mouseover", handleMouseOver);
            button.addEventListener("mouseout", handleMouseOut);
            button.addEventListener("click", clickHandler);

            return button;
          }

          function createHoldActionButton(id, position, svgContent, clickHandler, holdHandler) {
            const button = document.createElement("button");
            const fillOverlay = document.createElement("div");

            Object.assign(button.style, {
              position: "fixed",
              backgroundColor: "rgb(90, 98, 104)",
              border: "none",
              borderRadius: "10px",
              padding: "7px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              zIndex: "99999",
              transition: "all 0.3s",
              outline: "none",
              overflow: "hidden",
              ...position
            });

            Object.assign(fillOverlay.style, {
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              height: "0%",
              backgroundColor: "#4CAF50",
              transition: "none",
              borderRadius: "10px",
              zIndex: "-1"
            });

            button.id = id;
            button.innerHTML = svgContent;
            button.appendChild(fillOverlay);

            let holdTimeout;
            let isHolding = false;
            let startTime;

            function handleMouseOver() {
              if (!isHolding) {
                button.style.backgroundColor = "#e38571";
              }
            }

            function handleMouseOut() {
              if (!isHolding) {
                button.style.backgroundColor = "rgb(90, 98, 104)";
              }
            }

            function startHold() {
              isHolding = true;
              startTime = Date.now();

              fillOverlay.style.transition = "height 1s linear";
              fillOverlay.style.height = "100%";

              holdTimeout = setTimeout(() => {
                if (isHolding) {
                  holdHandler();
                  resetHold();
                }
              }, 1000);
            }

            function resetHold() {
              isHolding = false;
              clearTimeout(holdTimeout);

              fillOverlay.style.transition = "none";
              fillOverlay.style.height = "0%";

              button.style.backgroundColor = "rgb(90, 98, 104)";
            }

            function handleClick() {
              if (!isHolding) {
                clickHandler();
              }
            }

            button.addEventListener("mousedown", (e) => {
              if (e.button === 0) {
                startHold();
              }
            });
            button.addEventListener("mouseup", (e) => {
              if (e.button === 0 && isHolding) {
                const elapsed = Date.now() - startTime;
                if (elapsed < 1000) {
                  resetHold();
                  handleClick();
                }
              }
            });
            button.addEventListener("mouseleave", resetHold);

            button.addEventListener("mouseover", handleMouseOver);
            button.addEventListener("mouseout", handleMouseOut);

            return button;
          }

          const switchButton = createHoldActionButton(
            "switch-button",
            { bottom: "105px", right: "calc(((100% - 8px) / 3) - 24px)" },
            `<svg viewBox="0 0 330 330" width="16" height="16">
            <path fill="white" d="M79.394,250.606C82.323,253.535,86.161,255,90,255c3.839,0,7.678-1.465,10.606-4.394 c5.858-5.857,5.858-15.355,0-21.213L51.213,180h227.574l-49.393,49.394c-5.858,5.857-5.858,15.355,0,21.213 C232.322,253.535,236.161,255,240,255s7.678-1.465,10.606-4.394l75-75c5.858-5.857,5.858-15.355,0-21.213l-75-75 c-5.857-5.857-15.355-5.857-21.213,0c-5.858,5.857-5.858,15.355,0,21.213L278.787,150H51.213l49.393-49.394 c5.858-5.857,5.858-15.355,0-21.213c-5.857-5.857-15.355-5.857-21.213,0l-75,75c-5.858,5.857-5.858,15.355,0,21.213L79.394,250.606z"/>
            </svg>`,
            quickSwitch,
            holdSwitch
          );

          function updateRightActivationStyle() {
            if (window.__switchRightActivated) {
              switchButton.style.boxShadow = "0 0 0 2px #FFD700 inset, 0 0 8px rgba(255,215,0,0.7)";
              switchButton.setAttribute("data-right-activated", "true");
            } else {
              switchButton.style.boxShadow = "";
              switchButton.setAttribute("data-right-activated", "false");
            }
          }

          // Load initial state from server (shared across all browsers)
          fetch('http://localhost:3000/switch-right-activated')
            .then(r => r.json())
            .then(data => {
              window.__switchRightActivated = !!data.activated;
              updateRightActivationStyle();
            })
            .catch(() => {
              // Fallback to localStorage if server unavailable
              chrome.storage.local.get("switchRightActivated", (res) => {
                window.__switchRightActivated = !!res.switchRightActivated;
                updateRightActivationStyle();
              });
            });

          chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'local') return;
            if (changes.storiesRunning || changes.storiesMenuOpen) {
              try { updateStoriesDoneIconFromState(); } catch (_) { }
            }
          });

          switchButton.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            window.__switchRightActivated = !window.__switchRightActivated;
            updateRightActivationStyle();

            fetch('http://localhost:3000/switch-right-activated', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ activated: window.__switchRightActivated })
            }).catch(() => {

              chrome.storage.local.set({ switchRightActivated: window.__switchRightActivated });
            });
          });

          chrome.runtime.onMessage.addListener((request) => {
            if (request && request.action === "autoCompleted" && window.__switchRightActivated) {
              const down = new MouseEvent("mousedown", { bubbles: true, button: 0 });
              const up = new MouseEvent("mouseup", { bubbles: true, button: 0 });
              switchButton.dispatchEvent(down);
              switchButton.dispatchEvent(up);
            }
          });

          const clearButton = createActionButton(
            "clear-button",
            { bottom: "105px", right: "calc(((100% - 8px) / 3 * 4 / 5) - 24px)" },
            `<svg viewBox="0 0 1024 1024" width="16" height="16">
              <path fill="white" d="M899.1 869.6l-53-305.6H864c14.4 0 26-11.6 26-26V346c0-14.4-11.6-26-26-26H618V138c0-14.4-11.6-26-26-26H432c-14.4 0-26 11.6-26 26v182H160c-14.4 0-26 11.6-26 26v192c0 14.4 11.6 26 26 26h17.9l-53 305.6c-0.3 1.5-0.4 3-0.4 4.4 0 14.4 11.6 26 26 26h723c1.5 0 3-0.1 4.4-0.4 14.2-2.4 23.7-15.9 21.2-30zM204 390h272V182h72v208h272v104H204V390z m468 440V674c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v156H416V674c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v156H202.8l45.1-260H776l45.1 260H672z"/>
              </svg>`,
            quickClear
          );

          const reloadButton = createActionButton(
            "reload-button",
            { bottom: "105px", right: "calc(((100% - 8px) / 3 * 3 / 5) - 24px)" },
            `<svg viewBox="0 0 24 24" width="16" height="16">
                <path fill="none" stroke="white" stroke-width="2" stroke-linecap="round" d="M4,13 C4,17.4183 7.58172,21 12,21 C16.4183,21 20,17.4183 20,13 C20,8.58172 16.4183,5 12,5 C10.4407,5 8.98566,5.44609 7.75543,6.21762"/>
                <path fill="none" stroke="white" stroke-width="2" stroke-linecap="round" d="M9.2384,1.89795 L7.49856,5.83917 C7.27552,6.34441 7.50429,6.9348 8.00954,7.15784 L11.9508,8.89768"/>
                </svg>`,
            quickReload
          );

          const storiesContainer = document.createElement("div");
          storiesContainer.id = "stories-container";
          storiesContainer.style.position = "fixed";
          storiesContainer.style.bottom = "105px";
          storiesContainer.style.right = "1%";
          storiesContainer.style.display = "flex";
          storiesContainer.style.borderRadius = "4px";
          storiesContainer.style.overflow = "hidden";
          storiesContainer.style.backgroundColor = "rgba(28, 28, 28, 0.9)";
          storiesContainer.style.zIndex = "999999"
          storiesContainer.style.borderRadius = "10px"

          const storiesButton = createActionButton(
            "stories-button",
            { position: "relative", bottom: "auto", right: "auto" },
            `<svg width="16px" height="16px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" fill="#FFFFFF"/>
            <path d="M18 5C17.4477 5 17 5.44772 17 6C17 6.55228 17.4477 7 18 7C18.5523 7 19 6.55228 19 6C19 5.44772 18.5523 5 18 5Z" fill="#FFFFFF"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M1.65396 4.27606C1 5.55953 1 7.23969 1 10.6V13.4C1 16.7603 1 18.4405 1.65396 19.7239C2.2292 20.8529 3.14708 21.7708 4.27606 22.346C5.55953 23 7.23969 23 10.6 23H13.4C16.7603 23 18.4405 23 19.7239 22.346C20.8529 21.7708 21.7708 20.8529 22.346 19.7239C23 18.4405 23 16.7603 23 13.4V10.6C23 7.23969 23 5.55953 22.346 4.27606C21.7708 3.14708 20.8529 2.2292 19.7239 1.65396C18.4405 1 16.7603 1 13.4 1H10.6C7.23969 1 5.55953 1 4.27606 1.65396C3.14708 2.2292 2.2292 3.14708 1.65396 4.27606ZM13.4 3H10.6C8.88684 3 7.72225 3.00156 6.82208 3.0751C5.94524 3.14674 5.49684 3.27659 5.18404 3.43597C4.43139 3.81947 3.81947 4.43139 3.43597 5.18404C3.27659 5.49684 3.14674 5.94524 3.0751 6.82208C3.00156 7.72225 3 8.88684 3 10.6V13.4C3 15.1132 3.00156 16.2777 3.0751 17.1779C3.14674 18.0548 3.27659 18.5032 3.43597 18.816C3.81947 19.5686 4.43139 20.1805 5.18404 20.564C5.49684 20.7234 5.94524 20.8533 6.82208 20.9249C7.72225 20.9984 8.88684 21 10.6 21H13.4C15.1132 21 16.2777 20.9984 17.1779 20.9249C18.0548 20.8533 18.5032 20.7234 18.816 20.564C19.5686 20.1805 20.1805 19.5686 20.564 18.816C20.7234 18.5032 20.8533 18.0548 20.9249 17.1779C20.9984 16.2777 21 15.1132 21 13.4V10.6C21 8.88684 20.9984 7.72225 20.9249 6.82208C20.8533 5.94524 20.7234 5.49684 20.564 5.18404C20.1805 4.43139 19.5686 3.81947 18.816 3.43597C18.5032 3.27659 18.0548 3.14674 17.1779 3.0751C16.2777 3.00156 15.1132 3 13.4 3Z" fill="#FFFFFF"/>
            </svg>`,
            quickStories
          );

          const storiesDoneButton = createActionButton(
            "stories-done-button",
            { position: "relative", bottom: "auto", right: "auto" },
            `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 14L8.23309 16.4248C8.66178 16.7463 9.26772 16.6728 9.60705 16.2581L18 6" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            handleStoriesAction
          );

          storiesDoneButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            createStoriesSettingsMenu();
          });

          const leftOffsetPercent = 32;
          const topOffsetPixels = 45;

          const bottomOverlay = document.createElement("div");

          function updateOverlayColor() {
            const siteBackgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
            bottomOverlay.style.backgroundColor = siteBackgroundColor;
          }
          bottomOverlay.id = "bottom-overlay"
          bottomOverlay.style.position = "fixed";
          bottomOverlay.style.bottom = "0";
          bottomOverlay.style.left = "0";
          bottomOverlay.style.width = "100%";
          bottomOverlay.style.height = "140px";
          updateOverlayColor();
          bottomOverlay.style.zIndex = "9999";

          bottomOverlay.style.clipPath = `
            polygon(
              ${leftOffsetPercent}% 0, 
              100% 0, 
              100% 100%, 
              0 100%, 
              0 ${topOffsetPixels}px,
              ${leftOffsetPercent}% ${topOffsetPixels}px
            )
          `;

          document.body.appendChild(bottomOverlay);

          const rootObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.type === 'attributes' &&
                (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                updateOverlayColor();
                break;
              }
            }
          });

          rootObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style', 'class']
          });

          storiesButton.style.position = "relative";
          storiesDoneButton.style.position = "relative";
          storiesButton.style.boxShadow = "none";
          storiesDoneButton.style.boxShadow = "none";
          storiesButton.style.margin = "0";
          storiesDoneButton.style.margin = "0";
          storiesButton.style.borderRadius = "0";
          storiesDoneButton.style.borderRadius = "0";

          const separator = document.createElement("div");
          separator.style.width = "1px";
          separator.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
          separator.style.alignSelf = "stretch";

          storiesContainer.appendChild(storiesButton);
          storiesContainer.appendChild(separator);
          storiesContainer.appendChild(storiesDoneButton);

          document.body.appendChild(versionContainer);
          document.body.appendChild(switchButton);
          document.body.appendChild(clearButton);
          document.body.appendChild(reloadButton);
          document.body.appendChild(containerNew);
          document.body.appendChild(storiesContainer);
          window.buttonsAdded = true;
          try { updateStoriesDoneIconFromState(); } catch (_) { }
        }
      },
      args: [DELAY_GREEN_BUTTON],
    });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request && request.type === 'OFH_SEND_BROWSER_DATA_BG' && request.payload) {
    (async () => {
      try {
        await fetch('http://localhost:8765/browser-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.payload)
        });
      } catch (_) { }
    })();
    return true;
  }


  if (request.action === 'checkTab') {
    (async () => {
      const tabs = await chrome.tabs.query({});
      const storageData = await chrome.storage.local.get(null);
      const blacklistedTabIds = new Set();

      for (const key in storageData) {
        if (key.startsWith('blacklisted_') && storageData[key]) {
          const id = parseInt(key.split('_')[1]);
          if (!isNaN(id)) {
            blacklistedTabIds.add(id);
          }
        }
      }

      const activeWorkingTabs = tabs.filter(t => !blacklistedTabIds.has(t.id));
      const effectiveIndex = activeWorkingTabs.findIndex(t => t.id === request.tabId);

      if (effectiveIndex !== -1 && effectiveIndex < MAX_POST_TABS) {
        sendResponse({ shouldClick: true });
      } else {
        sendResponse({ shouldClick: false });
      }
    })();
    return true;
  }

  if (request && request.action === 'addMediaByTag') {
    (async () => {
      try {
        const browserId = request.target ? request.target : ("browser" + currentBrowserNumber);

        await fetch('http://localhost:8444/add-media-by-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ browser: browserId })
        });
      } catch (e) {
        console.error('add-media-by-tag request error:', e);
      }
    })();
    return true;
  }

  if (request.action === 'reregisterWS') {
    currentBrowserNumber = request.browserNumber;
    chrome.storage.sync.set({ preferredBrowserNumber: request.browserNumber });
    chrome.runtime.sendMessage({
      type: 'ws-update-browser-number',
      browserNumber: request.browserNumber
    });
    return true;
  }

  if (request.action === 'unregisterWS') {
    chrome.runtime.sendMessage({
      type: 'ws-unregister',
      browserNumber: request.browserNumber
    });
    return true;
  }

  if (request.action === "toggleAutoRestartState") {
    chrome.storage.local.get(['autoRestartEnabled', 'singleTabMode', '_arrowLocked', '_arrowLockedBy'], (result) => {
      const currentlyAuto = result.autoRestartEnabled || false;
      const lockedBy = result._arrowLockedBy;
      const locked = result._arrowLocked || false;

      if (currentlyAuto) {
        chrome.storage.local.set({ autoRestartEnabled: false });
        try {
          chrome.runtime.sendMessage({
            type: 'ws-send-raw',
            payload: { type: 'arrow-mode', mode: 'off', browserNumber: currentBrowserNumber }
          });
        } catch (_) { }
        return;
      }

      if (locked && lockedBy !== currentBrowserNumber) return;

      chrome.storage.local.set({
        autoRestartEnabled: true,
        singleTabMode: false,
        _arrowLocked: true,
        _arrowLockedBy: currentBrowserNumber
      });
      try {
        chrome.runtime.sendMessage({
          type: 'ws-send-raw',
          payload: { type: 'arrow-mode', mode: 'auto', browserNumber: currentBrowserNumber }
        });
      } catch (_) { }
    });
    return true;
  }

  if (request.action === "toggleSingleTabMode") {
    chrome.storage.local.get(['autoRestartEnabled', 'singleTabMode', '_arrowLocked', '_arrowLockedBy'], (result) => {
      const currentlySingle = result.singleTabMode || false;
      const lockedBy = result._arrowLockedBy;
      const locked = result._arrowLocked || false;


      if (currentlySingle) {
        chrome.storage.local.set({ singleTabMode: false, _arrowLocked: false, _arrowLockedBy: null });
        try {
          chrome.runtime.sendMessage({
            type: 'ws-send-raw',
            payload: { type: 'arrow-mode', mode: 'off', browserNumber: currentBrowserNumber }
          });
        } catch (_) { }
        return;
      }


      if (locked && lockedBy !== currentBrowserNumber) return;

      chrome.storage.local.set({
        singleTabMode: true,
        autoRestartEnabled: false,
        _arrowLocked: true,
        _arrowLockedBy: currentBrowserNumber
      });
      try {
        chrome.runtime.sendMessage({
          type: 'ws-send-raw',
          payload: { type: 'arrow-mode', mode: 'single', browserNumber: currentBrowserNumber }
        });
      } catch (_) { }
    });
    return true;
  }


  function handleTabOpen() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const currentTab = tabs[0];
        const currentTabIndex = currentTab.index;
        const targetUrl = "https://onlyfans.com/posts/create";

        chrome.tabs.query({}, function (tabs) {
          if (currentTabIndex < tabs.length - 1) {
            const nextTab = tabs[currentTabIndex + 1];
            if (nextTab.url !== targetUrl) {
              chrome.tabs.update(nextTab.id, { url: targetUrl, active: true }, () => resolve(nextTab.id));
            } else {
              chrome.tabs.update(nextTab.id, { active: true }, () => resolve(nextTab.id));
            }
          } else {
            chrome.tabs.create({ url: targetUrl }, function (newTab) {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (info.status === "complete" && tabId === newTab.id) {
                  chrome.tabs.onUpdated.removeListener(listener);
                  chrome.scripting.executeScript({
                    target: { tabId: newTab.id },
                    func: () => {
                      const selector1 = "#content > div.l-wrapper > div.l-wrapper__holder-content.m-inherit-zindex > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button.m-btn-clear-draft.g-btn.m-border.m-rounded.m-sm-width.m-reset-width";
                      const selector2 = "#content > div.l-wrapper > div > div > div > div > div.stories-list.g-negative-sides-gaps";
                      const observer = new MutationObserver((mutationsList) => {
                        for (let mutation of mutationsList) {
                          if (mutation.type === "childList") {
                            const element1 = document.querySelector(selector1);
                            if (element1) {
                              element1.click();
                              element1.style.display = "none";
                            }

                            const element2 = document.querySelector(selector2);
                            if (element2) {
                              element2.parentNode.removeChild(element2);
                            }

                            if (element1 && element2) {
                              observer.disconnect();
                            }
                          }
                        }
                      });

                      observer.observe(document, {
                        childList: true,
                        subtree: true,
                      });
                      setTimeout(() => observer.disconnect(), 10000);
                    },
                  });
                  resolve(newTab.id);
                }
              });
            });
          }
        });
      });
    });
  }


  if (request.action === "closeCurrentTab") {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      if (tabs.length > 1) {
        closedTabIds.add(sender.tab.id);
        chrome.tabs.remove(sender.tab.id, function () {
          if (chrome.runtime.lastError) {
            chrome.tabs.move(sender.tab.id, { index: -1 });
          }
        });
        chrome.storage.local.set({ isPaused: true });
        setTimeout(() => {
          chrome.storage.local.set({ isPaused: false });
        }, 6000);
      }
    });
  }

  if (request.action === "openNewTab") {
    handleTabOpen().then(tabId => {
      if (request.source === "pressBindFix") {
        fetch('http://localhost:3000/tabOpened', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ browserType: request.browserType })
        });
      }
    });
  }

  if (request.action === "clickAndMove") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs.length > 0) {
        const currentTabId = tabs[0].id;
        getNumberOfTabsToClick(currentTabId, function (numberOfTabsToClick) {
          tabsToClick = numberOfTabsToClick;
          clickAndMove(currentTabId, tabsToClick);
        });
      }
    });
  }

  if (request.action === "createNotif") {
    createNotification(request.tabId, request.message);
  }

  if (request.action === "switchTabClick") {
    chrome.tabs.update(request.tabId, { active: true });
  }

  if (request.action === "blacklist") {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      func: (url) => {
        try {
          let btn = document.getElementById('ofh-open-blacklist-btn');
          if (btn) return;
          btn = document.createElement('button');
          btn.id = 'ofh-open-blacklist-btn';
          btn.textContent = 'open blacklist';
          btn.className = 'g-btn m-flat m-btn-gaps m-reset-width';
          const style = btn.style;
          style.position = 'fixed';
          style.top = '10px';
          style.left = '60%';
          style.transform = 'translateX(-50%)';
          style.zIndex = '2147483647';
          style.padding = '8px 14px';
          style.borderRadius = '10px';
          style.fontWeight = 'bold';
          style.cursor = 'pointer';
          document.body.appendChild(btn);
          btn.addEventListener('click', () => { window.open(url, '_blank'); btn.remove(); });
        } catch (e) { console.error(e); }
      },
      args: [request.url]
    });
    if (!request.singleTabMode) {
      chrome.storage.local.set({ [`blacklisted_${request.tabId}`]: true });
    }
  }

  if (request.action === "closeTab" && sender.tab?.id) {
    closedTabIds.add(sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  }
});

async function rememberId(tab, prevTab) {
  chrome.storage.local.set({ savedTabId: tab.id });
  chrome.storage.local.set({ deleteTabId: prevTab.id });
}

async function pressBind(tabIdFromArg) {

  const currentTabId = tabIdFromArg !== undefined ? tabIdFromArg : window.__OFH_CURRENT_TAB_ID__;

  const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');

  const storageData = await new Promise(resolve => {
    chrome.storage.local.get(['pht', 'syncStop', 'singleStop', `blacklisted_${currentTabId}`], resolve);
  });
  const phtIds = Array.isArray(storageData.pht) ? storageData.pht : [];
  const isIntentionallyWithoutPhoto = currentTabId != null && phtIds.some((id) => Number(id) === Number(currentTabId));

  const hasMedia = document.querySelector('.media-file.m-default-bg.m-media-el, .media-file.m-default-bg.m-video-el, .media-file.m-lightbox-el') !== null;
  const shouldPost = isIntentionallyWithoutPhoto || hasMedia;

  if (!shouldPost) {
    console.log(`[OFH] Blocking post on tab ${currentTabId}: media expected but not found`);
    return;
  }

  if (mediaWrapperExists) {
    let selector =
      document.querySelector('[at-attr="submit_post"]') ||
      document.querySelector(
        "#content > div.l-wrapper > div > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button",
      );
    if (selector) {
      const { syncStop = false, singleStop = false } = storageData;
      const isBlacklisted = storageData[`blacklisted_${currentTabId}`] || false;

      if (!syncStop && !singleStop && !isBlacklisted) {

        selector.click();

        setTimeout(function () {
          let buttons = document.querySelectorAll(
            "button.g-btn.m-flat.m-btn-gaps.m-reset-width",
          );
          buttons.forEach(function (button) {
            if (button.textContent.trim() === "Yes") {
              button.click();
            }
          });
        }, 500);
      }
    }
  }
}

async function pressBindFix(tab, browserType, singleTabMode = false) {

  let savedMediaLink = null;
  let fixMediaAttempts = 0;

  async function getMediaLinkBeforeSubmit() {
    const imageElement = document.querySelector('.media-file.m-default-bg.m-media-el');
    if (imageElement && imageElement.getAttribute('href')) {
      return imageElement.getAttribute('href');
    }

    const videoSelectors = '.media-file.m-default-bg.m-video-el, .media-file.m-lightbox-el';
    const videoContainer = document.querySelector(videoSelectors);

    if (videoContainer) {
      const source = videoContainer.querySelector('source');
      if (source && source.src) return source.src;

      const video = videoContainer.querySelector('video');
      if (video && video.src) return video.src;
    }
    return null;
  }

  async function pressBind() {
    const currentTabId = window.__OFH_CURRENT_TAB_ID__;
    const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');

    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(['pht', 'syncStop', 'singleStop'], resolve);
    });
    const phtIds = Array.isArray(storageData.pht) ? storageData.pht : [];
    const isWithoutPhoto = currentTabId != null && phtIds.some((id) => Number(id) === Number(currentTabId));
    const hasMedia = document.querySelector('.media-file.m-default-bg.m-media-el, .media-file.m-default-bg.m-video-el, .media-file.m-lightbox-el') !== null;
    const shouldPost = isWithoutPhoto || hasMedia;

    if (!shouldPost) return;

    if (mediaWrapperExists) {
      savedMediaLink = await getMediaLinkBeforeSubmit();
    }

    const selector =
      document.querySelector('[at-attr="submit_post"]') ||
      document.querySelector(
        "#content > div.l-wrapper > div > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button",
      );
    if (selector) {
      const { syncStop = false, singleStop = false } = storageData;
      if (!syncStop && !singleStop) {
        selector.click();

        if (!singleTabMode) {
          chrome.storage.local.get(['tabsToClose'], (result) => {
            const tabsToClose = result.tabsToClose || [];
            if (!tabsToClose.includes(tab.id)) {
              tabsToClose.push(tab.id);
              chrome.storage.local.set({ tabsToClose: tabsToClose });
            }
          });
        }

        setTimeout(function () {
          const buttons = document.querySelectorAll("button.g-btn.m-flat.m-btn-gaps.m-reset-width");
          buttons.forEach(function (button) {
            if (button.textContent.trim() === "Yes") button.click();
          });
        }, 500);
      }
    }
  }

  var tabId = tab.id;

  window.__OFH_CURRENT_TAB_ID__ = tabId;

  function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }


  let singleTabDone = false;
  let singleTabWentAway = false;
  if (singleTabMode) {
    const navPollId = setInterval(() => {
      const isOnCreate = window.location.href.includes('/posts/create');
      if (!isOnCreate) {
        singleTabWentAway = true;
      } else if (singleTabWentAway && isOnCreate) {
        singleTabDone = true;
        clearInterval(navPollId);
      }
    }, 50);
    window.__ofhNavPollId = navPollId;
  }

  if (!singleTabMode) {
    chrome.runtime.sendMessage({ action: "openNewTab", source: "pressBindFix" });

    if (browserType) {
      fetch('http://localhost:3000/tabOpened', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ browserType })
      });
    }
  }

  function intervalFunc() {

    if (singleTabMode) {
      if (singleTabWentAway && window.location.href.includes('/posts/create')) {
        singleTabDone = true;
      }
      if (singleTabDone) return;
    }

    chrome.storage.local.get(["isPaused", `blacklisted_${tab.id}`], async function (data) {
      if (data.isPaused) {
        setTimeout(intervalFunc, 1000);
        return;
      } else if (data[`blacklisted_${tab.id}`]) {
        return;
      } else {
        const secondTargetNode = document.querySelector(
          ".b-reminder-form.m-error",
        );
        const innerDiv = secondTargetNode
          ? secondTargetNode.querySelector("div")
          : null;
        if (innerDiv) {
          if (!innerDiv.textContent.includes("10")) {
            chrome.runtime.sendMessage({
              action: "createNotif",
              tabId: tab.id,
              message: innerDiv.textContent,
            });
            if (innerDiv.textContent.includes("tag")) {
              const parts = innerDiv.textContent.split("@");
              const username = parts.length > 1 ? parts[1].trim() : '';
              if (!username) return;
              const url = `https://onlyfans.com/my/collections/user-lists/blocked?search=${username}`;

              chrome.runtime.sendMessage({
                action: "blacklist",
                url,
                tabId: tab.id,
                singleTabMode,
              });

              if (!singleTabMode) {
                chrome.storage.local.set({ [`blacklisted_${tab.id}`]: true });
              }
              return;
            }
            else if (/(Daily|Nothing)/.test(innerDiv.textContent)) {
              await delay(20000);
            }
            else if (/Internal/.test(innerDiv.textContent)) {
              chrome.runtime.sendMessage({
                action: "createNotif",
                tabId: tab.id,
                message: innerDiv.textContent,
              });
              await delay(60000);
            }
            else if (/(attached|issue)/i.test(innerDiv.textContent)) {

              fixMediaAttempts++;
              if (fixMediaAttempts > 3) {
                fixMediaAttempts = 0;
                return;
              }

              let mediaLink = savedMediaLink;

              if (mediaLink) {
                const deleteSelector = ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size.has-tooltip";
                let elements = document.querySelectorAll(deleteSelector);
                let divs = document.querySelectorAll(
                  "#make_post_form > div.b-make-post.m-with-free-options > div > div.b-make-post__main-wrapper > div.b-make-post__media-wrapper > div > div > div > div > div > div",
                );
                divs.forEach(function (div) {
                  elements.forEach(function (element) {
                    if (div.contains(element)) {
                      element.click();
                    }
                  });
                });

                await new Promise((resolve) => {
                  const start = Date.now();
                  const check = () => {
                    if (!document.querySelector(deleteSelector) || Date.now() - start > 4000) {
                      resolve();
                    } else {
                      setTimeout(check, 200);
                    }
                  };
                  check();
                });

                function simulateDragAndDrop(
                  sourceElement,
                  targetElement,
                  file,
                ) {
                  const dataTransfer = new DataTransfer();

                  dataTransfer.items.add(file);

                  const dragStartEvent = new DragEvent("dragstart", {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer,
                  });
                  sourceElement.dispatchEvent(dragStartEvent);

                  setTimeout(() => {
                    const dragOverEvent = new DragEvent("dragover", {
                      bubbles: true,
                      cancelable: true,
                      dataTransfer: dataTransfer,
                    });
                    targetElement.dispatchEvent(dragOverEvent);

                    setTimeout(() => {
                      const dropEvent = new DragEvent("drop", {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: dataTransfer,
                      });
                      targetElement.dispatchEvent(dropEvent);

                      const dragEndEvent = new DragEvent("dragend", {
                        bubbles: true,
                        cancelable: true,
                        dataTransfer: dataTransfer,
                      });
                      sourceElement.dispatchEvent(dragEndEvent);
                    }, 100);
                  }, 100);
                }

                async function handleImageUpload(imageUrl) {
                  try {
                    const urlParts = imageUrl.split("/");
                    const fileName = urlParts[urlParts.length - 1].split("?")[0];
                    const fileExtension = fileName.split(".").pop().toLowerCase() || "png";
                    let fileType = "image/png";
                    if (fileExtension === "gif") fileType = "image/gif";
                    else if (fileExtension === "mp4") fileType = "video/mp4";
                    else if (fileExtension === "jpg" || fileExtension === "jpeg") fileType = "image/jpeg";
                    else if (fileExtension === "webp") fileType = "image/webp";

                    const editor = document.querySelector(
                      ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto"
                    );

                    if (fileExtension === "mp4") {
                      const fetchController = new AbortController();
                      const fetchTimeout = setTimeout(() => fetchController.abort(), 90000);
                      try {
                        const fetchRes = await fetch(imageUrl, { signal: fetchController.signal });
                        clearTimeout(fetchTimeout);
                        if (!fetchRes.ok) throw new Error(`Fetch failed: ${fetchRes.status}`);
                        const originalBlob = await fetchRes.blob();

                        let videoBlob = originalBlob;
                        try {
                          const formData = new FormData();
                          formData.append("video", new File([originalBlob], "media.mp4", { type: "video/mp4" }));
                          formData.append("url", imageUrl);
                          const cropController = new AbortController();
                          const cropTimeout = setTimeout(() => cropController.abort(), 60000);
                          const cropRes = await fetch("http://localhost:8765/crop-video-fix", {
                            method: "POST",
                            body: formData,
                            signal: cropController.signal,
                          });
                          clearTimeout(cropTimeout);
                          if (cropRes.ok) {
                            videoBlob = await cropRes.blob();
                          }
                        } catch (cropErr) {
                          console.error("Ошибка crop-video-fix, используется оригинал:", cropErr);
                        }

                        const file = new File([videoBlob], "media.mp4", { type: "video/mp4" });
                        if (editor) {
                          editor.focus();
                          const dummySource = document.createElement("div");
                          simulateDragAndDrop(dummySource, editor, file);
                        }
                      } catch (e) {
                        clearTimeout(fetchTimeout);
                        console.error("Ошибка при загрузке видео:", e);
                      }
                    } else {
                      const imgFetchController = new AbortController();
                      const imgFetchTimeout = setTimeout(() => imgFetchController.abort(), 30000);
                      try {
                        const imgRes = await fetch(imageUrl, { signal: imgFetchController.signal });
                        clearTimeout(imgFetchTimeout);
                        if (!imgRes.ok) throw new Error(`Fetch failed: ${imgRes.status}`);
                        const originalBlob = await imgRes.blob();

                        let imageBlob = originalBlob;
                        try {
                          const formData = new FormData();
                          formData.append("image", new File([originalBlob], `media.${fileExtension}`, { type: fileType }));
                          formData.append("url", imageUrl);
                          const imgCropController = new AbortController();
                          const imgCropTimeout = setTimeout(() => imgCropController.abort(), 30000);
                          const cropRes = await fetch("http://localhost:8765/crop-image-fix", {
                            method: "POST",
                            body: formData,
                            signal: imgCropController.signal,
                          });
                          clearTimeout(imgCropTimeout);
                          if (cropRes.ok) {
                            imageBlob = await cropRes.blob();
                          }
                        } catch (cropErr) {
                          console.error("Ошибка crop-image-fix, используется оригинал:", cropErr);
                        }

                        const ext = fileExtension || fileType.split("/")[1];
                        const file = new File([imageBlob], `media.${ext}`, { type: fileType });
                        if (editor) {
                          editor.focus();
                          const dummySource = document.createElement("div");
                          simulateDragAndDrop(dummySource, editor, file);
                        }
                      } catch (e) {
                        clearTimeout(imgFetchTimeout);
                        console.error("Ошибка при загрузке изображения:", e);
                      }
                    }
                  } catch (error) {
                    console.error("Ошибка при обработке медиа:", error);
                  }
                  isUploading = false;
                }
                await handleImageUpload(mediaLink);
              }
              else {
                innerDiv.textContent = "[OFH] No saved media link available";
                return
              }
              innerDiv.textContent = "[OFH] Fixing media";
              await delay(7000);
            }
            else if (!innerDiv.textContent.includes("[OFH]")) {

              if (singleTabMode && !singleTabDone) {
                setTimeout(intervalFunc, 2000);
              }
              return
            }
            else {
              await delay(10000);
              setTimeout(intervalFunc, 2000);
            }
          }
        }

        try {
          const currentMediaLink = await getMediaLinkBeforeSubmit();
          if (currentMediaLink) {
            savedMediaLink = currentMediaLink;
          }
        } catch (e) {
          console.error("Error saving media link:", e);
        }

        chrome.runtime.sendMessage(
          { action: "checkTab", tabId: tab.id },
          async function (response) {
            if (response && response.shouldClick) {
              await pressBind();
            }
          },
        );

        setTimeout(function () {
          let anchorElement = document.querySelector(
            'a[data-name="PostsCreate"][href="/posts/create"]',
          );
          tabId = tabId.toString();

          if (singleTabMode) {
            if (singleTabDone) return;
            setTimeout(intervalFunc, 2000);
            return;
          }

          chrome.storage.local.get(tabId, function (data) {
            if (
              (anchorElement &&
                !anchorElement.classList.contains("m-disabled")) ||
              data[tabId] ||
              window.location.href.includes("/my/queue")
            ) {
              chrome.runtime.sendMessage({ action: "closeCurrentTab" });
              chrome.storage.local.set({ [tabId]: false });
            } else {
              setTimeout(intervalFunc, 2000);
            }
          });
        }, 1000);
      }
    });
  }
  intervalFunc();
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.storage.local.get(null, function (allItems) {
      const keysToRemove = [];

      for (const key in allItems) {

        if (key.startsWith('blacklisted_')) {
          keysToRemove.push(key);
        }

        else if (/^\d+$/.test(key)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.push('tabIds');

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, function () {
        });
      }
    });

    chrome.tabs.create({ url: "chrome://extensions/" });

    const targetUrl = "https://onlyfans.com/posts/create";
    chrome.tabs.create({ url: targetUrl });

    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      if (tabs.length >= 3) {
        const sortedTabs = tabs.sort((a, b) => a.index - b.index);
        const activeTab = sortedTabs.find(tab => tab.active);
        if (!activeTab) return;

        const tabsToRemove = sortedTabs
          .filter(tab => tab.index < activeTab.index && tab.index !== 0)
          .map(tab => tab.id);

        if (tabsToRemove.length > 0) {
          chrome.tabs.remove(tabsToRemove);
        }
      }
    });

    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      left: 0,
      top: 0,
      width: 220,
      height: 835
    });
  }
});

function createNotification(tabId, message) {
  if (timerVisibility) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || tabs.length === 0 || !tabs[0] || !tabs[0].id) {
        return;
      }
      var activeTabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: function (message, tabId) {
          var notification = document.createElement("div");
          var closeButton = document.createElement("span");
          closeButton.innerText = "×";

          Object.assign(closeButton.style, {
            position: "absolute",
            right: "5px",
            top: "0px",
            cursor: "pointer",
            fontSize: "20px"
          });

          closeButton.onmouseover = function () {
            closeButton.style.color = "red";
          };

          closeButton.onmouseout = function () {
            closeButton.style.color = "";
          };

          closeButton.onclick = function (event) {
            event.stopPropagation();
            document.body.removeChild(notification);
          };

          notification.appendChild(closeButton);

          var messageElement = document.createElement("span");
          messageElement.innerText = message;
          notification.appendChild(messageElement);

          Object.assign(notification.style, {
            position: "fixed",
            bottom: "95px",
            left: "10px",
            maxWidth: "150px",
            padding: "8px 12px",
            backgroundColor: "yellow",
            color: "black",
            textAlign: "center",
            zIndex: "10000",
            borderRadius: "10px",
            fontWeight: "bold",
            cursor: "pointer",
            opacity: "0",
            fontSize: "14px",
            transition: "opacity 0.5s ease-in-out"
          });

          notification.onclick = function () {
            chrome.runtime.sendMessage({
              action: "switchTabClick",
              tabId: tabId
            });
            document.body.removeChild(notification);
          };

          document.body.appendChild(notification);

          setTimeout(function () {
            notification.style.opacity = "1";
          }, 100);

          var timeoutId = setTimeout(function () {
            notification.style.opacity = "0";
            setTimeout(function () {
              if (document.body.contains(notification)) {
                document.body.removeChild(notification);
              }
            }, 500);
          }, 5000);

          notification.onmouseover = function () {
            clearTimeout(timeoutId);
          };

          notification.onmouseout = function () {
            timeoutId = setTimeout(function () {
              notification.style.opacity = "0";
              setTimeout(function () {
                if (document.body.contains(notification)) {
                  document.body.removeChild(notification);
                }
              }, 500);
            }, 1000);
          };
        },
        args: [message, tabId]
      });
    });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {

  if (tab.url && tab.url.includes("onlyfans.com/my/queue")) {
    chrome.storage.local.get(['tabsToClose'], (result) => {
      let tabsToClose = result.tabsToClose || [];

      if (tabsToClose.includes(tabId)) {
        closedTabIds.add(tabId);
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) { }
        });
        tabsToClose = tabsToClose.filter(id => id !== tabId);
        chrome.storage.local.set({ tabsToClose: tabsToClose });
      }
    });
  }

  if (changeInfo.status === "loading") {
    injectedTabs.delete(tabId);
    chrome.storage.local.get("tabIds", function (data) {
      let tabIds = data.tabIds || [];
      const index = tabIds.indexOf(tabId);
      if (index > -1) {
        tabIds.splice(index, 1);
        chrome.storage.local.set({ tabIds: tabIds });
      }
    });
  }

  if (changeInfo.status === "complete" && tab.status === "complete" && tab.url) {

    try {
      if (tab.url.startsWith('https://onlyfans.com')) {
        injectCSS(tabId);
      }
    } catch (_) { }

    chrome.storage.local.get("tabIds", function (data) {
      let tabIds = data.tabIds || [];
      if (!tabIds.includes(tabId)) {
        setBind(tab, DELAY_GREEN_BUTTON);
        tabIds.push(tabId);
        chrome.storage.local.set({ tabIds: tabIds });
      }
    });

    updateTabCounterOnActiveTab(false);

    if (changeInfo.url && changeInfo.url.startsWith('https://onlyfans.com')) {
      chrome.tabs.query({}, function (tabs) {
        const onlyFansTabsCount = tabs.filter(tab =>
          tab.url && tab.url.startsWith('https://onlyfans.com')
        ).length;

        getMyBrowserNumber().then(browserNum => {
          sendReadyRequest(browserNum, onlyFansTabsCount);
        });
        lastTabCount = onlyFansTabsCount;
      });
    }

    if (tab.url === "https://onlyfans.com/posts/create" && tabId !== lastTabId) {
      lastTabId = tabId;
      chrome.storage.local.get(["lastRequestTime"], function (result) {
        var lastRequestTime = result.lastRequestTime
          ? new Date(result.lastRequestTime)
          : null;
        var currentTime = new Date();
        var timeDifference = currentTime - lastRequestTime;
        if (!lastRequestTime || timeDifference >= 12 * 60 * 60 * 1000) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [currentTime.toString()],
            func: (currentTime) => {
              const observer = new MutationObserver(function () {
                const usernameDiv = document.querySelector(".g-user-username");
                if (usernameDiv) {
                  const username = usernameDiv.innerText;
                  if (username) {
                    observer.disconnect();
                    fetch("http://localhost:3000/checkInfo", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        username: username,
                      }),
                    }).then((response) => {
                      if (response.ok) {
                        chrome.storage.local.set({
                          lastRequestTime: currentTime,
                        });
                      }
                    });
                  }
                }
              });
              observer.observe(document.body, { childList: true, subtree: true });
            },
          });
        }
      });
    }
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.status === "complete" && tab.url !== undefined) {
    try {
      if (tab.url && tab.url.startsWith('https://onlyfans.com')) {
        injectCSS(tab.id);
      }
    } catch (_) { }
    chrome.storage.local.get("tabIds", function (data) {
      let tabIds = data.tabIds || [];
      if (tabIds.includes(tab.id)) {
        return;
      } else {
        setBind(tab, DELAY_GREEN_BUTTON);
        tabIds.push(tab.id);
        chrome.storage.local.set({ tabIds: tabIds });
      }
    });
  }
});

chrome.storage.local.remove("tabIds", function () {
  var error = chrome.runtime.lastError;
  if (error) {
    console.error(error);
  }
});

chrome.webNavigation.onCompleted.addListener(
  function (details) {
    if (details.url.startsWith("https://onlyfans.com/")) {
      try {
        injectCSS(details.tabId);
      } catch (_) { }
      updateTabCounterOnActiveTab(false);
    }
  },
  { url: [{ urlMatches: "https://onlyfans.com/" }] },
);

chrome.tabs.onCreated.addListener(function (tab) {
  if (tab.url && tab.url.startsWith("https://onlyfans.com/")) {
    try {
      injectCSS(tab.id);
    } catch (_) { }
    updateTabCounterOnActiveTab(false);
  }
});

setInterval(() => updateTabCounterOnActiveTab(false), 1000);

function sendWsConfirm(cmdId, browserNumber) {
  try {
    if (!cmdId) return;
    chrome.runtime.sendMessage({
      type: 'ws-confirm',
      cmdId: cmdId,
      browserNumber: browserNumber
    });
  } catch (_) { }
}


function shouldSkipDuplicate(entry, browserType) {
  try {
    const now = Date.now();

    if (recentCommands.size >= 100) {
      const oldestKey = Array.from(recentCommands.entries())
        .reduce((oldest, current) =>
          current[1] < oldest[1] ? current : oldest
        )[0];
      recentCommands.delete(oldestKey);
    }

    let valueKey = null;
    if (entry.id === '27') valueKey = `${Math.round(entry.x)}_${Math.round(entry.y)}`;
    else if (entry.id === '29') valueKey = String(entry.scalePercent);
    else if (entry.id === '31') valueKey = String(entry.angleDeg);
    const cmdKey = JSON.stringify({ id: entry.id, text: entry.textInput || null, browserType, v: valueKey });
    const lastTs = recentCommands.get(cmdKey);

    if (lastTs && (now - lastTs) < DEDUPE_TTL_MS) {
      return true;
    }

    recentCommands.set(cmdKey, now);
    return false;
  } catch (_) {
    return false;
  }
}

let tabsToClick = 0;

function clickOnNewTab(tabId, callback) {
  chrome.tabs.get(tabId, tab => {
    if (!tab || chrome.runtime.lastError) {
      callback?.();
      return;
    }

    if (tab.url.startsWith('chrome://')) {
      callback?.();
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        requestAnimationFrame(() => {
          const splitButton = document.getElementById("split-button2");
          const targetPart = splitButton ? splitButton.children[0] : null;

          if (targetPart) {
            const rect = targetPart.getBoundingClientRect();
            const mouseOverEvent = new MouseEvent("mouseover", {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            });
            targetPart.dispatchEvent(mouseOverEvent);
            setTimeout(() => {
              const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
              });
              targetPart.dispatchEvent(clickEvent);
            }, 0);
          }
        });
      }
    }, () => {
      if (chrome.runtime.lastError) {
        console.log('Script execution error:', chrome.runtime.lastError);
        callback?.();
        return;
      }
      callback?.();
    });
  });
}

async function getTabsAfterCurrent(currentTabId) {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
      resolve(tabs.slice(currentIndex + 1));
    });
  });
}

async function disableButtonsOnTabs(tabs, style) {
  return Promise.all(tabs.map(tab =>
    new Promise((resolve) => {

      chrome.tabs.get(tab.id, currentTab => {
        if (!currentTab || chrome.runtime.lastError || currentTab.url.startsWith('chrome://')) {
          resolve();
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (style) => {
            const button = document.getElementById("autopost-button");
            if (button) {
              if (!document.getElementById('auto-post-styles')) {
                const styleSheet = document.createElement("style");
                styleSheet.id = 'auto-post-styles';

                styleSheet.textContent = `
                    #autopost-button:disabled {
                        background-color: #cccccc !important;
                        cursor: not-allowed !important;
                        color: white !important;
                    }
                    #autopost-button:disabled:hover {
                        background-color: #cccccc !important;
                    }
                `;
                document.head.insertBefore(styleSheet, document.head.firstChild);
              }

              function handleMouseOver() {
                if (!button.disabled) {
                  button.style.backgroundColor = "#e38571";
                }
              }

              function handleMouseOut() {
                if (!button.disabled) {
                  button.style.backgroundColor = "rgb(221, 109, 85)";
                }
              }

              button.removeEventListener("mouseover", handleMouseOver);
              button.removeEventListener("mouseout", handleMouseOut);

              button.style.backgroundColor = style.backgroundColor;
              button.style.color = style.color;
              button.style.cursor = style.cursor;
              button.disabled = true;
            }
          },
          args: [style],
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.log('Script execution error:', chrome.runtime.lastError);
          }
          resolve();
        });
      });
    })
  ));
}

async function clickAndMove(currentTabId, remainingClicks) {
  try {
    const tabsAfterCurrent = await getTabsAfterCurrent(currentTabId);

    await disableButtonsOnTabs([...tabsAfterCurrent, { id: currentTabId }], {
      backgroundColor: "#cccccc",
      cursor: "not-allowed",
      color: "white"
    });

    const tabExists = await new Promise((resolve) => {
      chrome.tabs.get(currentTabId, (tab) => {
        resolve(!!tab && !chrome.runtime.lastError);
      });
    });

    if (!tabExists) {
      await resetAllButtonStyles();
      return;
    }

    const stopState = await new Promise((resolve) => {
      chrome.storage.local.get("isStop", (result) => {
        resolve(result.isStop !== undefined ? result.isStop : false);
      });
    });

    if (remainingClicks > 0 && !stopState) {

      await new Promise((resolve) => clickOnNewTab(currentTabId, resolve));

      try {

        const tabsResponse = await fetch('http://localhost:3000/waitForTabsOpened', {
          method: 'POST'
        });

        if (!tabsResponse.ok) {
          throw new Error(`Tabs request failed with status: ${tabsResponse.status}`);
        }

        const tabsResult = await tabsResponse.json();
        if (!tabsResult.success) {
          throw new Error('Tabs did not open in time');
        }

        const hasMoreTabs = await new Promise((resolve) => {
          checkForMoreTabs(currentTabId, (moreTabsExist, nextTabId) => {
            if (moreTabsExist && nextTabId) {
              clickAndMove(nextTabId, remainingClicks - 1);
            }
            resolve(moreTabsExist);
          });
        });

        if (!hasMoreTabs) {
          await resetAllButtonStyles();
        }
      } catch (error) {
        await resetAllButtonStyles();
        return;
      }
    } else {
      await resetAllButtonStyles();
    }
  } catch (error) {
    await resetAllButtonStyles();
  }
}

async function resetAllButtonStyles() {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      Promise.all(tabs.map(tab =>
        new Promise((resolve) => {

          chrome.tabs.get(tab.id, currentTab => {
            if (!currentTab || chrome.runtime.lastError || currentTab.url.startsWith('chrome://')) {
              resolve();
              return;
            }

            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                const button = document.getElementById("autopost-button");
                if (button) {
                  const oldStyle = document.getElementById('auto-post-styles');
                  if (oldStyle) {
                    oldStyle.remove();
                  }

                  function handleMouseOver() {
                    if (!button.disabled) {
                      button.style.backgroundColor = "#e38571";
                    }
                  }

                  function handleMouseOut() {
                    if (!button.disabled) {
                      button.style.backgroundColor = "rgb(221, 109, 85)";
                    }
                  }

                  button.removeEventListener("mouseover", handleMouseOver);
                  button.removeEventListener("mouseout", handleMouseOut);

                  button.style.backgroundColor = "rgb(221, 109, 85)";
                  button.style.color = "white";
                  button.style.cursor = "pointer";
                  button.disabled = false;

                  button.addEventListener("mouseover", handleMouseOver);
                  button.addEventListener("mouseout", handleMouseOut);
                }
              }
            }, (results) => {
              if (chrome.runtime.lastError) {
                console.log('Script execution error:', chrome.runtime.lastError);
              }
              resolve();
            });
          });
        })
      )).then(() => {
        fetch('http://localhost:8444/send_screenshots', {
          method: 'POST'
        })
          .then(response => {
            if (!response.ok) {
              console.log('Send screenshots request failed with status:', response.status);
            } else {
              console.log('Send screenshots request successful');
            }
          })
          .catch(error => {
            console.log('Error sending screenshots request:', error);
          })
          .finally(() => {
            const finish = () => chrome.storage.local.set({ isStop: false }, resolve);

            chrome.tabs.query({ currentWindow: true }, (tabs) => {
              if (!tabs || tabs.length === 0) {
                finish();
                return;
              }
              const onlyfansTabs = tabs.filter(t => t.url && t.url.includes("onlyfans.com"));
              const targetList = onlyfansTabs.length > 0 ? onlyfansTabs : tabs;
              const lastTab = targetList.reduce((acc, t) => (t.index > acc.index ? t : acc), targetList[0]);
              if (!lastTab || !lastTab.id) {
                finish();
                return;
              }
              chrome.tabs.sendMessage(lastTab.id, { action: "autoCompleted" }, () => {
                finish();
              });
            });
          });
      });
    });
  });
}

function checkForMoreTabs(currentTabId, callback) {
  chrome.tabs.query({ currentWindow: true }, function (tabs) {
    let currentTabIndex = tabs.findIndex((tab) => tab.id === currentTabId);
    if (currentTabIndex >= 0 && currentTabIndex < tabs.length - 1) {
      callback(true, tabs[currentTabIndex + 1].id);
    } else {
      tabsToClick = 0;
      callback(false);
    }
  });
}

function getNumberOfTabsToClick(currentTabId, callback) {
  chrome.tabs.query({ currentWindow: true }, function (tabs) {
    let currentTabIndex = tabs.findIndex((tab) => tab.id === currentTabId);
    if (currentTabIndex >= 0) {
      let numberOfTabsToClick = tabs.length - currentTabIndex;
      callback(numberOfTabsToClick);
    } else {
      callback(0);
    }
  });
}

async function collectOnlyfansData(tabId) {
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          let tag = "";
          try {
            const el = document.querySelector(".g-user-username");
            if (el && el.textContent) tag = String(el.textContent).trim();
          } catch (_) { }

          if (tag.startsWith("@")) tag = tag.slice(1);

          const ua = navigator.userAgent || "";

          const xbc =
            (typeof localStorage !== "undefined" &&
              localStorage.getItem("bcTokenSha")) ||
            "";

          try {
            const ex = document.getElementById("ofh-overlay");
            if (ex) ex.remove();
          } catch (_) { }

          const overlay = document.createElement("div");
          overlay.id = "ofh-overlay";
          overlay.style.cssText =
            "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:flex-start;justify-content:flex-end;background:rgba(0,0,0,0);transition:background 220ms ease;";

          const panel = document.createElement("div");
          panel.id = "ofh-panel";
          panel.style.cssText =
            "transform:translateY(-20px);transition:transform 260ms ease,opacity 240ms ease;opacity:0;background:#1e1e1e;color:#e0e0e0;border-radius:10px;padding:14px;max-width:160px;margin:16px;box-shadow:0 6px 18px rgba(0,0,0,.45);border:1px solid #2a2a2a;font-family:'Josefin Sans', sans-serif;";

          const title = document.createElement("div");
          title.textContent = "Data collected";
          title.style.cssText =
            "font-weight:600;margin-bottom:10px;color:#8ab4f8;text-align:center;";

          const buttons = document.createElement("div");
          buttons.style.cssText =
            "display:flex;flex-direction:column;gap:10px;justify-content:flex-start;align-items:stretch;";

          function makeBtn(id, label) {
            const btn = document.createElement("button");
            btn.id = id;
            btn.textContent = label;
            Object.assign(btn.style, {
              backgroundColor: "rgb(90, 98, 104)",
              color: "#ffffff",
              border: "none",
              borderRadius: "10px",
              padding: "8px 14px",
              cursor: "pointer",
              transition: "all 0.3s",
              outline: "none",
              fontFamily: "'Josefin Sans', sans-serif"
            });
            btn.addEventListener("mouseover", () => {
              btn.style.backgroundColor = "#e38571";
            });
            btn.addEventListener("mouseout", () => {
              btn.style.backgroundColor = "rgb(90, 98, 104)";
              btn.style.transform = "scale(1)";
            });
            btn.addEventListener("mousedown", () => {
              btn.style.transform = "scale(0.98)";
            });
            btn.addEventListener("mouseup", () => {
              btn.style.transform = "scale(1)";
            });
            return btn;
          }

          const copyBtn = makeBtn("ofh-copy", "copy");
          const sendBtn = makeBtn("ofh-send", "send");
          const closeBtn = makeBtn("ofh-close", "close");

          function animateClose() {
            try {
              panel.style.transform = "translateY(-20px)";
              panel.style.opacity = "0";
              overlay.style.background = "rgba(0,0,0,0)";
              setTimeout(() => {
                try {
                  overlay.remove();
                } catch (_) { }
              }, 280);
            } catch (_) { }
          }

          overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
              animateClose();
            }
          });

          const uaToken = String(ua).trim().replace(/\s+/g, "_");
          const copyStr = [tag, uaToken, xbc].join(" ").trim();

          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(copyStr);
            } catch (_) { }
          });

          closeBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            animateClose();
          });

          buttons.appendChild(copyBtn);
          buttons.appendChild(sendBtn);
          buttons.appendChild(closeBtn);
          panel.appendChild(title);
          panel.appendChild(buttons);
          overlay.appendChild(panel);
          (document.body || document.documentElement).appendChild(overlay);

          void panel.offsetHeight;
          requestAnimationFrame(() => {
            try {
              overlay.style.background = "rgba(0,0,0,0.35)";
              panel.style.opacity = "1";
              panel.style.transform = "translateY(10px)";
            } catch (_) { }
          });

          window.addEventListener(
            "message",
            (ev) => {
              try {
                const data = ev?.data;
                if (
                  data &&
                  data.type === "OFH_SEND_BROWSER_DATA" &&
                  data.payload
                ) {
                  chrome.runtime.sendMessage({
                    type: "OFH_SEND_BROWSER_DATA_BG",
                    payload: data.payload
                  });
                }
              } catch (_) { }
            }
          );

          return { ua, xbc, tag, overlayPresent: true };
        } catch (e) {
          return { ua: "", xbc: "", tag: "" };
        }
      },
      args: []
    });

    const ua = inj?.result?.ua || "";
    const xbc = inj?.result?.xbc || "";
    const tag = inj?.result?.tag || "";

    const sess = await new Promise((resolve) => {
      try {
        chrome.cookies.get(
          { url: "https://onlyfans.com/", name: "sess" },
          (c) => resolve(c?.value || "")
        );
      } catch (_) {
        resolve("");
      }
    });

    const authId = await new Promise((resolve) => {
      try {
        chrome.cookies.get(
          { url: "https://onlyfans.com/", name: "auth_id" },
          (c) => resolve(c?.value || "")
        );
      } catch (_) {
        resolve("");
      }
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (payload) => {
        try {
          const overlay = document.getElementById("ofh-overlay");
          const sendBtn = document.getElementById("ofh-send");
          const closeBtn = document.getElementById("ofh-close");
          if (!overlay || !sendBtn || !closeBtn) return;

          const animateClose = () => {
            try {
              const panel = document.getElementById("ofh-panel");
              const overlayEl = document.getElementById("ofh-overlay");
              if (!panel || !overlayEl) {
                overlayEl?.remove();
                return;
              }
              panel.style.transform = "translateY(-20px)";
              panel.style.opacity = "0";
              overlayEl.style.background = "rgba(0,0,0,0)";
              setTimeout(() => {
                try {
                  overlayEl.remove();
                } catch (_) { }
              }, 280);
            } catch (_) { }
          };

          sendBtn.addEventListener(
            "click",
            (ev) => {
              ev.stopPropagation();
              try {
                window.postMessage(
                  { type: "OFH_SEND_BROWSER_DATA", payload },
                  "*"
                );
              } catch (_) { }
              animateClose();
            },
            { once: true }
          );

          closeBtn.addEventListener(
            "click",
            (ev) => {
              ev.stopPropagation();
              animateClose();
            },
            { once: true }
          );
        } catch (_) { }
      },
      args: [{ tag, userAgent: ua, xbc, sess, authId }]
    });
  } catch (_) { }
}

async function collectFromSelectedBrowsers() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs && tabs[0];
    if (activeTab && activeTab.url && activeTab.url.startsWith('https://onlyfans.com/')) {
      await collectOnlyfansData(activeTab.id);
    }
  } catch (_) { }
}

function injectConsentObserver(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => {
      if (window.__ofAutoConsentObserver) return;
      window.__ofAutoConsentObserver = true;

      const observer = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            const modalBody = document.getElementById("ModalConfirm___BV_modal_body_");
            if (modalBody && modalBody.textContent.includes("I Consent to the distribution")) {
              const modal = modalBody.closest('.modal-content') || modalBody.parentElement || document.body;
              const buttons = Array.from(modal.querySelectorAll("button"));
              const yesButton = buttons.find(b => b.textContent && b.textContent.trim().toLowerCase() === "yes");
              if (yesButton && !yesButton.disabled) {
                yesButton.click();
              }
            }
          }
        }
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }
  }).catch((e) => { });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.includes("onlyfans.com")) {
    injectConsentObserver(tabId);
  }
});

chrome.tabs.query({ url: "https://onlyfans.com/*" }, (tabs) => {
  if (!tabs) return;
  for (const tab of tabs) {
    if (tab.id) {
      injectConsentObserver(tab.id);
    }
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.storiesSyncCanvasEnabled) {
    const newValue = changes.storiesSyncCanvasEnabled.newValue !== false;
    chrome.tabs.query({ url: "*://*.onlyfans.com/*" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (val) => { window.__OFH_SYNC_ENABLED = val; },
            args: [newValue]
          }).catch(() => { });
        }
      }
    });
  }
});

const ALL_ACTIONS_MONITOR = 200;
const DELAY_GREEN_BUTTON = 500;

console.error = function () {};

async function executeScriptIfValid(activeTab, details) {
  if (activeTab && !activeTab.url.startsWith("chrome://")) {
    await chrome.scripting.executeScript(details);
  }
}

const protectedTabs = {
  ids: new Set(),

  add: function(tabId) {
    const tabIdStr = String(tabId);
    this.ids.add(tabIdStr);
    return tabIdStr;
  },
  
  has: function(tabId) {
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
const intervals = new Map();
let processing = false;

function checkAndCloseTab(tabId, serializedIntervals) {
  const intervalsArray = Object.entries(serializedIntervals);
  const hasInterval = intervalsArray.some(([key]) => key === tabId.toString());

    const cleanupInterval = (tabId) => {
      chrome.runtime.sendMessage({
        type: 'clearInterval',
        tabId: tabId
      });
    };
    
    if (hasInterval) {
      cleanupInterval(tabId); 
    }

    const editor = document.querySelector(".tiptap.ProseMirror");
    if (editor?.getAttribute("data-is-empty") === "true") {
      chrome.runtime.sendMessage({ action: "closeTab", tabId });
      return;
    }

    const pressBind = () => {
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

      chrome.runtime.sendMessage({
        type: 'setInterval',
        tabId: tabId,
        intervalId: intervalId
      });
    };

    const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');
    if (!mediaWrapperExists) {
      return
    }

    const secondTargetNode = document.querySelector(
      ".b-reminder-form.m-error",
    );
    const innerDiv = secondTargetNode
      ? secondTargetNode.querySelector("div")
      : null;
      
    if (!document.querySelector(".b-reminder-form.m-error") || (innerDiv && innerDiv.textContent.includes("10"))) {
      pressBind();
    }
}

function updateTabCounterOnActiveTab(isReset) {
  chrome.tabs.query({}, function (allTabs) { 
    const onlyFansTabsCount = allTabs.filter(tab => 
      tab.url.startsWith('https://onlyfans.com')
    ).length;
 
    chrome.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
      if (activeTabs.length === 0) return;
      const activeTab = activeTabs[0];
 
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (isVisible) => {
          const elements = [
            "tabCounter", "cont1", "cont2", "cont3", 
            "switch-button", "fakeMakeButton", "version", "clear-button", "reload-button", "stories-container", "bottom-overlay", "joy"
          ].map(id => document.getElementById(id));
          
          elements.forEach(el => {
            if (el) {
              el.style.opacity = isVisible ? "1" : "0";
              el.style.pointerEvents = isVisible ? "auto" : "none";
            }
          });
        },
        args: [timerVisibility]
      }).catch(console.error);
 
      let timeSinceLastClosed = "00:00";
      let color = "rgb(45, 155, 55)";
 
      if (isReset) {
        lastClosedTime = new Date();
        closedTabsCount = 0;
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
          
          document.readyState === "loading"
            ? document.addEventListener("DOMContentLoaded", update)
            : update();
        },
        args: [onlyFansTabsCount, closedTabsCount, timeSinceLastClosed, color]
      }).catch(console.error);
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
                tabs.length >= 30
              ) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: checkAndCloseTab,
                  args: [tab.id, Object.fromEntries(intervals)],
                });
              } else if (
                tab.url.startsWith("https://onlyfans.com") &&
                tab.url !== "https://onlyfans.com/posts/create" &&
                tabs.length >= 5
              ) {
                closedTabIds.add(tab.id);
                chrome.tabs.remove(tab.id);
              }
            }
          }
        );
      }
    );
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'setInterval':
      intervals.set(message.tabId, message.intervalId);
      break;
    case 'clearInterval':
      if (intervals.has(message.tabId)) {
        clearInterval(intervals.get(message.tabId));
        intervals.delete(message.tabId);
      }
      break;
  }
});

function openNewTab() {
  chrome.runtime.sendMessage({ action: "openNewTab" });
}

async function toggleColors() {
  function waitForElement(selector, callback) {
    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        callback(element);
        clearInterval(interval);
      }
    }, 500);
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

  const checkDropzoneElements = setInterval(() => {
    const elements = document.querySelectorAll(
      ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size"
    );
    
    if (elements.length >= 2) {
      setTimeout(() => {
        const updatedElements = document.querySelectorAll(
          ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size"
        );
        
        updatedElements.forEach((element) => {
          element.style.opacity = ".4";
          element.style.background = "rgba(138, 150, 163, .75)";
        });
        clearInterval(checkDropzoneElements);
      }, 1000); 
    }
  }, 500);
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
  button.style.background = "#2D9B37";
}

async function instantPostOff() {
  await chrome.storage.local.set({ postChecked: false });
  const button = document.getElementById("instantPost");
  button.style.background = "#DD6D55";
}

async function fakeColorsOn() {
  await chrome.storage.local.set({ fakeChecked: true });
  const button = document.getElementById("fakeButton");
  button.style.background = "#6E8C6E";
}

async function fakeColorsOff() {
  await chrome.storage.local.set({ fakeChecked: false });
  const button = document.getElementById("fakeButton");
  button.style.background = "#8C6E6E"; 
}

async function searchPosts() {
  const fileUrl = chrome.runtime.getURL("server/files/tags.txt");
  const response = await fetch(fileUrl);
  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  const usernameDiv = document.querySelector(".g-user-username");
  if (usernameDiv) {
    const username = usernameDiv.innerText;
    const baseUrl = "https://onlyfans.com/";
    const searchUrl = "/search/posts?q=";

    chrome.runtime.sendMessage({
      action: "openAndProtectTabs",
      urls: lines.map(line => `${baseUrl}${line}${searchUrl}${username}`)
    });
  }
}

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
   if (message.action === "protectTab") {

    const openedTabIds = [];
    
    message.urls.forEach(url => {
      chrome.tabs.create({ url: url }, (tab) => {

        protectedTabs.add(tab.id);
        openedTabIds.push(tab.id);
        
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
          
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: processTab
            });
          }
        });
      });
    });

    sendResponse({ success: true });
    
    } else if (message.action === "openAndProtectTabs") {
      message.urls.forEach(url => {
        chrome.tabs.create({ url: url }, (tab) => {
          protectedTabs.add(tab.id);
        });
      });
    }
})

async function checkModels() {
  const fileUrl = chrome.runtime.getURL("server/files/tags.txt");
  const response = await fetch(fileUrl);
  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  
  const urls = lines.map(line => `https://onlyfans.com/${line}`);
  chrome.runtime.sendMessage({
    action: "protectTab",
    urls: urls
  });
}

async function processTab() {
  async function outputElements() {
    const usernameElements = document.querySelectorAll(".g-user-username");
    const username = usernameElements.length >= 2 ? usernameElements[1].textContent : "-";
    let fanCountElement = document.querySelector('svg[data-icon-name="icon-follow"]');
    const fanCount = fanCountElement
      ? fanCountElement.nextElementSibling.textContent.trim()
      : "closed Fans";

    setTimeout(async () => {
      const currentMonthElement = document.querySelector(".vdatetime-calendar__current--month");
      const currentMonth = currentMonthElement ? currentMonthElement.textContent : "-";
      let firstActiveDay = document.querySelector(
        ".vdatetime-calendar__month__day:not(.vdatetime-calendar__month__day--disabled)"
      );
      let firstActiveDayNumber = firstActiveDay
        ? firstActiveDay.querySelector("span span").textContent
        : "-";
    
      const data = { username, currentMonth, firstActiveDayNumber, fanCount };

      try {
        const response = await fetch("http://localhost:3000/checkModels", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data)
        });
        
        if (response.ok) {
          console.log("Data sent successfully to the server");
          chrome.runtime.sendMessage({ action: "closeTab" });
        } else {
          console.error("Failed to send data to the server");
        }
      } catch (error) {
        console.error("Error:", error);
      }
    }, 1000);
  }

  let subscribeButtonClicked = false;
  let dropdownButtonClicked = false;

  const observer = new MutationObserver(async (mutationsList, observer) => {
    for (let mutation of mutationsList) {
      if (mutation.type === "childList") {
        const subscribeButton = document.querySelector(
          ".m-rounded.m-flex.m-space-between.m-lg.g-btn"
        );
        const dropdownButton = document.querySelector(
          ".btn.dropdown-toggle.g-btn.m-gray.m-with-round-hover.m-icon.m-icon-only.m-sm-size"
        );

        if (
          subscribeButton &&
          !dropdownButtonClicked &&
          !dropdownButton &&
          !subscribeButtonClicked
        ) {
          subscribeButtonClicked = true;
          setTimeout(() => {
            subscribeButton.click();
            setTimeout(() => {
              const newDropdownButton = document.querySelector(
                ".btn.dropdown-toggle.g-btn.m-gray.m-with-round-hover.m-icon.m-icon-only.m-sm-size"
              );
              if (newDropdownButton) {
                newDropdownButton.click();
                dropdownButtonClicked = true;

                setTimeout(() => {
                  const goToDateLabel = document.querySelector(
                    'label[for="filter-go-to-date"]'
                  );
                  if (goToDateLabel) {
                    goToDateLabel.click();
                  }

                  setTimeout(async () => {
                    let days = Array.from(
                      document.querySelectorAll(
                        ".vdatetime-calendar__month .vdatetime-calendar__month__day"
                      )
                    );
                    days = days.filter(
                      (day) =>
                        !day.classList.contains(
                          "vdatetime-calendar__month__day--disabled"
                        )
                    );

                    while (days.length > 0) {
                      const previousButton = document.querySelector(
                        ".vdatetime-calendar__navigation--previous"
                      );
                      if (previousButton) {
                        previousButton.click();
                        await new Promise((resolve) =>
                          setTimeout(resolve, 100)
                        );
                      }
                      days = Array.from(
                        document.querySelectorAll(
                          ".vdatetime-calendar__month .vdatetime-calendar__month__day"
                        )
                      );
                      days = days.filter(
                        (day) =>
                          !day.classList.contains(
                            "vdatetime-calendar__month__day--disabled"
                          )
                      );
                    }

                    const nextButton = document.querySelector(
                      ".vdatetime-calendar__navigation--next"
                    );
                    if (nextButton) {
                      nextButton.click();
                      setTimeout(async () => {
                        await outputElements();
   
                        observer.disconnect();
                      }, 500);
                    }
                  }, 500);
                }, 3000);
              }
            }, 9000);
          }, 5000);
        }

        if (dropdownButton && !dropdownButtonClicked) {
          dropdownButtonClicked = true;
          setTimeout(() => {
            dropdownButton.click();
            setTimeout(() => {
              const goToDateLabel = document.querySelector(
                'label[for="filter-go-to-date"]'
              );
              if (goToDateLabel) {
                goToDateLabel.click();
              }

              setTimeout(async () => {
                let days = Array.from(
                  document.querySelectorAll(
                    ".vdatetime-calendar__month .vdatetime-calendar__month__day"
                  )
                );
                days = days.filter(
                  (day) =>
                    !day.classList.contains(
                      "vdatetime-calendar__month__day--disabled"
                    )
                );

                while (days.length > 0) {
                  const previousButton = document.querySelector(
                    ".vdatetime-calendar__navigation--previous"
                  );
                  if (previousButton) {
                    previousButton.click();
                    await new Promise((resolve) =>
                      setTimeout(resolve, 100)
                    );
                  }
                  days = Array.from(
                    document.querySelectorAll(
                      ".vdatetime-calendar__month .vdatetime-calendar__month__day"
                    )
                  );
                  days = days.filter(
                    (day) =>
                      !day.classList.contains(
                        "vdatetime-calendar__month__day--disabled"
                      )
                  );
                }

                const nextButton = document.querySelector(
                  ".vdatetime-calendar__navigation--next"
                );
                if (nextButton) {
                  nextButton.click();
                  setTimeout(async () => {
                    await outputElements();
                    
                    observer.disconnect();
                  }, 500);
                }
              }, 500);
            }, 500);
          }, 5000);
        }
      }
    }
  });

  if (document.readyState !== "loading") {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }
}

let lastMentionPos = null;

function updateMentionPosition(newX, newY) {
  const canvas = document.querySelector(".upper-canvas");
  const canvasRect = canvas.getBoundingClientRect();
  const startX = canvasRect.left + lastMentionPos.x;
  const startY = canvasRect.top + lastMentionPos.y;
  const endX = canvasRect.left + newX;
  const endY = canvasRect.top + newY;
  const mouseDownEvent = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: startX,
    clientY: startY
  });
  canvas.dispatchEvent(mouseDownEvent);
  const mouseMoveEvent = new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: endX,
    clientY: endY
  });
  canvas.dispatchEvent(mouseMoveEvent);
  const mouseUpEvent = new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: endX,
    clientY: endY
  });
  canvas.dispatchEvent(mouseUpEvent);
  lastMentionPos = { x: newX, y: newY };
}

async function processImageAndUpload(imageTag) {
  function sendJoystickData(newTagX, newTagY) {
    fetch("http://localhost:3000/joystick-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: newTagX, y: newTagY })
    }).catch(error => {
      console.error("Error sending joystick data:", error);
    });
  }

  function createJoystick() {
    const containerSize = 100; 
    const handleSize = 10; 
    const joystickContainer = document.createElement("div");
    joystickContainer.id = "joy"
    joystickContainer.style.position = "fixed";
    joystickContainer.style.top = "45px";
    joystickContainer.style.left = "10px";
    joystickContainer.style.width = containerSize + "px";
    joystickContainer.style.height = containerSize + "px";
    joystickContainer.style.border = "2px solid #000";
    joystickContainer.style.boxSizing = "border-box";
    joystickContainer.style.zIndex = "10000";
    joystickContainer.style.background = "rgb(90, 98, 104)";
    joystickContainer.style.borderRadius = "10px";

    const joystickHandle = document.createElement("div");
    joystickHandle.style.width = handleSize + "px";
    joystickHandle.style.height = handleSize + "px";
    joystickHandle.style.borderRadius = "50%";
    joystickHandle.style.background = "#fff";
    joystickHandle.style.position = "absolute";
    const initialX = (containerSize - handleSize) / 2;
    const initialY = (containerSize - handleSize) / 2;
    joystickHandle.style.left = initialX + "px";
    joystickHandle.style.top = initialY + "px";
    joystickHandle.style.zIndex = "10000";

    joystickContainer.appendChild(joystickHandle);
    document.body.appendChild(joystickContainer);

    let offsetX = 0;
    let offsetY = 0;
    let currentX = initialX;
    let currentY = initialY;
    let dragging = false;

    joystickHandle.addEventListener("pointerdown", function(e) {
      dragging = true;
      offsetX = e.clientX - joystickHandle.getBoundingClientRect().left;
      offsetY = e.clientY - joystickHandle.getBoundingClientRect().top;
      joystickHandle.setPointerCapture(e.pointerId);
    });

    document.addEventListener("pointermove", function(e) {
      if (!dragging) return;
      const containerRect = joystickContainer.getBoundingClientRect();
      let newLeft = e.clientX - containerRect.left - offsetX;
      let newTop = e.clientY - containerRect.top - offsetY;
      newLeft = Math.max(0, Math.min(newLeft, containerSize - handleSize));
      newTop = Math.max(0, Math.min(newTop, containerSize - handleSize));
      currentX = newLeft;
      currentY = newTop;
      joystickHandle.style.left = currentX + "px";
      joystickHandle.style.top = currentY + "px";
    });

    document.addEventListener("pointerup", function(e) {
      if (!dragging) return;
      dragging = false;
      const canvas = document.querySelector(".upper-canvas");
      const canvasRect = canvas.getBoundingClientRect();
      const whiteCenterX = currentX + handleSize / 2;
      const whiteCenterY = currentY + handleSize / 2;
      const percentX = whiteCenterX / containerSize;
      const percentY = whiteCenterY / containerSize;
      const newTagX = percentX * canvasRect.width;
      const newTagY = percentY * canvasRect.height;
      sendJoystickData(newTagX, newTagY);
    });
  }

  function initializeLastMentionPos() {
    const canvas = document.querySelector(".upper-canvas");
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      lastMentionPos = { x: rect.width / 2, y: rect.height / 2 };
    }
  }

  const waitForElement = (selector, maxAttempts = 30, interval = 500) => new Promise((resolve, reject) => {
    let attempts = 0;
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) { resolve(element); return; }
      attempts++;
      if (attempts >= maxAttempts) { reject(new Error(selector)); return; }
      setTimeout(checkElement, interval);
    };
    checkElement();
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
      if (attempts >= maxAttempts) { reject(new Error(text)); return; }
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
      if (attempts >= maxAttempts) { reject(new Error(text)); return; }
      setTimeout(checkButtons, interval);
    };
    checkButtons();
  });

  const cleanTag = imageTag.trim();
  const userUsernameElement = await waitForElement(".g-user-username");
  if (userUsernameElement) {
    const username = userUsernameElement.textContent.trim().replace(/^@/, '');
    if (username === cleanTag) {
      return Promise.resolve();
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
      } catch (error) { console.log(error); }
    }
    try {
      const imageUrl = chrome.runtime.getURL(`server/crop/images/${tag}`);
      const response = await fetch(imageUrl);
      if (response.ok) {
        const blob = await response.blob();
        const mimeType = blob.type;
        let extension = "png";
        if (mimeType.includes("jpeg") || mimeType.includes("jpg")) { extension = "jpg"; }
        else if (mimeType.includes("png")) { extension = "png"; }
        else if (mimeType.includes("heic")) { extension = "heic"; }
        return { blob: blob, filename: `${tag}.${extension}`, extension: extension };
      }
    } catch (error) { console.log(error); }
    return null;
  };
  return new Promise(async (resolve, reject) => {
    try {
      const button = await waitForElement("#add-story-btn");
      const imageData = await findAndLoadImage(fileSearchTag);
      if (!imageData) { throw new Error(fileSearchTag); }
      let mimeType = "image/png";
      switch (imageData.extension) {
        case "jpg":
        case "jpeg":
          mimeType = "image/jpeg";
          break;
        case "png":
          mimeType = "image/png";
          break;
        case "heic":
          mimeType = "image/heic";
          break;
      }
      const file = new File([imageData.blob], imageData.filename, { type: mimeType });
      button.click();
      const fileInput = await waitForElement('input[type="file"]');
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;
      const event = new Event("change", { bubbles: true });
      fileInput.dispatchEvent(event);
      const mentionButton = await waitForElement(".g-btn.m-with-round-hover.m-light.m-icon.m-icon-only.m-white.m-sm-size.has-tooltip");
      await new Promise(resolve => setTimeout(resolve, 3000));
      mentionButton.click();
      const mentionLink = await waitForElementWithText(".b-stickers__link.d-flex.align-items-center.w-100.m-bg-light", "Mention");
      mentionLink.click();
      const textarea = await waitForElement('textarea[placeholder="Mention"]');
      textarea.value = cleanTag;
      const inputEvent = new Event("input", { bubbles: true });
      textarea.dispatchEvent(inputEvent);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const doneButton = await waitForButtonWithText(".g-btn.m-rounded.m-reset-width", "Done");
      doneButton.click();
      initializeLastMentionPos();
      createJoystick();
      resolve();
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}


function postStories() {
  function checkButtonExists() {
    const button = document.querySelector('.g-btn.m-rounded.m-reset-width.d-inline-flex');
    return button !== null;
  }

  function clickButton() {
    const button = document.querySelector('.g-btn.m-rounded.m-reset-width.d-inline-flex');
    if (button) {
      button.click();
      return true;
    }
    return false;
  }

  if (checkButtonExists()) { 
    clickButton();
    const joyElement = document.getElementById('joy');
    if (joyElement) {
      joyElement.style.display = 'none';
  }
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
    var clearButton = document.querySelector(
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
          var clearButton = document.querySelector(
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

function stopPosting() {

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
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;

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
          canvas.width = element.naturalWidth;
          canvas.height = element.naturalHeight;
          ctx.drawImage(element, 0, 0);
          return new Promise((resolve) => canvas.toBlob(resolve));
        } else if (element instanceof HTMLVideoElement) {
          const response = await fetch(element.src);
          return response.blob();
        }
      };

      convertMediaToBlob(mediaElement).then((blob) => {
        const fileExtension =
          mediaElement instanceof HTMLImageElement ? "png" : "mp4";
        const mimeType =
          mediaElement instanceof HTMLImageElement ? "image/png" : "video/mp4";
        const file = new File([blob], `media.${fileExtension}`, {
          type: mimeType,
        });

        dataTransfer.items.add(file);

        const events = [
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          }),
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          }),
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          }),
        ];

        sourceElement.dispatchEvent(events[0]);
        setTimeout(() => {
          targetElement.dispatchEvent(events[1]);
          setTimeout(() => {
            targetElement.dispatchEvent(events[2]);
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
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(resource, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(id);
        return response;
      } catch (e) {
        if (e.name === "AbortError") {
          console.log(`Fetch timed out. Retrying (${i + 1}/${retries})...`);
          continue;
        } 
        throw e;
      }
    }
    throw new Error("Fetch failed after retries");
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

async function addTextToPost(text, imageUrl, index, browserType, exp, txt, pht) {
  let isUploading = false;
  let imageInserted = false;
  let textInserted = false;
  let isProcessing = false;

  async function fetchWithRetry(resource, options, timeout = 5000, retries = 3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(resource, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  function simulateDragAndDrop(sourceElement, targetElement, file) {
    try {
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
    } catch (error) {}
  }

  async function sendUpdateRequest() {
    const shouldSendRequest = (imageInserted || !pht) && (textInserted || !txt);
    if (!shouldSendRequest) return;
    
    const number = parseInt(browserType.replace(/\D/g, "")) || 0;
    
    const requestConfig = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        index: index,
        number: number,
      }),
    };
    
    const url = "http://localhost:3000/update-browser";
    const timeout = 5000;
    
    try {
      await fetchWithRetry(url, requestConfig, timeout);
    } catch (error) {
      setTimeout(async () => {
        try {
          await fetchWithRetry(url, requestConfig, timeout);
        } catch (e) {
          console.error("Failed to update browser after retry:", e);
        }
      }, 2000);
    }
  }

  async function handleImageUpload(pht) {
    if (isUploading || !pht) {
      if (!pht) {
        imageInserted = true;
        await sendUpdateRequest();
      }
      return;
    }

    isUploading = true;
    
    try {
      const fileExtension = imageUrl.split(".").pop().toLowerCase();
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
          try {
            const mediaBlob = await fetch(imageUrl).then(res => res.blob());
            const file = new File([mediaBlob], `media.${fileExtension}`, {
              type: fileType,
            });
            
            let dragAttempts = 0;
            let mediaInserted = false;
            
            const observer = new MutationObserver((mutations) => {
              for (let mutation of mutations) {
                if (mutation.type === "childList") {
                  const mediaWrapper = document.querySelector(".b-make-post__media-wrapper");
                  if (mediaWrapper && !mediaInserted) {
                    mediaInserted = true;
                    resolve();
                    observer.disconnect();
                  }
                }
              }
            });
            
            observer.observe(document.body, { childList: true, subtree: true });
            
            const tryInsertMedia = async () => {
              if (mediaInserted || dragAttempts >= 3) {
                return;
              }

              const editor = document.querySelector(
                ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto"
              );
              
              const mediaWrapper = document.querySelector(".b-make-post__media-wrapper");
              
              if (editor && !mediaWrapper) {
                editor.focus();
                simulateDragAndDrop(mediaElement, editor, file);
                dragAttempts++;
                
                setTimeout(() => {
                  const updatedMediaWrapper = document.querySelector(".b-make-post__media-wrapper");
                  if (updatedMediaWrapper) {
                    mediaInserted = true;
                    resolve();
                    observer.disconnect();
                  } else if (dragAttempts >= 3) {
                    resolve();
                    observer.disconnect();
                  } else {
                    setTimeout(tryInsertMedia, 1000);
                  }
                }, 500);
              } else if (mediaWrapper) {
                mediaInserted = true;
                resolve();
                observer.disconnect();
              } else {
                setTimeout(tryInsertMedia, 1000);
              }
            };
            
            tryInsertMedia();
            
            setTimeout(() => {
              observer.disconnect();
              resolve();
            }, 30000);
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
        sendUpdateRequest();
      });
    } catch (e) {
      isUploading = false;
      imageInserted = true;
      await sendUpdateRequest();
    }
  }

  const formatText = (text) => {
    if (!text) return '';
  
    let formattedText = text.split('\n').join('<br>');

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
      formattedText = formattedText.replace(regex, replacement);
    });
  
    const segments = formattedText.split('<br>');
    formattedText = segments
      .map(segment => {
        if (segment.trim().startsWith('<') && segment.trim().endsWith('>')) {
          return segment;
        }
        return `<p>${segment}</p>`;
      })
      .join('');
  
    return formattedText;
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
      
      const expireButton = await waitForElement(".b-make-post__expire-period-btn");
      if (!expireButton) {
        throw new Error("Expire period button not found");
      }
      
      if (imageUrl) {
        await handleImageUpload(pht);
      } else {
        imageInserted = true;
      }
      
      const textarea = await waitForElement(".tiptap.ProseMirror");
      if (textarea && txt) {
        textarea.innerHTML = formatText(text);
        textInserted = true;
        await sendUpdateRequest();
      } else {
        textInserted = true;
        await sendUpdateRequest();
      }
      
      if (exp) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const expireButtonAgain = await waitForElement(".b-make-post__expire-period-btn");
        if (expireButtonAgain) {
          expireButtonAgain.dispatchEvent(clickEvent);
          
          const button2 = await waitForElement(
            "#ModalPostExpiration___BV_modal_body_ > div.b-tabs__nav.m-nv.m-tab-rounded.mb-0.m-single-current > ul > li:nth-child(2) > button"
          );
          
          if (button2) {
            button2.dispatchEvent(clickEvent);
            
            const confirmButton = await waitForElement(
              "#ModalPostExpiration___BV_modal_footer_ > button:nth-child(2)"
            );
            
            if (confirmButton) {
              confirmButton.dispatchEvent(clickEvent);
            }
          }
        }
      }
    } catch (error) {
    } finally {
      isProcessing = false;
    }
  }
  
  setTimeout(() => {
    startProcessing();
  }, 1000);
}

function addTimeToPost(textInput, isApart, browserType) {
  
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
        clearInterval(intervalId);
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

      if (textInput.length === 1 || textInput.length === 2 || textInput.length === 3 ) {
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
        var textInput = parseInt(parts[0]);
        newMinutes = parseInt(parts[1]);
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

        textInput = textInput.toString();
        newMinutes = newMinutes.toString();
      }

      if (
        textInput.length === 1 ||
        textInput.length === 2 ||
        textInput.length === 3
      ) {
        
        hours = currentTimeInHours + parseInt(textInput);
        if (isApart) {
          let number = parseInt(browserType.replace(/\D/g, ""));
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
        
        else if (hours === 24 ) {
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
          let getMonth = parseInt(parts[0]);
          currentDayOfMonth = parseInt(parts[1]);
          newHours = parseInt(parts[2].slice(0, -3));
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
            let currentMonthElement = document.querySelector(
              "#make_post_form > div.vdatetime.b-datepicker-input.custom-datepicker > div > div.vdatetime-popup.m-vdatetime-tabs > div.vdatetime-popup__body > div > div.vdatetime-calendar__navigation > div.vdatetime-calendar__current--month",
            );
            let currentMonthName = currentMonthElement.innerText.split(" ")[0];
            if (nextMonthName !== currentMonthName) {
              next.dispatchEvent(clickEvent);
            }
          }, 1000);
        }
      }

      if (textInput.length === 5) {
        newHours = parseInt(textInput.substring(1, 2));
        newMinutes = textInput.substring(2, 4);
      } else if (textInput.length === 6) {
        newHours = parseInt(textInput.substring(1, 3));
        newMinutes = textInput.substring(3, 5);
      }

      if (isApart && textInput.length !== 1 && textInput.length !== 2) {
        let number = parseInt(browserType.replace(/\D/g, ""));
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
          if (span && parseInt(span.innerText) === currentDayOfMonth) {
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
            const number = parseInt(div.innerText);

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
    const intervalId = setInterval(checkButtonsAndContinue, 200);
  } catch (error) {
    console.log("Error: ", error);
  }
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

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (
    changeInfo.status === "complete" &&
    tab.url === "https://onlyfans.com/posts/create" &&
    tabId !== lastTabId
  ) {
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
          function: function (currentTime) {
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

async function checkDataFile() {

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

  const dataFileURL = chrome.runtime.getURL("server/files/data/data.json");
  const result = await chrome.storage.local.get([
    "browser1Checked",
    "browser2Checked",
    "browser3Checked",
    "browser4Checked",
    "browser5Checked",
    "browser6Checked",
    "browser7Checked",
    "browser8Checked",
    "browser9Checked",
    "browser10Checked",
    "browser11Checked",
    "browser12Checked",
    "browser13Checked",
    "browser14Checked",
    "browser15Checked",
    "postChecked",
  ]);

  const browser1 = result.browser1Checked;
  const browser2 = result.browser2Checked;
  const browser3 = result.browser3Checked;
  const browser4 = result.browser4Checked;
  const browser5 = result.browser5Checked;
  const browser6 = result.browser6Checked;
  const browser7 = result.browser7Checked;
  const browser8 = result.browser8Checked;
  const browser9 = result.browser9Checked;
  const browser10 = result.browser10Checked;
  const browser11 = result.browser11Checked;
  const browser12 = result.browser12Checked;
  const browser13 = result.browser13Checked;
  const browser14 = result.browser14Checked;
  const browser15 = result.browser15Checked;
  const instantPost = result.postChecked;

  try {
    if (typeof instantPost === "boolean") {
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: listenForButtonClicks,
          args: [instantPost, activeTab.id],
        });
      });
    }

    const response = await fetch(dataFileURL);
    const data = await response.json();

    let lastEntry = null;
    let lastIndex = -1;
    for (let i = 0; i < data.length; i++) {
      const entry = data[i];
      if (
        (browser1 && !entry.browser1) ||
        (browser2 && !entry.browser2) ||
        (browser3 && !entry.browser3) ||
        (browser4 && !entry.browser4) ||
        (browser5 && !entry.browser5) ||
        (browser6 && !entry.browser6) ||
        (browser7 && !entry.browser7) ||
        (browser8 && !entry.browser8) ||
        (browser9 && !entry.browser9) ||
        (browser10 && !entry.browser10) ||
        (browser11 && !entry.browser11) ||
        (browser12 && !entry.browser12) ||
        (browser13 && !entry.browser13) ||
        (browser14 && !entry.browser14) ||
        (browser15 && !entry.browser15)
      ) {
        lastEntry = entry;
        lastIndex = i;
        break;
      }
    }

    let browserType = "";
    var isApart = false;

    if (lastEntry) {
      
      const browserVars = [browser1, browser2, browser3, browser4, browser5, browser6, browser7, 
        browser8, browser9, browser10, browser11, browser12, browser13, 
        browser14, browser15];

        for (let i = 0; i < 15; i++) {
          if (browserVars[i] && !lastEntry[`browser${i+1}`]) {
            browserType = `browser${i+1}`;
            break;
          }
        }  

      isApart = lastEntry.isApart;
      isDelete = lastEntry.isDelete;
    }

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
      await sendTypeToServer(lastIndex, browserType);
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
      const activeTab = currentWindow.tabs.find((tab) => tab.active);
      await executeScriptIfValid(activeTab, {
        target: { tabId: activeTab.id },
        func: clearPosts,
      });
      return
    })}

    if (lastEntry && (lastEntry.id === "24" || (lastEntry.id === "11" && lastEntry.textInput === "reload")) && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
      const activeTab = currentWindow.tabs.find((tab) => tab.active);
      await executeScriptIfValid(activeTab, {
        target: { tabId: activeTab.id },
        func: reloadPage,
      });
      return
    })}

    async function processTags() {
    const tagsFilePath = 'server/files/tags.txt';
    let firstCreatedTab = null;
    
    try {
      const tagsResponse = await fetch(chrome.runtime.getURL(tagsFilePath));
      const tagsText = await tagsResponse.text();
      const tags = tagsText.split('\n').filter(tag => tag.trim() !== '');
      
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const tab = await chrome.tabs.create({ url: "https://onlyfans.com/", active: true });
        
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
        
        await new Promise(resolve => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: processImageAndUpload,
            args: [tag]
          }, () => {
            resolve();
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
  }
    
    if (lastEntry && lastEntry.id === "25" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      processTags().catch(error => console.error(error));
      return;
    }

    if (lastEntry && lastEntry.id === "26" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const tabs = currentWindow.tabs;
        const currentTabIndex = tabs.findIndex(tab => tab.active);
        const previousTabId = tabs[currentTabIndex].id;
        
        if (currentTabIndex < tabs.length - 1) {
          const nextTabIndex = currentTabIndex + 1;
          chrome.tabs.update(tabs[nextTabIndex].id, { active: true }, async () => {
            await executeScriptIfValid(tabs[currentTabIndex], { 
              target: { tabId: previousTabId }, 
              func: postStories 
            });
          });
        } else {
          chrome.tabs.create({url: 'https://onlyfans.com'}, async (newTab) => {
            await executeScriptIfValid(tabs[currentTabIndex], { 
              target: { tabId: previousTabId }, 
              func: postStories,
            });
          });
        }
      });
      return
    }

    if (lastEntry && lastEntry.id === "27" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
      const activeTab = currentWindow.tabs.find((tab) => tab.active);
      await executeScriptIfValid(activeTab, {
        target: { tabId: activeTab.id },
        func: updateMentionPosition,
        args: [lastEntry.x, lastEntry.y],
      });
      return
    })}
    
    if (lastEntry && lastEntry.id === "11" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        if (lastEntry.textInput === "reset") {
          updateTabCounterOnActiveTab(true);
          return;
        } else if (lastEntry.textInput === "hide") {
          timerVisibility = false;
          return;
        } 
        else if (lastEntry.textInput === "show") {
          timerVisibility = true;
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
        } else if (lastEntry.textInput === "check") {
          const browserNumber = browserType.replace("browser", ""); 
          const selectedBrowserArray = lastEntry.selectedBrowsers.split(" ");
          if (selectedBrowserArray.includes(browserNumber) || lastEntry.selectedBrowsers == "") {
            await executeScriptIfValid(activeTab, {
                target: { tabId: activeTab.id },
                func: checkModels,
            });
            return;
          } 
          return;
        } else if (lastEntry.textInput === "search") {
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: searchPosts,
          });
          return;
        } else if (validateDelete(lastEntry.textInput)) {
          const number = extractNumber(lastEntry.textInput);
          new Promise((resolve) => {
            chrome.tabs.query(
              { currentWindow: true, active: true },
              function (tabs) {
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
      await sendTypeToServer(lastIndex, browserType);

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
          const activeTab = currentWindow.tabs.find((tab) => tab.active);
          await executeScriptIfValid(activeTab, {
            target: { tabId: activeTab.id },
            func: createBrowser,
            args: [browserType, index, totalIndex, repeat],
          });
        });
      }

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await waitForTabAndExecute(
          activeTab.id, 
          addTextToPost, 
          [text, imageUrl, index, browserType, exp, txt, pht]
        );
      });
      return
    }

    if (lastEntry && lastEntry.id === "14" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: openNewTab,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "15" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pressBind,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "19" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pressBindFix,
          args: [activeTab, browserType],
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "100" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: instantPostOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "101" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: instantPostOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "102" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: fakeColorsOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "103" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: fakeColorsOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "104" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const allTabs = currentWindow.tabs;
        const activeTab = allTabs.find((tab) => tab.active);

        if (activeTab) {
          allTabs.forEach(async (tab) => {
            if (tab.index >= activeTab.index) {
              await executeScriptIfValid(tab, {
                target: { tabId: tab.id },
                func: toggleColors,
                args: [tab],
              });
            }
          });
        }
      });
      return
    }

    if (lastEntry && lastEntry.id === "20" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
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
      await sendTypeToServer(lastIndex, browserType);

      chrome.storage.local.get(
        ["savedTabId", "deleteTabId"],
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
                      }

                      const fakeCheckedResult =
                        await chrome.storage.local.get("fakeChecked");
                      if (fakeCheckedResult.fakeChecked === true) {
                        allTabs.forEach(async (tab) => {
                          if (tab.index >= activeTab.index) {
                            await executeScriptIfValid(tab, {
                              target: { tabId: tab.id },
                              func: toggleColors,
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
      await sendTypeToServer(lastIndex, browserType);
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          const currentTabId = tabs[0].id;
          chrome.tabs.query({ url: "https://onlyfans.com/*" }, function(matchingTabs) {
              if (matchingTabs.length > 2) {
                  const firstMatchingTab = matchingTabs[0];
                  if (currentTabId !== firstMatchingTab.id) {
                      chrome.tabs.update(firstMatchingTab.id, { active: true }, () => {
                          setTimeout(() => {
                              chrome.tabs.update(currentTabId, { active: true });
                          }, 1000);
                          chrome.scripting.executeScript({
                              target: { tabId: firstMatchingTab.id },
                              func: checkAndCloseTab,
                              args: [firstMatchingTab.id, Object.fromEntries(intervals)],
                          });
                      });
                  }
              }
          });
      });
      return;
    }

    if (lastEntry && lastEntry.id === "16" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: pasteBind,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "117" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: stopOn,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "118" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: stopOff,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "18" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);

      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await executeScriptIfValid(activeTab, {
          target: { tabId: activeTab.id },
          func: clearPhotoBindAll,
        });
      });
      return
    }

    if (lastEntry && lastEntry.id === "13" && browserType !== "") {
      await sendTypeToServer(lastIndex, browserType);
      if (!isApart) {
        isApart = false;
      }
      const text = lastEntry.textInput;
      
      chrome.windows.getCurrent({ populate: true }, async (currentWindow) => {
        const activeTab = currentWindow.tabs.find((tab) => tab.active);
        await waitForTabAndExecute(
          activeTab.id, 
          addTimeToPost, 
          [text, isApart, browserType]
        );
      });
    }
    return
  } catch (error) {
    console.error("Error: ", error);
  }
}

async function setBind(tab, DELAY_GREEN_BUTTON) {
  if (!tab.url.startsWith("chrome://")) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function (DELAY_GREEN_BUTTON) {
        let observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
              let elements = document.querySelectorAll(
                ".b-dropzone__preview__delete.g-btn.m-rounded.m-reset-width.m-thumb-r-corner-pos.m-btn-remove.m-sm-icon-size.has-tooltip",
              );
              if (elements.length) {
                let button = document.querySelector(
                  "#ModalAlert___BV_modal_footer_ > button",
                );
                if (button) button.click();
              }
            }
          });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        async function animateButton(button, buttonText, callback) {
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

        async function quickClear() {
          await makeRequest("http://localhost:3000/quickClear", 0);
        }

        async function quickReload() {
          await makeRequest("http://localhost:3000/quickReload", 0);
        }

        async function quickStories() {
          await makeRequest("http://localhost:3000/quickStories", 0);
        }

        async function quickStoriesDone() {
          await makeRequest("http://localhost:3000/quickStoriesDone", 0);
        }

        async function bindFixRequest() {
          await makeRequest("http://localhost:3000/bindFix", 0 );
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

          fakeMakeBtn.addEventListener("mouseenter", function() {
            this.style.background = "#e38571"; 
          });
          
          fakeMakeBtn.addEventListener("mouseleave", function() {
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
                wordDiv.style.cssText = `
                  line-height: 1.2;
                  text-align: center;
                `;
                wordDiv.textContent = word;
                leftPart.appendChild(wordDiv);
              });
              
              newRightText.split(" ").forEach(word => {
                const wordDiv = document.createElement("div");
                wordDiv.style.cssText = `
                  line-height: 1.2;
                  text-align: center;
                `;
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
          leftPart.addEventListener("mouseout", () => {
            animationTimeout = setTimeout(resetState, 100);
          });
        
          rightPart.addEventListener("mouseover", () => handleHover("right"));
          rightPart.addEventListener("mouseout", () => {
            animationTimeout = setTimeout(resetState, 100);
          });
        
          button.addEventListener("click", async (event) => {
            const rect = button.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            button.disabled = true;
        
            if (clickX <= rect.width / 2) {
              await animateButton(button, leftPart, callbackLeft);
            } else {
              await animateButton(button, rightPart, callbackRight);
            }
        
            button.disabled = false;
          });
        
          if (isStopButton) {
            chrome.storage.local.get(['singleStop', 'syncStop'], function(result) {
              updateStopButtonState(result.singleStop, result.syncStop);
            });
        
            chrome.storage.onChanged.addListener(function(changes, namespace) {
              if (namespace === 'local' && (changes.singleStop || changes.syncStop)) {
                chrome.storage.local.get(['singleStop', 'syncStop'], function(result) {
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
            const VERSION = '5.6.6.4';
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
        
          chrome.storage.local.get(null, function(items) {
            const activeBrowser = Object.keys(items)
              .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
              .map(key => parseInt(key.match(/\d+/)[0]))[0] || "not set";
            updateVersionText(activeBrowser)
          });
        
          chrome.storage.onChanged.addListener(function(changes, namespace) {
            if (namespace === 'local') {
              const browserChanges = Object.keys(changes).filter(key => 
                key.startsWith('browser') && key.endsWith('Checked')
              );
              
              if (browserChanges.length > 0) {
                chrome.storage.local.get(null, function(items) {
                  const activeBrowser = Object.keys(items)
                    .filter(key => key.startsWith('browser') && key.endsWith('Checked') && items[key])
                    .map(key => parseInt(key.match(/\d+/)[0]))[0] || "not set";
                  updateVersionText(activeBrowser)
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
            "next tab & post",
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
            "0px 2px 0px 2px",
            "calc(((100% - 8px) / 3) + 0.01px)",
          );

          let postIndicatorButton = createIndicatorButton(container2);
          let fakeColors = createFakeColorsButton(container2);
          let fakeMakeButton = createFakeMakeButton(document.body);

          updatePostIndicator(postIndicatorButton);
          updateFakeIndicator(fakeColors);

          postIndicatorButton.addEventListener("click", async () => {
            await togglePostIndicator();
            await updatePostIndicator(postIndicatorButton);
          });
          fakeColors.addEventListener("click", async () => {
            await toggleFakeIndicator();
            await updateFakeIndicator(fakeColors);
          });
          fakeMakeButton.addEventListener("click", async () => {
            await fakeRequest();
          });

          const newButton = document.createElement("button");
          newButton.id = "autopost-button";
          Object.assign(newButton.style, {
           backgroundColor: "rgb(221, 109, 85)",
           color: "white",
           border: "none",
           cursor: "pointer",
           zIndex: "9999",
           fontFamily: "'Josefin Sans', sans-serif",
           borderRadius: "10px",
           width: "calc((100% - 8px) / 3)",
           height: "30px",
           margin: "0px 0px 0px 2px",
           display: "flex",
           justifyContent: "center",
           alignItems: "center"
          });
          
          const newButtonText = document.createElement("span");
          newButtonText.textContent = "auto";
          Object.assign(newButtonText.style, {
           transition: "all 0.5s ease",
          });
          
          newButton.appendChild(newButtonText);
          newButton.addEventListener("click", function () {
           chrome.runtime.sendMessage({ action: "clickAndMove" });
          });

          newButton.onmouseover = function () {
            this.style.background = "#e38571";
            this.style.transition = "all 0.5s ease";
          };

          newButton.onmouseout = function () {
            this.style.background = "rgb(221, 109, 85)";
            this.style.transition = "all 0.5s ease";
          };


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

          const switchButton = createActionButton(
                "switch-button",
                { bottom: "105px", right: "28%" },
                  `<svg viewBox="0 0 330 330" width="16" height="16">
                  <path fill="white" d="M79.394,250.606C82.323,253.535,86.161,255,90,255c3.839,0,7.678-1.465,10.606-4.394 c5.858-5.857,5.858-15.355,0-21.213L51.213,180h227.574l-49.393,49.394c-5.858,5.857-5.858,15.355,0,21.213 C232.322,253.535,236.161,255,240,255s7.678-1.465,10.606-4.394l75-75c5.858-5.857,5.858-15.355,0-21.213l-75-75 c-5.857-5.857-15.355-5.857-21.213,0c-5.858,5.857-5.858,15.355,0,21.213L278.787,150H51.213l49.393-49.394 c5.858-5.857,5.858-15.355,0-21.213c-5.857-5.857-15.355-5.857-21.213,0l-75,75c-5.858,5.857-5.858,15.355,0,21.213L79.394,250.606z"/>
                  </svg>`,
                quickSwitch
          );

          const clearButton = createActionButton(
            "clear-button",
            { bottom: "105px", right: "21%" },
              `<svg viewBox="0 0 1024 1024" width="16" height="16">
              <path fill="white" d="M899.1 869.6l-53-305.6H864c14.4 0 26-11.6 26-26V346c0-14.4-11.6-26-26-26H618V138c0-14.4-11.6-26-26-26H432c-14.4 0-26 11.6-26 26v182H160c-14.4 0-26 11.6-26 26v192c0 14.4 11.6 26 26 26h17.9l-53 305.6c-0.3 1.5-0.4 3-0.4 4.4 0 14.4 11.6 26 26 26h723c1.5 0 3-0.1 4.4-0.4 14.2-2.4 23.7-15.9 21.2-30zM204 390h272V182h72v208h272v104H204V390z m468 440V674c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v156H416V674c0-4.4-3.6-8-8-8h-48c-4.4 0-8 3.6-8 8v156H202.8l45.1-260H776l45.1 260H672z"/>
              </svg>`,
              quickClear
          );
        
          const reloadButton = createActionButton(
              "reload-button",
                { bottom: "105px", right: "14%" },
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
          storiesContainer.style.borderRadius =  "10px"

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
            quickStoriesDone
          );

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
          containerNew.appendChild(newButton);
          document.body.appendChild(containerNew);
          document.body.appendChild(storiesContainer);
          window.buttonsAdded = true;
        }
      },
      args: [DELAY_GREEN_BUTTON],
    });
  }
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {

  function handleTabOpen() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        const currentTabIndex = currentTab.index;
        const targetUrl = "https://onlyfans.com/posts/create";
  
        chrome.tabs.query({}, function(tabs) {
          if (currentTabIndex < tabs.length - 1) {
            const nextTab = tabs[currentTabIndex + 1];
            if (nextTab.url !== targetUrl) {
              chrome.tabs.update(nextTab.id, { url: targetUrl, active: true }, () => resolve(nextTab.id));
            } else {
              chrome.tabs.update(nextTab.id, { active: true }, () => resolve(nextTab.id));
            }
          } else {
            chrome.tabs.create({ url: targetUrl }, function(newTab) {
              chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                if (info.status === "complete" && tabId === newTab.id) {
                  chrome.scripting.executeScript({
                    target: { tabId: newTab.id },
                    function() {
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
                  chrome.tabs.onUpdated.removeListener(listener);
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
    chrome.tabs.query({ currentWindow: true }, function(tabs) {
      if (tabs.length > 1) {
        closedTabIds.add(sender.tab.id);
        chrome.tabs.remove(sender.tab.id, function() {
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
      const currentTabId = tabs[0].id;
      getNumberOfTabsToClick(currentTabId, function (numberOfTabsToClick) {
        tabsToClick = numberOfTabsToClick;
        clickAndMove(currentTabId, tabsToClick);
      });
    });
  }

  if (request.action === "createNotif") {
    createNotification(request.tabId, request.message);
  }

  if (request.action === "switchTabClick") {
    chrome.tabs.update(request.tabId, { active: true });
  }

  if (request.action === "blacklist") {
    chrome.tabs.query({ currentWindow: true }, function (tabs) {
      let currentTab = tabs.find((tab) => tab.id === request.tabId);
      let previousTab = tabs.find((tab) => tab.index === currentTab.index - 1);
      if (previousTab && previousTab.url !== request.url) {
        chrome.tabs.update(request.tabId, { url: request.url });
      }
    });
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

async function pressBind() {
  const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');
  if (mediaWrapperExists) {
    let selector =
      document.querySelector('[at-attr="submit_post"]') ||
      document.querySelector(
        "#content > div.l-wrapper > div > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button",
      );
    if (selector) {
      const { syncStop = false, singleStop = false } = await new Promise(resolve => {
        chrome.storage.local.get(['syncStop', 'singleStop'], resolve);
      });
      if (!syncStop && !singleStop) {
  
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

async function pressBindFix(tab, browserType) {

  let savedMediaLink = null;

  async function getMediaLinkBeforeSubmit() {
    const linkElement = document.querySelector('.media-file.m-default-bg.m-media-el');
    if (linkElement && linkElement.getAttribute('href')) {
      return linkElement.getAttribute('href');
    }
    return null;
  }

  async function pressBind() {
    const mediaWrapperExists = document.querySelector('.b-make-post__media-wrapper');
    if (mediaWrapperExists) {
      
      savedMediaLink = await getMediaLinkBeforeSubmit();
      
      let selector =
        document.querySelector('[at-attr="submit_post"]') ||
        document.querySelector(
          "#content > div.l-wrapper > div > div > div > div > div.g-page__header.m-real-sticky.js-sticky-header.m-nowrap > div > button",
        );
      if (selector) {
        const { syncStop = false, singleStop = false } = await new Promise(resolve => {
          chrome.storage.local.get(['syncStop', 'singleStop'], resolve);
        });
        if (!syncStop && !singleStop) {
    
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
  
  var tabId = tab.id;

  function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  chrome.runtime.sendMessage({ action: "openNewTab",  source: "pressBindFix" });

  if (browserType) {
    fetch('http://localhost:3000/tabOpened', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({ browserType })
    })
  }

  function intervalFunc() {
    chrome.storage.local.get("isPaused", async function (data) {
      if (data.isPaused) {
        setTimeout(intervalFunc, 1000);
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
              let username = innerDiv.textContent.split("@")[1].trim();
              let url = `https://onlyfans.com/my/collections/user-lists/blocked?search=${username}`;
              chrome.runtime.sendMessage({
                action: "blacklist",
                url,
                tabId: tab.id,
              });
            }
            else if (/(Daily|Internal|Nothing)/.test(innerDiv.textContent)) {
              await delay(20000);
            } 
            else if (/(attached|issue)/i.test(innerDiv.textContent)) {

              let mediaLink = savedMediaLink;
              
              if (mediaLink) {
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
                  let fileType = "image/png";
                  let mediaElement;
                
                  if (imageUrl.includes("/media.") || imageUrl.includes("/image.")) {
                    fileType = "image/png";
                    mediaElement = new Image();
                  } else {
                    const urlParts = imageUrl.split("/");
                    const fileName = urlParts[urlParts.length - 1].split("?")[0];
                    const fileExtension = fileName.split(".").pop().toLowerCase();
                
                    if (fileExtension === "gif") {
                      fileType = "image/gif";
                      mediaElement = new Image();
                    } else if (fileExtension === "mp4") {
                      fileType = "video/mp4";
                      mediaElement = document.createElement("video");
                    } else {
                      fileType = "image/png";
                      mediaElement = new Image();
                    }
                  }
                
                  mediaElement.crossOrigin = "anonymous";
                  mediaElement.src = imageUrl;
                
                  mediaElement.onload = mediaElement.onloadedmetadata = async function () {
                    try {
                      const cropLeft = Math.floor(Math.random() * 3) + 1;
                      const cropRight = Math.floor(Math.random() * 3) + 1;
                      const cropTop = Math.floor(Math.random() * 3) + 1;
                      const cropBottom = Math.floor(Math.random() * 3) + 1;
                      
                      const canvas = document.createElement("canvas");
                      const sourceWidth = mediaElement.width || 800;
                      const sourceHeight = mediaElement.height || 600;
                      
                      const newWidth = sourceWidth - cropLeft - cropRight;
                      const newHeight = sourceHeight - cropTop - cropBottom;
                      
                      canvas.width = newWidth;
                      canvas.height = newHeight;
                      
                      const ctx = canvas.getContext("2d");
                      
                      ctx.drawImage(
                        mediaElement,
                        cropLeft, cropTop,
                        sourceWidth - cropLeft - cropRight,
                        sourceHeight - cropTop - cropBottom,
                        0, 0,
                        newWidth, newHeight
                      );
                
                      const blob = await new Promise((resolve) => {
                        canvas.toBlob(resolve, fileType);
                      });
                
                      const extension = fileType.split("/")[1];
                      const file = new File([blob], `media.${extension}`, {
                        type: fileType,
                      });
                      let mediaInserted = false;
                
                      await new Promise((resolve) => {
                        const observer = new MutationObserver((mutationsList, observer) => {
                          for (let mutation of mutationsList) {
                            if (mutation.type === "childList") {
                              let el = document.querySelector(".b-make-post__media-wrapper");
                              if (el && !mediaInserted) {
                                mediaInserted = true;
                                clearInterval(intervalId);
                                isUploading = false;
                                resolve();
                                observer.disconnect();
                              }
                            }
                          }
                        });
                
                        observer.observe(document.body, {
                          childList: true,
                          subtree: true,
                        });
                
                        let dragAttempts = 0;
                
                        const intervalId = setInterval(function () {
                          let element = document.querySelector(
                            ".tiptap.ProseMirror.b-text-editor.js-text-editor.m-native-custom-scrollbar.m-scrollbar-y.m-scroll-behavior-auto.m-overscroll-behavior-auto"
                          );
                          let el = document.querySelector(".b-make-post__media-wrapper");
                
                          if (element && !el && dragAttempts === 0 && !mediaInserted) {
                            element.focus();
                            simulateDragAndDrop(mediaElement, element, file);
                            mediaInserted = true;
                            dragAttempts++;
                          }
                
                          setTimeout(function () {
                            el = document.querySelector(".b-make-post__media-wrapper");
                            if (el || dragAttempts >= 2) {
                              mediaInserted = true;
                              clearInterval(intervalId);
                              isUploading = false;
                              resolve();
                              observer.disconnect();
                            }
                          }, 500);
                        }, 200);
                      });
                    } catch (error) {
                      console.error("Ошибка при обработке изображения:", error);
                      isUploading = false;
                    }
                  };
                
                  mediaElement.onerror = function (error) {
                    isUploading = false;
                  };
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
            else if (!innerDiv.textContent.includes("[OFH]")){
              return
            }
            else {
              delay(10000);
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
            if (response.shouldClick) {
              await pressBind();
            }
          },
        );
        setTimeout(function () {
          let anchorElement = document.querySelector(
            'a[data-name="PostsCreate"][href="/posts/create"]',
          );
          tabId = tabId.toString();
          chrome.storage.local.get(tabId, function (data) {
            if (
              (anchorElement &&
                !anchorElement.classList.contains("m-disabled")) ||
              data[tabId] ||
              tab.url === "https://onlyfans.com/my/queue"
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

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'checkTab') {
    chrome.tabs.query({}, function(tabs) {
      if (tabs.findIndex(t => t.id === request.tabId) < 3) {
        sendResponse({shouldClick: true});
      } else {
        sendResponse({shouldClick: false});
      }
    });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "chrome://extensions/" });

    const targetUrl = "https://onlyfans.com/posts/create";
    chrome.tabs.create({ url: targetUrl }, function (tab) {
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (info.status === "complete" && tabId === tab.id) {
          chrome.tabs.onUpdated.removeListener(listener);
          chrome.scripting.executeScript({
            target: { tabId },
            function: function () {
              const item = new ClipboardItem({
                "text/plain": new Blob([""], { type: "text/plain" })
              });
              navigator.clipboard.write([item]);
            }
          });
        }
      });
    });

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
      var activeTabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        function: function () {
          var tabId = arguments[1];
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
  
          closeButton.onmouseover = function() {
            closeButton.style.color = "red";
          };
  
          closeButton.onmouseout = function() {
            closeButton.style.color = "";
          };
  
          closeButton.onclick = function(event) {
            event.stopPropagation();
            document.body.removeChild(notification);
          };
  
          notification.appendChild(closeButton);
  
          var messageElement = document.createElement("span");
          messageElement.innerText = arguments[0];
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
  
          notification.onclick = function() {
            chrome.runtime.sendMessage({
              action: "switchTabClick",
              tabId: tabId
            });
            document.body.removeChild(notification);
          };
  
          document.body.appendChild(notification);
          
          setTimeout(function() {
            notification.style.opacity = "1";
          }, 100);
  
          var timeoutId = setTimeout(function() {
            notification.style.opacity = "0";
            setTimeout(function() {
              if (document.body.contains(notification)) {
                document.body.removeChild(notification);
              }
            }, 500);
          }, 5000);
  
          notification.onmouseover = function() {
            clearTimeout(timeoutId);
          };
  
          notification.onmouseout = function() {
            timeoutId = setTimeout(function() {
              notification.style.opacity = "0";
              setTimeout(function() {
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
  if (changeInfo.status === "loading") {
    chrome.storage.local.get("tabIds", function (data) {
      let tabIds = data.tabIds || [];
      const index = tabIds.indexOf(tabId);
      if (index > -1) {
        tabIds.splice(index, 1);
        chrome.storage.local.set({ tabIds: tabIds });
      }
    });
  }
  if (
    changeInfo.status === "complete" &&
    tab.status === "complete" &&
    tab.url !== undefined
  ) {
    chrome.storage.local.get("tabIds", function (data) {
      let tabIds = data.tabIds || [];
      if (!tabIds.includes(tabId)) {
        setBind(tab, DELAY_GREEN_BUTTON);
        tabIds.push(tabId);
        chrome.storage.local.set({ tabIds: tabIds });
      }
    });
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.status === "complete" && tab.url !== undefined) {
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
      updateTabCounterOnActiveTab(false);
    }
  },
  { url: [{ urlMatches: "https://onlyfans.com/" }] },
);

chrome.tabs.onCreated.addListener(function (tab) {
  if (tab.url && tab.url.startsWith("https://onlyfans.com/")) {
    updateTabCounterOnActiveTab(false);
  }
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (
    tab.url &&
    tab.url.startsWith("https://onlyfans.com/") &&
    changeInfo.status === "complete"
  ) {
    updateTabCounterOnActiveTab(false);
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  if (closedTabIds.has(tabId)) {
    closedTabIds.delete(tabId);
    closedTabsCount++;
    lastClosedTime = new Date();
  }
  updateTabCounterOnActiveTab(false);
});

setInterval(() => updateTabCounterOnActiveTab(false), 1000);

function checkDataFileAndSetTimeout() {
  checkDataFile().then(() => {
    setTimeout(checkDataFileAndSetTimeout, ALL_ACTIONS_MONITOR);
  });
}

checkDataFileAndSetTimeout();

async function sendTypeToServer(dataIndex, browserType) {
  const serverUrl = "http://localhost:3000/update";

  const requestData = {
    dataIndex,
    browserType,
  };

  try {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
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
                  if (splitButton) {
                      const rect = splitButton.getBoundingClientRect();
                      const mouseOverEvent = new MouseEvent("mouseover", {
                          bubbles: true,
                          cancelable: true,
                          clientX: rect.left + rect.width / 4,
                          clientY: rect.top + rect.height / 2,
                      });
                      splitButton.dispatchEvent(mouseOverEvent);
                      setTimeout(() => {
                          const clickEvent = new MouseEvent("click", {
                              bubbles: true,
                              cancelable: true,
                              clientX: rect.left + rect.width / 4,
                              clientY: rect.top + rect.height / 2,
                          });
                          splitButton.dispatchEvent(clickEvent);
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
                  const oldStyle = document.querySelector('style');
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
          chrome.storage.local.set({ isStop: false }, resolve);
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

let ws = null;
let currentBrowserNumber = 1;
const HEARTBEAT_INTERVAL = 20000;
let heartbeatTimer = null;
self.__OFH_PORTS = { http: 3000, cropFlask: 8765, cropVite: 8444 };

async function loadInstancePorts() {
  try {
    const res = await fetch(chrome.runtime.getURL('instance.json') + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const parsed = Number(data.http);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      self.__OFH_PORTS = { ...self.__OFH_PORTS, http: parsed };
    }
  } catch (_) { }
}

const serverBase = () => `http://localhost:${(self.__OFH_PORTS && self.__OFH_PORTS.http) || 3000}`;

async function getWsPort() {
  try {
    await loadInstancePorts();
    const res = await fetch(`${serverBase()}/ws-port`);
    const data = await res.json();
    return data.port || null;
  } catch (_) {
    return null;
  }
}

async function connectWS() {
  const port = await getWsPort();
  if (!port) {
    setTimeout(connectWS, 2000);
    return;
  }

  try {
    ws = new WebSocket(`ws://localhost:${port}`);
  } catch (e) {
    setTimeout(connectWS, 2000);
    return;
  }

  ws.onopen = () => {
    console.log(`[Offscreen] WS connected on port ${port}`);
    chrome.runtime.sendMessage({ type: 'ws-get-browser-number' }, (response) => {
      if (response && response.browserNumber) {
        currentBrowserNumber = response.browserNumber;
        ws.send(JSON.stringify({ type: 'register', browserNumber: currentBrowserNumber }));

        if (response.arrowMode) {
          ws.send(JSON.stringify({ type: 'arrow-mode', mode: response.arrowMode, browserNumber: currentBrowserNumber }));
        }
      }
    });

    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'pong') return;
      if (data.type === 'displaced') {
        chrome.runtime.sendMessage({ type: 'ws-displaced' });
        return;
      }
      if (data.type === 'browsers-updated') {
        try { chrome.runtime.sendMessage({ type: 'browsers-updated', numbers: data.numbers }); } catch (_) { }
        return;
      }
      chrome.runtime.sendMessage({ type: 'ws-command', payload: data });
    } catch (_) { }
  };

  ws.onclose = () => {
    console.log('[Offscreen] WS closed, reconnecting in 1s...');
    clearInterval(heartbeatTimer);
    ws = null;
    setTimeout(connectWS, 1000);
  };

  ws.onerror = () => {
    console.error('[Offscreen] WS error - connection failed');
    try { ws.close(); } catch (_) { }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ws-confirm') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'done',
        cmdId: message.cmdId,
        browserNumber: message.browserNumber,
        data: message.data
      }));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ws-update-browser-number') {
    currentBrowserNumber = message.browserNumber;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'register', browserNumber: currentBrowserNumber }));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ws-unregister') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'unregister',
        browserNumber: message.browserNumber
      }));
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ws-reconnect') {
    try { if (ws) ws.close(); } catch (_) { }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'ws-status') {
    sendResponse({ connected: ws && ws.readyState === WebSocket.OPEN });
    return false;
  }

  if (message.type === 'ws-send-raw') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message.payload));
    }
    sendResponse({ ok: true });
    return false;
  }
});

connectWS();
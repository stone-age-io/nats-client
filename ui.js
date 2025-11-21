import { els } from "./dom.js";
import * as utils from "./utils.js";

// --- TOASTS ---
export function showToast(msg, type = "info") {
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerText = msg;
  els.toastContainer.appendChild(div);
  setTimeout(() => {
    div.classList.add("hiding");
    div.addEventListener("animationend", () => div.remove());
  }, 3500);
}

// --- LOG PAUSE & BUFFER ---
let isPaused = false;
let msgBuffer = [];
let renderLoopId = null;
const MAX_PRETTY_SIZE = 20000; // 20KB limit for pretty printing

export function toggleLogPause() {
  isPaused = !isPaused;
  els.btnPause.innerText = isPaused ? "Resume" : "Pause";
  if (isPaused) els.btnPause.classList.add("paused");
  else els.btnPause.classList.remove("paused");
}

function createMessageDiv(subject, data, isRpc, msgHeaders) {
  const div = document.createElement("div");
  div.className = "msg-entry";
  
  // Check filter
  const filterText = els.logFilter.value.toLowerCase();
  const fullText = (subject + data).toLowerCase();
  if (filterText && !fullText.includes(filterText)) {
    div.style.display = "none";
  }

  let content = data;
  
  // Optimization: Don't try to pretty print massive payloads
  if (data.length < MAX_PRETTY_SIZE) {
    try {
      const obj = JSON.parse(data);
      content = JSON.stringify(obj, null, 2); 
    } catch (e) {}
  } else {
    content = data.substring(0, MAX_PRETTY_SIZE) + `\n... [Truncated ${utils.formatBytes(data.length)}]`;
  }

  const time = new Date().toLocaleTimeString();
  const badgeClass = isRpc ? "badge-rpc" : "badge-sub";
  const badgeText = isRpc ? "RPC" : "MSG";
  const msgId = `msg-${Date.now()}-${Math.random()}`;

  let headerHtml = "";
  if (msgHeaders) {
    const headerList = [];
    for (const [key, value] of msgHeaders) headerList.push(`${key}: ${value}`);
    if (headerList.length > 0) {
      headerHtml = `<div style="margin-top:4px;"><span class="badge badge-hdr">HEAD</span> <span style="color:#888; font-size:0.8em">${headerList.join(", ")}</span></div>`;
    }
  }

  div.innerHTML = `
    <div class="msg-meta">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span>${time}</span>
      <span style="color:#ddd; font-weight:bold;">${subject}</span>
      <button class="copy-btn" onclick="window.copyToClipboard('${msgId}')">Copy JSON</button>
    </div>
    ${headerHtml}
    <pre id="${msgId}">${content}</pre>
  `;
  return div;
}

function flushBuffer() {
  if (msgBuffer.length > 0) {
    const fragment = document.createDocumentFragment();
    // Process a batch (e.g. 50 messages) to keep UI responsive
    const batch = msgBuffer.splice(0, 50);
    
    batch.forEach(({ subject, data, isRpc, headers }) => {
       const div = createMessageDiv(subject, data, isRpc, headers);
       fragment.appendChild(div);
    });

    // Auto-scroll logic check before appending
    const container = els.messages;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    
    els.messages.appendChild(fragment);

    if (isAtBottom) {
      container.scrollTop = container.scrollHeight;
    }

    // Prune old messages
    while (els.messages.children.length > 200) {
      els.messages.removeChild(els.messages.firstChild);
    }
  }

  // Use timeout if buffer still has items to process them asap, otherwise wait for animation frame
  if (msgBuffer.length > 0) {
      setTimeout(flushBuffer, 0);
  } else {
      renderLoopId = requestAnimationFrame(flushBuffer);
  }
}

export function startRenderLoop() {
    if (!renderLoopId) {
        flushBuffer();
    }
}

export function stopRenderLoop() {
    if (renderLoopId) {
        cancelAnimationFrame(renderLoopId);
        renderLoopId = null;
    }
    msgBuffer = [];
}

export function renderMessage(subject, data, isRpc = false, msgHeaders = null) {
  if (isPaused && !isRpc) return;
  msgBuffer.push({ subject, data, isRpc, headers: msgHeaders });
}

// --- TABS ---
export function switchTab(mode) {
  // Reset
  els.tabMsg.classList.remove('active');
  els.tabKv.classList.remove('active');
  els.tabStream.classList.remove('active');
  
  els.panelMsg.style.display = 'none';
  els.panelKv.style.display = 'none';
  els.panelStream.style.display = 'none';

  if (mode === 'msg') {
    els.tabMsg.classList.add('active');
    els.panelMsg.style.display = 'flex';
  } else if (mode === 'kv') {
    els.tabKv.classList.add('active');
    els.panelKv.style.display = 'flex';
  } else if (mode === 'stream') {
    els.tabStream.classList.add('active');
    els.panelStream.style.display = 'flex';
  }
}

// --- CONNECTION STATE UI ---
export function setConnectionState(state) {
  // state: 'connected' | 'reconnecting' | 'disconnected'
  
  if (state === 'connected') {
    els.btnConnect.innerText = "Disconnect";
    els.btnConnect.className = "danger"; 
    els.url.disabled = true;
    els.creds.disabled = true;
    els.subPanel.style.display = "flex";
    els.appPanel.style.display = "flex";
    
    els.statusText.innerText = "Connected";
    els.statusText.style.color = "#4CAF50";
    els.statusDot.className = "status-dot connected";
  
  } else if (state === 'reconnecting') {
    els.statusText.innerText = "Reconnecting...";
    els.statusText.style.color = "var(--warn)";
    els.statusDot.className = "status-dot reconnecting";
    els.btnConnect.disabled = true; // Lock button during reconnect attempts

  } else {
    // DISCONNECTED
    els.btnConnect.innerText = "Connect";
    els.btnConnect.className = "primary"; 
    els.btnConnect.disabled = false;
    els.url.disabled = false;
    els.creds.disabled = false;
    els.subPanel.style.display = "none";
    els.appPanel.style.display = "none";
    
    els.statusText.innerText = "Disconnected";
    els.statusText.style.color = "var(--muted)";
    els.statusDot.className = "status-dot";
    els.rttLabel.style.opacity = 0;
    
    els.subList.innerHTML = "";
    els.subCount.innerText = "(0)";
  }
}

export function filterLogs(val) {
  const v = val.toLowerCase();
  document.querySelectorAll(".msg-entry").forEach(entry => {
    entry.style.display = entry.innerText.toLowerCase().includes(v) ? "block" : "none";
  });
}

// --- KV UI ---
export function setKvStatus(msg, isErr = false) {
  els.kvStatus.innerText = msg;
  els.kvStatus.style.color = isErr ? "var(--danger)" : "var(--accent)";
}

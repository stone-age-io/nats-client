import { els } from "./dom.js";

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

// --- LOG PAUSE ---
let isPaused = false;
export function toggleLogPause() {
  isPaused = !isPaused;
  els.btnPause.innerText = isPaused ? "Resume" : "Pause";
  if (isPaused) els.btnPause.classList.add("paused");
  else els.btnPause.classList.remove("paused");
}

// --- TABS ---
export function switchTab(mode) {
  if (mode === 'msg') {
    els.tabMsg.classList.add('active');
    els.tabKv.classList.remove('active');
    els.panelMsg.style.display = 'flex';
    els.panelKv.style.display = 'none';
  } else {
    els.tabKv.classList.add('active');
    els.tabMsg.classList.remove('active');
    els.panelKv.style.display = 'flex';
    els.panelMsg.style.display = 'none';
  }
}

// --- CONNECTION STATE UI ---
export function setConnectionState(isConnected) {
  if (isConnected) {
    // CONNECTED STATE
    els.btnConnect.innerText = "Disconnect";
    els.btnConnect.className = "danger"; // Switch to Red
    els.url.disabled = true;
    els.creds.disabled = true;
    els.subPanel.style.display = "flex";
    els.appPanel.style.display = "flex";
    els.statusText.innerText = "Connected";
    els.statusText.style.color = "#4CAF50";
    els.statusDot.className = "status-dot connected";
  } else {
    // DISCONNECTED STATE
    els.btnConnect.innerText = "Connect";
    els.btnConnect.className = "primary"; // Switch to Green
    els.url.disabled = false;
    els.creds.disabled = false;
    els.subPanel.style.display = "none";
    els.appPanel.style.display = "none";
    els.statusText.innerText = "Disconnected";
    els.statusText.style.color = "var(--muted)";
    els.statusDot.className = "status-dot";
    els.rttLabel.style.opacity = 0;
    
    // Clear specific UI elements
    els.subList.innerHTML = "";
    els.subCount.innerText = "(0)";
    // Note: We deliberately DO NOT clear the logs here, users might want to read them after disconnect.
  }
}

// --- LOG RENDERING ---
export function renderMessage(subject, data, isRpc = false, msgHeaders = null) {
  if (isPaused && !isRpc) return;

  const filterText = els.logFilter.value.toLowerCase();
  const fullText = (subject + data).toLowerCase();
  const isHidden = filterText && !fullText.includes(filterText);

  const div = document.createElement("div");
  div.className = "msg-entry";
  if (isHidden) div.style.display = "none";

  let content = data;
  try {
    const obj = JSON.parse(data);
    content = JSON.stringify(obj, null, 2); 
  } catch (e) {}

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
  
  els.messages.prepend(div);
  if (els.messages.children.length > 100) els.messages.lastChild.remove();
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

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

// --- HISTORY DROPDOWNS ---
export function renderHistoryDatalist(elementId, items) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerHTML = items.map(s => `<option value="${s}">`).join("");
}

// --- SUBSCRIPTIONS ---
export function addSubscription(id, subject) {
    const li = document.createElement("li");
    li.id = `sub-li-${id}`;
    li.innerHTML = `
      <span style="cursor:pointer;" title="Click to copy to Publish" 
            onclick="document.getElementById('pubSubject').value = '${subject}'">
        ${utils.escapeHtml(subject)}
      </span>
      <button class="danger" onclick="window.unsubscribe(${id})">X</button>
    `;
    els.subList.prepend(li);
}

export function removeSubscription(id) {
    const li = document.getElementById(`sub-li-${id}`);
    if (li) li.remove();
}

export function updateSubCount(count) {
    els.subCount.innerText = `(${count})`;
}

export function clearSubscriptions() {
    els.subList.innerHTML = "";
    updateSubCount(0);
}

// --- KV STORE LISTS ---
export function renderKvBuckets(buckets) {
    els.kvBucketSelect.innerHTML = '<option value="">-- Select a Bucket --</option>';
    buckets.sort().forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.innerText = b;
      els.kvBucketSelect.appendChild(opt);
    });
}

export function addKvKey(key, onSelect) {
    if (document.getElementById(`kv-key-${key}`)) return;
    const div = document.createElement("div");
    div.className = "kv-key";
    div.id = `kv-key-${key}`;
    div.innerText = key;
    div.onclick = () => onSelect(key, div);
    els.kvKeyList.appendChild(div);
}

export function removeKvKey(key) {
    const el = document.getElementById(`kv-key-${key}`);
    if(el) el.remove();
}

export function highlightKvKey(key, uiEl) {
    document.querySelectorAll(".kv-key").forEach(e => e.classList.remove("active"));
    if (uiEl) {
        uiEl.classList.add("active");
    } else {
        const existing = document.getElementById(`kv-key-${key}`);
        if(existing) existing.classList.add("active");
    }
}

export function renderKvHistory(hist, onSelect) {
    els.kvHistoryList.innerHTML = "";
    if(hist.length === 0) {
        els.kvHistoryList.innerHTML = "No history found.";
        return;
    }
    hist.forEach(h => {
        const row = document.createElement("div");
        row.className = "kv-history-row";
        
        // Use Flexbox: Left side (Rev + Badge), Right side (Date)
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        
        const isDelete = h.operation === "DEL" || h.operation === "PURGE";
        
        // Format date slightly shorter for mobile
        const dateStr = new Date(h.created).toLocaleString(undefined, { 
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' 
        });

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <span style="color:var(--accent); white-space:nowrap;">Rev ${h.revision}</span> 
                <span class="badge" style="font-size:0.7em">${h.operation}</span>
            </div>
            <div style="color:#666; font-size:0.75em; text-align:right;">${dateStr}</div>
        `;
        
        row.title = isDelete ? "Deleted" : (typeof h.value === 'string' ? h.value : JSON.stringify(h.value));
        row.onclick = () => onSelect(h);

        els.kvHistoryList.appendChild(row);
    });
}

// --- STREAM LISTS ---
export function renderStreamList(list, onSelect) {
    els.streamList.innerHTML = '';
    if(list.length === 0) { 
        els.streamList.innerHTML = '<div class="kv-empty">No Streams Found</div>'; 
        return; 
    }
    list.forEach(s => {
        const div = document.createElement("div");
        div.className = "kv-key"; 
        div.innerText = s.config.name;
        div.onclick = () => onSelect(s.config.name, div);
        els.streamList.appendChild(div);
    });
}

export function highlightStream(uiEl) {
    Array.from(els.streamList.children).forEach(e => e.classList.remove("active"));
    if(uiEl) uiEl.classList.add("active");
}

export function renderStreamConsumers(consumers) {
    els.consumerList.innerHTML = '';
    if (consumers.length === 0) { 
        els.consumerList.innerHTML = '<div class="kv-empty">No Consumers</div>'; 
        return; 
    }
    consumers.forEach(c => {
        const div = document.createElement("div");
        div.style.borderBottom = "1px solid #222";
        div.style.padding = "6px 8px";
        div.style.fontSize = "0.8rem";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";
        const isDurable = !!c.config.durable_name;
        const nameHtml = isDurable 
            ? `<span style="color:var(--accent); font-weight:bold;">${utils.escapeHtml(c.name)}</span>` 
            : `<span style="color:#888;">${utils.escapeHtml(c.name)}</span> <span class="badge" style="font-size:0.6em">Ephemeral</span>`;
        
        div.innerHTML = `
            <div>${nameHtml}</div>
            <div style="font-family:var(--mono); font-size:0.75rem; color:#aaa;">
                Pending: <span style="color:${(c.num_pending||0) > 0 ? 'var(--warn)' : '#666'}">${c.num_pending||0}</span> | 
                Waiting: ${c.num_waiting||0}
            </div>
        `;
        els.consumerList.appendChild(div);
    });
}

export function renderStreamMessages(msgs) {
    els.streamMsgContainer.innerHTML = '';
    if(msgs.length === 0) { 
        els.streamMsgContainer.innerHTML = '<div class="kv-empty">No messages found in range</div>'; 
        return; 
    }
    
    msgs.forEach(m => {
        const div = document.createElement("div");
        div.className = "stream-msg-entry"; 
        div.style.borderBottom = "1px solid #333";
        div.style.padding = "8px";
        div.style.fontSize = "0.85rem";
        div.style.fontFamily = "var(--mono)";
        
        let content = utils.escapeHtml(m.data);
        try {
             const json = JSON.parse(m.data);
             content = utils.syntaxHighlight(json);
        } catch(e) {}

        const msgId = `stream-msg-${m.seq}-${Date.now()}`; 

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; color:var(--accent); margin-bottom:4px;">
               <span>#${m.seq}</span>
               <span style="color:#666;">${new Date(m.time).toLocaleString()}</span>
            </div>
            <div style="color:#ddd; font-weight:bold; margin-bottom:4px;">${utils.escapeHtml(m.subject)}</div>
            <div style="position:relative;">
                <button class="copy-btn" style="position:absolute; top:0; right:0;" onclick="window.copyToClipboard('${msgId}')">Copy JSON</button>
                <pre id="${msgId}" style="margin:0; font-size:0.8em; color:#aaa; padding-top:24px;">${content}</pre>
            </div>
        `;
        els.streamMsgContainer.appendChild(div);
    });
}

// --- DATA MODEL (LOG HISTORY) ---
const logHistory = [];
const MAX_LOG_HISTORY = 1000; 

function tryParsePayload(rawData) {
    if (typeof rawData !== 'string') return rawData;
    const trimmed = rawData.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return JSON.parse(rawData); } catch (e) { return rawData; }
    }
    return rawData;
}

function addToLogHistory(subject, rawData, isRpc, headers) {
    let headerObj = null;
    if (headers) {
        headerObj = {};
        for (const [key, value] of headers) {
            headerObj[key] = value;
        }
    }

    const entry = {
        timestamp: new Date().toISOString(),
        type: isRpc ? 'RPC' : 'MSG',
        subject: subject,
        headers: headerObj,
        payload: tryParsePayload(rawData)
    };

    logHistory.push(entry);
    if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift();
    }
}

export function clearLogs() {
    logHistory.length = 0;
    stopRenderLoop();
    startRenderLoop();
    els.messages.innerHTML = "";
}

export function downloadLogs() {
  if(logHistory.length === 0) {
      showToast("No logs to export", "info");
      return;
  }
  const blob = new Blob([JSON.stringify(logHistory, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nats-logs-${new Date().toISOString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${logHistory.length} messages`, "success");
}

// --- LIST FILTERING ---
export function filterList(inputElement, containerElement, childSelector = "div") {
    const term = inputElement.value.toLowerCase();
    const children = containerElement.querySelectorAll(childSelector);
    children.forEach(child => {
        if(child.classList.contains("kv-empty")) return;
        const text = child.innerText.toLowerCase();
        child.style.display = text.includes(term) ? "block" : "none";
    });
}

// --- LOG PAUSE & BUFFER ---
let isPaused = false;
let msgBuffer = [];
let renderLoopId = null;
const MAX_PRETTY_SIZE = 20000; 

export function toggleLogPause() {
  isPaused = !isPaused;
  els.btnPause.innerText = isPaused ? "Resume" : "Pause";
  if (isPaused) els.btnPause.classList.add("paused");
  else els.btnPause.classList.remove("paused");
}

function createMessageDiv(subject, data, isRpc, msgHeaders) {
  const div = document.createElement("div");
  div.className = "msg-entry";
  
  const filterText = els.logFilter.value.toLowerCase();
  const fullText = (subject + data).toLowerCase();
  if (filterText && !fullText.includes(filterText)) {
    div.style.display = "none";
  }

  let content = utils.escapeHtml(data);
  if (data.length < MAX_PRETTY_SIZE) {
    try {
      const obj = JSON.parse(data);
      content = utils.syntaxHighlight(obj); 
    } catch (e) {}
  } else {
    content = utils.escapeHtml(data.substring(0, MAX_PRETTY_SIZE)) + `\n... [Truncated ${utils.formatBytes(data.length)}]`;
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
      headerHtml = `<div style="margin-top:4px;"><span class="badge badge-hdr">HEAD</span> <span style="color:#888; font-size:0.8em">${utils.escapeHtml(headerList.join(", "))}</span></div>`;
    }
  }

  div.innerHTML = `
    <div class="msg-meta">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span>${time}</span>
      <span style="color:#ddd; font-weight:bold;">${utils.escapeHtml(subject)}</span>
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
    const batch = msgBuffer.splice(0, 50);
    for (let i = batch.length - 1; i >= 0; i--) {
        const { subject, data, isRpc, headers } = batch[i];
        const div = createMessageDiv(subject, data, isRpc, headers);
        fragment.appendChild(div);
    }
    const container = els.messages;
    const isAtTop = container.scrollTop === 0;
    container.prepend(fragment);
    if (isAtTop) container.scrollTop = 0;
    while (els.messages.children.length > 200) {
      els.messages.removeChild(els.messages.lastChild);
    }
  }

  if (msgBuffer.length > 0) {
      setTimeout(flushBuffer, 0);
  } else {
      renderLoopId = requestAnimationFrame(flushBuffer);
  }
}

export function startRenderLoop() {
    if (!renderLoopId) flushBuffer();
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
  addToLogHistory(subject, data, isRpc, msgHeaders);
  msgBuffer.push({ subject, data, isRpc, headers: msgHeaders });
}

// --- TABS ---
export function switchTab(mode) {
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
    els.btnConnect.disabled = true;
  } else {
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
    clearSubscriptions();
  }
}

export function filterLogs(val) {
  const v = val.toLowerCase();
  document.querySelectorAll(".msg-entry").forEach(entry => {
    entry.style.display = entry.innerText.toLowerCase().includes(v) ? "block" : "none";
  });
}

export function setKvStatus(msg, isErr = false) {
  els.kvStatus.innerText = msg;
  els.kvStatus.style.color = isErr ? "var(--danger)" : "var(--accent)";
}

// ============================================================================
// UI RENDERING LOGIC
// ============================================================================
// Handles all DOM manipulation and visual updates
// No NATS logic - just painting the screen

import { els } from "./dom.js";
import * as utils from "./utils.js";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// Maximum characters to syntax highlight before truncation
// Above this size, browser slows down significantly during JSON.parse + highlighting
// Tested on low-end devices (2GB RAM Chromebook)
const MAX_PRETTY_SIZE = 20000;

// Maximum log entries to keep in memory for export
// Prevents browser memory issues during high-traffic debugging
// 1000 entries ≈ 5-10MB RAM depending on message size
const MAX_LOG_HISTORY = 1000; 

// Maximum messages to display in DOM at once
// Prevents layout thrashing, keeps scrolling smooth
// 200 visible entries is ~1-2 screens of scrollback
const MAX_VISIBLE_MESSAGES = 200;

// How long toast notifications stay visible (ms)
// 3.5 seconds is optimal for reading short messages without being annoying
// Source: Nielsen Norman Group UX research
const TOAST_DURATION_MS = 3500;

// ============================================================================
// MODULE INITIALIZATION
// ============================================================================

/**
 * Setup event delegation for copy buttons
 * Call this once on app initialization
 */
export function initializeEventDelegation() {
  // Handle copy buttons in message log
  els.messages.addEventListener('click', async (e) => {
    if (e.target.classList.contains('copy-btn')) {
      const msgId = e.target.dataset.msgId;
      const el = document.getElementById(msgId);
      if (el) {
        const success = await utils.copyToClipboard(el.innerText);
        if (success) {
          const originalText = e.target.innerText;
          e.target.innerText = "Copied!";
          setTimeout(() => e.target.innerText = originalText, 1000);
        }
      }
    }
  });

  // Handle copy buttons in stream messages
  els.streamMsgContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('copy-btn')) {
      const msgId = e.target.dataset.msgId;
      const el = document.getElementById(msgId);
      if (el) {
        const success = await utils.copyToClipboard(el.innerText);
        if (success) {
          const originalText = e.target.innerText;
          e.target.innerText = "Copied!";
          setTimeout(() => e.target.innerText = originalText, 1000);
        }
      }
    }
  });
}

// ============================================================================
// TOASTS
// ============================================================================

export function showToast(msg, type = "info") {
  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.innerText = msg;
  els.toastContainer.appendChild(div);
  
  setTimeout(() => {
    div.classList.add("hiding");
    div.addEventListener("animationend", () => div.remove());
  }, TOAST_DURATION_MS);
}

// ============================================================================
// HISTORY DROPDOWNS
// ============================================================================

export function renderHistoryDatalist(elementId, items) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerHTML = items.map(s => `<option value="${utils.escapeHtml(s)}">`).join("");
}

// ============================================================================
// NAMED OPTION DROPDOWNS (Profiles / Templates)
// ============================================================================

/**
 * Re-render a select's options from a list of named items,
 * preserving the placeholder option and reselecting the previous value
 */
export function renderNamedOptions(selectEl, items, placeholder) {
    const prev = selectEl.value;
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.name;
        opt.innerText = item.name;
        selectEl.appendChild(opt);
    });
    if (items.some(i => i.name === prev)) selectEl.value = prev;
}

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

/**
 * Add subscription to UI
 * Returns the list item element so caller can attach events if needed
 */
export function addSubscription(id, subject) {
    const li = document.createElement("li");
    li.id = `sub-li-${id}`;
    
    const span = document.createElement("span");
    span.style.cursor = "pointer";
    span.title = "Click to copy to Publish";
    span.innerText = subject;
    
    const btn = document.createElement("button");
    btn.className = "danger";
    btn.innerText = "X";
    btn.dataset.subId = id;
    
    li.appendChild(span);
    li.appendChild(btn);
    els.subList.prepend(li);
    
    return { li, span, btn };
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

// ============================================================================
// KV STORE
// ============================================================================

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

export function setKvStatus(msg, isErr = false) {
  els.kvStatus.innerText = msg;
  els.kvStatus.style.color = isErr ? "var(--danger)" : "var(--accent)";
}

// ============================================================================
// STREAMS
// ============================================================================

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
        div.style.gap = "8px";

        const isDurable = !!c.config.durable_name;
        const nameHtml = isDurable
            ? `<span style="color:var(--accent); font-weight:bold;">${utils.escapeHtml(c.name)}</span>`
            : `<span style="color:#888;">${utils.escapeHtml(c.name)}</span> <span class="badge" style="font-size:0.6em">Ephemeral</span>`;

        const safeName = utils.escapeHtml(c.name);
        div.innerHTML = `
            <div style="min-width:0; overflow:hidden; text-overflow:ellipsis;">${nameHtml}</div>
            <div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">
                <div style="font-family:var(--mono); font-size:0.75rem; color:#aaa; white-space:nowrap;">
                    Pending: <span style="color:${(c.num_pending||0) > 0 ? 'var(--warn)' : '#666'}">${c.num_pending||0}</span> |
                    Waiting: ${c.num_waiting||0} |
                    Ack: ${c.num_ack_pending||0}
                </div>
                <button class="sm-btn consumer-edit" data-consumer="${safeName}" title="View / Edit Config">Edit</button>
                <button class="sm-btn danger consumer-delete" data-consumer="${safeName}" title="Delete Consumer">✕</button>
            </div>
        `;
        els.consumerList.appendChild(div);
    });
}

// Counter for unique stream message DOM ids (tail can deliver the same seq
// again after a restart, so seq alone is not unique enough)
let streamMsgCounter = 0;

// Cap on rendered tail entries so a busy stream doesn't grow the DOM forever
const MAX_TAIL_MESSAGES = 200;

/**
 * Build a single stream message entry element
 * Shared by range loading and live tail
 */
function createStreamMsgDiv(m) {
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

    const msgId = `stream-msg-${streamMsgCounter++}`;

    let headerHtml = "";
    if (m.headers) {
        const pairs = Object.entries(m.headers).map(([k, v]) => `${k}: ${v}`);
        headerHtml = `<div style="margin-bottom:4px;">
            <span class="badge badge-hdr">HEAD</span>
            <span style="color:#888; font-size:0.8em">${utils.escapeHtml(pairs.join(", "))}</span>
        </div>`;
    }

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; color:var(--accent); margin-bottom:4px;">
           <span>#${m.seq}</span>
           <span style="color:#666;">${new Date(m.time).toLocaleString()}</span>
        </div>
        <div style="color:#ddd; font-weight:bold; margin-bottom:4px;">${utils.escapeHtml(m.subject)}</div>
        ${headerHtml}
        <div style="position:relative;">
            <button class="copy-btn" style="position:absolute; top:0; right:0;" data-msg-id="${msgId}">Copy JSON</button>
            <pre id="${msgId}" style="margin:0; font-size:0.8em; color:#aaa; padding-top:24px;">${content}</pre>
        </div>
    `;
    return div;
}

export function renderStreamMessages(msgs) {
    els.streamMsgContainer.innerHTML = '';
    if(msgs.length === 0) {
        els.streamMsgContainer.innerHTML = '<div class="kv-empty">No messages found in range</div>';
        return;
    }

    msgs.forEach(m => els.streamMsgContainer.appendChild(createStreamMsgDiv(m)));
}

/**
 * Prepend a single live-tail message (newest at top), pruning old entries
 */
export function appendStreamTailMessage(m) {
    // Remove any placeholder / previously loaded state marker
    const empty = els.streamMsgContainer.querySelector(".kv-empty, .tail-placeholder");
    if (empty) empty.remove();

    els.streamMsgContainer.prepend(createStreamMsgDiv(m));

    while (els.streamMsgContainer.children.length > MAX_TAIL_MESSAGES) {
        els.streamMsgContainer.lastChild.remove();
    }
}

export function showTailPlaceholder() {
    els.streamMsgContainer.innerHTML = '<div class="kv-empty tail-placeholder">Tailing... waiting for new messages</div>';
}

// ============================================================================
// MESSAGE LOG RENDERING
// ============================================================================

// Log history for export feature
const logHistory = [];

// Pause state
let isPaused = false;

// Unique message counter (prevents ID collisions)
let msgCounter = 0;

/**
 * Try to parse payload as JSON
 * Used for log export feature
 */
function tryParsePayload(rawData) {
    if (typeof rawData !== 'string') return rawData;
    const trimmed = rawData.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { return JSON.parse(rawData); } catch (e) { return rawData; }
    }
    return rawData;
}

/**
 * Add message to history for export
 */
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
    
    // Keep history size reasonable to prevent memory bloat
    if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift();
    }
}

/**
 * Create a message DOM element
 */
function createMessageDiv(subject, data, isRpc, msgHeaders) {
  const div = document.createElement("div");
  div.className = "msg-entry";
  
  // Apply filter if active
  const filterText = els.logFilter.value.toLowerCase();
  const fullText = (subject + data).toLowerCase();
  if (filterText && !fullText.includes(filterText)) {
    div.style.display = "none";
  }

  // Format content (with syntax highlighting for JSON)
  let content = utils.escapeHtml(data);
  
  // Only syntax highlight if payload is small enough
  // Large payloads slow down browser significantly
  if (data.length < MAX_PRETTY_SIZE) {
    try {
      const obj = JSON.parse(data);
      content = utils.syntaxHighlight(obj); 
    } catch (e) {
      // Not JSON, use raw text
    }
  } else {
    // Truncate large payloads to keep UI responsive
    content = utils.escapeHtml(data.substring(0, MAX_PRETTY_SIZE)) + 
              `\n... [Truncated ${utils.formatBytes(data.length)}]`;
  }

  const time = new Date().toLocaleTimeString();
  const badgeClass = isRpc ? "badge-rpc" : "badge-sub";
  const badgeText = isRpc ? "RPC" : "MSG";
  
  // Use counter to prevent ID collisions (more reliable than timestamp + random)
  const msgId = `msg-${msgCounter++}`;

  // Format headers if present
  let headerHtml = "";
  if (msgHeaders) {
    const headerList = [];
    for (const [key, value] of msgHeaders) {
      headerList.push(`${key}: ${value}`);
    }
    if (headerList.length > 0) {
      headerHtml = `<div style="margin-top:4px;">
        <span class="badge badge-hdr">HEAD</span> 
        <span style="color:#888; font-size:0.8em">${utils.escapeHtml(headerList.join(", "))}</span>
      </div>`;
    }
  }

  div.innerHTML = `
    <div class="msg-meta">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span>${time}</span>
      <span style="color:#ddd; font-weight:bold;">${utils.escapeHtml(subject)}</span>
      <button class="copy-btn" data-msg-id="${msgId}">Copy JSON</button>
    </div>
    ${headerHtml}
    <pre id="${msgId}">${content}</pre>
  `;
  
  return div;
}

/**
 * Render a message to the log
 * 
 * Simple direct approach - just prepend to DOM
 * Messages appear at TOP (newest first)
 * Auto-prune old messages to keep DOM size manageable
 * 
 * If high-traffic subjects cause UI lag in the future, 
 * we can add batching then. Start simple!
 */
export function renderMessage(subject, data, isRpc = false, msgHeaders = null) {
  // Don't render if paused (unless it's an RPC response - those should always show)
  if (isPaused && !isRpc) return;
  
  // Add to history for export
  addToLogHistory(subject, data, isRpc, msgHeaders);
  
  // Create and add DOM element
  const div = createMessageDiv(subject, data, isRpc, msgHeaders);
  
  // Check if user is viewing top of log (so we can keep them there)
  const isAtTop = els.messages.scrollTop === 0;
  
  // Add to top of list (newest messages at top)
  els.messages.prepend(div);
  
  // Keep scroll position at top if they were already there
  if (isAtTop) {
    els.messages.scrollTop = 0;
  }
  
  // Prune old messages to prevent DOM bloat
  // Keep last N messages visible for scrollback
  while (els.messages.children.length > MAX_VISIBLE_MESSAGES) {
    els.messages.lastChild.remove();
  }
}

export function toggleLogPause() {
  isPaused = !isPaused;
  els.btnPause.innerText = isPaused ? "Resume" : "Pause";
  if (isPaused) els.btnPause.classList.add("paused");
  else els.btnPause.classList.remove("paused");
}

export function clearLogs() {
  logHistory.length = 0;
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

export function filterLogs(val) {
  const v = val.toLowerCase();
  document.querySelectorAll(".msg-entry").forEach(entry => {
    entry.style.display = entry.innerText.toLowerCase().includes(v) ? "block" : "none";
  });
}

// ============================================================================
// LIST FILTERING
// ============================================================================

export function filterList(inputElement, containerElement, childSelector = "div") {
    const term = inputElement.value.toLowerCase();
    const children = containerElement.querySelectorAll(childSelector);
    children.forEach(child => {
        if(child.classList.contains("kv-empty")) return;
        const text = child.innerText.toLowerCase();
        child.style.display = text.includes(term) ? "block" : "none";
    });
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

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

// ============================================================================
// CONNECTION STATE UI
// ============================================================================

export function setConnectionState(state) {
  if (state === 'connected') {
    els.btnConnect.innerText = "Disconnect";
    els.btnConnect.className = "danger";
    els.btnConnect.disabled = false;
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
    // Disconnected
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

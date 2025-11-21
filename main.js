import { els } from "./dom.js";
import * as utils from "./utils.js";
import * as ui from "./ui.js";
import * as nats from "./nats-client.js";

// --- INIT ---
const savedUrl = localStorage.getItem("nats_url");
if (savedUrl) els.url.value = savedUrl;
const savedPubSubj = localStorage.getItem("nats_last_pub_subject");
if (savedPubSubj) els.pubSubject.value = savedPubSubj;

// --- EVENT LISTENERS ---

// 1. CONNECT / DISCONNECT TOGGLE
els.btnConnect.addEventListener("click", async () => {
  // A. DISCONNECT FLOW
  if (nats.isConnected()) {
    try {
      await nats.disconnect();
      ui.setConnectionState(false);
      ui.showToast("Disconnected", "info");
    } catch (err) {
      ui.showToast(`Error disconnecting: ${err.message}`, "error");
    }
    return; 
  }

  // B. CONNECT FLOW
  try {
    localStorage.setItem("nats_url", els.url.value);
    els.statusText.innerText = "Connecting...";
    
    const file = els.creds.files.length > 0 ? els.creds.files[0] : null;
    await nats.connectToNats(els.url.value, file);

    ui.setConnectionState(true);
    ui.showToast("Connected to NATS", "success");
  } catch (err) {
    els.statusText.innerText = "Error";
    els.statusText.style.color = "#d32f2f";
    ui.showToast(`Connection Failed: ${err.message}`, "error");
  }
});

// 2. INFO MODAL
els.btnInfo.addEventListener("click", () => {
  const info = nats.getServerInfo();
  if (info) {
    els.serverInfoPre.innerText = JSON.stringify(info, null, 2);
  } else {
    els.serverInfoPre.innerText = "Not connected.";
  }
  els.infoModal.style.display = "flex";
});

els.btnCloseModal.addEventListener("click", () => {
  els.infoModal.style.display = "none";
});

// 3. TABS
els.tabMsg.onclick = () => ui.switchTab('msg');
els.tabKv.onclick = () => {
  ui.switchTab('kv');
  if (nats.isConnected()) loadKvBucketsWrapper();
};

// 4. SUBSCRIBE
els.btnSub.addEventListener("click", () => {
  const subj = els.subSubject.value.trim();
  if (!subj) return;
  try {
    utils.addToHistory(subj);
    const { id, subject, size } = nats.subscribe(subj);
    
    const li = document.createElement("li");
    li.id = `sub-li-${id}`;
    li.innerHTML = `<span>${subject}</span><button class="danger" onclick="window.unsubscribe(${id})">X</button>`;
    els.subList.prepend(li);
    els.subCount.innerText = `(${size})`;
    els.subSubject.value = "";
    ui.showToast(`Subscribed to ${subject}`, "success");
  } catch (err) {
    ui.showToast(err.message, "error");
  }
});

window.unsubscribe = (id) => {
  const size = nats.unsubscribe(id);
  const li = document.getElementById(`sub-li-${id}`);
  if (li) li.remove();
  els.subCount.innerText = `(${size})`;
};

// 5. PUBLISH
els.btnPub.addEventListener("click", () => {
  const subj = els.pubSubject.value.trim();
  const payload = els.pubPayload.value;
  if (!subj) return;

  try {
    utils.addToHistory(subj);
    localStorage.setItem("nats_last_pub_subject", subj);
    
    nats.publish(subj, payload, els.pubHeaders.value);
    
    const originalText = els.btnPub.innerText;
    els.btnPub.innerText = "✓";
    setTimeout(() => els.btnPub.innerText = "Pub", 1000);
  } catch (err) {
    ui.showToast(err.message, "error");
  }
});

// 6. REQUEST
els.btnReq.addEventListener("click", async () => {
  const subj = els.pubSubject.value.trim();
  const payload = els.pubPayload.value;
  const timeout = parseInt(els.reqTimeout.value) || 2000;
  
  try {
    utils.addToHistory(subj);
    els.btnReq.disabled = true;
    const msg = await nats.request(subj, payload, els.pubHeaders.value, timeout);
    ui.renderMessage(msg.subject, msg.data, true, msg.headers);
  } catch (err) {
    ui.showToast(err.message, "error");
  } finally {
    els.btnReq.disabled = false;
  }
});

// --- UI HELPERS ---
els.subSubject.addEventListener("keyup", (e) => { if (e.key === "Enter") els.btnSub.click(); });
els.pubPayload.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") els.btnPub.click(); });
els.pubPayload.addEventListener("blur", () => utils.beautify(els.pubPayload));
els.pubHeaders.addEventListener("blur", () => utils.beautify(els.pubHeaders));
els.kvValueInput.addEventListener("blur", () => utils.beautify(els.kvValueInput));
els.btnClear.addEventListener("click", () => els.messages.innerHTML = "");
els.logFilter.addEventListener("keyup", (e) => ui.filterLogs(e.target.value));
els.btnPause.addEventListener("click", ui.toggleLogPause);

els.btnHeaderToggle.addEventListener("click", () => {
  const isHidden = els.headerContainer.style.display === "none";
  els.headerContainer.style.display = isHidden ? "block" : "none";
  els.btnHeaderToggle.innerText = isHidden ? "▼ Headers (Optional)" : "► Add Headers (Optional)";
});

// --- KV LOGIC WRAPPERS ---
async function loadKvBucketsWrapper() {
  try {
    const list = await nats.getKvBuckets();
    els.kvBucketSelect.innerHTML = '<option value="">-- Select a Bucket --</option>';
    if (list.length === 0) ui.setKvStatus("No KV Buckets found.");
    else {
      list.sort().forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.innerText = b;
        els.kvBucketSelect.appendChild(opt);
      });
      ui.setKvStatus(`Loaded ${list.length} buckets.`);
    }
  } catch (e) { console.error(e); ui.setKvStatus("Error loading buckets", true); }
}
els.btnKvRefresh.addEventListener("click", loadKvBucketsWrapper);

els.kvBucketSelect.addEventListener("change", async () => {
  const bucket = els.kvBucketSelect.value;
  if (!bucket) return;
  try {
    await nats.openKvBucket(bucket);
    loadKeysWrapper();
  } catch (e) { ui.setKvStatus(e.message, true); }
});

els.btnKvLoadKeys.addEventListener("click", loadKeysWrapper);

async function loadKeysWrapper() {
  els.kvKeyList.innerHTML = '<div class="kv-empty">Loading...</div>';
  try {
    const keys = await nats.getKvKeys();
    if (keys.length === 0) {
      els.kvKeyList.innerHTML = '<div class="kv-empty">No keys found</div>';
      return;
    }
    els.kvKeyList.innerHTML = '';
    keys.sort().forEach(k => {
      const div = document.createElement("div");
      div.className = "kv-key";
      div.innerText = k;
      div.onclick = () => selectKeyWrapper(k, div);
      els.kvKeyList.appendChild(div);
    });
    ui.setKvStatus(`Loaded ${keys.length} keys.`);
  } catch (e) { console.error(e); els.kvKeyList.innerHTML = '<div class="kv-empty">Error</div>'; }
}

async function selectKeyWrapper(key, uiEl) {
  document.querySelectorAll(".kv-key").forEach(e => e.classList.remove("active"));
  if (uiEl) uiEl.classList.add("active");
  els.kvKeyInput.value = key;
  els.kvValueInput.value = "Loading...";
  try {
    const res = await nats.getKvValue(key);
    if (res) {
      els.kvValueInput.value = res.value;
      utils.beautify(els.kvValueInput);
      ui.setKvStatus(`Loaded key '${key}' (Rev: ${res.revision})`);
    } else {
      els.kvValueInput.value = "";
      ui.setKvStatus("Key not found", true);
    }
  } catch (e) { els.kvValueInput.value = ""; ui.setKvStatus(e.message, true); }
}

els.btnKvGet.addEventListener("click", () => selectKeyWrapper(els.kvKeyInput.value));

els.btnKvPut.addEventListener("click", async () => {
  const key = els.kvKeyInput.value.trim();
  const val = els.kvValueInput.value;
  if (!key) return;
  try {
    await nats.putKvValue(key, val);
    ui.setKvStatus(`Saved '${key}'`);
    const existing = Array.from(document.querySelectorAll(".kv-key")).map(e => e.innerText);
    if (!existing.includes(key)) loadKeysWrapper();
    ui.showToast("Key Saved", "success");
  } catch (e) { ui.setKvStatus(e.message, true); ui.showToast(e.message, "error"); }
});

els.btnKvDelete.addEventListener("click", async () => {
  const key = els.kvKeyInput.value.trim();
  if (!key || !confirm(`Delete '${key}'?`)) return;
  try {
    await nats.deleteKvValue(key);
    ui.setKvStatus(`Deleted '${key}'`);
    els.kvValueInput.value = "";
    loadKeysWrapper();
    ui.showToast("Key Deleted", "info");
  } catch (e) { ui.setKvStatus(e.message, true); ui.showToast(e.message, "error"); }
});

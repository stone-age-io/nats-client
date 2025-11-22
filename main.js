import { els } from "./dom.js";
import * as utils from "./utils.js";
import * as ui from "./ui.js";
import * as nats from "./nats-client.js";

// Init History
function refreshHistoryUi() {
    ui.renderHistoryDatalist("subHistory", utils.getSubjectHistory());
    ui.renderHistoryDatalist("urlHistory", utils.getUrlHistory());
}
refreshHistoryUi();

const savedUrl = localStorage.getItem("nats_url");
if (savedUrl) els.url.value = savedUrl;

const urlParams = new URLSearchParams(window.location.search);
const paramUrl = urlParams.get('url');
const paramToken = urlParams.get('token');
const paramUser = urlParams.get('user');
const paramPass = urlParams.get('pass');
const autoConnect = urlParams.has('connect');

if (paramUrl) els.url.value = paramUrl;
if (paramToken) els.authToken.value = paramToken;
if (paramUser) els.authUser.value = paramUser;
if (paramPass) els.authPass.value = paramPass;

els.btnConnect.addEventListener("click", async () => {
  if (nats.isConnected()) {
    try {
      ui.setConnectionState('disconnected');
      ui.stopRenderLoop();
      ui.showToast("Disconnected", "info");
      await nats.disconnect();
    } catch (err) {
      ui.showToast(`Error disconnecting: ${err.message}`, "error");
    }
    return; 
  }

  try {
    const url = els.url.value;
    localStorage.setItem("nats_url", url);
    utils.addUrlHistory(url);
    refreshHistoryUi();
    
    els.statusText.innerText = "Connecting...";
    
    const authOptions = {
        credsFile: els.creds.files.length > 0 ? els.creds.files[0] : null,
        user: els.authUser.value.trim(),
        pass: els.authPass.value.trim(),
        token: els.authToken.value.trim()
    };
    
    await nats.connectToNats(url, authOptions, (status, err) => {
      ui.setConnectionState(status);
      if (status === 'disconnected') {
          ui.stopRenderLoop();
          if (err) ui.showToast(`Connection Lost: ${err.message}`, "error");
      } else if (status === 'connected') {
          ui.showToast("Reconnected", "success");
      }
    });

    ui.setConnectionState('connected');
    ui.startRenderLoop();
    ui.showToast("Connected to NATS", "success");

    if (els.tabKv.classList.contains('active')) loadKvBucketsWrapper();
    else if (els.tabStream.classList.contains('active')) loadStreamsWrapper();

  } catch (err) {
    ui.setConnectionState('disconnected');
    ui.showToast(`Connection Failed: ${err.message}`, "error");
  }
});

if (autoConnect) setTimeout(() => els.btnConnect.click(), 100);

els.btnInfo.addEventListener("click", () => {
  const info = nats.getServerInfo();
  els.serverInfoPre.innerText = info ? JSON.stringify(info, null, 2) : "Not connected.";
  els.infoModal.style.display = "flex";
});
els.btnCloseModal.addEventListener("click", () => els.infoModal.style.display = "none");

let activeConfigAction = null; 
function openConfigModal(title, templateJson, actionCallback) {
    els.configModalTitle.innerText = title;
    els.configInput.value = JSON.stringify(templateJson, null, 2);
    activeConfigAction = actionCallback;
    els.configModal.style.display = "flex";
    els.configInput.classList.remove("input-error");
}
function closeConfigModal() {
    els.configModal.style.display = "none";
    activeConfigAction = null;
}
els.btnCloseConfigModal.addEventListener("click", closeConfigModal);
els.btnConfigSave.addEventListener("click", async () => {
    if(!utils.validateJsonInput(els.configInput)) {
        ui.showToast("Invalid JSON", "error");
        return;
    }
    if(activeConfigAction) {
        const config = JSON.parse(els.configInput.value);
        await activeConfigAction(config);
    }
});
els.configInput.addEventListener("input", () => utils.validateJsonInput(els.configInput));
document.addEventListener("keydown", (e) => { 
    if (e.key === "Escape") {
        els.infoModal.style.display = "none";
        closeConfigModal();
    }
});

els.tabMsg.onclick = () => ui.switchTab('msg');
els.tabKv.onclick = () => {
  ui.switchTab('kv');
  if (nats.isConnected()) loadKvBucketsWrapper();
};
els.tabStream.onclick = () => {
  ui.switchTab('stream');
  if (nats.isConnected()) loadStreamsWrapper();
};

// SUBSCRIPTIONS
els.btnSub.addEventListener("click", () => {
  const subj = els.subSubject.value.trim();
  if (!subj) return;
  try {
    utils.addSubjectHistory(subj);
    refreshHistoryUi();
    const { id, subject, size } = nats.subscribe(subj);
    ui.addSubscription(id, subject);
    ui.updateSubCount(size);
    els.subSubject.value = "";
    ui.showToast(`Subscribed to ${subject}`, "success");
  } catch (err) { ui.showToast(err.message, "error"); }
});

window.unsubscribe = (id) => {
  const size = nats.unsubscribe(id);
  ui.removeSubscription(id);
  ui.updateSubCount(size);
};

els.btnPub.addEventListener("click", () => {
  const subj = els.pubSubject.value.trim();
  if (!subj) return;
  try {
    utils.addSubjectHistory(subj);
    refreshHistoryUi();
    nats.publish(subj, els.pubPayload.value, els.pubHeaders.value);
    const originalText = els.btnPub.innerText;
    els.btnPub.innerText = "✓";
    setTimeout(() => els.btnPub.innerText = "Pub", 1000);
  } catch (err) { ui.showToast(err.message, "error"); }
});

els.btnReq.addEventListener("click", async () => {
  const subj = els.pubSubject.value.trim();
  const timeout = parseInt(els.reqTimeout.value) || 2000;
  try {
    utils.addSubjectHistory(subj);
    refreshHistoryUi();
    els.btnReq.disabled = true;
    const msg = await nats.request(subj, els.pubPayload.value, els.pubHeaders.value, timeout);
    ui.renderMessage(msg.subject, msg.data, true, msg.headers);
  } catch (err) { ui.showToast(err.message, "error"); }
  finally { els.btnReq.disabled = false; }
});

els.subSubject.addEventListener("keyup", (e) => { if (e.key === "Enter") els.btnSub.click(); });
els.pubPayload.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") els.btnPub.click(); });
els.pubPayload.addEventListener("input", () => utils.validateJsonInput(els.pubPayload));
els.pubHeaders.addEventListener("input", () => utils.validateJsonInput(els.pubHeaders));
els.kvValueInput.addEventListener("input", () => utils.validateJsonInput(els.kvValueInput));
els.pubPayload.addEventListener("blur", () => { if(utils.validateJsonInput(els.pubPayload)) utils.beautify(els.pubPayload); });
els.pubHeaders.addEventListener("blur", () => { if(utils.validateJsonInput(els.pubHeaders)) utils.beautify(els.pubHeaders); });
els.kvValueInput.addEventListener("blur", () => { if(utils.validateJsonInput(els.kvValueInput)) utils.beautify(els.kvValueInput); });
els.btnClear.addEventListener("click", () => ui.clearLogs());
els.logFilter.addEventListener("keyup", (e) => ui.filterLogs(e.target.value));
els.btnPause.addEventListener("click", ui.toggleLogPause);
els.btnHeaderToggle.addEventListener("click", () => {
  const isHidden = els.headerContainer.style.display === "none";
  els.headerContainer.style.display = isHidden ? "block" : "none";
  els.btnHeaderToggle.innerText = isHidden ? "▼ Headers (Optional)" : "► Add Headers (Optional)";
});
els.btnDownloadLogs.addEventListener("click", ui.downloadLogs);
els.kvFilter.addEventListener("keyup", () => ui.filterList(els.kvFilter, els.kvKeyList, ".kv-key"));
els.streamFilter.addEventListener("keyup", () => ui.filterList(els.streamFilter, els.streamList, ".kv-key"));

// --- KV STORE LOGIC ---

els.btnKvCreate.addEventListener("click", () => {
    const template = { bucket: "new-bucket", history: 5, description: "My KV Bucket", storage: "file", replicas: 1 };
    openConfigModal("Create KV Bucket", template, async (config) => {
        try {
            await nats.createKvBucket(config);
            ui.showToast(`Bucket ${config.bucket} created`, "success");
            closeConfigModal();
            loadKvBucketsWrapper();
        } catch(e) { ui.showToast(e.message, "error"); }
    });
});
els.btnKvEdit.addEventListener("click", async () => {
    const bucket = els.kvBucketSelect.value;
    if(!bucket) { ui.showToast("Select a bucket first", "info"); return; }
    try {
        const status = await nats.getKvStatus();
        const editableConfig = {
            bucket: status.bucket,
            history: status.history,
            description: status.streamInfo.config.description || "",
            storage: status.storage,
            replicas: status.replicas, 
            ttl: status.ttl,
            maxBucketSize: status.streamInfo.config.max_bytes,
            maxValueSize: status.streamInfo.config.max_msg_size
        };
        openConfigModal(`Edit KV: ${bucket}`, editableConfig, async (config) => {
            try {
                await nats.updateKvBucket(config);
                ui.showToast(`Bucket ${bucket} updated`, "success");
                closeConfigModal();
            } catch(e) { ui.showToast(e.message, "error"); }
        });
    } catch(e) { ui.showToast("Error fetching KV status: " + e.message, "error"); }
});

async function loadKvBucketsWrapper() {
  try {
    const list = await nats.getKvBuckets();
    ui.renderKvBuckets(list);
    ui.setKvStatus(`Loaded ${list.length} buckets.`);
  } catch (e) { ui.setKvStatus("Error loading buckets", true); }
}

els.btnKvRefresh.addEventListener("click", loadKvBucketsWrapper);
const kvKeysMap = new Set(); 

els.kvBucketSelect.addEventListener("change", async () => {
  const bucket = els.kvBucketSelect.value;
  els.kvKeyList.innerHTML = '';
  kvKeysMap.clear();
  if (!bucket) return;
  try {
    await nats.openKvBucket(bucket);
    ui.setKvStatus(`Watching ${bucket}...`);
    nats.watchKvBucket((key, op) => {
        if (op === "DEL" || op === "PURGE") {
             kvKeysMap.delete(key);
             ui.removeKvKey(key);
        } else {
            if(!kvKeysMap.has(key)) {
                kvKeysMap.add(key);
                ui.addKvKey(key, (k, div) => selectKeyWrapper(k, div));
                if(els.kvFilter.value) ui.filterList(els.kvFilter, els.kvKeyList, ".kv-key");
            }
        }
    });
  } catch (e) { ui.setKvStatus(e.message, true); }
});

// KV VIEW MODE LOGIC
let isKvEditMode = false;

function setKvEditMode(isEdit) {
    isKvEditMode = isEdit;
    if (isKvEditMode) {
        els.kvValueInput.style.display = "block";
        els.kvValueHighlighter.style.display = "none";
        els.btnKvToggleMode.innerText = "👁 View";
        els.kvValueInput.focus();
    } else {
        els.kvValueInput.style.display = "none";
        els.kvValueHighlighter.style.display = "block";
        els.btnKvToggleMode.innerText = "✎ Edit";
        try {
            const json = JSON.parse(els.kvValueInput.value);
            els.kvValueHighlighter.innerHTML = utils.syntaxHighlight(json);
        } catch(e) {
            els.kvValueHighlighter.innerText = els.kvValueInput.value;
        }
    }
}

els.btnKvToggleMode.addEventListener("click", () => {
    setKvEditMode(!isKvEditMode);
});

async function selectKeyWrapper(key, uiEl) {
  ui.highlightKvKey(key, uiEl);
  els.kvKeyInput.value = key;
  els.kvValueInput.value = "Loading...";
  els.kvValueHighlighter.innerText = "Loading...";
  els.kvHistoryList.innerHTML = "Loading history...";
  
  try {
    // 1. Get Current Value (Head)
    const res = await nats.getKvValue(key);
    if (res) {
      els.kvValueInput.value = res.value;
      utils.beautify(els.kvValueInput);
      setKvEditMode(false);
      ui.setKvStatus(`Loaded '${key}' (Rev: ${res.revision})`);
    } else {
      els.kvValueInput.value = "";
      els.kvValueHighlighter.innerText = "";
      ui.setKvStatus("Key not found", true);
    }

    // 2. Get History & Render with Click Handler
    const hist = await nats.getKvHistory(key);
    
    ui.renderKvHistory(hist, (entry) => {
        // LOGIC: What happens when history row is clicked
        const isDelete = entry.operation === "DEL" || entry.operation === "PURGE";
        
        if (isDelete) {
            els.kvValueInput.value = "";
            els.kvValueHighlighter.innerText = "// [DELETED REVISION]";
        } else {
            els.kvValueInput.value = entry.value;
            utils.beautify(els.kvValueInput);
            
            // If in view mode, update highlighter immediately
            if (!isKvEditMode) {
                try {
                    const json = JSON.parse(els.kvValueInput.value);
                    els.kvValueHighlighter.innerHTML = utils.syntaxHighlight(json);
                } catch(e) {
                    els.kvValueHighlighter.innerText = els.kvValueInput.value;
                }
            }
        }
        
        // Force view mode to prevent accidental overwrite of HEAD with old data
        setKvEditMode(false);
        ui.setKvStatus(`Viewing Rev ${entry.revision} (Historical)`);
    });

  } catch (e) { 
      els.kvValueInput.value = ""; 
      els.kvValueHighlighter.innerText = "";
      ui.setKvStatus(e.message, true); 
  }
}

els.btnKvGet.addEventListener("click", () => selectKeyWrapper(els.kvKeyInput.value));
els.btnKvCopy.addEventListener("click", () => {
  const val = els.kvValueInput.value;
  if(!val) return;
  navigator.clipboard.writeText(val);
  const orig = els.btnKvCopy.innerText;
  els.btnKvCopy.innerText = "Copied!";
  setTimeout(() => els.btnKvCopy.innerText = orig, 1000);
});
els.btnKvPut.addEventListener("click", async () => {
  const key = els.kvKeyInput.value.trim();
  const val = els.kvValueInput.value;
  if (!key) return;
  try {
    await nats.putKvValue(key, val);
    ui.setKvStatus(`Saved '${key}'`);
    ui.showToast("Key Saved", "success");
    selectKeyWrapper(key);
  } catch (e) { ui.setKvStatus(e.message, true); ui.showToast(e.message, "error"); }
});
els.btnKvDelete.addEventListener("click", async () => {
  const key = els.kvKeyInput.value.trim();
  if (!key || !confirm(`Delete '${key}'?`)) return;
  try {
    await nats.deleteKvValue(key);
    ui.setKvStatus(`Deleted '${key}'`);
    els.kvValueInput.value = "";
    els.kvValueHighlighter.innerText = "";
    els.kvHistoryList.innerHTML = "Key deleted.";
    ui.showToast("Key Deleted", "info");
  } catch (e) { ui.setKvStatus(e.message, true); ui.showToast(e.message, "error"); }
});

// --- STREAMS LOGIC ---
let currentStream = null;
els.btnStreamCreate.addEventListener("click", () => {
    const template = { name: "NEW_STREAM", description: "Stream Description", subjects: ["events.>"], retention: "limits", max_msgs: -1, max_bytes: -1, max_age: 0, discard: "old", storage: "file", num_replicas: 1, duplicate_window: 120000000000 };
    openConfigModal("Create Stream", template, async (config) => {
        try {
            await nats.createStream(config);
            ui.showToast(`Stream ${config.name} created`, "success");
            closeConfigModal();
            loadStreamsWrapper();
        } catch(e) { ui.showToast(e.message, "error"); }
    });
});
els.btnStreamEdit.addEventListener("click", async () => {
    if(!currentStream) { ui.showToast("Select a stream first", "info"); return; }
    try {
        const info = await nats.getStreamInfo(currentStream);
        openConfigModal(`Edit Stream: ${currentStream}`, info.config, async (config) => {
            try {
                await nats.updateStream(config);
                ui.showToast(`Stream ${currentStream} updated`, "success");
                closeConfigModal();
                selectStreamWrapper(currentStream);
            } catch(e) { ui.showToast(e.message, "error"); }
        });
    } catch(e) { ui.showToast("Error fetching stream info: " + e.message, "error"); }
});

async function loadStreamsWrapper() {
  els.streamList.innerHTML = '<div class="kv-empty">Loading...</div>';
  try {
    const list = await nats.getStreams();
    list.sort((a,b) => a.config.name.localeCompare(b.config.name));
    ui.renderStreamList(list, (name, div) => selectStreamWrapper(name, div));
    if(els.streamFilter.value) ui.filterList(els.streamFilter, els.streamList, ".kv-key");
  } catch (e) { els.streamList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`; }
}
els.btnStreamRefresh.addEventListener("click", loadStreamsWrapper);

async function selectStreamWrapper(name, uiEl) {
  ui.highlightStream(uiEl);
  currentStream = name;
  els.streamEmptyState.style.display = "none";
  els.streamDetailView.style.display = "none"; 
  els.streamMsgContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view stream messages</div>`;
  els.consumerList.innerHTML = `<div style="padding:10px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view consumers</div>`;
  try {
    const info = await nats.getStreamInfo(name);
    const conf = info.config;
    const state = info.state;
    els.streamNameTitle.innerText = conf.name;
    els.streamCreated.innerText = new Date(info.created).toLocaleString();
    els.streamSubjects.innerText = (conf.subjects || []).join(", ");
    els.streamStorage.innerText = conf.storage; 
    els.streamRetention.innerText = conf.retention; 
    els.streamMsgs.innerText = state.messages.toLocaleString();
    els.streamBytes.innerText = utils.formatBytes(state.bytes);
    els.streamFirstSeq.innerText = state.first_seq;
    els.streamLastSeq.innerText = state.last_seq;
    els.streamConsumerCount.innerText = state.consumer_count;
    const last = state.last_seq;
    const first = state.first_seq;
    let start = last - 49;
    if (start < first) start = first;
    els.msgEndSeq.value = last;
    els.msgStartSeq.value = start > 0 ? start : 0;
    els.streamDetailView.style.display = "block";
  } catch (e) { ui.showToast(`Error loading stream info: ${e.message}`, "error"); }
}

els.btnStreamClearMsgs.addEventListener("click", () => {
    els.streamMsgContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view stream messages</div>`;
    els.streamMsgFilter.value = "";
});

els.streamMsgFilter.addEventListener("keyup", () => {
    ui.filterList(els.streamMsgFilter, els.streamMsgContainer, ".stream-msg-entry");
});

els.btnStreamViewMsgs.addEventListener("click", async () => {
    if(!currentStream) return;
    const start = parseInt(els.msgStartSeq.value) || 0;
    const end = parseInt(els.msgEndSeq.value) || 0;
    if(end < start) { ui.showToast("End Seq cannot be less than Start Seq", "error"); return; }
    if((end - start) > 50) { ui.showToast("Range cannot exceed 50 messages", "error"); return; }
    els.btnStreamViewMsgs.disabled = true;
    els.streamMsgContainer.innerHTML = '<div class="kv-empty">Loading...</div>';
    try {
        const msgs = await nats.getStreamMessageRange(currentStream, start, end);
        ui.renderStreamMessages(msgs);
        if(els.streamMsgFilter.value) {
             ui.filterList(els.streamMsgFilter, els.streamMsgContainer, ".stream-msg-entry");
        }
    } catch(e) { els.streamMsgContainer.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`; } 
    finally { els.btnStreamViewMsgs.disabled = false; }
});

els.btnLoadConsumers.addEventListener("click", async () => {
    if(!currentStream) return;
    els.btnLoadConsumers.disabled = true;
    els.consumerList.innerHTML = '<div class="kv-empty">Loading...</div>';
    try {
        const consumers = await nats.getConsumers(currentStream);
        ui.renderStreamConsumers(consumers);
    } catch (e) { els.consumerList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`; } 
    finally { els.btnLoadConsumers.disabled = false; }
});

els.btnStreamPurge.addEventListener("click", async () => {
    if(!currentStream || !confirm(`Purge ALL messages from '${currentStream}'? This cannot be undone.`)) return;
    try {
        await nats.purgeStream(currentStream);
        ui.showToast(`Stream '${currentStream}' purged`, "success");
        selectStreamWrapper(currentStream); 
    } catch(e) { ui.showToast(e.message, "error"); }
});

els.btnStreamDelete.addEventListener("click", async () => {
    if(!currentStream || !confirm(`DELETE stream '${currentStream}'?`)) return;
    try {
        await nats.deleteStream(currentStream);
        ui.showToast(`Stream '${currentStream}' deleted`, "success");
        currentStream = null;
        els.streamDetailView.style.display = "none";
        els.streamEmptyState.style.display = "block";
        loadStreamsWrapper();
    } catch(e) { ui.showToast(e.message, "error"); }
});

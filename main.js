import { els } from "./dom.js";
import * as utils from "./utils.js";
import * as ui from "./ui.js";
import * as nats from "./nats-client.js";

// --- INIT ---
const savedUrl = localStorage.getItem("nats_url");
if (savedUrl) els.url.value = savedUrl;

// --- EVENT LISTENERS ---

// 1. CONNECT
els.btnConnect.addEventListener("click", async () => {
  if (nats.isConnected()) {
    try {
      ui.setConnectionState(false);
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
    utils.addToUrlHistory(url);
    
    els.statusText.innerText = "Connecting...";
    
    // Gather Auth Options
    const authOptions = {
        credsFile: els.creds.files.length > 0 ? els.creds.files[0] : null,
        user: els.authUser.value.trim(),
        pass: els.authPass.value.trim(),
        token: els.authToken.value.trim()
    };
    
    await nats.connectToNats(url, authOptions, (err) => {
      ui.setConnectionState(false);
      if (err) {
        ui.showToast(`Connection Lost: ${err.message}`, "error");
        els.statusText.innerText = "Error";
        els.statusText.style.color = "#d32f2f";
      }
    });

    ui.setConnectionState(true);
    ui.showToast("Connected to NATS", "success");

    if (els.tabKv.classList.contains('active')) {
      loadKvBucketsWrapper();
    } else if (els.tabStream.classList.contains('active')) {
      loadStreamsWrapper();
    }

  } catch (err) {
    els.statusText.innerText = "Error";
    els.statusText.style.color = "#d32f2f";
    ui.showToast(`Connection Failed: ${err.message}`, "error");
  }
});

// 2. INFO MODAL
els.btnInfo.addEventListener("click", () => {
  const info = nats.getServerInfo();
  els.serverInfoPre.innerText = info ? JSON.stringify(info, null, 2) : "Not connected.";
  els.infoModal.style.display = "flex";
});
els.btnCloseModal.addEventListener("click", () => els.infoModal.style.display = "none");

// --- CONFIG MODAL HELPERS ---
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

// 3. TABS
els.tabMsg.onclick = () => ui.switchTab('msg');
els.tabKv.onclick = () => {
  ui.switchTab('kv');
  if (nats.isConnected()) loadKvBucketsWrapper();
};
els.tabStream.onclick = () => {
  ui.switchTab('stream');
  if (nats.isConnected()) loadStreamsWrapper();
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
    
    li.innerHTML = `
      <span style="cursor:pointer;" title="Click to copy to Publish" 
            onclick="document.getElementById('pubSubject').value = '${subject}'">
        ${subject}
      </span>
      <button class="danger" onclick="window.unsubscribe(${id})">X</button>
    `;
    
    els.subList.prepend(li);
    els.subCount.innerText = `(${size})`;
    els.subSubject.value = "";
    ui.showToast(`Subscribed to ${subject}`, "success");
  } catch (err) { ui.showToast(err.message, "error"); }
});

window.unsubscribe = (id) => {
  const size = nats.unsubscribe(id);
  const li = document.getElementById(`sub-li-${id}`);
  if (li) li.remove();
  els.subCount.innerText = `(${size})`;
};

// 5. PUBLISH & REQUEST
els.btnPub.addEventListener("click", () => {
  const subj = els.pubSubject.value.trim();
  if (!subj) return;
  try {
    utils.addToHistory(subj);
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
    utils.addToHistory(subj);
    els.btnReq.disabled = true;
    const msg = await nats.request(subj, els.pubPayload.value, els.pubHeaders.value, timeout);
    ui.renderMessage(msg.subject, msg.data, true, msg.headers);
  } catch (err) { ui.showToast(err.message, "error"); }
  finally { els.btnReq.disabled = false; }
});

// --- UI HELPERS ---
els.subSubject.addEventListener("keyup", (e) => { if (e.key === "Enter") els.btnSub.click(); });
els.pubPayload.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") els.btnPub.click(); });

els.pubPayload.addEventListener("input", () => utils.validateJsonInput(els.pubPayload));
els.pubHeaders.addEventListener("input", () => utils.validateJsonInput(els.pubHeaders));
els.kvValueInput.addEventListener("input", () => utils.validateJsonInput(els.kvValueInput));

els.pubPayload.addEventListener("blur", () => { if(utils.validateJsonInput(els.pubPayload)) utils.beautify(els.pubPayload); });
els.pubHeaders.addEventListener("blur", () => { if(utils.validateJsonInput(els.pubHeaders)) utils.beautify(els.pubHeaders); });
els.kvValueInput.addEventListener("blur", () => { if(utils.validateJsonInput(els.kvValueInput)) utils.beautify(els.kvValueInput); });

els.btnClear.addEventListener("click", () => els.messages.innerHTML = "");
els.logFilter.addEventListener("keyup", (e) => ui.filterLogs(e.target.value));
els.btnPause.addEventListener("click", ui.toggleLogPause);
els.btnHeaderToggle.addEventListener("click", () => {
  const isHidden = els.headerContainer.style.display === "none";
  els.headerContainer.style.display = isHidden ? "block" : "none";
  els.btnHeaderToggle.innerText = isHidden ? "▼ Headers (Optional)" : "► Add Headers (Optional)";
});

// --- KV LOGIC ---
els.btnKvCreate.addEventListener("click", () => {
    const template = {
        bucket: "new-bucket",
        history: 5,
        description: "My KV Bucket",
        storage: "file", // or "memory"
        replicas: 1
    };
    
    openConfigModal("Create KV Bucket", template, async (config) => {
        try {
            await nats.createKvBucket(config);
            ui.showToast(`Bucket ${config.bucket} created`, "success");
            closeConfigModal();
            loadKvBucketsWrapper();
        } catch(e) {
            ui.showToast(e.message, "error");
        }
    });
});

els.btnKvEdit.addEventListener("click", async () => {
    const bucket = els.kvBucketSelect.value;
    if(!bucket) {
        ui.showToast("Select a bucket first", "info");
        return;
    }
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
            } catch(e) {
                ui.showToast(e.message, "error");
            }
        });
    } catch(e) {
        ui.showToast("Error fetching KV status: " + e.message, "error");
    }
});

async function loadKvBucketsWrapper() {
  try {
    const list = await nats.getKvBuckets();
    els.kvBucketSelect.innerHTML = '<option value="">-- Select a Bucket --</option>';
    list.sort().forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.innerText = b;
      els.kvBucketSelect.appendChild(opt);
    });
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
             const el = document.getElementById(`kv-key-${key}`);
             if(el) el.remove();
        } else {
            if(!kvKeysMap.has(key)) {
                kvKeysMap.add(key);
                const div = document.createElement("div");
                div.className = "kv-key";
                div.id = `kv-key-${key}`;
                div.innerText = key;
                div.onclick = () => selectKeyWrapper(key, div);
                els.kvKeyList.appendChild(div);
            }
        }
    });
  } catch (e) { ui.setKvStatus(e.message, true); }
});

async function selectKeyWrapper(key, uiEl) {
  document.querySelectorAll(".kv-key").forEach(e => e.classList.remove("active"));
  if (uiEl) uiEl.classList.add("active");
  else {
      const existing = document.getElementById(`kv-key-${key}`);
      if(existing) existing.classList.add("active");
  }

  els.kvKeyInput.value = key;
  els.kvValueInput.value = "Loading...";
  els.kvHistoryList.innerHTML = "Loading history...";

  try {
    const res = await nats.getKvValue(key);
    if (res) {
      els.kvValueInput.value = res.value;
      utils.beautify(els.kvValueInput);
      ui.setKvStatus(`Loaded '${key}' (Rev: ${res.revision})`);
    } else {
      els.kvValueInput.value = "";
      ui.setKvStatus("Key not found", true);
    }

    const hist = await nats.getKvHistory(key);
    els.kvHistoryList.innerHTML = "";
    if(hist.length === 0) els.kvHistoryList.innerHTML = "No history found.";
    
    hist.forEach(h => {
        const row = document.createElement("div");
        row.style.borderBottom = "1px solid #333";
        row.style.padding = "4px";
        row.innerHTML = `
            <span style="color:var(--accent)">Rev ${h.revision}</span> 
            <span class="badge" style="font-size:0.7em">${h.operation}</span>
            <span style="float:right; color:#666;">${h.created.toLocaleTimeString()}</span>
        `;
        row.title = h.value; 
        els.kvHistoryList.appendChild(row);
    });
  } catch (e) { 
      els.kvValueInput.value = ""; 
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
    els.kvHistoryList.innerHTML = "Key deleted.";
    ui.showToast("Key Deleted", "info");
  } catch (e) { ui.setKvStatus(e.message, true); ui.showToast(e.message, "error"); }
});

// --- STREAM LOGIC ---
let currentStream = null;

els.btnStreamCreate.addEventListener("click", () => {
    const template = {
        name: "NEW_STREAM",
        description: "Stream Description",
        subjects: ["events.>"],
        retention: "limits", 
        max_msgs: -1,
        max_bytes: -1,
        // 0 = infinite. 1h = 3600000000000, 24h = 86400000000000
        max_age: 0, 
        discard: "old",
        storage: "file",
        num_replicas: 1,
        // 2 minutes in ns
        duplicate_window: 120000000000 
    };
    
    openConfigModal("Create Stream", template, async (config) => {
        try {
            await nats.createStream(config);
            ui.showToast(`Stream ${config.name} created`, "success");
            closeConfigModal();
            loadStreamsWrapper();
        } catch(e) {
            ui.showToast(e.message, "error");
        }
    });
});

els.btnStreamEdit.addEventListener("click", async () => {
    if(!currentStream) {
        ui.showToast("Select a stream first", "info");
        return;
    }
    try {
        const info = await nats.getStreamInfo(currentStream);
        openConfigModal(`Edit Stream: ${currentStream}`, info.config, async (config) => {
            try {
                await nats.updateStream(config);
                ui.showToast(`Stream ${currentStream} updated`, "success");
                closeConfigModal();
                selectStreamWrapper(currentStream); // Refresh info
            } catch(e) {
                ui.showToast(e.message, "error");
            }
        });
    } catch(e) {
        ui.showToast("Error fetching stream info: " + e.message, "error");
    }
});

async function loadStreamsWrapper() {
  els.streamList.innerHTML = '<div class="kv-empty">Loading...</div>';
  try {
    const list = await nats.getStreams();
    els.streamList.innerHTML = '';
    
    if(list.length === 0) {
        els.streamList.innerHTML = '<div class="kv-empty">No Streams Found</div>';
        return;
    }

    list.sort((a,b) => a.config.name.localeCompare(b.config.name)).forEach(s => {
      const div = document.createElement("div");
      div.className = "kv-key"; 
      div.innerText = s.config.name;
      div.onclick = () => selectStreamWrapper(s.config.name, div);
      els.streamList.appendChild(div);
    });
  } catch (e) {
    els.streamList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`;
  }
}

els.btnStreamRefresh.addEventListener("click", loadStreamsWrapper);

async function selectStreamWrapper(name, uiEl) {
  Array.from(els.streamList.children).forEach(e => e.classList.remove("active"));
  if(uiEl) uiEl.classList.add("active");

  currentStream = name;
  els.streamEmptyState.style.display = "none";
  els.streamDetailView.style.display = "none"; 
  // Reset message view
  els.streamMsgContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view stream messages</div>`;
  // Reset Consumer View
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

    // AUTO-FILL SEQUENCE INPUTS FOR MESSAGES
    const last = state.last_seq;
    const first = state.first_seq;
    // Default to last 50 messages
    let start = last - 49;
    if (start < first) start = first;
    
    els.msgEndSeq.value = last;
    els.msgStartSeq.value = start > 0 ? start : 0;

    els.streamDetailView.style.display = "block";
  } catch (e) {
    ui.showToast(`Error loading stream info: ${e.message}`, "error");
  }
}

els.btnStreamViewMsgs.addEventListener("click", async () => {
    if(!currentStream) return;
    
    // Validate Range
    const start = parseInt(els.msgStartSeq.value) || 0;
    const end = parseInt(els.msgEndSeq.value) || 0;
    
    if(end < start) {
        ui.showToast("End Seq cannot be less than Start Seq", "error");
        return;
    }
    if((end - start) > 50) {
        ui.showToast("Range cannot exceed 50 messages", "error");
        return;
    }

    els.btnStreamViewMsgs.disabled = true;
    els.streamMsgContainer.innerHTML = '<div class="kv-empty">Loading...</div>';
    
    try {
        const msgs = await nats.getStreamMessageRange(currentStream, start, end);
        els.streamMsgContainer.innerHTML = '';
        
        if(msgs.length === 0) {
            els.streamMsgContainer.innerHTML = '<div class="kv-empty">No messages found in range</div>';
            return;
        }
        
        msgs.forEach(m => {
            const div = document.createElement("div");
            div.style.borderBottom = "1px solid #333";
            div.style.padding = "8px";
            div.style.fontSize = "0.85rem";
            div.style.fontFamily = "var(--mono)";
            
            let content = m.data;
            try { content = JSON.stringify(JSON.parse(m.data), null, 2); } catch(e){}
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:var(--accent); margin-bottom:4px;">
                   <span>#${m.seq}</span>
                   <span style="color:#666;">${new Date(m.time).toLocaleTimeString()}</span>
                </div>
                <div style="color:#ddd; font-weight:bold; margin-bottom:4px;">${m.subject}</div>
                <pre style="margin:0; font-size:0.8em; color:#aaa;">${content}</pre>
            `;
            els.streamMsgContainer.appendChild(div);
        });
        
    } catch(e) {
        els.streamMsgContainer.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`;
    } finally {
        els.btnStreamViewMsgs.disabled = false;
    }
});

els.btnLoadConsumers.addEventListener("click", async () => {
    if(!currentStream) return;
    
    els.btnLoadConsumers.disabled = true;
    els.consumerList.innerHTML = '<div class="kv-empty">Loading...</div>';
    
    try {
        const consumers = await nats.getConsumers(currentStream);
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
                ? `<span style="color:var(--accent); font-weight:bold;">${c.name}</span>` 
                : `<span style="color:#888;">${c.name}</span> <span class="badge" style="font-size:0.6em">Ephemeral</span>`;

            const pending = c.num_pending || 0;
            const waiting = c.num_waiting || 0;
            
            div.innerHTML = `
                <div>${nameHtml}</div>
                <div style="font-family:var(--mono); font-size:0.75rem; color:#aaa;">
                    Pending: <span style="color:${pending > 0 ? 'var(--warn)' : '#666'}">${pending}</span> | 
                    Waiting: ${waiting}
                </div>
            `;
            els.consumerList.appendChild(div);
        });

    } catch (e) {
        els.consumerList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`;
    } finally {
        els.btnLoadConsumers.disabled = false;
    }
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

// ============================================================================
// NATS WEB CLIENT - MAIN APPLICATION LOGIC
// ============================================================================
// This is the "brain" - wires UI events to NATS operations
// Architecture: UI events → main.js handlers → nats-client.js API → UI updates

// ============================================================================
// IMPORTS
// ============================================================================

import { els } from "./dom.js";
import * as utils from "./utils.js";
import * as ui from "./ui.js";
import * as nats from "./nats-client.js";
import * as storage from "./storage.js";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// Maximum messages to fetch from stream in one request
// NATS server performance limit - larger batches cause timeouts
// Tested with NATS 2.9+ on standard hardware
const MAX_STREAM_MSG_FETCH = 50;

// Default RPC timeout in milliseconds
// 2 seconds is reasonable for most NATS deployments (local/LAN)
// Users can adjust per-request if needed
const DEFAULT_RPC_TIMEOUT_MS = 2000;

// ============================================================================
// APPLICATION STATE
// ============================================================================
// All mutable state in one place so grug can find it
// If you need to know "what is current X?", look here first

const appState = {
  // Config Modal Management
  // Stores the callback to execute when user clicks Save in the config modal
  // This allows one modal to handle creating/editing both Streams and KV Buckets
  activeConfigAction: null,
  
  // Stream Management
  // Name of the currently selected stream (string) or null if none selected
  currentStream: null,
  
  // KV Store Management
  // Set of key names in the currently watched bucket
  // Used to prevent duplicate key entries in the UI
  kvKeys: new Set(),
  
  // KV value edit mode flag
  // true = textarea is visible for editing
  // false = pre element is visible with syntax highlighting
  kvEditMode: false,
  
  // Name of the currently selected KV bucket (string) or null if none selected
  // Preserved when switching tabs so user maintains their working context
  currentKvBucket: null,
  
  // Current KV Watcher
  // AsyncIterable that streams key change events from the NATS server
  // Important: Must stop this before opening new bucket to prevent memory leaks
  currentKvWatcher: null,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 * Setup event delegation and restore saved state
 */
function initializeApp() {
  // Setup event delegation for copy buttons and unsubscribe buttons
  ui.initializeEventDelegation();
  setupSubscriptionEventDelegation();
  
  // Restore history and last URL
  refreshHistoryUi();
  const savedUrl = storage.getLastUrl();
  if (savedUrl) els.url.value = savedUrl;
  
  // Handle URL parameters (for deep linking)
  handleUrlParameters();
}

/**
 * Setup event delegation for subscription list
 * Handles unsubscribe button clicks and subject clicks
 */
function setupSubscriptionEventDelegation() {
  // Handle unsubscribe button clicks
  els.subList.addEventListener('click', (e) => {
    if (e.target.classList.contains('danger')) {
      const subId = parseInt(e.target.dataset.subId);
      if (!isNaN(subId)) {
        handleUnsubscribe(subId);
      }
    }
    
    // Handle subject clicks (copy to publish field)
    if (e.target.tagName === 'SPAN' && e.target.parentElement.id.startsWith('sub-li-')) {
      els.pubSubject.value = e.target.innerText;
    }
  });
}

/**
 * Refresh history dropdowns (subjects and URLs)
 */
function refreshHistoryUi() {
    ui.renderHistoryDatalist("subHistory", storage.getSubjectHistory());
    ui.renderHistoryDatalist("urlHistory", storage.getUrlHistory());
}

/**
 * Handle URL parameters for deep linking
 * Supports auto-connection with pre-filled credentials
 */
function handleUrlParameters() {
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
  
  // Auto-connect if requested
  if (autoConnect) {
    setTimeout(() => handleConnect(), 100);
  }
}

// Initialize app on load
initializeApp();

// ============================================================================
// CONNECTION HANDLERS
// ============================================================================

async function handleConnect() {
  // If already connected, disconnect
  if (nats.isConnected()) {
    try {
      await nats.disconnect();
      ui.setConnectionState('disconnected');
      
      // Clear KV bucket selection on disconnect
      // This ensures fresh state when reconnecting to potentially different server
      appState.currentKvBucket = null;
      
      ui.showToast("Disconnected", "info");
    } catch (err) {
      console.error("Error during disconnect:", err);
      ui.showToast(`Disconnect error: ${err.message}`, "error");
    }
    return; 
  }

  // Otherwise, connect
  const url = els.url.value.trim();
  
  if (!url) {
    ui.showToast("Please enter a server URL", "error");
    return;
  }
  
  try {
    // Save URL to storage and history
    storage.saveUrl(url);
    storage.addUrlToHistory(url);
    refreshHistoryUi();
    
    els.statusText.innerText = "Connecting...";
    els.btnConnect.disabled = true;
    
    // Gather authentication options
    const authOptions = {
        credsFile: els.creds.files.length > 0 ? els.creds.files[0] : null,
        user: els.authUser.value.trim(),
        pass: els.authPass.value.trim(),
        token: els.authToken.value.trim()
    };
    
    // Connect with callbacks for status and stats
    await nats.connectToNats(
      url, 
      authOptions, 
      // Status change callback
      (status, err) => {
        ui.setConnectionState(status);
        if (status === 'disconnected') {
            if (err) ui.showToast(`Connection Lost: ${err.message}`, "error");
        } else if (status === 'connected') {
            ui.showToast("Reconnected", "success");
        }
      },
      // Stats callback (RTT updates)
      (stats) => {
        els.rttLabel.innerText = `RTT: ${stats.rtt}ms`;
        els.rttLabel.style.opacity = 1;
      }
    );

    ui.setConnectionState('connected');
    ui.showToast("Connected to NATS", "success");

    // Load data for active tab
    if (els.tabKv.classList.contains('active')) {
      loadKvBucketsWrapper();
    } else if (els.tabStream.classList.contains('active')) {
      loadStreamsWrapper();
    }

  } catch (err) {
    console.error("Connection error:", err);
    ui.setConnectionState('disconnected');
    ui.showToast(err.message, "error");
  } finally {
    els.btnConnect.disabled = false;
  }
}

function handleShowServerInfo() {
  const info = nats.getServerInfo();
  els.serverInfoPre.innerText = info ? JSON.stringify(info, null, 2) : "Not connected.";
  els.infoModal.style.display = "flex";
}

function handleCloseModal() {
  els.infoModal.style.display = "none";
}

// Wire up connection events
els.btnConnect.addEventListener("click", handleConnect);
els.btnInfo.addEventListener("click", handleShowServerInfo);
els.btnCloseModal.addEventListener("click", handleCloseModal);

// ============================================================================
// CONFIG MODAL HANDLERS
// ============================================================================

/**
 * Open config modal for creating/editing streams or KV buckets
 * 
 * This modal is reused for all entity types (Streams, KV Buckets)
 * The action callback determines what happens when user clicks Save
 * 
 * @param {string} title - Modal title (e.g. "Create Stream", "Edit KV Bucket")
 * @param {object} templateJson - Default JSON config to show in textarea
 * @param {function} actionCallback - Async function to call on save
 */
function openConfigModal(title, templateJson, actionCallback) {
    els.configModalTitle.innerText = title;
    els.configInput.value = JSON.stringify(templateJson, null, 2);
    appState.activeConfigAction = actionCallback;
    els.configModal.style.display = "flex";
    els.configInput.classList.remove("input-error");
}

function closeConfigModal() {
    els.configModal.style.display = "none";
    appState.activeConfigAction = null;
}

async function handleConfigSave() {
    if(!utils.validateJsonInput(els.configInput)) {
        ui.showToast("Invalid JSON", "error");
        return;
    }
    
    if(appState.activeConfigAction) {
        try {
            const config = JSON.parse(els.configInput.value);
            await appState.activeConfigAction(config);
        } catch (error) {
            console.error("Config save error:", error);
            ui.showToast(error.message, "error");
        }
    }
}

// Wire up config modal events
els.btnCloseConfigModal.addEventListener("click", closeConfigModal);
els.btnConfigSave.addEventListener("click", handleConfigSave);
els.configInput.addEventListener("input", () => utils.validateJsonInput(els.configInput));

// Close modals on Escape key
document.addEventListener("keydown", (e) => { 
    if (e.key === "Escape") {
        els.infoModal.style.display = "none";
        closeConfigModal();
    }
});

// ============================================================================
// TAB NAVIGATION HANDLERS
// ============================================================================

function handleTabMsg() {
  ui.switchTab('msg');
}

function handleTabKv() {
  ui.switchTab('kv');
  if (nats.isConnected()) loadKvBucketsWrapper();
}

function handleTabStream() {
  ui.switchTab('stream');
  if (nats.isConnected()) loadStreamsWrapper();
}

// Wire up tab clicks
els.tabMsg.onclick = handleTabMsg;
els.tabKv.onclick = handleTabKv;
els.tabStream.onclick = handleTabStream;

// ============================================================================
// SUBSCRIPTION HANDLERS
// ============================================================================

function handleSubscribe() {
  const subj = els.subSubject.value.trim();
  if (!subj) return;
  
  try {
    storage.addSubjectToHistory(subj);
    refreshHistoryUi();
    
    // Subscribe with message callback
    const { id, subject, size } = nats.subscribe(subj, (subject, data, isRpc, headers) => {
      ui.renderMessage(subject, data, isRpc, headers);
    });
    
    ui.addSubscription(id, subject);
    ui.updateSubCount(size);
    els.subSubject.value = "";
    ui.showToast(`Subscribed to ${subject}`, "success");
  } catch (err) {
    console.error("Subscribe error:", err);
    ui.showToast(err.message, "error"); 
  }
}

function handleUnsubscribe(id) {
  try {
    const size = nats.unsubscribe(id);
    ui.removeSubscription(id);
    ui.updateSubCount(size);
  } catch (error) {
    console.error("Unsubscribe error:", error);
    ui.showToast(error.message, "error");
  }
}

// Wire up subscription events
els.btnSub.addEventListener("click", handleSubscribe);
els.subSubject.addEventListener("keyup", (e) => { 
  if (e.key === "Enter") handleSubscribe(); 
});

// ============================================================================
// PUBLISH/REQUEST HANDLERS
// ============================================================================

function handlePublish() {
  const subj = els.pubSubject.value.trim();
  if (!subj) {
    ui.showToast("Enter a subject", "error");
    return;
  }
  
  try {
    storage.addSubjectToHistory(subj);
    refreshHistoryUi();
    nats.publish(subj, els.pubPayload.value, els.pubHeaders.value);
    
    // Show checkmark feedback
    els.btnPub.innerText = "✓";
    setTimeout(() => els.btnPub.innerText = "Pub", 1000);
  } catch (err) {
    console.error("Publish error:", err);
    ui.showToast(err.message, "error"); 
  }
}

async function handleRequest() {
  const subj = els.pubSubject.value.trim();
  if (!subj) {
    ui.showToast("Enter a subject", "error");
    return;
  }
  
  const timeout = parseInt(els.reqTimeout.value) || DEFAULT_RPC_TIMEOUT_MS;
  
  try {
    storage.addSubjectToHistory(subj);
    refreshHistoryUi();
    els.btnReq.disabled = true;
    
    const msg = await nats.request(subj, els.pubPayload.value, els.pubHeaders.value, timeout);
    ui.renderMessage(msg.subject, msg.data, true, msg.headers);
  } catch (err) {
    console.error("Request error:", err);
    ui.showToast(err.message, "error"); 
  } finally { 
    els.btnReq.disabled = false; 
  }
}

function handleHeaderToggle() {
  const isHidden = els.headerContainer.style.display === "none";
  els.headerContainer.style.display = isHidden ? "block" : "none";
  els.btnHeaderToggle.innerText = isHidden ? "▼ Headers (Optional)" : "► Add Headers (Optional)";
}

// Wire up publish/request events
els.btnPub.addEventListener("click", handlePublish);
els.btnReq.addEventListener("click", handleRequest);
els.btnHeaderToggle.addEventListener("click", handleHeaderToggle);

// Ctrl/Cmd+Enter to publish
els.pubPayload.addEventListener("keydown", (e) => { 
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handlePublish(); 
});

// ============================================================================
// MESSAGE LOG HANDLERS
// ============================================================================

els.btnClear.addEventListener("click", () => ui.clearLogs());
els.logFilter.addEventListener("keyup", (e) => ui.filterLogs(e.target.value));
els.btnPause.addEventListener("click", ui.toggleLogPause);
els.btnDownloadLogs.addEventListener("click", ui.downloadLogs);

// ============================================================================
// INPUT VALIDATION HANDLERS
// ============================================================================
// Real-time JSON validation with visual feedback

els.pubPayload.addEventListener("input", () => utils.validateJsonInput(els.pubPayload));
els.pubHeaders.addEventListener("input", () => utils.validateJsonInput(els.pubHeaders));
els.kvValueInput.addEventListener("input", () => utils.validateJsonInput(els.kvValueInput));

// Auto-beautify on blur
els.pubPayload.addEventListener("blur", () => { 
  if(utils.validateJsonInput(els.pubPayload)) utils.beautify(els.pubPayload); 
});
els.pubHeaders.addEventListener("blur", () => { 
  if(utils.validateJsonInput(els.pubHeaders)) utils.beautify(els.pubHeaders); 
});
els.kvValueInput.addEventListener("blur", () => { 
  if(utils.validateJsonInput(els.kvValueInput)) utils.beautify(els.kvValueInput); 
});

// ============================================================================
// KV STORE HANDLERS
// ============================================================================

async function handleKvCreate() {
    const template = { 
      bucket: "new-bucket", 
      history: 5, 
      description: "My KV Bucket", 
      storage: "file", 
      replicas: 1 
    };
    
    openConfigModal("Create KV Bucket", template, async (config) => {
        try {
            await nats.createKvBucket(config);
            ui.showToast(`Bucket ${config.bucket} created`, "success");
            closeConfigModal();
            loadKvBucketsWrapper();
        } catch(e) {
          console.error("KV create error:", e);
          ui.showToast(e.message, "error"); 
        }
    });
}

async function handleKvEdit() {
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
              console.error("KV update error:", e);
              ui.showToast(e.message, "error"); 
            }
        });
    } catch(e) {
      console.error("KV status error:", e);
      ui.showToast("Error fetching KV status: " + e.message, "error"); 
    }
}

/**
 * Load list of KV buckets and restore previous bucket selection if it still exists
 * Called when switching to KV tab or clicking Refresh button
 */
async function loadKvBucketsWrapper() {
  try {
    const list = await nats.getKvBuckets();
    ui.renderKvBuckets(list);
    ui.setKvStatus(`Loaded ${list.length} buckets.`);
    
    // Restore previous bucket selection if it still exists
    // This maintains user's working context when switching between tabs
    if (appState.currentKvBucket && list.includes(appState.currentKvBucket)) {
      els.kvBucketSelect.value = appState.currentKvBucket;
      // Don't call handleKvBucketChange - watcher is already running
      // Keys are still being updated in background, just show status
      ui.setKvStatus(`Watching ${appState.currentKvBucket}...`);
    } else if (appState.currentKvBucket) {
      // Bucket was deleted while user was on another tab
      appState.currentKvBucket = null;
      cleanupKvUi();
      ui.setKvStatus(`Previous bucket no longer exists`, true);
    }
  } catch (e) {
    console.error("Load KV buckets error:", e);
    ui.setKvStatus("Error loading buckets", true); 
    ui.showToast(e.message, "error");
  }
}

/**
 * Handle KV bucket selection change
 * Opens the bucket, starts watching for key changes, and displays keys
 */
async function handleKvBucketChange() {
  const bucket = els.kvBucketSelect.value;
  
  // Store current bucket selection in app state
  // This preserves context when switching tabs
  appState.currentKvBucket = bucket;
  
  // Clear UI state
  els.kvKeyList.innerHTML = '';
  appState.kvKeys.clear();
  
  // Stop previous watcher to prevent memory leak
  if (appState.currentKvWatcher) {
    appState.currentKvWatcher.stop();
    appState.currentKvWatcher = null;
  }
  
  if (!bucket) {
    // User explicitly selected "-- Select a Bucket --"
    cleanupKvUi();
    return;
  }
  
  try {
    await nats.openKvBucket(bucket);
    ui.setKvStatus(`Watching ${bucket}...`);
    
    // Store watcher reference so we can stop it later
    appState.currentKvWatcher = await nats.watchKvBucket((key, op) => {
        if (op === "DEL" || op === "PURGE") {
             appState.kvKeys.delete(key);
             ui.removeKvKey(key);
        } else {
            if(!appState.kvKeys.has(key)) {
                appState.kvKeys.add(key);
                ui.addKvKey(key, (k, div) => selectKeyWrapper(k, div));
                if(els.kvFilter.value) ui.filterList(els.kvFilter, els.kvKeyList, ".kv-key");
            }
        }
    });
  } catch (e) {
    console.error("KV bucket open error:", e);
    ui.setKvStatus(e.message, true); 
    ui.showToast(e.message, "error");
  }
}

/**
 * Clean up KV UI without stopping the watcher
 * Used when user explicitly deselects bucket or bucket no longer exists
 */
function cleanupKvUi() {
  els.kvKeyList.innerHTML = '<div class="kv-empty">Select a bucket to view keys</div>';
  els.kvKeyInput.value = '';
  els.kvValueInput.value = '';
  els.kvValueHighlighter.innerText = '';
  els.kvHistoryList.innerHTML = 'Select a key to view history';
  appState.kvKeys.clear();
}

/**
 * Toggle between view mode and edit mode for KV values
 * View mode shows syntax-highlighted JSON in a <pre> element
 * Edit mode shows raw text in a <textarea> for editing
 */
function setKvEditMode(isEdit) {
    appState.kvEditMode = isEdit;
    
    if (appState.kvEditMode) {
        // Edit mode: Show textarea
        els.kvValueInput.style.display = "block";
        els.kvValueHighlighter.style.display = "none";
        els.btnKvToggleMode.innerText = "👁 View";
        els.kvValueInput.focus();
    } else {
        // View mode: Show syntax highlighted pre
        els.kvValueInput.style.display = "none";
        els.kvValueHighlighter.style.display = "block";
        els.btnKvToggleMode.innerText = "✎ Edit";
        
        // Update highlighter with current value
        try {
            const json = JSON.parse(els.kvValueInput.value);
            els.kvValueHighlighter.innerHTML = utils.syntaxHighlight(json);
        } catch(e) {
            els.kvValueHighlighter.innerText = els.kvValueInput.value;
        }
    }
}

/**
 * Load a KV key's current value and history
 * Shows the current value (HEAD) and lists all historical revisions
 */
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
        // Handle history entry click - load that revision
        const isDelete = entry.operation === "DEL" || entry.operation === "PURGE";
        
        if (isDelete) {
            els.kvValueInput.value = "";
            els.kvValueHighlighter.innerText = "// [DELETED REVISION]";
        } else {
            els.kvValueInput.value = entry.value;
            utils.beautify(els.kvValueInput);
            
            // If in view mode, update highlighter immediately
            if (!appState.kvEditMode) {
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
      console.error("KV select key error:", e);
      els.kvValueInput.value = ""; 
      els.kvValueHighlighter.innerText = "";
      ui.setKvStatus(e.message, true);
      ui.showToast(e.message, "error");
  }
}

async function handleKvGet() {
  const key = els.kvKeyInput.value.trim();
  if (!key) {
    ui.showToast("Enter a key name", "error");
    return;
  }
  await selectKeyWrapper(key);
}

async function handleKvCopy() {
  const val = els.kvValueInput.value;
  if(!val) return;
  
  const success = await utils.copyToClipboard(val);
  if (success) {
    const orig = els.btnKvCopy.innerText;
    els.btnKvCopy.innerText = "Copied!";
    setTimeout(() => els.btnKvCopy.innerText = orig, 1000);
  }
}

async function handleKvPut() {
  const key = els.kvKeyInput.value.trim();
  const val = els.kvValueInput.value;
  if (!key) {
    ui.showToast("Enter a key name", "error");
    return;
  }
  
  try {
    await nats.putKvValue(key, val);
    ui.setKvStatus(`Saved '${key}'`);
    ui.showToast("Key Saved", "success");
    selectKeyWrapper(key);
  } catch (e) {
    console.error("KV put error:", e);
    ui.setKvStatus(e.message, true); 
    ui.showToast(e.message, "error"); 
  }
}

async function handleKvDelete() {
  const key = els.kvKeyInput.value.trim();
  if (!key || !confirm(`Delete '${key}'?`)) return;
  
  try {
    await nats.deleteKvValue(key);
    ui.setKvStatus(`Deleted '${key}'`);
    els.kvValueInput.value = "";
    els.kvValueHighlighter.innerText = "";
    els.kvHistoryList.innerHTML = "Key deleted.";
    ui.showToast("Key Deleted", "info");
  } catch (e) {
    console.error("KV delete error:", e);
    ui.setKvStatus(e.message, true); 
    ui.showToast(e.message, "error"); 
  }
}

// Wire up KV events
els.btnKvCreate.addEventListener("click", handleKvCreate);
els.btnKvEdit.addEventListener("click", handleKvEdit);
els.btnKvRefresh.addEventListener("click", loadKvBucketsWrapper);
els.kvBucketSelect.addEventListener("change", handleKvBucketChange);
els.btnKvToggleMode.addEventListener("click", () => setKvEditMode(!appState.kvEditMode));
els.btnKvGet.addEventListener("click", handleKvGet);
els.btnKvCopy.addEventListener("click", handleKvCopy);
els.btnKvPut.addEventListener("click", handleKvPut);
els.btnKvDelete.addEventListener("click", handleKvDelete);
els.kvFilter.addEventListener("keyup", () => ui.filterList(els.kvFilter, els.kvKeyList, ".kv-key"));

// ============================================================================
// STREAM HANDLERS
// ============================================================================

async function handleStreamCreate() {
    const template = { 
      name: "NEW_STREAM", 
      description: "Stream Description", 
      subjects: ["events.>"], 
      retention: "limits", 
      max_msgs: -1, 
      max_bytes: -1, 
      max_age: 0, 
      discard: "old", 
      storage: "file", 
      num_replicas: 1, 
      duplicate_window: 120000000000 
    };
    
    openConfigModal("Create Stream", template, async (config) => {
        try {
            await nats.createStream(config);
            ui.showToast(`Stream ${config.name} created`, "success");
            closeConfigModal();
            loadStreamsWrapper();
        } catch(e) {
          console.error("Stream create error:", e);
          ui.showToast(e.message, "error"); 
        }
    });
}

async function handleStreamEdit() {
    if(!appState.currentStream) { 
      ui.showToast("Select a stream first", "info"); 
      return; 
    }
    
    try {
        const info = await nats.getStreamInfo(appState.currentStream);
        openConfigModal(`Edit Stream: ${appState.currentStream}`, info.config, async (config) => {
            try {
                await nats.updateStream(config);
                ui.showToast(`Stream ${appState.currentStream} updated`, "success");
                closeConfigModal();
                selectStreamWrapper(appState.currentStream);
            } catch(e) {
              console.error("Stream update error:", e);
              ui.showToast(e.message, "error"); 
            }
        });
    } catch(e) {
      console.error("Stream info error:", e);
      ui.showToast("Error fetching stream info: " + e.message, "error"); 
    }
}

async function loadStreamsWrapper() {
  els.streamList.innerHTML = '<div class="kv-empty">Loading...</div>';
  try {
    const list = await nats.getStreams();
    list.sort((a,b) => a.config.name.localeCompare(b.config.name));
    ui.renderStreamList(list, (name, div) => selectStreamWrapper(name, div));
    if(els.streamFilter.value) ui.filterList(els.streamFilter, els.streamList, ".kv-key");
  } catch (e) {
    console.error("Load streams error:", e);
    els.streamList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`;
    ui.showToast(e.message, "error");
  }
}

async function selectStreamWrapper(name, uiEl) {
  ui.highlightStream(uiEl);
  appState.currentStream = name;
  els.streamEmptyState.style.display = "none";
  els.streamDetailView.style.display = "none"; 
  els.streamMsgContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view stream messages</div>`;
  els.consumerList.innerHTML = `<div style="padding:10px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view consumers</div>`;
  
  try {
    const info = await nats.getStreamInfo(name);
    const conf = info.config;
    const state = info.state;
    
    // Populate detail view
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
    
    // Set default message range (last 50 messages)
    const last = state.last_seq;
    const first = state.first_seq;
    let start = last - 49;
    if (start < first) start = first;
    els.msgEndSeq.value = last;
    els.msgStartSeq.value = start > 0 ? start : 0;
    
    els.streamDetailView.style.display = "block";
  } catch (e) {
    console.error("Stream select error:", e);
    ui.showToast(`Error loading stream info: ${e.message}`, "error"); 
  }
}

async function handleStreamViewMessages() {
    if(!appState.currentStream) return;
    
    const start = parseInt(els.msgStartSeq.value) || 0;
    const end = parseInt(els.msgEndSeq.value) || 0;
    
    if(end < start) { 
      ui.showToast("End Seq cannot be less than Start Seq", "error"); 
      return; 
    }
    if((end - start) > MAX_STREAM_MSG_FETCH) { 
      ui.showToast(`Range cannot exceed ${MAX_STREAM_MSG_FETCH} messages`, "error"); 
      return; 
    }
    
    els.btnStreamViewMsgs.disabled = true;
    els.streamMsgContainer.innerHTML = '<div class="kv-empty">Loading...</div>';
    
    try {
        const msgs = await nats.getStreamMessageRange(appState.currentStream, start, end);
        ui.renderStreamMessages(msgs);
        if(els.streamMsgFilter.value) {
             ui.filterList(els.streamMsgFilter, els.streamMsgContainer, ".stream-msg-entry");
        }
    } catch(e) {
      console.error("Stream messages error:", e);
      els.streamMsgContainer.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`; 
      ui.showToast(e.message, "error");
    } finally { 
      els.btnStreamViewMsgs.disabled = false; 
    }
}

function handleStreamClearMessages() {
    els.streamMsgContainer.innerHTML = `<div style="padding:20px; text-align:center; color:#666; font-size:0.8rem; font-style:italic;">Click Load to view stream messages</div>`;
    els.streamMsgFilter.value = "";
}

async function handleLoadConsumers() {
    if(!appState.currentStream) return;
    
    els.btnLoadConsumers.disabled = true;
    els.consumerList.innerHTML = '<div class="kv-empty">Loading...</div>';
    
    try {
        const consumers = await nats.getConsumers(appState.currentStream);
        ui.renderStreamConsumers(consumers);
    } catch (e) {
      console.error("Load consumers error:", e);
      els.consumerList.innerHTML = `<div class="kv-empty" style="color:var(--danger)">Error: ${e.message}</div>`;
      ui.showToast(e.message, "error");
    } finally { 
      els.btnLoadConsumers.disabled = false; 
    }
}

async function handleStreamPurge() {
    if(!appState.currentStream || !confirm(`Purge ALL messages from '${appState.currentStream}'? This cannot be undone.`)) return;
    
    try {
        await nats.purgeStream(appState.currentStream);
        ui.showToast(`Stream '${appState.currentStream}' purged`, "success");
        selectStreamWrapper(appState.currentStream); 
    } catch(e) {
      console.error("Stream purge error:", e);
      ui.showToast(e.message, "error"); 
    }
}

async function handleStreamDelete() {
    if(!appState.currentStream || !confirm(`DELETE stream '${appState.currentStream}'?`)) return;
    
    try {
        await nats.deleteStream(appState.currentStream);
        ui.showToast(`Stream '${appState.currentStream}' deleted`, "success");
        appState.currentStream = null;
        els.streamDetailView.style.display = "none";
        els.streamEmptyState.style.display = "block";
        loadStreamsWrapper();
    } catch(e) {
      console.error("Stream delete error:", e);
      ui.showToast(e.message, "error"); 
    }
}

// Wire up stream events
els.btnStreamCreate.addEventListener("click", handleStreamCreate);
els.btnStreamEdit.addEventListener("click", handleStreamEdit);
els.btnStreamRefresh.addEventListener("click", loadStreamsWrapper);
els.btnStreamViewMsgs.addEventListener("click", handleStreamViewMessages);
els.btnStreamClearMsgs.addEventListener("click", handleStreamClearMessages);
els.btnLoadConsumers.addEventListener("click", handleLoadConsumers);
els.btnStreamPurge.addEventListener("click", handleStreamPurge);
els.btnStreamDelete.addEventListener("click", handleStreamDelete);
els.streamFilter.addEventListener("keyup", () => ui.filterList(els.streamFilter, els.streamList, ".kv-key"));
els.streamMsgFilter.addEventListener("keyup", () => ui.filterList(els.streamMsgFilter, els.streamMsgContainer, ".stream-msg-entry"));

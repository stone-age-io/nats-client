// ============================================================================
// NATS CLIENT WRAPPER - MIGRATED TO @nats-io/nats-core
// ============================================================================
// Pure NATS API wrapper with no UI dependencies
// All UI updates happen via callbacks passed in by caller

import { wsconnect, credsAuthenticator, headers } from "@nats-io/nats-core";
import { jetstreamManager } from "@nats-io/jetstream";
import { Kvm } from "@nats-io/kv";

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

// How often to poll RTT/latency from server (ms)
// 2 seconds is frequent enough to notice issues without hammering server
const STATS_POLL_INTERVAL_MS = 2000;

// ============================================================================
// MODULE STATE
// ============================================================================

let nc = null;
let kv = null;
let jsm = null;
let activeKvWatcher = null; 

// Text encoder/decoder for message payloads (replaces StringCodec)
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const subscriptions = new Map();
let subCounter = 0;
let statsInterval = null;

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Connect to NATS server with proper error handling and cleanup
 * @param {string} url - WebSocket URL (ws:// or wss://)
 * @param {object} authOptions - Authentication credentials
 * @param {function} onStatusChange - Callback for connection status changes
 * @param {function} onStats - Callback for RTT/stats updates
 */
export async function connectToNats(url, authOptions, onStatusChange, onStats) {
  // Always cleanup first to prevent resource leaks
  await disconnect(); 
  
  const opts = { servers: url, ignoreClusterUpdates: true };
  
  try {
    // Handle authentication
    if (authOptions.credsFile) {
      let rawText = await authOptions.credsFile.text();
      const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----");
      if (jwtIndex > 0) rawText = rawText.substring(jwtIndex);
      else if (jwtIndex === -1) throw new Error("Invalid .creds file: JWT section not found");
      rawText = rawText.replace(/\r\n/g, "\n");
      opts.authenticator = credsAuthenticator(encoder.encode(rawText));
    } else if (authOptions.token) {
      opts.token = authOptions.token;
    } else if (authOptions.user) {
      opts.user = authOptions.user;
      opts.pass = authOptions.pass;
    }
    
    // Attempt connection using wsconnect (replaces connect from nats.ws)
    nc = await wsconnect(opts);
    
    // Only setup monitoring if connection succeeded
    setupConnectionMonitoring(onStatusChange);
    startStatsLoop(onStats);
    
    return nc;
    
  } catch (error) {
    // Cleanup on failure
    await disconnect();
    
    // Provide user-friendly error messages
    if (error.message.includes("ECONNREFUSED") || error.message.includes("Failed to fetch")) {
      throw new Error("Cannot reach NATS server. Check URL and ensure WebSocket is enabled.");
    } else if (error.message.includes("Authorization Violation")) {
      throw new Error("Authentication failed. Check credentials.");
    } else if (error.message.includes("Invalid .creds")) {
      throw error; // Our own error message, pass through
    } else {
      throw new Error(`Connection failed: ${error.message}`);
    }
  }
}

/**
 * Setup connection status monitoring
 * Monitors for disconnects, reconnects, and errors
 */
function setupConnectionMonitoring(onStatusChange) {
  if (!nc) return;
  
  // Monitor connection status changes
  (async () => {
    try {
      for await (const s of nc.status()) {
        switch(s.type) {
            case "disconnect": 
              if (onStatusChange) onStatusChange('reconnecting'); 
              break;
            case "reconnect": 
              if (onStatusChange) onStatusChange('connected'); 
              break;
            case "error":
              console.error("NATS connection error:", s.data);
              break;
        }
      }
    } catch (e) {
      console.error("Status monitor failed:", e);
    }
  })();
  
  // Monitor connection close
  nc.closed().then((err) => { 
    if (onStatusChange) onStatusChange('disconnected', err); 
  }).catch((err) => {
    console.error("Connection closed with error:", err);
    if (onStatusChange) onStatusChange('disconnected', err);
  });
}

export async function disconnect() {
  try {
    // Stop stats polling
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
    
    // Stop KV watcher
    if (activeKvWatcher) { 
      activeKvWatcher.stop(); 
      activeKvWatcher = null; 
    }
    
    // Close connection
    if (nc) { 
      await nc.close(); 
      nc = null; 
    }
    
    // Clear state
    kv = null; 
    jsm = null; 
    subscriptions.clear(); 
    subCounter = 0;
  } catch (error) {
    console.error("Error during disconnect:", error);
    // Force cleanup even if errors occur
    nc = null;
    kv = null;
    jsm = null;
    statsInterval = null;
    activeKvWatcher = null;
    subscriptions.clear();
    subCounter = 0;
  }
}

export function isConnected() { 
  return nc && !nc.isClosed(); 
}

export function getServerInfo() { 
  return nc ? nc.info : null; 
}

/**
 * Start polling server stats (RTT/latency)
 * Calls onStats callback with { rtt: number } object
 */
function startStatsLoop(onStats) {
  if (statsInterval) clearInterval(statsInterval);
  
  statsInterval = setInterval(async () => {
    if (!nc || nc.isClosed()) {
      clearInterval(statsInterval);
      statsInterval = null;
      return;
    }
    
    try {
      const rtt = await nc.rtt();
      if (onStats) onStats({ rtt });
    } catch (e) {
      console.error("Stats poll failed:", e);
    }
  }, STATS_POLL_INTERVAL_MS);
}

// ============================================================================
// PUBLISH/SUBSCRIBE
// ============================================================================

/**
 * Subscribe to a subject
 * @param {string} subject - NATS subject pattern
 * @param {function} onMessage - Callback for incoming messages (subject, data, isRpc, headers)
 * @returns {object} - { id, subject, size }
 */
export function subscribe(subject, onMessage) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const sub = nc.subscribe(subject);
    const id = ++subCounter;
    subscriptions.set(id, { sub, subject });
    
    (async () => {
      try {
        for await (const m of sub) {
          try { 
            const data = decoder.decode(m.data);
            if (onMessage) onMessage(m.subject, data, false, m.headers);
          } catch (e) { 
            // Binary data
            if (onMessage) onMessage(m.subject, `[Binary Data: ${m.data.length} bytes]`, false, m.headers);
          }
        }
      } catch (e) {
        console.error(`Subscription error for ${subject}:`, e);
      }
    })();
    
    return { id, subject, size: subscriptions.size };
  } catch (error) {
    throw new Error(`Failed to subscribe to ${subject}: ${error.message}`);
  }
}

export function unsubscribe(id) {
  const item = subscriptions.get(id);
  if (item) { 
    try {
      item.sub.unsubscribe(); 
    } catch (e) {
      console.error("Error unsubscribing:", e);
    }
    subscriptions.delete(id); 
  }
  return subscriptions.size;
}

export function publish(subject, payload, headersJson) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const h = parseHeaders(headersJson);
    // Encode string payload to bytes
    nc.publish(subject, encoder.encode(payload), { headers: h });
  } catch (error) {
    throw new Error(`Failed to publish: ${error.message}`);
  }
}

export async function request(subject, payload, headersJson, timeout) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const h = parseHeaders(headersJson);
    const msg = await nc.request(subject, encoder.encode(payload), { timeout, headers: h });
    let data;
    try { 
      data = decoder.decode(msg.data); 
    } catch (e) { 
      data = `[Binary Response: ${msg.data.length} bytes]`; 
    }
    return { subject: msg.subject, data, headers: msg.headers };
  } catch (error) {
    if (error.message.includes("timeout")) {
      throw new Error(`Request timeout after ${timeout}ms. No responder available?`);
    }
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * Parse JSON headers string into NATS headers object
 * @param {string} jsonStr - JSON string like '{"Content-Type": "application/json"}'
 * @returns {Headers|undefined}
 */
function parseHeaders(jsonStr) {
  const val = jsonStr.trim();
  if (!val) return undefined;
  try {
    const h = headers();
    const obj = JSON.parse(val);
    for (const k in obj) {
        if(Array.isArray(obj[k])) obj[k].forEach(v => h.append(k, String(v)));
        else h.append(k, String(obj[k]));
    }
    return h;
  } catch (e) { 
    throw new Error("Invalid Headers JSON"); 
  }
}

// ============================================================================
// KV STORE
// ============================================================================

export async function getKvBuckets() {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const kvm = new Kvm(nc);
    const list = [];
    for await (const status of await kvm.list()) list.push(status.bucket);
    return list;
  } catch (error) {
    throw new Error(`Failed to list KV buckets: ${error.message}`);
  }
}

export async function createKvBucket(config) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const kvm = new Kvm(nc); 
    await kvm.create(config.bucket, config);
  } catch (error) {
    if (error.message.includes("already exists")) {
      throw new Error(`Bucket '${config.bucket}' already exists`);
    }
    throw new Error(`Failed to create bucket: ${error.message}`);
  }
}

export async function openKvBucket(bucketName) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const kvm = new Kvm(nc); 
    kv = await kvm.open(bucketName);
    return kv;
  } catch (error) {
    throw new Error(`Failed to open bucket '${bucketName}': ${error.message}`);
  }
}

export async function getKvStatus() { 
  if(!kv) throw new Error("No bucket open"); 
  return await kv.status(); 
}

/**
 * Update KV bucket configuration
 * KV buckets are backed by JetStream streams, so we update the underlying stream
 */
export async function updateKvBucket(config) {
  if (!nc || nc.isClosed()) throw new Error("Not Connected");
  
  try {
    const mgr = await getJsm();
    const streamName = `KV_${config.bucket}`;
    
    // Fetch current config to be safe
    const si = await mgr.streams.info(streamName);
    const sc = si.config;
    
    // Map KV abstract config -> Stream Config
    sc.description = config.description;
    sc.max_msgs_per_subject = config.history; // KV History
    sc.max_bytes = config.maxBucketSize;
    sc.max_msg_size = config.maxValueSize;
    sc.max_age = config.ttl;
    // Note: storage and replicas usually cannot be changed easily on single server 
    // without data loss or clustering, but we pass them in case the server supports it.
    sc.num_replicas = config.replicas;
    
    await mgr.streams.update(streamName, sc);
  } catch (error) {
    throw new Error(`Failed to update bucket: ${error.message}`);
  }
}

/**
 * Watch KV bucket for changes
 * @param {function} onKeyChange - Callback for key changes (key, operation)
 * @returns {AsyncIterable} - The watcher (call .stop() to cleanup)
 */
export async function watchKvBucket(onKeyChange) {
  if (!kv) throw new Error("No bucket open");
  if (activeKvWatcher) activeKvWatcher.stop();
  
  try {
    const iter = await kv.watch();
    activeKvWatcher = iter;
    
    (async () => {
      try { 
        for await (const e of iter) {
          if (onKeyChange) onKeyChange(e.key, e.operation);
        }
      } catch (err) {
        console.error("KV watch error:", err);
      }
    })();
    
    return iter;
  } catch (error) {
    throw new Error(`Failed to watch bucket: ${error.message}`);
  }
}

export async function getKvValue(key) {
  if (!kv) throw new Error("No Bucket Open");
  
  try {
    const entry = await kv.get(key);
    if (!entry) return null;
    return { value: decoder.decode(entry.value), revision: entry.revision };
  } catch (error) {
    throw new Error(`Failed to get key '${key}': ${error.message}`);
  }
}

export async function getKvHistory(key) {
  if (!kv) throw new Error("No Bucket Open");
  
  try {
    const hist = [];
    const iter = await kv.history({ key });
    for await (const e of iter) {
        hist.push({
            revision: e.revision, 
            operation: e.operation,
            value: e.value ? decoder.decode(e.value) : null, 
            created: e.created
        });
    }
    return hist.reverse();
  } catch (error) {
    throw new Error(`Failed to get history for '${key}': ${error.message}`);
  }
}

export async function putKvValue(key, value) { 
  if (!kv) throw new Error("No Bucket Open");
  
  try {
    await kv.put(key, encoder.encode(value));
  } catch (error) {
    throw new Error(`Failed to put key '${key}': ${error.message}`);
  }
}

export async function deleteKvValue(key) { 
  if (!kv) throw new Error("No Bucket Open");
  
  try {
    await kv.delete(key);
  } catch (error) {
    throw new Error(`Failed to delete key '${key}': ${error.message}`);
  }
}

// ============================================================================
// JETSTREAM STREAMS
// ============================================================================

async function getJsm() { 
  if (!nc || nc.isClosed()) throw new Error("Not Connected"); 
  // Use jetstreamManager function instead of nc.jetstreamManager()
  if (!jsm) jsm = await jetstreamManager(nc); 
  return jsm; 
}

export async function getStreams() {
  try {
    const mgr = await getJsm();
    const list = [];
    const iter = await mgr.streams.list();
    for await (const s of iter) list.push(s);
    return list;
  } catch (error) {
    throw new Error(`Failed to list streams: ${error.message}`);
  }
}

export async function createStream(config) {
  try {
    const mgr = await getJsm(); 
    await mgr.streams.add(config);
  } catch (error) {
    if (error.message.includes("already exists")) {
      throw new Error(`Stream '${config.name}' already exists`);
    }
    throw new Error(`Failed to create stream: ${error.message}`);
  }
}

export async function updateStream(config) {
  try {
    const mgr = await getJsm(); 
    await mgr.streams.update(config.name, config);
  } catch (error) {
    throw new Error(`Failed to update stream: ${error.message}`);
  }
}

export async function getStreamInfo(name) {
  try {
    const mgr = await getJsm(); 
    return await mgr.streams.info(name);
  } catch (error) {
    throw new Error(`Failed to get stream info: ${error.message}`);
  }
}

export async function purgeStream(name) {
  try {
    const mgr = await getJsm(); 
    await mgr.streams.purge(name);
  } catch (error) {
    throw new Error(`Failed to purge stream: ${error.message}`);
  }
}

export async function deleteStream(name) {
  try {
    const mgr = await getJsm(); 
    await mgr.streams.delete(name);
  } catch (error) {
    throw new Error(`Failed to delete stream: ${error.message}`);
  }
}

export async function getConsumers(streamName) {
  try {
    const mgr = await getJsm();
    const list = [];
    const iter = await mgr.consumers.list(streamName);
    for await (const c of iter) list.push(c);
    return list;
  } catch (error) {
    throw new Error(`Failed to list consumers: ${error.message}`);
  }
}

/**
 * Fetch messages from stream by sequence number range
 * @param {string} name - Stream name
 * @param {number} startSeq - Start sequence (inclusive)
 * @param {number} endSeq - End sequence (inclusive)
 * @returns {Array} - Array of message objects
 */
export async function getStreamMessageRange(name, startSeq, endSeq) {
  try {
    const mgr = await getJsm();
    if(startSeq < 1) startSeq = 1;
    if(endSeq < startSeq) return [];
    
    const promises = [];
    for (let i = startSeq; i <= endSeq; i++) {
        promises.push(
            mgr.streams.getMessage(name, { seq: i })
            .then(sm => ({ 
              seq: sm.seq, 
              subject: sm.subject, 
              data: decoder.decode(sm.data), 
              time: sm.time 
            }))
            .catch(() => null) // Message might not exist (gaps in sequence)
        );
    }
    
    const results = await Promise.all(promises);
    return results.filter(m => m !== null).reverse();
  } catch (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }
}

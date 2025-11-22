import { connect, StringCodec, credsAuthenticator, headers } from "nats.ws";
import { Kvm } from "@nats-io/kv";
import { els } from "./dom.js"; // Used only for Stats loop, technically UI logic, but acceptable for now in Grug view
import { renderMessage } from "./ui.js";

let nc = null;
let kv = null;
let jsm = null;
let activeKvWatcher = null; 

const sc = StringCodec();
const subscriptions = new Map();
let subCounter = 0;
let statsInterval = null;

export async function connectToNats(url, authOptions, onStatusChangeCb) {
  await disconnect(); 
  const opts = { servers: url, ignoreClusterUpdates: true };
  if (authOptions.credsFile) {
    let rawText = await authOptions.credsFile.text();
    const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----");
    if (jwtIndex > 0) rawText = rawText.substring(jwtIndex);
    else if (jwtIndex === -1) throw new Error("Invalid .creds file");
    rawText = rawText.replace(/\r\n/g, "\n");
    opts.authenticator = credsAuthenticator(new TextEncoder().encode(rawText));
  } else if (authOptions.token) {
    opts.token = authOptions.token;
  } else if (authOptions.user) {
    opts.user = authOptions.user;
    opts.pass = authOptions.pass;
  }
  nc = await connect(opts);
  (async () => {
    try {
      for await (const s of nc.status()) {
        switch(s.type) {
            case "disconnect": onStatusChangeCb('reconnecting'); break;
            case "reconnect": onStatusChangeCb('connected'); break;
        }
      }
    } catch (e) {}
  })();
  nc.closed().then((err) => { onStatusChangeCb('disconnected', err); });
  startStatsLoop();
  return nc;
}

export async function disconnect() {
  if (statsInterval) clearInterval(statsInterval);
  if (activeKvWatcher) { activeKvWatcher.stop(); activeKvWatcher = null; }
  if (nc) { await nc.close(); nc = null; }
  kv = null; jsm = null; subscriptions.clear(); subCounter = 0;
}

export function isConnected() { return !!nc; }
export function getServerInfo() { return nc ? nc.info : null; }

function startStatsLoop() {
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(async () => {
    if (!nc || nc.isClosed()) return;
    try {
      const rtt = await nc.rtt();
      els.rttLabel.innerText = `RTT: ${rtt}ms`;
      els.rttLabel.style.opacity = 1;
    } catch (e) {}
  }, 2000);
}

export function subscribe(subject) {
  if (!nc) throw new Error("Not Connected");
  const sub = nc.subscribe(subject);
  const id = ++subCounter;
  subscriptions.set(id, { sub, subject });
  (async () => {
    for await (const m of sub) {
      try { renderMessage(m.subject, sc.decode(m.data), false, m.headers); } 
      catch (e) { renderMessage(m.subject, `[Binary Data: ${m.data.length} bytes]`, false, m.headers); }
    }
  })();
  return { id, subject, size: subscriptions.size };
}

export function unsubscribe(id) {
  const item = subscriptions.get(id);
  if (item) { item.sub.unsubscribe(); subscriptions.delete(id); return subscriptions.size; }
  return subscriptions.size;
}

export function publish(subject, payload, headersJson) {
  if (!nc) return;
  const h = parseHeaders(headersJson);
  nc.publish(subject, sc.encode(payload), { headers: h });
}

export async function request(subject, payload, headersJson, timeout) {
  if (!nc) return;
  const h = parseHeaders(headersJson);
  const msg = await nc.request(subject, sc.encode(payload), { timeout, headers: h });
  let data;
  try { data = sc.decode(msg.data); } catch (e) { data = `[Binary Response: ${msg.data.length} bytes]`; }
  return { subject: msg.subject, data, headers: msg.headers };
}

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
  } catch (e) { throw new Error("Invalid Headers JSON"); }
}

// --- KV ---
export async function getKvBuckets() {
  if (!nc) return [];
  const kvm = new Kvm(nc);
  const list = [];
  for await (const status of await kvm.list()) list.push(status.bucket);
  return list;
}
export async function createKvBucket(config) { const kvm = new Kvm(nc); await kvm.create(config.bucket, config); }
export async function openKvBucket(bucketName) { const kvm = new Kvm(nc); kv = await kvm.open(bucketName); return kv; }
export async function getKvStatus() { if(!kv) throw new Error("No bucket open"); return await kv.status(); }

// FIX: Use JetStream Manager to update the underlying stream for the KV bucket
export async function updateKvBucket(config) { 
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
    // Note: storage and replicas usually cannot be changed easily on single server without data loss or clustering, 
    // but we pass them in case the server supports it.
    sc.num_replicas = config.replicas;
    
    await mgr.streams.update(streamName, sc);
}

export async function watchKvBucket(onKeyChange) {
  if (!kv) return;
  if (activeKvWatcher) activeKvWatcher.stop();
  const iter = await kv.watch();
  activeKvWatcher = iter;
  (async () => {
    try { for await (const e of iter) onKeyChange(e.key, e.operation); } catch (err) {}
  })();
}
export async function getKvValue(key) {
  if (!kv) throw new Error("No Bucket Open");
  const entry = await kv.get(key);
  if (!entry) return null;
  return { value: sc.decode(entry.value), revision: entry.revision };
}
export async function getKvHistory(key) {
    if (!kv) return [];
    const hist = [];
    const iter = await kv.history({ key });
    for await (const e of iter) {
        hist.push({
            revision: e.revision, operation: e.operation,
            value: e.value ? sc.decode(e.value) : null, created: e.created
        });
    }
    return hist.reverse();
}
export async function putKvValue(key, value) { if (!kv) throw new Error("No Bucket Open"); await kv.put(key, sc.encode(value)); }
export async function deleteKvValue(key) { if (!kv) throw new Error("No Bucket Open"); await kv.delete(key); }

// --- STREAMS ---
async function getJsm() { if (!nc) throw new Error("Not Connected"); if (!jsm) jsm = await nc.jetstreamManager(); return jsm; }
export async function getStreams() {
  const mgr = await getJsm();
  const list = [];
  const iter = await mgr.streams.list();
  for await (const s of iter) list.push(s);
  return list;
}
export async function createStream(config) { const mgr = await getJsm(); await mgr.streams.add(config); }
export async function updateStream(config) { const mgr = await getJsm(); await mgr.streams.update(config.name, config); }
export async function getStreamInfo(name) { const mgr = await getJsm(); return await mgr.streams.info(name); }
export async function purgeStream(name) { const mgr = await getJsm(); await mgr.streams.purge(name); }
export async function deleteStream(name) { const mgr = await getJsm(); await mgr.streams.delete(name); }
export async function getConsumers(streamName) {
  const mgr = await getJsm();
  const list = [];
  const iter = await mgr.consumers.list(streamName);
  for await (const c of iter) list.push(c);
  return list;
}
export async function getStreamMessageRange(name, startSeq, endSeq) {
    const mgr = await getJsm();
    if(startSeq < 1) startSeq = 1;
    if(endSeq < startSeq) return [];
    const promises = [];
    for (let i = startSeq; i <= endSeq; i++) {
        promises.push(
            mgr.streams.getMessage(name, { seq: i })
            .then(sm => ({ seq: sm.seq, subject: sm.subject, data: sc.decode(sm.data), time: sm.time }))
            .catch(() => null)
        );
    }
    const results = await Promise.all(promises);
    return results.filter(m => m !== null).reverse(); 
}

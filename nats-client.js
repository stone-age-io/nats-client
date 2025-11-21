import { connect, StringCodec, credsAuthenticator, headers } from "nats.ws";
import { Kvm } from "@nats-io/kv";
import { els } from "./dom.js";
import { renderMessage } from "./ui.js";

let nc = null;
let kv = null;
const sc = StringCodec();
const subscriptions = new Map();
let subCounter = 0;
let statsInterval = null;

// --- CONNECTION ---
export async function connectToNats(url, credsFile) {
  // Clean up any previous state just in case
  await disconnect(); 

  const opts = { servers: url, ignoreClusterUpdates: true };

  if (credsFile) {
    let rawText = await credsFile.text();
    const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----");
    if (jwtIndex > 0) rawText = rawText.substring(jwtIndex);
    else if (jwtIndex === -1) throw new Error("Invalid .creds file");
    rawText = rawText.replace(/\r\n/g, "\n");
    opts.authenticator = credsAuthenticator(new TextEncoder().encode(rawText));
  }

  nc = await connect(opts);
  startStatsLoop();
  return nc;
}

export async function disconnect() {
  if (statsInterval) clearInterval(statsInterval);
  
  if (nc) {
    await nc.close();
    nc = null;
  }
  
  // Reset Internal State
  kv = null;
  subscriptions.clear();
  subCounter = 0;
}

export function isConnected() { return !!nc; }

export function getServerInfo() {
  return nc ? nc.info : null;
}

// --- STATS LOOP ---
function startStatsLoop() {
  if (statsInterval) clearInterval(statsInterval);
  statsInterval = setInterval(async () => {
    if (!nc || nc.isClosed()) return;
    try {
      const rtt = await nc.rtt();
      els.rttLabel.innerText = `RTT: ${rtt}ms`;
      els.rttLabel.style.opacity = 1;
    } catch (e) {
      // ignore
    }
  }, 2000);
}

// --- MESSAGING ---
export function subscribe(subject) {
  if (!nc) throw new Error("Not Connected");
  
  const sub = nc.subscribe(subject);
  const id = ++subCounter;
  subscriptions.set(id, { sub, subject });

  (async () => {
    for await (const m of sub) {
      renderMessage(m.subject, sc.decode(m.data), false, m.headers);
    }
  })();

  return { id, subject, size: subscriptions.size };
}

export function unsubscribe(id) {
  const item = subscriptions.get(id);
  if (item) {
    item.sub.unsubscribe();
    subscriptions.delete(id);
    return subscriptions.size;
  }
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
  return { subject: msg.subject, data: sc.decode(msg.data), headers: msg.headers };
}

function parseHeaders(jsonStr) {
  const val = jsonStr.trim();
  if (!val) return undefined;
  try {
    const h = headers();
    const obj = JSON.parse(val);
    for (const k in obj) h.append(k, String(obj[k]));
    return h;
  } catch (e) {
    throw new Error("Invalid Headers JSON");
  }
}

// --- KV STORE ---
export async function getKvBuckets() {
  if (!nc) return [];
  const kvm = new Kvm(nc);
  const list = [];
  for await (const status of await kvm.list()) {
    list.push(status.bucket);
  }
  return list;
}

export async function openKvBucket(bucketName) {
  const kvm = new Kvm(nc);
  kv = await kvm.open(bucketName);
  return kv;
}

export async function getKvKeys() {
  if (!kv) return [];
  const keyArr = [];
  for await (const k of await kv.keys()) keyArr.push(k);
  return keyArr;
}

export async function getKvValue(key) {
  if (!kv) throw new Error("No Bucket Open");
  const entry = await kv.get(key);
  if (!entry) return null;
  return {
    value: sc.decode(entry.value),
    revision: entry.revision
  };
}

export async function putKvValue(key, value) {
  if (!kv) throw new Error("No Bucket Open");
  await kv.put(key, sc.encode(value));
}

export async function deleteKvValue(key) {
  if (!kv) throw new Error("No Bucket Open");
  await kv.delete(key);
}

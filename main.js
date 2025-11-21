import { connect, StringCodec, credsAuthenticator } from "nats.ws";

// --- STATE ---
let nc = null;
const sc = StringCodec();
const subscriptions = new Map(); 
let subCounter = 0;

// --- DOM ELEMENTS ---
const els = {
  url: document.getElementById("serverUrl"), // Defined here as 'url'
  creds: document.getElementById("credsFile"),
  btnConnect: document.getElementById("btnConnect"),
  statusText: document.getElementById("statusText"),
  statusDot: document.getElementById("statusDot"),
  
  subPanel: document.getElementById("subPanel"),
  appPanel: document.getElementById("appPanel"),
  
  subSubject: document.getElementById("subSubject"),
  btnSub: document.getElementById("btnSub"),
  subList: document.getElementById("subList"),
  subCount: document.getElementById("subCount"),
  
  pubSubject: document.getElementById("pubSubject"),
  pubPayload: document.getElementById("pubPayload"),
  btnPub: document.getElementById("btnPub"),
  btnReq: document.getElementById("btnReq"),
  
  messages: document.getElementById("messages"),
  btnClear: document.getElementById("btnClear"),
};

// --- INIT ---
const savedUrl = localStorage.getItem("nats_url");
if (savedUrl) els.url.value = savedUrl;

const savedPubSubj = localStorage.getItem("nats_last_pub_subject");
if (savedPubSubj) els.pubSubject.value = savedPubSubj;

// --- KEYBOARD SHORTCUTS ---
els.subSubject.addEventListener("keyup", (e) => {
  if (e.key === "Enter") els.btnSub.click();
});

els.pubPayload.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    els.btnPub.click();
  }
});

// --- RENDER LOG ---
const renderMessage = (subject, data, isRpc = false) => {
  const div = document.createElement("div");
  div.className = "msg-entry";
  let content = data;
  try {
    const obj = JSON.parse(data);
    content = JSON.stringify(obj, null, 2); 
  } catch (e) {}

  const time = new Date().toLocaleTimeString();
  const badgeClass = isRpc ? "badge-rpc" : "badge-sub";
  const badgeText = isRpc ? "RPC" : "MSG";

  div.innerHTML = `
    <div class="msg-meta">
      <span class="badge ${badgeClass}">${badgeText}</span>
      <span>${time}</span>
      <span style="color:#ddd; font-weight:bold;">${subject}</span>
    </div>
    <pre>${content}</pre>
  `;
  els.messages.prepend(div);
  
  if (els.messages.children.length > 100) {
    els.messages.lastChild.remove();
  }
};

// --- JSON FORMATTER ---
els.pubPayload.addEventListener("blur", () => {
  const val = els.pubPayload.value.trim();
  if (!val) return;
  try {
    const obj = JSON.parse(val);
    els.pubPayload.value = JSON.stringify(obj, null, 2);
    const lines = els.pubPayload.value.split("\n").length;
    els.pubPayload.rows = Math.min(10, lines + 1);
  } catch (e) {}
});

// --- CONNECT ---
els.btnConnect.addEventListener("click", async () => {
  try {
    localStorage.setItem("nats_url", els.url.value);
    const opts = { servers: els.url.value, ignoreClusterUpdates: true };

    if (els.creds.files.length > 0) {
      const file = els.creds.files[0];
      let rawText = await file.text();
      
      // Sanitize
      const jwtIndex = rawText.indexOf("-----BEGIN NATS USER JWT-----");
      if (jwtIndex > 0) rawText = rawText.substring(jwtIndex);
      else if (jwtIndex === -1) throw new Error("Invalid .creds file");
      
      rawText = rawText.replace(/\r\n/g, "\n");
      opts.authenticator = credsAuthenticator(new TextEncoder().encode(rawText));
    }

    els.statusText.innerText = "Connecting...";
    nc = await connect(opts);

    els.statusText.innerText = "Connected";
    els.statusText.style.color = "#4CAF50";
    els.statusDot.classList.add("connected");
    
    // --- THE FIX: Use els.url, not els.serverUrl ---
    els.btnConnect.disabled = true;
    els.url.disabled = true; 
    
    els.subPanel.style.display = "flex";
    els.appPanel.style.display = "flex";

  } catch (err) {
    els.statusText.innerText = "Error";
    els.statusText.style.color = "#d32f2f";
    alert(`Connection Failed: ${err.message}`);
  }
});

// --- SUBSCRIBE ---
els.btnSub.addEventListener("click", () => {
  const subject = els.subSubject.value.trim();
  if (!nc || !subject) return;

  try {
    const sub = nc.subscribe(subject);
    const id = ++subCounter;
    subscriptions.set(id, { sub, subject });
    updateSubCount();

    const li = document.createElement("li");
    li.id = `sub-li-${id}`;
    li.innerHTML = `
      <span>${subject}</span>
      <button class="danger" onclick="window.unsubscribe(${id})">X</button>
    `;
    els.subList.prepend(li);
    els.subSubject.value = "";

    (async () => {
      for await (const m of sub) {
        renderMessage(m.subject, sc.decode(m.data));
      }
    })();
  } catch (err) {
    alert("Invalid Subject");
  }
});

// --- UNSUBSCRIBE ---
window.unsubscribe = (id) => {
  const item = subscriptions.get(id);
  if (item) {
    item.sub.unsubscribe();
    subscriptions.delete(id);
    const li = document.getElementById(`sub-li-${id}`);
    if (li) li.remove();
    updateSubCount();
  }
};

function updateSubCount() {
  els.subCount.innerText = `(${subscriptions.size})`;
}

// --- PUBLISH ---
els.btnPub.addEventListener("click", () => {
  const subj = els.pubSubject.value.trim();
  const payload = els.pubPayload.value;
  if (!nc || !subj) return;
  
  localStorage.setItem("nats_last_pub_subject", subj);
  
  nc.publish(subj, sc.encode(payload));
  
  const originalText = els.btnPub.innerText;
  els.btnPub.innerText = "✓";
  setTimeout(() => els.btnPub.innerText = originalText, 1000);
});

// --- REQUEST ---
els.btnReq.addEventListener("click", async () => {
  const subj = els.pubSubject.value.trim();
  const payload = els.pubPayload.value;
  if (!nc || !subj) return;
  
  localStorage.setItem("nats_last_pub_subject", subj);
  
  els.btnReq.disabled = true;
  
  try {
    const msg = await nc.request(subj, sc.encode(payload), { timeout: 2000 });
    renderMessage(msg.subject, sc.decode(msg.data), true);
  } catch (err) {
    alert("Request Failed: Timeout");
  } finally {
    els.btnReq.disabled = false;
  }
});

// --- CLEAR ---
els.btnClear.addEventListener("click", () => els.messages.innerHTML = "");

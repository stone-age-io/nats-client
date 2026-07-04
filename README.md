# NATS Web Client 🪨

A lightweight, dependency-light web client for [NATS](https://nats.io/). Built with **Vanilla JavaScript**, **Vite**, and standard CSS.

This tool acts as a web utility for NATS developers, providing a UI for Messaging, Key-Value Store management, and JetStream administration directly from your browser.

## Features

### Connection & Authentication
*   **WebSocket Support:** Connects directly to NATS servers via `ws://` or `wss://`.
*   **Authentication:** Supports **User/Password**, **Token**, and **.creds (JWT/NKEY)** files.
*   **Named Profiles:** Save connection settings (URL + auth) as named profiles ("dev", "staging", "prod") for one-click switching. Credentials are only stored when you explicitly opt in.
*   **History:** Remembers previous connection URLs for quick switching.
*   **Stats:** Real-time RTT/Latency monitoring.

### Messaging (Pub/Sub)
*   **Publish:** Send messages with payloads and Headers (JSON). `Ctrl + Enter` to send.
*   **Subscribe:** Real-time message logging with JSON auto-formatting and syntax highlighting.
*   **Request/Reply:** Perform RPC calls with configurable timeouts.
*   **Message Templates:** Save subject/payload/headers combos as named templates - like a Postman collection for NATS.
*   **QoL:**
    *   **Persistent Subscriptions:** Subscriptions are remembered per server and automatically restored on reconnect.
    *   **Click-to-Fill:** Click a subscription subject to immediately target it for publishing.
    *   **Local History:** Remembers recently used subjects.
    *   **Pause/Resume:** Pause the log flow to inspect high-traffic subjects.
    *   **Binary-safe:** Non-UTF-8 payloads are detected and shown as a hex preview.

### JetStream KV Store
*   **Management:** Create, Edit, and Delete KV Buckets using raw JSON configuration (bucket deletion requires typing the bucket name).
*   **Real-time Watch:** The key list updates instantly when keys are added/removed by other clients.
*   **CRUD:** Get, Put, Delete, and **Purge** keys (purge also removes revision history).
*   **History:** View **Revision History** for any key to see how values changed over time.
*   **UX:** One-click Copy for values, JSON validation.

### Stream Management
*   **Admin:** List, Create, Edit, and Delete JetStream Streams.
*   **Configuration:** Full control over Retention, Storage (File/Memory), Subjects, and Limits via JSON templates.
*   **Inspection:**
    *   **Consumer Management:** Consumers load automatically per stream. View/edit configs, create new consumers, and delete them - with Pending/Waiting/Ack-pending counts.
    *   **Message Inspector:** Fetch messages by **Sequence Range** with an optional **Subject Filter** (wildcards supported), fetched as a single batch. Headers are displayed.
    *   **Live Tail:** Follow new messages on a stream in real time, optionally filtered by subject.
*   **Actions:** Purge stream messages.

## Prerequisites

1.  **Node.js** (v16+ recommended)
2.  **NATS Server** (v2.9+ recommended for KV support)

## Getting Started

### 1. Configure NATS Server
**Crucial Step:** Browsers cannot connect to NATS via raw TCP (port 4222). You **must** enable WebSockets on your NATS server.

Create a `nats.conf` file:
```text
websocket {
    port: 9222
    no_tls: true  # Set to false if using SSL/HTTPS
}

# Enable JetStream for KV and Stream support
jetstream {
    store_dir: './data'
}
```

Run the server:
```bash
nats-server -c nats.conf
```

### 2. Install and Run
```bash
# Install dependencies
npm install

# Run local dev server
npm run dev
```
Open your browser to `http://localhost:5173`.

## Usage Guide

### Connection
1.  Enter your WebSocket URL (e.g., `ws://localhost:9222`).
2.  (Optional) Enter a Token, User/Pass, or upload a `.creds` file.
3.  Click **Connect**.

### Streams Tab
*   **Create:** Click `+` to open the JSON configuration modal. A template with common defaults (Limits, File Storage) is provided.
*   **Edit:** Select a stream and click **Edit** to modify its configuration (e.g., add subjects).
*   **Inspect:** 
    *   Click **Load Consumers** to see who is reading from the stream.
    *   Enter a Start/End Sequence and click **Load** to view specific raw messages stored in the stream (Max 50 at a time).

### KV Store Tab
*   **Create/Edit:** Uses the same JSON configuration approach as streams.
*   **Watch:** Just select a bucket. The key list is a live view.
*   **History:** Click a key to see its current value and a list of previous revisions below it.

## Project Structure

Designed to be easily readable and hackable.

```text
├── index.html        # The skeleton. Semantic HTML5.
├── style.css         # The skin. CSS Variables, Grid, Flexbox, Mobile responsive.
├── main.js           # The brain. Ties UI events to Logic.
├── nats-client.js    # The engine. Wraps nats.ws and @nats-io/kv.
├── ui.js             # The painter. Handles DOM updates, Toasts, Tabs.
├── dom.js            # The map. Centralized references to HTML elements.
└── utils.js          # The tools. Formatters, Validators, History helpers.
```

## Contributing

1.  Fork it.
2.  Keep it simple
3.  Submit a Pull Request.

## License

MIT License.

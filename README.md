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

### Connecting
1.  Click the **status pill** in the top bar (`● Disconnected ▾`) to open the
    connection popover.
2.  Enter your WebSocket URL (e.g. `ws://localhost:9222`).
3.  (Optional) Enter a token, user/pass, or upload a `.creds` file.
4.  Click **Connect**. The popover closes and the pill shows the host and RTT.

Save the current settings as a named profile with **Save profile**; the profile
dropdown sits next to the logo for one-click switching between servers.

### Messaging Tab
*   **Subscribe:** type a subject in the left pane and press Enter. Click a
    subject in the list to copy it into the publish field.
*   **Publish / Request:** fill in the subject and payload, then **Pub** or
    **Req**. `Ctrl + Enter` in the payload publishes.
*   Collapse the composer with the **Publish / Request** disclosure to give the
    log the full pane while watching traffic.

### KV Store Tab
Three panes: **Buckets → Keys → key detail**.

*   **Select a bucket** to start a live watch; the key list updates as other
    clients write.
*   **Value / History** sub-tabs split the current value from the revision list,
    so each gets the full pane. Clicking a revision loads it read-only, so an old
    value cannot be saved over HEAD by accident.
*   **Config** and **Delete** in the Keys pane header act on the selected bucket.
    Deleting requires typing the bucket name.

### Streams Tab
Two panes: **Streams → stream detail**, with the detail split into sub-tabs.

*   **Overview:** configuration and state, plus **Edit config**, **Purge** and
    **Delete** (delete requires typing the stream name).
*   **Consumers:** loads automatically when a stream is selected. Create, edit
    and delete consumers, with pending/waiting/ack-pending counts.
*   **Messages:** enter a start/end sequence and click **Load** (up to 200 at a
    time), optionally filtered by subject. **▶ Tail** live-follows new messages
    instead.

## Layout

The window is a top bar, a tab strip, and a workspace. Each tab owns a grid of
panes, and **every pane owns exactly one scroll region** - there is no nested
scrolling anywhere in the app.

```text
┌─────────────────────────────────────────────────────────────────┐
│ NATS 🪨   [profile ▾]        ● Connected · host · 138ms   Server │  app bar
├─────────────────────────────────────────────────────────────────┤
│ Messaging │ KV Store │ Streams                                  │  tabs
├──────────────┬──────────────────────────────────────────────────┤
│ Subscriptions│ Publish / Request  (collapsible)                 │
│              ├──────────────────────────────────────────────────┤
│              │ Message Log                                      │
└──────────────┴──────────────────────────────────────────────────┘

KV Store:  Buckets │ Keys │ key detail ─ [ Value | History ]
Streams:   Streams │ stream detail ─ [ Overview | Consumers | Messages ]
```

*   **Connection** lives in a popover behind the status pill, not in a permanent
    sidebar - it is a once-per-session task, so it does not hold screen space.
*   **Subscriptions** live inside the Messaging tab, where they are actually
    used, and get the full height of the window.
*   **Detail sub-tabs** give consumers, stored messages and revision history a
    full pane each instead of stacking them into one scrolling column.
*   The workspace stays visible while disconnected. Only controls that need a
    live connection are disabled, so profiles, templates and the last results
    you loaded remain readable offline.

Adding a section is additive: a `<button class="tab" data-tab="x">` plus a
matching `<section class="tab-panel" data-tab-panel="x">`. Tab and sub-tab
switching is delegated and data-driven, so no JavaScript changes are needed.

## Project Structure

Designed to be easily readable and hackable.

```text
├── index.html        # The skeleton. Semantic HTML5, no inline styles.
├── style.css         # The skin. CSS variables, spacing scale, one scroll region per pane.
├── main.js           # The brain. Ties UI events to logic.
├── nats-client.js    # The engine. Wraps nats.ws and @nats-io/kv.
├── ui.js             # The painter. DOM updates, toasts, tabs, connection state.
├── dialogs.js        # The interruptions. Every modal, built on native <dialog>.
├── dom.js            # The map. Centralized references to HTML elements.
└── utils.js          # The tools. Formatters, validators, history helpers.
```

### Dialogs

All modals use the native `<dialog>` element, which brings focus trapping,
Escape-to-close, an inert background and focus restoration for free. This also
replaces `window.confirm` / `window.prompt`, so destructive actions no longer
break the dark theme with a browser-chrome popup.

| Helper | Used for |
| --- | --- |
| `confirmDialog` | Reversible destructive actions (delete key, delete consumer) |
| `typeToConfirmDialog` | Irreversible ones - requires typing the exact name (delete bucket, delete stream) |
| `promptDialog` | Naming profiles and templates |
| `jsonDialog` | Stream / bucket / consumer configuration. Server errors show inline and keep the dialog open so a rejected config can be fixed without retyping it. |
| `infoDialog` | Server information |

Dialogs settle synchronously when dismissed rather than waiting on the `close`
event, so a caller's `await` never depends on event delivery timing.

## Contributing

1.  Fork it.
2.  Keep it simple
3.  Submit a Pull Request.

## License

MIT License.

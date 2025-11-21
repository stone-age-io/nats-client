# NATS Client

A lightweight, dependency-light web client for [NATS](https://nats.io/). Built with **Vanilla JavaScript**, **Vite**, and standard CSS. No heavy frontend frameworks, no complex state management libraries, just direct DOM manipulation and NATS WebSockets.

## Features

*   **Zero Framework Overhead:** Built with Vanilla JS and native ESM modules.
*   **NATS Authentication:** Full support for **User JWTs/NKEYs** via `.creds` files.
*   **Messaging:**
    *   Real-time Publish / Subscribe.
    *   Request / Reply (RPC) with configurable timeouts.
    *   Support for NATS Headers.
    *   JSON Auto-formatting and Syntax Highlighting.
*   **JetStream KV Store:**
    *   Browse Buckets.
    *   List Keys.
    *   Get / Put / Delete values visually.
*   **Developer UX:**
    *   Local History (remembers subjects and URLs).
    *   Responsive Design (Works on Mobile/Tablet).
    *   Connection Stats (RTT/Latency).
    *   Pause/Resume Log scrolling.

## Prerequisites

1.  **Node.js** (v16+ recommended)
2.  **NATS Server** (v2.9+ recommended for KV support)

## Getting Started

### 1. Clone and Install
```bash
git clone https://github.com/yourusername/nats-grug-client.git
cd nats-grug-client
npm install
```

### 2. Configure NATS Server
**Crucial Step:** Browsers cannot connect to NATS via raw TCP (port 4222). You **must** enable WebSockets on your NATS server.

Create a `nats.conf` file:
```text
websocket {
    port: 9222
    no_tls: true  # Set to false if using SSL/HTTPS
}

# Enable JetStream for KV support
jetstream {
    store_dir: './data'
}
```

Run the server:
```bash
nats-server -c nats.conf
```

### 3. Run the Client
```bash
npm run dev
```
Open your browser to `http://localhost:5173` (or the port Vite assigns).

## Usage Guide

### Connection
1.  **URL:** Use the WebSocket URL (e.g., `ws://localhost:9222` or `wss://your-domain.com`).
2.  **Creds:** (Optional) Upload your `.creds` file. 
3.  Click **Connect**.

### Messaging Tab
*   **Subscribe:** Enter a subject (e.g., `orders.>`) and hit Enter. Messages appear in the log below.
*   **Publish:** Enter a subject and payload. `Ctrl + Enter` sends the message.
*   **Request:** Sends a message and waits for a reply (RPC).
*   **Pause:** Useful for high-traffic subjects. Stops the DOM from updating so you can inspect messages.

### KV Store Tab
*   **Refresh Buckets:** Lists all Key-Value buckets in your JetStream account.
*   **Keys:** Select a bucket to view keys. Click a key to view its value.
*   **Edit:** Modify the value and click **Put / Update** to save.

## Project Structure

Designed to be easily readable by developers of any skill level.

```text
├── index.html        # The skeleton. Semantic HTML5.
├── style.css         # The skin. CSS Variables, Grid, Flexbox.
├── main.js           # The brain. Ties UI events to Logic.
├── nats-client.js    # The engine. Wraps nats.ws and @nats-io/kv.
├── ui.js             # The painter. Handles DOM updates, Toasts, Tabs.
├── dom.js            # The map. Centralized references to HTML elements.
└── utils.js          # The tools. Formatters, LocalStorage helpers.
```

## Contributing

1.  Fork it.
2.  Keep it simple.
3.  Submit a Pull Request.

## License

MIT License. Do whatever you want with it.

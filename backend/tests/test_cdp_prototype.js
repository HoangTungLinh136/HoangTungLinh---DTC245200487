const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\hoang\\.gemini\\antigravity-ide\\brain\\17b7f3cb-2a97-4e22-8b90-e5e79fa67329\\scratch\\chrome-test-profile';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { resolve(b); }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const listeners = this.eventListeners.get(msg.method) || [];
        listeners.forEach(fn => fn(msg.params));
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.eventListeners.has(method)) this.eventListeners.set(method, []);
    this.eventListeners.get(method).push(fn);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('Starting Chrome for CDP Page test...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  try {
    // Wait for Chrome port
    await new Promise(r => setTimeout(r, 1000));
    const version = await fetchJson('http://127.0.0.1:9222/json/version');
    console.log('Chrome Debugger:', version.Browser);

    const list = await fetchJson('http://127.0.0.1:9222/json/list');
    let pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) {
      await fetchJson('http://127.0.0.1:9222/json/new?http://localhost/');
      const updated = await fetchJson('http://127.0.0.1:9222/json/list');
      pageTarget = updated.find(t => t.type === 'page');
    }

    console.log('Connecting to page WebSocket:', pageTarget.webSocketDebuggerUrl);
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log('Navigating to http://localhost/ ...');
    await client.send('Page.navigate', { url: 'http://localhost/' });
    await new Promise(r => setTimeout(r, 1500));

    const evalTitle = await client.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    console.log('Page Title in Chrome:', evalTitle.result.value);

    const evalHeading = await client.send('Runtime.evaluate', { expression: 'document.querySelector("h1").innerText', returnByValue: true });
    console.log('Page H1 in Chrome:', evalHeading.result.value);

    client.close();
    console.log('[✔] CDP Browser integration verified successfully!');
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

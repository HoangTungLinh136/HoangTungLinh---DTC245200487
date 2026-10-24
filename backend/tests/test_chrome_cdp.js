const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\hoang\\.gemini\\antigravity-ide\\brain\\17b7f3cb-2a97-4e22-8b90-e5e79fa67329\\scratch\\chrome-test-profile';

async function waitHttp(url, maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(url, (res) => {
          let b = '';
          res.on('data', c => b += c);
          res.on('end', () => resolve(JSON.parse(b)));
        }).on('error', reject);
      });
      return data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('Timeout waiting for ' + url);
}

async function main() {
  console.log('Spawning Chrome headless...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  try {
    const version = await waitHttp('http://127.0.0.1:9222/json/version');
    console.log('Chrome connected successfully!');
    console.log('Browser:', version.Browser);
    console.log('Protocol-Version:', version['Protocol-Version']);
    console.log('WebSocket Debugger URL:', version.webSocketDebuggerUrl);
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error('CDP test failed:', err);
  process.exit(1);
});

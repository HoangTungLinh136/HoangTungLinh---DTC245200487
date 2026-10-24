/**
 * Live Runtime Verification Script for QuizSystem Services & Endpoints
 * Runs against localhost after docker compose up -d
 */
const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runLiveVerification() {
  console.log('===============================================================');
  console.log('   QUIZSYSTEM LIVE RUNTIME VERIFICATION (E6 / E7 AUDIT)');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    process.stdout.write(`[*] Checking ${name}... `);
    try {
      await fn();
      console.log('PASS ✓');
      passed++;
    } catch (err) {
      console.log(`FAIL ✗ (${err.message})`);
      failed++;
    }
  }

  // 1. Nginx Reverse Proxy & Frontend
  await check('Nginx Port 80 (Frontend root)', async () => {
    const res = await httpGet('http://localhost:80/');
    if (res.statusCode !== 200 || !res.body.includes('QuizSystem')) {
      throw new Error(`Unexpected status ${res.statusCode} or body`);
    }
    if (!res.headers['x-content-type-options'] || res.headers['x-content-type-options'] !== 'nosniff') {
      throw new Error('Missing X-Content-Type-Options: nosniff header');
    }
  });

  // 2. Backend Health & Readiness via Nginx
  await check('Backend /health & /ready via Nginx', async () => {
    const health = await httpGet('http://localhost:80/health');
    if (health.statusCode !== 200 || !health.body.includes('healthy')) {
      throw new Error(`/health returned ${health.statusCode}`);
    }
    const ready = await httpGet('http://localhost:80/ready');
    if (ready.statusCode !== 200 || !ready.body.includes('connected')) {
      throw new Error(`/ready returned ${ready.statusCode}`);
    }
  });

  // 3. Prometheus Scraper Port 9090
  await check('Prometheus Metrics UI (Port 9090)', async () => {
    const res = await httpGet('http://localhost:9090/-/healthy');
    if (res.statusCode !== 200) {
      throw new Error(`Prometheus returned status ${res.statusCode}`);
    }
  });

  // 4. Grafana Dashboards Port 3001
  await check('Grafana Dashboard Service (Port 3001)', async () => {
    const res = await httpGet('http://localhost:3001/api/health');
    if (res.statusCode !== 200) {
      throw new Error(`Grafana returned status ${res.statusCode}`);
    }
  });

  // 5. Loki Centralized Log Storage Port 3100
  await check('Loki Engine Ready (Port 3100)', async () => {
    const res = await httpGet('http://localhost:3100/ready');
    if (res.statusCode !== 200) {
      throw new Error(`Loki returned status ${res.statusCode}`);
    }
  });

  // 6. Mailpit Web UI & SMTP Port 8025
  await check('Mailpit Web UI (Port 8025)', async () => {
    const res = await httpGet('http://localhost:8025/');
    if (res.statusCode !== 200) {
      throw new Error(`Mailpit returned status ${res.statusCode}`);
    }
  });

  // 7. phpMyAdmin Database Administration Port 8081
  await check('phpMyAdmin UI (Port 8081)', async () => {
    const res = await httpGet('http://localhost:8081/');
    if (res.statusCode !== 200) {
      throw new Error(`phpMyAdmin returned status ${res.statusCode}`);
    }
  });

  const testPassword = process.env.TEST_PASSWORD || 'Hoanglinh1#';

  // 8. Live API: Login as Student
  let studentToken = null;
  await check('Live API Login (student1)', async () => {
    const res = await httpPost('http://localhost:80/api/auth/login', {
      username: 'student1',
      password: testPassword
    });
    if (res.statusCode !== 200 || !res.body.token) {
      throw new Error(`Login failed with status ${res.statusCode}: ${JSON.stringify(res.body)}`);
    }
    studentToken = res.body.token;
  });

  // 9. Live API: Login as Teacher
  let teacherToken = null;
  await check('Live API Login (teacher1)', async () => {
    const res = await httpPost('http://localhost:80/api/auth/login', {
      username: 'teacher1',
      password: testPassword
    });
    if (res.statusCode !== 200 || !res.body.token) {
      throw new Error(`Login failed with status ${res.statusCode}`);
    }
    teacherToken = res.body.token;
  });

  // 10. Live API: Login as Admin
  let adminToken = null;
  await check('Live API Login (admin)', async () => {
    const res = await httpPost('http://localhost:80/api/auth/login', {
      username: 'admin',
      password: testPassword
    });
    if (res.statusCode !== 200 || !res.body.token) {
      throw new Error(`Login failed with status ${res.statusCode}`);
    }
    adminToken = res.body.token;
  });

  // 11. RBAC Guard Verification
  await check('Live RBAC Guard: Student forbidden on /api/questions', async () => {
    const res = await httpPost('http://localhost:80/api/questions', {}, {
      'Authorization': `Bearer ${studentToken}`
    });
    if (res.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden, got ${res.statusCode}`);
    }
  });

  console.log('\n===============================================================');
  console.log(`TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});

const http = require('http');

async function testMailpitDelivery() {
  console.log('--- Testing Mailpit Password Reset Email Delivery ---');

  // 1. Trigger forgot-password
  const postData = JSON.stringify({ email: 'student1@quizsystem.local' });
  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 80,
      path: '/api/auth/forgot-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log('[*] Triggered /api/auth/forgot-password. Waiting 1s for SMTP dispatch...');
  await new Promise(r => setTimeout(r, 1000));

  // 2. Query Mailpit API
  const messages = await new Promise((resolve, reject) => {
    http.get('http://localhost:8025/api/v1/messages', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  const total = messages.total || (messages.messages ? messages.messages.length : 0);
  console.log(`[*] Mailpit inbox total messages: ${total}`);

  if (total > 0) {
    const latest = messages.messages[0];
    console.log(`    ✓ Latest Message ID: ${latest.ID}`);
    console.log(`    ✓ Subject: ${latest.Subject}`);
    console.log(`    ✓ To: ${latest.To ? latest.To[0].Address : '-'}`);
    console.log(`    ✓ From: ${latest.From ? latest.From.Address : '-'}`);
  } else {
    throw new Error('No message found in Mailpit inbox');
  }
}

testMailpitDelivery().catch(console.error);

const http = require('http');

function postJson(path, body, token = null) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port: 80, // Nginx proxy to backend
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resBody) });
        } catch (e) {
          resolve({ status: res.statusCode, body: resBody });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== TESTING CHANGE PASSWORD LIVE ENDPOINT ===');
  
  // 1. Login with original password
  const login1 = await postJson('/api/auth/login', { username: 'student2', password: 'Password123!' });
  console.log('1. Login original password status:', login1.status);
  if (login1.status !== 200) throw new Error('Initial login failed: ' + JSON.stringify(login1.body));
  const token = login1.body.token;

  // 2. Change password with wrong old password
  const badOld = await postJson('/api/auth/change-password', { oldPassword: 'WrongPassword!', newPassword: 'NewPassword456!' }, token);
  console.log('2. Change with wrong old password status:', badOld.status, badOld.body.error);
  if (badOld.status !== 400) throw new Error('Expected 400 for wrong old password');

  // 3. Change password with identical new password
  const sameNew = await postJson('/api/auth/change-password', { oldPassword: 'Password123!', newPassword: 'Password123!' }, token);
  console.log('3. Change with same password status:', sameNew.status, sameNew.body.error);
  if (sameNew.status !== 400) throw new Error('Expected 400 for same password');

  // 4. Change password successfully
  const changeOk = await postJson('/api/auth/change-password', { oldPassword: 'Password123!', newPassword: 'NewPassword456!' }, token);
  console.log('4. Valid change password status:', changeOk.status, changeOk.body.message);
  if (changeOk.status !== 200) throw new Error('Expected 200 for valid change password');

  // 4b. Verify old token is revoked on server (Task 3 Session Revocation)
  const checkOldToken = await new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 80, path: '/api/auth/me', method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, (res) => resolve(res.statusCode));
    req.end();
  });
  console.log('4b. Old token validation status after password change:', checkOldToken);
  if (checkOldToken !== 401) throw new Error('Expected 401 for revoked old session token');

  // 5. Try login with old password -> should fail (401)
  const loginOld = await postJson('/api/auth/login', { username: 'student2', password: 'Password123!' });
  console.log('5. Login with old password status:', loginOld.status);
  if (loginOld.status !== 401) throw new Error('Old password must be rejected with 401');

  // 6. Login with new password -> should succeed (200)
  const loginNew = await postJson('/api/auth/login', { username: 'student2', password: 'NewPassword456!' });
  console.log('6. Login with new password status:', loginNew.status);
  if (loginNew.status !== 200) throw new Error('New password must be accepted with 200');
  const tokenNew = loginNew.body.token;

  // 7. Revert password back to original Password123!
  const revert = await postJson('/api/auth/change-password', { oldPassword: 'NewPassword456!', newPassword: 'Password123!' }, tokenNew);
  console.log('7. Revert to original password status:', revert.status);
  if (revert.status !== 200) throw new Error('Revert failed');

  // 8. Confirm original password works again
  const loginRevert = await postJson('/api/auth/login', { username: 'student2', password: 'Password123!' });
  console.log('8. Login with reverted password status:', loginRevert.status);
  if (loginRevert.status !== 200) throw new Error('Revert verification failed');

  console.log('\n[✔] ALL CHANGE PASSWORD LIVE TESTS PASSED 100%!');
}

run().catch(err => {
  console.error('[✖] TEST FAILED:', err);
  process.exit(1);
});

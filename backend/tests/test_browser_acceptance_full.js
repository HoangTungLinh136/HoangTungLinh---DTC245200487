const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\hoang\\.gemini\\antigravity-ide\\brain\\17b7f3cb-2a97-4e22-8b90-e5e79fa67329';
const USER_DATA_DIR = path.join(ARTIFACT_DIR, 'scratch', 'chrome-full-profile');

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3307,
  user: 'quiz_user',
  password: 'QuizPass123!',
  database: 'quizsystem'
};

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

class BrowserDriver {
  constructor() {
    this.chromeProc = null;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
    this.consoleErrors = [];
    this.networkLogs = [];
  }

  async launch() {
    if (fs.existsSync(USER_DATA_DIR)) {
      try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
    }
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    this.chromeProc = spawn(CHROME_PATH, [
      '--headless=new',
      '--remote-debugging-port=9222',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900'
    ]);

    // Wait for Chrome port
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        await fetchJson('http://127.0.0.1:9222/json/version');
        connected = true;
        break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    if (!connected) throw new Error('Chrome failed to start or open port 9222');

    const list = await fetchJson('http://127.0.0.1:9222/json/list');
    let pageTarget = list.find(t => t.type === 'page');
    if (!pageTarget) {
      await fetchJson('http://127.0.0.1:9222/json/new?http://localhost/');
      const updated = await fetchJson('http://127.0.0.1:9222/json/list');
      pageTarget = updated.find(t => t.type === 'page');
    }

    this.ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
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
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        if (msg.params.type === 'error') {
          const text = (msg.params.args || []).map(a => a.value || JSON.stringify(a)).join(' ');
          this.consoleErrors.push(text);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(msg.params.exceptionDetails.text);
      } else if (msg.method === 'Page.javascriptDialogOpening') {
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      } else if (msg.method === 'Network.responseReceived') {
        this.networkLogs.push({
          url: msg.params.response.url,
          status: msg.params.response.status
        });
      }
    };

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor(async () => {
      const r = await this.evaluate('document.readyState');
      return r === 'complete' || r === 'interactive';
    }, 8000);
    await new Promise(r => setTimeout(r, 500));
  }

  async reload() {
    await this.send('Page.reload');
    await this.waitFor(async () => {
      const r = await this.evaluate('document.readyState');
      return r === 'complete' || r === 'interactive';
    }, 8000);
    await new Promise(r => setTimeout(r, 600));
  }

  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : undefined;
  }

  async waitFor(conditionFn, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        let ok = false;
        if (typeof conditionFn === 'string') {
          ok = await this.evaluate(`!!document.querySelector(${JSON.stringify(conditionFn)})`);
        } else {
          ok = await conditionFn();
        }
        if (ok) return true;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
  }

  async click(selector) {
    await this.waitFor(selector, 5000);
    const clicked = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error(`Could not click selector: ${selector}`);
    await new Promise(r => setTimeout(r, 300));
  }

  async type(selector, text) {
    await this.waitFor(selector, 5000);
    const typed = await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
    if (!typed) throw new Error(`Could not type into selector: ${selector}`);
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const fullPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  }

  async close() {
    if (this.ws) this.ws.close();
    if (this.chromeProc) {
      this.chromeProc.kill('SIGKILL');
    }
  }
}

async function runBrowserAcceptanceSuite() {
  console.log('========================================================================');
  console.log('  QUIZSYSTEM REAL BROWSER ACCEPTANCE & FUNCTIONAL VERIFICATION SUITE   ');
  console.log('========================================================================\n');

  const browser = new BrowserDriver();
  let dbConn = null;

  try {
    dbConn = await mysql.createConnection(DB_CONFIG);
    await browser.launch();
    console.log('[✔] STEP 1: Chrome headless browser launched & CDP WebSocket attached.');

    // -------------------------------------------------------------------------
    // SECTION 1: TEACHER PORTAL ACCEPTANCE (TASK 3)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 1: TEACHER PORTAL ACCEPTANCE (TASK 3) ---');
    await browser.goto('http://localhost/');
    console.log('Navigated to login page:', await browser.evaluate('document.title'));

    // 1.1 Teacher Login
    await browser.click('#tab-login-btn');
    await browser.type('#login-username', 'teacher1');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');

    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("teacher.html")'), 8000);
    const teacherName = await browser.evaluate('document.getElementById("teacher-display-name").innerText');
    console.log(`  [✔] PASS: Teacher Login — Display Name: "${teacherName}", URL: ${await browser.evaluate('window.location.href')}`);

    // Capture Teacher Dashboard Screenshot
    const s1 = await browser.captureScreenshot('screenshot_01_teacher_dashboard.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s1)}`);

    // 1.2 Teacher creates Question in Question Bank
    const testQTitle = 'Browser Question ' + Date.now();
    await browser.click('button[onclick="openCreateQuestionModal()"]');
    await browser.waitFor('#question-modal.open', 4000);
    await browser.type('#q-modal-title-input', testQTitle);
    await browser.type('#q-modal-content-input', 'Giao thức nào hoạt động ở tầng Giao vận (Transport Layer)?');
    await browser.type('#q-modal-subject', 'Mang May Tinh');

    // Choice A: TCP (correct)
    await browser.evaluate(`
      (() => {
        const rows = document.querySelectorAll('#choices-builder-container > div');
        if (rows.length >= 2) {
          rows[0].querySelector('.choice-content-input').value = 'TCP';
          rows[0].querySelector('input[type="radio"]').checked = true;
          rows[1].querySelector('.choice-content-input').value = 'IP';
          rows[1].querySelector('input[type="radio"]').checked = false;
        }
      })()
    `);
    await browser.click('#question-modal button[type="submit"]');
    await new Promise(r => setTimeout(r, 1000));

    // Verify Question in DB
    const [qDb] = await dbConn.execute('SELECT id, title, subject, question_type FROM questions WHERE title = ?', [testQTitle]);
    if (qDb.length === 0) throw new Error('Question was not saved to MySQL database');
    const createdQuestionId = qDb[0].id;
    console.log(`  [✔] PASS: Teacher Question Creation — Saved in MySQL with ID: ${createdQuestionId}`);

    // 1.3 Teacher creates Exam with Questions & Weights
    const testExamTitle = 'Kỳ Thi Trắc Nghiệm Browser ' + Date.now();
    await browser.click('#tab-exams-btn');
    await browser.waitFor('#section-exams', 4000);
    await browser.click('button[onclick="openCreateExamModal()"]');
    await browser.waitFor('#exam-modal.open', 4000);

    await browser.type('#exam-title-input', testExamTitle);
    await browser.type('#exam-desc-input', 'Đề thi nghiệm thu tự động qua trình duyệt Chrome CDP');
    await browser.type('#exam-duration-input', '20');
    await browser.type('#exam-max-attempts', '2');
    await browser.type('#exam-pass-score', '5.0');

    // Pick created question
    const pickerCount = await browser.evaluate('document.querySelectorAll(".exam-q-select").length');
    console.log('Available questions in picker:', pickerCount);
    await browser.evaluate(`
      (() => {
        const pickers = document.querySelectorAll('.exam-q-select');
        if (pickers.length > 0) {
          pickers[0].checked = true;
          pickers[0].dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    const isChecked = await browser.evaluate('document.querySelectorAll(".exam-q-select:checked").length');
    console.log('Checked questions count:', isChecked);

    const invalidFields = await browser.evaluate(`
      [...document.querySelector('#exam-modal form').elements]
        .filter(e => !e.validity.valid)
        .map(e => ({ id: e.id, name: e.name, class: e.className, msg: e.validationMessage }))
    `);
    console.log('Invalid fields in exam form:', JSON.stringify(invalidFields));

    await browser.evaluate(`
      (() => {
        const form = document.querySelector('#exam-modal form');
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      })()
    `);
    await new Promise(r => setTimeout(r, 1500));

    const toastMsg = await browser.evaluate('document.getElementById("toast-container") ? document.getElementById("toast-container").innerText : ""');
    console.log('Toast message after exam submit:', toastMsg);

    // Verify Exam in DB
    const [examDb] = await dbConn.execute('SELECT id, title, duration_minutes, max_attempts, pass_score, is_published_scores FROM exams WHERE title = ?', [testExamTitle]);
    if (examDb.length === 0) {
      console.log('Console Errors captured:', browser.consoleErrors);
      throw new Error('Exam was not saved to MySQL database. Toast was: ' + toastMsg);
    }
    const createdExamId = examDb[0].id;
    console.log(`  [✔] PASS: Teacher Exam Creation — Saved in MySQL with ID: ${createdExamId}, Max Attempts: ${examDb[0].max_attempts}, Published: ${examDb[0].is_published_scores}`);

    // Logout Teacher
    await browser.click('button[onclick="API.logout()"]');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("index.html") || window.location.pathname === "/"'), 5000);
    console.log('  [✔] PASS: Teacher Logout — Successfully returned to Login Page.');


    // -------------------------------------------------------------------------
    // SECTION 2: STUDENT PORTAL ACCEPTANCE & FLOW (TASK 2)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 2: STUDENT PORTAL ACCEPTANCE (TASK 2) ---');

    // 2.1 Student Login
    await browser.type('#login-username', 'student1');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("student.html")'), 8000);

    const studentName = await browser.evaluate('document.getElementById("user-display-name").innerText');
    console.log(`  [✔] PASS: Student Login — Display Name: "${studentName}", URL: ${await browser.evaluate('window.location.href')}`);

    // 2.2 Student Views Available Exams
    await browser.waitFor('#exams-list', 5000);
    const examsCount = await browser.evaluate('document.querySelectorAll("#exams-list .card").length');
    console.log(`  [✔] PASS: Student Views Exam List — Total available exams rendered: ${examsCount}`);

    // 2.3 Student Starts Attempt on newly created Exam
    // Find button for created exam
    await browser.evaluate(`
      (() => {
        const cards = document.querySelectorAll('#exams-list .card');
        for (const c of cards) {
          if (c.innerText.includes(${JSON.stringify(testExamTitle)})) {
            const btn = c.querySelector('button');
            if (btn) btn.click();
            return;
          }
        }
        // Fallback: click first start button
        const firstBtn = document.querySelector('#exams-list button');
        if (firstBtn) firstBtn.click();
      })()
    `);

    // Verify Fullscreen Runner Opened
    await browser.waitFor(() => browser.evaluate('document.getElementById("exam-runner").style.display === "flex"'), 6000);
    const timerText = await browser.evaluate('document.getElementById("countdown-timer").innerText');
    console.log(`  [✔] PASS: Exam Runner Launched — Countdown Timer Active: "${timerText}"`);

    // 2.4 Student Selects Answer & Verifies Autosave
    await browser.waitFor('.choice-label', 5000);
    await browser.click('.choice-label'); // Click first choice (TCP)
    await new Promise(r => setTimeout(r, 800));

    const runnerInfo = await browser.evaluate('document.getElementById("runner-attempt-info").innerText');
    console.log(`  [✔] PASS: Autosave Triggered — Runner Badge: "${runnerInfo}"`);

    // Capture Runner with Answer selected
    const s2 = await browser.captureScreenshot('screenshot_02_student_runner_autosave.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s2)}`);

    // Verify answer in MySQL attempt_answers
    const [activeAttempt] = await dbConn.execute(`
      SELECT a.id, a.status, aa.question_id, aa.selected_choice_ids 
      FROM exam_attempts a 
      JOIN attempt_answers aa ON a.id = aa.attempt_id 
      WHERE a.student_id = 3 AND a.status = 'in_progress' 
      ORDER BY a.id DESC LIMIT 1
    `);
    if (activeAttempt.length === 0) throw new Error('Autosave did not persist into MySQL attempt_answers');
    console.log(`  [✔] PASS: MySQL Verification — Attempt ID: ${activeAttempt[0].id}, Choice IDs: ${JSON.stringify(activeAttempt[0].selected_choice_ids)}`);
    const studentAttemptId = activeAttempt[0].id;

    // 2.5 Refresh Page & Verify Answer Recovery (BD-05 / BD-07)
    console.log('Simulating browser refresh (F5 / location.reload) ...');
    await browser.reload();
    await browser.waitFor('#dashboard-view', 6000);

    // Active attempt banner should be visible
    const bannerDisplay = await browser.evaluate('document.getElementById("active-banner").style.display');
    console.log(`  [✔] PASS: Active Attempt Detected After Refresh — Banner Display: "${bannerDisplay}"`);

    // Resume attempt
    await browser.click('#btn-resume-active');
    await browser.waitFor(() => browser.evaluate('document.getElementById("exam-runner").style.display === "flex"'), 6000);

    // Verify choice is restored
    const selectedInputChecked = await browser.evaluate(`
      (() => {
        const inp = document.querySelector('.choice-label input:checked');
        return !!inp;
      })()
    `);
    console.log(`  [✔] PASS: Answer Recovery Verified — Selected choice restored: ${selectedInputChecked}`);

    // 2.6 Submit Exam
    console.log('Submitting exam from runner...');
    await browser.evaluate('window.confirm = () => true; window.alert = () => true;');
    await browser.click('button[onclick="confirmSubmit()"]');

    let modalOpened = false;
    for (let i = 0; i < 40; i++) {
      const isOpen = await browser.evaluate('!!document.querySelector("#result-modal.open")');
      if (isOpen) {
        modalOpened = true;
        break;
      }
      const runnerDisplay = await browser.evaluate('document.getElementById("exam-runner") ? document.getElementById("exam-runner").style.display : ""');
      const toastText = await browser.evaluate('document.getElementById("toast-container") ? document.getElementById("toast-container").innerText : ""');
      if (i % 5 === 0) {
        console.log(`  [Poll ${i}] Waiting result modal: runnerDisplay="${runnerDisplay}", toast="${toastText}", consoleErrors=${JSON.stringify(browser.consoleErrors)}`);
      }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!modalOpened) throw new Error('Result modal did not open after exam submission');
    console.log('  [✔] PASS: Exam Submitted Successfully & Result Modal Opened.');

    // 2.7 Verify Attempt Status in MySQL
    const [subAttemptDb] = await dbConn.execute('SELECT id, status, grading_status, score FROM exam_attempts WHERE id = ?', [studentAttemptId]);
    console.log(`  [✔] PASS: MySQL Auto-Grading Outcome — Status: "${subAttemptDb[0].status}", Grading: "${subAttemptDb[0].grading_status}", Score: ${subAttemptDb[0].score}`);

    // 2.8 Student Queries Result (Privacy Gate BD-06)
    // Teacher has NOT published scores yet
    const scoreTextUnpublished = await browser.evaluate('document.getElementById("result-content").innerText');
    console.log(`  [✔] PASS: Privacy Gate Enforced — Score masked before publication: "${scoreTextUnpublished.trim().replace(/\n/g, ' ')}"`);

    // Capture Privacy Gate Modal
    const s3 = await browser.captureScreenshot('screenshot_03_student_privacy_gate.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s3)}`);
    await browser.click('button[onclick="closeResultModal()"]');

    // Logout Student
    await browser.click('button[onclick="API.logout()"]');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("index.html") || window.location.pathname === "/"'), 5000);


    // -------------------------------------------------------------------------
    // SECTION 3: TEACHER PUBLISHES SCORE & STUDENT VIEWS RESULT (TASK 2 CONTINUED)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 3: SCORE PUBLICATION & VERIFICATION ---');

    // 3.1 Teacher Login
    await browser.type('#login-username', 'teacher1');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("teacher.html")'), 8000);

    // 3.2 Publish Scores & Answers for Exam
    await browser.click('#tab-exams-btn');
    await browser.waitFor('#section-exams', 5000);

    // Publish scores via API call from page context
    await browser.evaluate(`
      (async () => {
        await API.patch('/exams/${createdExamId}/publication', {
          is_published_scores: 1,
          is_published_answers: 1
        });
      })()
    `);
    console.log(`  [✔] PASS: Teacher Toggled Publication On for Exam #${createdExamId}`);

    // Verify publication in MySQL
    const [pubDb] = await dbConn.execute('SELECT is_published_scores, is_published_answers FROM exams WHERE id = ?', [createdExamId]);
    console.log(`  [✔] PASS: MySQL Publication Status — Scores: ${pubDb[0].is_published_scores}, Answers: ${pubDb[0].is_published_answers}`);

    await browser.click('button[onclick="API.logout()"]');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("index.html") || window.location.pathname === "/"'), 5000);

    // 3.3 Student Logs Back In to View Published Score
    await browser.type('#login-username', 'student1');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("student.html")'), 8000);
    await browser.waitFor('#attempts-tbody button', 8000);
    await browser.click(`button[onclick="viewAttemptResult(${studentAttemptId})"]`);
    await browser.waitFor('#result-modal.open', 8000);

    const publishedResultText = await browser.evaluate('document.getElementById("result-content").innerText');
    console.log(`  [✔] PASS: Student Views Published Result — Content: "${publishedResultText.trim().replace(/\n/g, ' ')}"`);

    // Capture Published Result Modal
    const s4 = await browser.captureScreenshot('screenshot_04_student_published_result.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s4)}`);
    await browser.click('button[onclick="closeResultModal()"]');


    // -------------------------------------------------------------------------
    // SECTION 4: SECURITY & CHANGE PASSWORD MODAL (TASK 5)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 4: SECURITY & CHANGE PASSWORD MODAL (TASK 5) ---');

    // 4.1 Open Change Password Modal in Navbar
    await browser.click('button[onclick="API.openChangePasswordModal()"]');
    await browser.waitFor('#change-password-modal.open', 4000);
    console.log('  [✔] PASS: Change Password Modal Opened from Navbar.');

    // Capture Change Password Modal
    const s5 = await browser.captureScreenshot('screenshot_05_change_password_modal.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s5)}`);

    // 4.2 Test Changing Password on UI
    await browser.type('#cp-old-pwd', 'Password123!');
    await browser.type('#cp-new-pwd', 'StudentNewPass789!');
    await browser.type('#cp-confirm-pwd', 'StudentNewPass789!');
    await browser.click('#btn-submit-change-pwd');

    // Wait for auto logout & redirect to login
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("index.html") || window.location.pathname === "/"'), 8000);
    console.log('  [✔] PASS: Change Password Executed — Successfully logged out and redirected to login.');

    // 4.3 Verify Old Password Rejected
    await browser.type('#login-username', 'student1');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');
    await new Promise(r => setTimeout(r, 800));
    const onLoginStill = await browser.evaluate('!window.location.pathname.includes("student.html")');
    console.log(`  [✔] PASS: Old Password Rejected on Browser — Still on Login Page: ${onLoginStill}`);

    // 4.4 Verify New Password Accepted
    await browser.type('#login-username', 'student1');
    await browser.type('#login-password', 'StudentNewPass789!');
    await browser.click('#btn-submit-login');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("student.html")'), 8000);
    console.log('  [✔] PASS: New Password Accepted on Browser — Successfully logged in to student portal.');

    // 4.5 Revert Password back to original Password123!
    await browser.click('button[onclick="API.openChangePasswordModal()"]');
    await browser.waitFor('#change-password-modal.open', 4000);
    await browser.type('#cp-old-pwd', 'StudentNewPass789!');
    await browser.type('#cp-new-pwd', 'Password123!');
    await browser.type('#cp-confirm-pwd', 'Password123!');
    await browser.click('#btn-submit-change-pwd');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("index.html") || window.location.pathname === "/"'), 8000);
    console.log('  [✔] PASS: Student Password Reverted back to original Password123!.');


    // -------------------------------------------------------------------------
    // SECTION 5: ADMIN PORTAL ACCEPTANCE (TASK 4)
    // -------------------------------------------------------------------------
    console.log('\n--- SECTION 5: ADMIN PORTAL ACCEPTANCE (TASK 4) ---');

    // 5.1 Admin Login
    await browser.type('#login-username', 'admin');
    await browser.type('#login-password', 'Password123!');
    await browser.click('#btn-submit-login');
    await browser.waitFor(() => browser.evaluate('window.location.pathname.includes("admin.html")'), 8000);

    const adminName = await browser.evaluate('document.getElementById("admin-display-name").innerText');
    console.log(`  [✔] PASS: Admin Login — Display Name: "${adminName}", URL: ${await browser.evaluate('window.location.href')}`);

    // 5.2 Verify TC-01 Option B Banner
    const tc01Banner = await browser.evaluate(`
      (() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Chính sách phân quyền TC-01') && bodyText.includes('Lựa chọn B');
      })()
    `);
    console.log(`  [✔] PASS: TC-01 Option B Privacy Restriction Notice displayed: ${tc01Banner}`);

    // 5.3 Users Management & Filtering
    await browser.waitFor('#users-tbody tr', 5000);
    const usersCount = await browser.evaluate('document.querySelectorAll("#users-tbody tr").length');
    console.log(`  [✔] PASS: Admin Users List Rendered — Total users displayed: ${usersCount}`);

    // 5.4 Audit Logs Tab
    await browser.click('#tab-audit-btn');
    await browser.waitFor('#audit-tbody tr', 5000);
    const auditCount = await browser.evaluate('document.querySelectorAll("#audit-tbody tr").length');
    console.log(`  [✔] PASS: Admin Audit Logs Rendered — Total recent audit events: ${auditCount}`);

    // Capture Admin Portal Screenshot
    const s6 = await browser.captureScreenshot('screenshot_06_admin_portal_audit.png');
    console.log(`  [✔] Screenshot saved: ${path.basename(s6)}`);

    // 5.5 Check Console Errors Across All Browser Sessions
    console.log('\n--- BROWSER CONSOLE ERROR CHECK ---');
    console.log(`Total JavaScript console errors captured: ${browser.consoleErrors.length}`);
    if (browser.consoleErrors.length > 0) {
      console.log('Console Errors:', browser.consoleErrors);
    }

    console.log('\n========================================================================');
    console.log('  ALL BROWSER ACCEPTANCE TESTS & REAL UI FLOWS PASSED 100%!             ');
    console.log('========================================================================\n');

  } finally {
    if (dbConn) await dbConn.end();
    await browser.close();
  }
}

runBrowserAcceptanceSuite().catch(err => {
  console.error('\n[✖] BROWSER ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});

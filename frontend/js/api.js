/**
 * QuizSystem API Client & Helper Utilities
 */
const API_BASE = '/api';

const API = {
  getToken() {
    return localStorage.getItem('quiz_token');
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('quiz_token', token);
    } else {
      localStorage.removeItem('quiz_token');
    }
  },

  getUser() {
    const raw = localStorage.getItem('quiz_user');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem('quiz_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('quiz_user');
    }
  },

  async request(path, options = {}) {
    const headers = options.headers || {};
    const token = this.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    options.headers = headers;

    try {
      const response = await fetch(`${API_BASE}${path}`, options);
      
      // If unauthorized, redirect to login
      if (response.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
        this.setToken(null);
        this.setUser(null);
        window.location.href = '/index.html';
        return null;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP error ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`[API Error: ${path}]`, error.message);
      throw error;
    }
  },

  get(path, headers = {}) {
    return this.request(path, { method: 'GET', headers });
  },

  post(path, body, headers = {}) {
    return this.request(path, { method: 'POST', body, headers });
  },

  put(path, body, headers = {}) {
    return this.request(path, { method: 'PUT', body, headers });
  },

  patch(path, body, headers = {}) {
    return this.request(path, { method: 'PATCH', body, headers });
  },

  delete(path, headers = {}) {
    return this.request(path, { method: 'DELETE', headers });
  },

  logout() {
    this.post('/auth/logout').finally(() => {
      this.setToken(null);
      this.setUser(null);
      window.location.href = '/index.html';
    });
  },

  changePassword(oldPassword, newPassword) {
    return this.post('/auth/change-password', { oldPassword, newPassword });
  },

  openChangePasswordModal() {
    let modal = document.getElementById('change-password-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'change-password-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 440px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <h3 style="font-size: 1.2rem; font-weight: 700;">Đổi Mật Khẩu</h3>
            <button class="btn btn-secondary btn-sm" onclick="API.closeChangePasswordModal()">×</button>
          </div>
          <form id="change-password-form" onsubmit="API.handleChangePasswordSubmit(event)">
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label" for="cp-old-pwd" style="display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.35rem;">Mật khẩu hiện tại</label>
              <input type="password" id="cp-old-pwd" class="form-control" required placeholder="Nhập mật khẩu hiện tại" style="width: 100%;">
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label" for="cp-new-pwd" style="display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.35rem;">Mật khẩu mới (tối thiểu 6 ký tự)</label>
              <input type="password" id="cp-new-pwd" class="form-control" required minlength="6" placeholder="Nhập mật khẩu mới" style="width: 100%;">
            </div>
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label class="form-label" for="cp-confirm-pwd" style="display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.35rem;">Xác nhận mật khẩu mới</label>
              <input type="password" id="cp-confirm-pwd" class="form-control" required minlength="6" placeholder="Nhập lại mật khẩu mới" style="width: 100%;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
              <button type="button" class="btn btn-secondary" onclick="API.closeChangePasswordModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" id="btn-submit-change-pwd">Đổi Mật Khẩu</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(modal);
    }
    document.getElementById('cp-old-pwd').value = '';
    document.getElementById('cp-new-pwd').value = '';
    document.getElementById('cp-confirm-pwd').value = '';
    modal.classList.add('open');
  },

  closeChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (modal) modal.classList.remove('open');
  },

  async handleChangePasswordSubmit(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('cp-old-pwd').value;
    const newPassword = document.getElementById('cp-new-pwd').value;
    const confirmPassword = document.getElementById('cp-confirm-pwd').value;

    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu mới và xác nhận mật khẩu không khớp', 'error');
      return;
    }

    if (newPassword === oldPassword) {
      showToast('Mật khẩu mới phải khác mật khẩu cũ', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-change-pwd');
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';

    try {
      const res = await this.changePassword(oldPassword, newPassword);
      showToast(res.message || 'Đổi mật khẩu thành công! Vui lòng đăng nhập lại.', 'success');
      this.closeChangePasswordModal();
      setTimeout(() => {
        this.logout();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Đổi Mật Khẩu';
    }
  }
};

/**
 * Global Toast Notification Helper (Top-Right Placement)
 */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Luôn ép vị trí góc trên bên phải trực tiếp trên container để tránh lỗi cache CSS
  container.style.setProperty('position', 'fixed', 'important');
  container.style.setProperty('top', '1.25rem', 'important');
  container.style.setProperty('right', '1.5rem', 'important');
  container.style.setProperty('bottom', 'auto', 'important');
  container.style.setProperty('left', 'auto', 'important');
  container.style.setProperty('z-index', '999999', 'important');
  container.style.setProperty('display', 'flex', 'important');
  container.style.setProperty('flex-direction', 'column', 'important');
  container.style.setProperty('gap', '0.65rem', 'important');
  container.style.setProperty('pointer-events', 'none', 'important');
  container.style.setProperty('max-width', '420px', 'important');

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // SVG Icon
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  if (type === 'success') {
    iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === 'warning') {
    iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Đóng thông báo';

  function dismiss() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  }

  closeBtn.onclick = dismiss;

  toast.appendChild(iconSpan);
  toast.appendChild(msgSpan);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) dismiss();
  }, 4000);
}

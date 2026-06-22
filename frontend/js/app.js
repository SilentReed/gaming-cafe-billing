const API_BASE = '/api/v1';

const api = {
    async request(method, path, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const token = localStorage.getItem('token');
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${path}`, opts);
        if (res.status === 401) {
            localStorage.removeItem('token');
            showLogin();
            return null;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || '请求失败');
        }
        return res.json();
    },
    get(path) { return this.request('GET', path); },
    post(path, body) { return this.request('POST', path, body); },
    put(path, body) { return this.request('PUT', path, body); },
    delete(path) { return this.request('DELETE', path); },
};

const pageTitles = {
    dashboard: '计费大厅',
    members: '会员管理',
    bills: '账单记录',
    reports: '报表统计',
    logs: '操作记录',
    settings: '主机设置',
};

const statusLabels = { idle: '空闲', in_use: '使用中', active: '使用中', paused: '暂停中', maintenance: '维护', offline: '离线' };
const tierLabels = { basic: '普通会员', silver: '银卡会员', gold: '金卡会员', diamond: '钻石会员' };
const tierColors = { basic: 'info', silver: 'success', gold: 'warning', diamond: 'purple' };
const billingModeLabels = { count_up: '正计时', countdown: '倒计时' };

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}时${m}分${s}秒`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return h > 0 ? `${h}时${m}分` : `${m}分`;
}

function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('zh-CN');
}

function showModal(title, bodyHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

const pages = {};

function registerPage(name, renderFn) {
    pages[name] = renderFn;
}

function navigateTo(page) {
    const container = document.getElementById('page-container');
    const titleEl = document.getElementById('page-title');

    if (container._cleanup) {
        container._cleanup();
        container._cleanup = null;
    }

    document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#/${page}`);
    });

    if (titleEl) titleEl.textContent = pageTitles[page] || '';

    if (pages[page]) {
        pages[page](container);
    } else {
        container.innerHTML = '<div class="empty-state"><p>页面不存在</p></div>';
    }
}

function showLogin() {
    const container = document.getElementById('page-container');
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.style.display = 'none';
    container.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <div class="logo-center">
                    <div class="icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="2" y="6" width="20" height="12" rx="2"/>
                            <circle cx="8" cy="12" r="2"/>
                            <circle cx="16" cy="12" r="2"/>
                        </svg>
                    </div>
                    <h2>主机计费系统</h2>
                    <p class="subtitle">Gaming Console Billing System</p>
                </div>
                <div class="form-group">
                    <label>用户名</label>
                    <input id="login-user" value="admin" placeholder="请输入用户名">
                </div>
                <div class="form-group">
                    <label>密码</label>
                    <input id="login-pass" type="password" value="admin123" placeholder="请输入密码">
                </div>
                <button class="btn-primary" onclick="doLogin()">登 录</button>
            </div>
        </div>
    `;
}

async function doLogin() {
    const username = document.getElementById('login-user').value;
    const password = document.getElementById('login-pass').value;
    try {
        const res = await api.post('/auth/login', { username, password });
        localStorage.setItem('token', res.access_token);
        const topbar = document.getElementById('topbar');
        if (topbar) topbar.style.display = 'flex';
        navigateTo('dashboard');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function loadUserInfo() {
    try {
        const user = await api.get('/auth/me');
        const el = document.getElementById('user-info');
        if (el && user) el.textContent = `${user.name} (${user.role === 'admin' ? '管理员' : '员工'})`;
    } catch (e) {}
}

window.addEventListener('hashchange', () => {
    const page = location.hash.slice(2) || 'dashboard';
    navigateTo(page);
});

window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        loadUserInfo();
        const page = location.hash.slice(2) || 'dashboard';
        navigateTo(page);
    } else {
        showLogin();
    }
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
});

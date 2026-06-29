// Auto-detect base path (supports /cafe/ prefix)
const _basePath = location.pathname.startsWith('/cafe/') ? '/cafe' : '';
const API_BASE = _basePath + '/api/v1';

let currentUser = null;

const api = {
    async request(method, path, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        const token = localStorage.getItem('token');
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        // Admin merchant switcher: add merchant_id header
        const activeMerchant = localStorage.getItem('active_merchant_id');
        if (activeMerchant) opts.headers['X-Merchant-Id'] = activeMerchant;
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
    platform: '平台概览',
    'platform-overview': '平台概览',
    'platform-config': '系统配置',
    cashier: '收银台',
    dashboard: '计费大厅',
    members: '会员管理',
    bills: '账单记录',
    reports: '报表统计',
    logs: '操作记录',
    merchants: '商户管理',
    'merchant-features': '功能配置',
    'all-staff': '员工总览',
    accounts: '账户管理',
    settings: '主机设置',
    shifts: '交班管理',
    packages: '时段套餐',
    staff: '员工管理',
    products: '餐饮商品',
    orders: '订单管理',
    reservations: '预约管理',
    sessions: '活跃会话',
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

// Helper function for API requests (used by page modules)
async function apiRequest(path, method = 'GET', body = null) {
    if (method === 'GET') {
        return api.get(path);
    } else if (method === 'POST') {
        return api.post(path, body);
    } else if (method === 'PUT') {
        return api.put(path, body);
    } else if (method === 'DELETE') {
        return api.delete(path);
    }
    throw new Error(`Unsupported method: ${method}`);
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
    const app = document.getElementById('app');
    const loginPage = document.getElementById('login-page');
    if (app) app.style.display = 'none';
    if (loginPage) loginPage.classList.remove('hidden');
}

function hideLogin() {
    const app = document.getElementById('app');
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.classList.add('hidden');
    if (app) app.style.display = '';
}

async function doLogin() {
    const username = document.getElementById('login-user').value;
    const password = document.getElementById('login-pass').value;
    try {
        const res = await api.post('/auth/login', { username, password });
        localStorage.setItem('token', res.access_token);
        localStorage.setItem('role', res.role);
        localStorage.setItem('merchant_id', res.merchant_id || '');
        localStorage.setItem('username', res.username);
        hideLogin();
        await loadUserInfo();
        
        // 检查商户是否过期
        if (res.merchant_expired) {
            showExpiredModal();
            return;
        }
        
        // Navigate based on role
        if (res.role === 'admin') {
            navigateTo('platform-overview');
        } else {
            navigateTo('cashier');
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// 显示授权过期弹窗
function showExpiredModal() {
    const modal = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    
    modalTitle.textContent = '⚠️ 授权已过期';
    modalBody.innerHTML = `
        <div style="text-align:center;padding:20px 0;">
            <div style="font-size:48px;margin-bottom:16px;">⏰</div>
            <h3 style="margin-bottom:12px;color:var(--danger);">商户授权已过期</h3>
            <p style="color:var(--text-secondary);margin-bottom:24px;">
                您的商户授权已到期，所有功能已暂停使用。<br>
                请联系平台管理员续费以恢复服务。
            </p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="btn-primary" onclick="doLogout()">退出登录</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}

async function loadUserInfo() {
    try {
        const user = await api.get('/auth/me');
        currentUser = user;
        
        const roleMap = { admin: '超管', merchant: '商户', staff: '员工' };
        const roleText = roleMap[user.role] || user.role;
        
        // 侧边栏用户信息
        const el = document.getElementById('user-info');
        if (el && user) {
            el.textContent = `${user.name} (${roleText})`;
        }
        
        // 顶栏用户菜单信息
        const menuInfo = document.getElementById('user-menu-info');
        if (menuInfo && user) {
            menuInfo.innerHTML = `
                <div>${user.name}</div>
                <div class="role">${roleText}</div>
            `;
        }
        
        const role = user.role || localStorage.getItem('role');
        
        // Platform section: admin only
        document.querySelectorAll('.nav-platform').forEach(el => {
            el.style.display = role === 'admin' ? '' : 'none';
        });
        
        // Shop section: non-admin only
        document.querySelectorAll('.nav-shop').forEach(el => {
            el.style.display = role !== 'admin' ? '' : 'none';
        });
        
        // Admin-only items
        document.querySelectorAll('.nav-admin').forEach(el => {
            el.style.display = role === 'admin' ? '' : 'none';
        });
        
        // Merchant+admin items
        document.querySelectorAll('.nav-merchant').forEach(el => {
            el.style.display = (role === 'admin' || role === 'merchant') ? '' : 'none';
        });
        
        document.querySelectorAll('.nav-staff-hide').forEach(el => {
            el.style.display = role === 'staff' ? 'none' : '';
        });
        
        // Load merchant switcher for admin
        if (role === 'admin') {
            loadMerchantSwitcher();
        }
    } catch (e) {
        console.error('Failed to load user info:', e);
    }
}

// Merchant switcher for admin
async function loadMerchantSwitcher() {
    const role = localStorage.getItem('role');
    const switcher = document.getElementById('merchant-switcher');
    if (!switcher) return;
    if (role !== 'admin') {
        switcher.style.display = 'none';
        return;
    }
    switcher.style.display = 'block';
    try {
        const merchants = await api.get('/merchants');
        const select = document.getElementById('active-merchant');
        if (!select || !merchants) return;
        const current = localStorage.getItem('active_merchant_id') || '';
        select.innerHTML = '<option value="">全部商户</option>' +
            merchants.filter(m => m.is_active).map(m =>
                `<option value="${m.id}" ${current == m.id ? 'selected' : ''}>${m.name}</option>`
            ).join('');
    } catch (e) {}
}

window.switchMerchant = function(merchantId) {
    if (merchantId) {
        localStorage.setItem('active_merchant_id', merchantId);
    } else {
        localStorage.removeItem('active_merchant_id');
    }
    // Reload current page
    const page = location.hash.slice(2) || 'dashboard';
    navigateTo(page);
};

window.doLogout = async function() {
    try {
        await api.post('/auth/logout', {});
    } catch (e) {}
    // Clear all stored data
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('merchant_id');
    localStorage.removeItem('username');
    localStorage.removeItem('active_merchant_id');
    currentUser = null;
    // Close WebSocket connections
    if (window._dashboardWS) { window._dashboardWS.close(); window._dashboardWS = null; }
    showLogin();
    showToast('已安全退出');
};

// 用户菜单切换
window.toggleUserMenu = function() {
    const dropdown = document.getElementById('user-menu-dropdown');
    dropdown.classList.toggle('hidden');
};

// 点击外部关闭菜单
document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    const dropdown = document.getElementById('user-menu-dropdown');
    if (menu && dropdown && !menu.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

window.addEventListener('hashchange', () => {
    const page = location.hash.slice(2) || 'dashboard';
    navigateTo(page);
});

window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app').style.display = '';
        loadUserInfo().then(() => {
            const page = location.hash.slice(2);
            if (page) {
                navigateTo(page);
            } else {
                // Default page based on role
                const role = localStorage.getItem('role');
                if (role === 'admin') {
                    navigateTo('platform-overview');
                } else {
                    navigateTo('cashier');
                }
            }
        });
    } else {
        showLogin();
    }

    document.getElementById('login-pass').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    document.getElementById('login-user').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('login-pass').focus();
    });
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
});

// ==================== 平台管理页面 ====================

// 平台概览页面
registerPage('platform-overview', async function(container) {
    container.innerHTML = '<div class="loading">加载中...</div>';
    try {
        const merchants = await api.get('/merchants');
        const users = await api.get('/auth/users');
        
        container.innerHTML = `
            <div class="page-header">
                <h2>📊 平台概览</h2>
            </div>
            <div class="stats-bar">
                <div class="stat-card">
                    <div class="stat-value">${merchants.length}</div>
                    <div class="stat-label">商户总数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${merchants.filter(m => m.is_active).length}</div>
                    <div class="stat-label">营业中</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${users.length}</div>
                    <div class="stat-label">用户总数</div>
                </div>
            </div>
            <div class="table-container">
                <h3>商户列表</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>商户名称</th>
                            <th>联系人</th>
                            <th>电话</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${merchants.map(m => `
                            <tr>
                                <td>${m.name}</td>
                                <td>${m.contact || m.contact_name || '-'}</td>
                                <td>${m.phone || '-'}</td>
                                <td><span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">${m.is_active ? '营业中' : '已停业'}</span></td>
                                <td>
                                    <button class="btn btn-sm" onclick="navigateTo('merchants')">管理</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
    }
});

// 商户管理页面

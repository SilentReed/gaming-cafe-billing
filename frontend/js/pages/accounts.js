registerPage('accounts', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">账户管理</h2>
                <p class="section-subtitle">管理系统用户账户</p>
            </div>
            <div class="actions">
                <button class="btn-primary" onclick="showNewUser()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增账户
                </button>
            </div>
        </div>
        <div class="table-wrapper">
            <div id="accounts-table"></div>
        </div>
    `;

    const roleLabels = { admin: '超管', merchant: '商户', staff: '员工' };
    const roleBadge = { admin: 'danger', merchant: 'warning', staff: 'info' };

    async function load() {
        const users = await api.get('/auth/users');
        const tableEl = document.getElementById('accounts-table');
        if (!users || !tableEl) return;
        if (users.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无账户</p></div>';
            return;
        }
        const rows = users.map(u => [
            `<span style="font-weight:600;">#${u.id}</span>`,
            `<span style="font-weight:500;">${u.username}</span>`,
            u.name,
            `<span class="badge badge-${roleBadge[u.role] || 'info'}">${roleLabels[u.role] || u.role}</span>`,
            `<span class="badge badge-${u.is_active ? 'success' : 'warning'}">${u.is_active ? '启用' : '禁用'}</span>`,
            `<div class="btn-group">
                <button class="btn-sm btn-secondary" onclick="editUser(${u.id}, '${u.name}', '${u.role}', ${u.is_active})">编辑</button>
                <button class="btn-sm btn-secondary" onclick="resetUserPassword(${u.id}, '${u.username}')">改密</button>
                <button class="btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">删除</button>
            </div>`,
        ]);
        renderTable(['ID', '用户名', '姓名', '角色', '状态', '操作'], rows, tableEl);
    }

    await load();
    window._reloadAccounts = load;
});

window.showNewUser = function() {
    const currentRole = localStorage.getItem('role');
    const roleOpts = currentRole === 'admin'
        ? '<option value="staff">员工</option><option value="merchant">商户</option><option value="admin">超管</option>'
        : '<option value="staff">员工</option>';
    showModal('新增账户', `
        <div class="form-group">
            <label>用户名</label>
            <input id="nu-username" placeholder="登录用户名">
        </div>
        <div class="form-group">
            <label>姓名</label>
            <input id="nu-name" placeholder="显示名称">
        </div>
        <div class="form-group">
            <label>密码</label>
            <input id="nu-password" type="password" placeholder="登录密码">
        </div>
        <div class="form-group">
            <label>角色</label>
            <select id="nu-role">
                ${roleOpts}
            </select>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewUser()">创建账户</button>
    `);
};

window.doNewUser = async function() {
    try {
        await api.post('/auth/users', {
            username: document.getElementById('nu-username').value,
            name: document.getElementById('nu-name').value,
            password: document.getElementById('nu-password').value,
            role: document.getElementById('nu-role').value,
        });
        closeModal();
        showToast('账户创建成功');
        if (window._reloadAccounts) window._reloadAccounts();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.editUser = function(id, name, role, isActive) {
    const currentRole = localStorage.getItem('role');
    const roleOpts = currentRole === 'admin'
        ? `<option value="staff" ${role === 'staff' ? 'selected' : ''}>员工</option><option value="merchant" ${role === 'merchant' ? 'selected' : ''}>商户</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>超管</option>`
        : `<option value="staff" ${role === 'staff' ? 'selected' : ''}>员工</option>`;
    showModal('编辑账户', `
        <div class="form-group">
            <label>姓名</label>
            <input id="eu-name" value="${name}">
        </div>
        <div class="form-group">
            <label>角色</label>
            <select id="eu-role">
                ${roleOpts}
            </select>
        </div>
        <div class="form-group">
            <label>状态</label>
            <select id="eu-active">
                <option value="true" ${isActive ? 'selected' : ''}>启用</option>
                <option value="false" ${!isActive ? 'selected' : ''}>禁用</option>
            </select>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditUser(${id})">保存</button>
    `);
};

window.doEditUser = async function(id) {
    try {
        await api.put(`/auth/users/${id}`, {
            name: document.getElementById('eu-name').value,
            role: document.getElementById('eu-role').value,
            is_active: document.getElementById('eu-active').value === 'true',
        });
        closeModal();
        showToast('已更新');
        if (window._reloadAccounts) window._reloadAccounts();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.resetUserPassword = function(id, username) {
    showModal('重置密码', `
        <div class="form-group">
            <label>${username} 的新密码</label>
            <input id="rp-pass" type="password" placeholder="输入新密码">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doResetPassword(${id})">确认重置</button>
    `);
};

window.doResetPassword = async function(id) {
    try {
        const pass = document.getElementById('rp-pass').value;
        if (!pass) { showToast('请输入密码', 'error'); return; }
        await api.put(`/auth/users/${id}`, { password: pass });
        closeModal();
        showToast('密码已重置');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deleteUser = async function(id, username) {
    if (!confirm(`确认删除账户 ${username}？`)) return;
    try {
        await api.delete(`/auth/users/${id}`);
        showToast('账户已删除');
        if (window._reloadAccounts) window._reloadAccounts();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

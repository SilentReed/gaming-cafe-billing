/**
 * 员工管理页面（商户管理员专用）
 */
registerPage('staff', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">员工管理</h2>
                <p class="section-subtitle">管理本店员工账户</p>
            </div>
            <div class="actions">
                <button class="btn-primary" onclick="showNewStaff()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增员工
                </button>
            </div>
        </div>
        <div class="stats-bar" id="staff-stats"></div>
        <div class="table-wrapper">
            <div id="staff-table"></div>
        </div>
    `;

    async function load() {
        const staff = await api.get('/staff');
        
        // 统计
        const statsEl = document.getElementById('staff-stats');
        const admins = staff.filter(s => s.role === 'merchant').length;
        const employees = staff.filter(s => s.role === 'staff').length;
        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${staff.length}</div>
                <div class="stat-label">员工总数</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${admins}</div>
                <div class="stat-label">管理员</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${employees}</div>
                <div class="stat-label">普通员工</div>
            </div>
        `;
        
        // 表格
        const tableEl = document.getElementById('staff-table');
        if (!staff || staff.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无员工</p></div>';
            return;
        }
        const roleLabels = { merchant: '商户管理员', staff: '员工' };
        const roleBadges = { merchant: 'primary', staff: 'info' };
        const rows = staff.map(u => [
            `<span style="font-weight:500;">${u.username}</span>`,
            u.display_name || u.name || '-',
            `<span class="badge badge-${roleBadges[u.role] || 'info'}">${roleLabels[u.role] || u.role}</span>`,
            u.phone || '-',
            u.last_login ? new Date(u.last_login).toLocaleString('zh-CN') : '未登录',
            `<div class="btn-group">
                <button class="btn-sm btn-secondary" onclick="editStaff(${u.id}, '${u.username}', '${u.display_name || u.name || ''}', '${u.role}', '${u.phone || ''}')">编辑</button>
                <button class="btn-sm btn-secondary" onclick="resetStaffPassword(${u.id}, '${u.username}')">重置密码</button>
                ${u.role === 'staff' ? `<button class="btn-sm btn-danger" onclick="deleteStaff(${u.id}, '${u.username}')">删除</button>` : ''}
            </div>`,
        ]);
        renderTable(['用户名', '姓名', '角色', '手机', '最后登录', '操作'], rows, tableEl);
    }

    await load();
    window.loadStaff = load;
});

// ==================== 员工账户操作 ====================

window.showNewStaff = function() {
    showModal('新增员工', `
        <div class="form-group"><label>用户名 *</label><input id="ns-username" placeholder="登录用户名"></div>
        <div class="form-group"><label>密码 *</label><input id="ns-password" type="password" placeholder="登录密码"></div>
        <div class="form-group"><label>姓名 *</label><input id="ns-name" placeholder="员工姓名"></div>
        <div class="form-row">
            <div class="form-group"><label>角色</label>
                <select id="ns-role">
                    <option value="staff">员工</option>
                    <option value="merchant">管理员</option>
                </select>
            </div>
            <div class="form-group"><label>手机</label><input id="ns-phone" placeholder="联系电话"></div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewStaff()">创建</button>
    `);
};

window.doNewStaff = async function() {
    const username = document.getElementById('ns-username').value.trim();
    const password = document.getElementById('ns-password').value;
    const name = document.getElementById('ns-name').value.trim();
    if (!username || !password || !name) { showToast('请填写必填项', 'error'); return; }
    try {
        await api.post('/staff', {
            username,
            password,
            display_name: name,
            role: document.getElementById('ns-role').value,
            phone: document.getElementById('ns-phone').value || null,
        });
        closeModal();
        showToast('员工创建成功');
        loadStaff();
    } catch (e) { showToast(e.message, 'error'); }
};

window.editStaff = function(id, username, name, role, phone) {
    showModal(`编辑员工 — ${username}`, `
        <div class="form-group"><label>用户名</label><input value="${username}" disabled></div>
        <div class="form-group"><label>姓名</label><input id="es-name" value="${name}"></div>
        <div class="form-row">
            <div class="form-group"><label>角色</label>
                <select id="es-role">
                    <option value="staff" ${role === 'staff' ? 'selected' : ''}>员工</option>
                    <option value="merchant" ${role === 'merchant' ? 'selected' : ''}>管理员</option>
                </select>
            </div>
            <div class="form-group"><label>手机</label><input id="es-phone" value="${phone}"></div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditStaff(${id})">保存</button>
    `);
};

window.doEditStaff = async function(id) {
    try {
        await api.put(`/staff/${id}`, {
            display_name: document.getElementById('es-name').value,
            role: document.getElementById('es-role').value,
            phone: document.getElementById('es-phone').value || null,
        });
        closeModal();
        showToast('员工信息已更新');
        loadStaff();
    } catch (e) { showToast(e.message, 'error'); }
};

window.resetStaffPassword = function(id, username) {
    showModal(`重置密码 — ${username}`, `
        <div class="form-group"><label>新密码 *</label><input id="rsp-password" type="password" placeholder="输入新密码"></div>
        <div class="form-group"><label>确认密码 *</label><input id="rsp-password2" type="password" placeholder="再次输入新密码"></div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doResetStaffPassword(${id})">重置</button>
    `);
};

window.doResetStaffPassword = async function(id) {
    const password = document.getElementById('rsp-password').value;
    const password2 = document.getElementById('rsp-password2').value;
    if (!password) { showToast('请输入新密码', 'error'); return; }
    if (password !== password2) { showToast('两次密码不一致', 'error'); return; }
    try {
        await api.put(`/staff/${id}`, { password });
        closeModal();
        showToast('密码已重置');
    } catch (e) { showToast(e.message, 'error'); }
};

window.deleteStaff = async function(id, username) {
    if (!confirm(`确认删除员工 "${username}"？`)) return;
    try {
        await api.delete(`/staff/${id}`);
        showToast('员工已删除');
        loadStaff();
    } catch (e) { showToast(e.message, 'error'); }
};

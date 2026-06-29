registerPage('merchants', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">商户管理</h2>
                <p class="section-subtitle">管理商户账户和授权期限</p>
            </div>
            <div class="actions">
                <button class="btn-primary" onclick="showNewMerchant()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增商户
                </button>
            </div>
        </div>
        <div id="merchants-list"></div>
    `;

    async function load() {
        const merchants = await api.get('/merchants');
        const listEl = document.getElementById('merchants-list');
        if (!merchants || merchants.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><p>暂无商户</p></div>';
            return;
        }
        
        let html = '';
        for (const m of merchants) {
            // 获取商户管理员账户
            let adminAccount = null;
            try {
                const users = await api.get(`/merchants/${m.id}/users`);
                adminAccount = users.find(u => u.role === 'merchant');
            } catch (e) {}
            
            // 授权状态
            const isExpired = m.is_expired;
            const expiresAt = m.expires_at ? new Date(m.expires_at).toLocaleDateString('zh-CN') : '永久';
            const statusBadge = isExpired 
                ? '<span class="badge badge-danger">已过期</span>'
                : (m.expires_at 
                    ? `<span class="badge badge-success">有效至 ${expiresAt}</span>`
                    : '<span class="badge badge-info">永久授权</span>');
            
            html += `
                <div class="merchant-card" style="margin-bottom:16px;${isExpired ? 'border-color:var(--danger);' : ''}">
                    <div class="merchant-card-header">
                        <div>
                            <h3 style="margin:0;">${m.name}</h3>
                            <div style="display:flex;gap:8px;margin-top:4px;">
                                ${m.is_active ? '<span class="badge badge-success">营业中</span>' : '<span class="badge badge-warning">已停业</span>'}
                                ${statusBadge}
                            </div>
                        </div>
                        <div class="btn-group">
                            <button class="btn-sm btn-secondary" onclick="editMerchant(${m.id}, '${m.name}', '${m.contact || ''}', '${m.phone || ''}', '${m.address || ''}')">编辑</button>
                            <button class="btn-sm btn-secondary" onclick="showSetExpiry(${m.id}, '${m.name}', '${m.expires_at || ''}')">设置期限</button>
                            <button class="btn-sm btn-danger" onclick="deleteMerchant(${m.id}, '${m.name}')">禁用</button>
                        </div>
                    </div>
                    <div class="merchant-card-body" style="padding:16px;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                            <div><span style="color:var(--text-muted);">联系人：</span>${m.contact || '-'}</div>
                            <div><span style="color:var(--text-muted);">电话：</span>${m.phone || '-'}</div>
                            <div><span style="color:var(--text-muted);">地址：</span>${m.address || '-'}</div>
                            <div><span style="color:var(--text-muted);">员工数：</span>${m.user_count} 人</div>
                        </div>
                        
                        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">
                            <h4 style="margin-bottom:12px;font-size:14px;">商户登录账户</h4>
                            ${adminAccount ? `
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:center;">
                                    <div><span style="color:var(--text-muted);">用户名：</span><strong>${adminAccount.username}</strong></div>
                                    <div><span style="color:var(--text-muted);">姓名：</span>${adminAccount.name}</div>
                                    <div class="btn-group">
                                        <button class="btn-sm btn-secondary" onclick="resetMerchantPassword(${m.id}, '${m.name}', ${adminAccount.id}, '${adminAccount.username}')">重置密码</button>
                                        <button class="btn-sm btn-secondary" onclick="showMerchantAccounts(${m.id}, '${m.name}')">管理账户</button>
                                    </div>
                                </div>
                            ` : `
                                <div style="color:var(--text-muted);">未设置管理员账户</div>
                                <button class="btn-sm btn-primary" style="margin-top:8px;" onclick="showCreateMerchantAdmin(${m.id}, '${m.name}')">创建管理员账户</button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }
        listEl.innerHTML = html;
    }

    await load();
    window.loadMerchants = load;
});

// ==================== 商户基本操作 ====================

window.showNewMerchant = function() {
    showModal('新增商户', `
        <div class="form-group"><label>商户名称 *</label><input id="mch-name" placeholder="如：ABC游戏馆"></div>
        <div class="form-row">
            <div class="form-group"><label>联系人</label><input id="mch-contact" placeholder="联系人姓名"></div>
            <div class="form-group"><label>联系电话</label><input id="mch-phone" placeholder="联系电话"></div>
        </div>
        <div class="form-group"><label>地址</label><input id="mch-address" placeholder="商户地址"></div>
        <hr style="border-color:var(--border);margin:16px 0;">
        <h4 style="margin-bottom:12px;">商户登录账户</h4>
        <div class="form-row">
            <div class="form-group"><label>用户名 *</label><input id="mch-username" placeholder="登录用户名"></div>
            <div class="form-group"><label>密码 *</label><input id="mch-password" type="password" placeholder="登录密码"></div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewMerchant()">创建</button>
    `);
};

window.doNewMerchant = async function() {
    const name = document.getElementById('mch-name').value.trim();
    const username = document.getElementById('mch-username').value.trim();
    const password = document.getElementById('mch-password').value;
    if (!name) { showToast('请输入商户名称', 'error'); return; }
    if (!username || !password) { showToast('请设置商户登录账户', 'error'); return; }
    try {
        const merchant = await api.post('/merchants', {
            name,
            contact: document.getElementById('mch-contact').value,
            phone: document.getElementById('mch-phone').value,
            address: document.getElementById('mch-address').value,
        });
        await api.post(`/merchants/${merchant.id}/users`, {
            username,
            password,
            name: name + '管理员',
            role: 'merchant',
        });
        closeModal();
        showToast('商户创建成功');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

window.editMerchant = function(id, name, contact, phone, address) {
    showModal(`编辑商户 — ${name}`, `
        <div class="form-group"><label>商户名称</label><input id="em-name" value="${name}"></div>
        <div class="form-row">
            <div class="form-group"><label>联系人</label><input id="em-contact" value="${contact}"></div>
            <div class="form-group"><label>联系电话</label><input id="em-phone" value="${phone}"></div>
        </div>
        <div class="form-group"><label>地址</label><input id="em-address" value="${address}"></div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditMerchant(${id})">保存</button>
    `);
};

window.doEditMerchant = async function(id) {
    try {
        await api.put(`/merchants/${id}`, {
            name: document.getElementById('em-name').value,
            contact: document.getElementById('em-contact').value,
            phone: document.getElementById('em-phone').value,
            address: document.getElementById('em-address').value,
        });
        closeModal();
        showToast('商户已更新');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

window.deleteMerchant = async function(id, name) {
    if (!confirm(`确认禁用商户 "${name}"？禁用后该商户将无法登录。`)) return;
    try {
        await api.delete(`/merchants/${id}`);
        showToast('已禁用');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

// ==================== 授权期限管理 ====================

window.showSetExpiry = function(merchantId, merchantName, currentExpiry) {
    const currentDate = currentExpiry ? new Date(currentExpiry).toISOString().split('T')[0] : '';
    showModal(`设置授权期限 — ${merchantName}`, `
        <div class="form-group">
            <label>授权到期日期</label>
            <input type="date" id="expiry-date" value="${currentDate}" min="${new Date().toISOString().split('T')[0]}">
            <p style="margin-top:8px;font-size:12px;color:var(--text-muted);">留空表示永久授权</p>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn-primary" style="flex:1;" onclick="doSetExpiry(${merchantId})">保存</button>
            ${currentExpiry ? `<button class="btn-danger" style="flex:1;" onclick="doClearExpiry(${merchantId})">清除期限（永久）</button>` : ''}
        </div>
    `);
};

window.doSetExpiry = async function(merchantId) {
    const dateStr = document.getElementById('expiry-date').value;
    try {
        const expiresAt = dateStr ? new Date(dateStr + 'T23:59:59').toISOString() : null;
        await api.put(`/merchants/${merchantId}`, { expires_at: expiresAt });
        closeModal();
        showToast('授权期限已更新');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

window.doClearExpiry = async function(merchantId) {
    try {
        await api.put(`/merchants/${merchantId}`, { expires_at: null });
        closeModal();
        showToast('已设为永久授权');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

// ==================== 账户管理 ====================

window.showCreateMerchantAdmin = function(merchantId, merchantName) {
    showModal(`创建管理员 — ${merchantName}`, `
        <div class="form-group"><label>用户名 *</label><input id="cma-username" placeholder="登录用户名"></div>
        <div class="form-group"><label>密码 *</label><input id="cma-password" type="password" placeholder="登录密码"></div>
        <div class="form-group"><label>姓名</label><input id="cma-name" value="${merchantName}管理员"></div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doCreateMerchantAdmin(${merchantId}, '${merchantName}')">创建</button>
    `);
};

window.doCreateMerchantAdmin = async function(merchantId, merchantName) {
    const username = document.getElementById('cma-username').value.trim();
    const password = document.getElementById('cma-password').value;
    if (!username || !password) { showToast('请填写用户名和密码', 'error'); return; }
    try {
        await api.post(`/merchants/${merchantId}/users`, {
            username,
            password,
            name: document.getElementById('cma-name').value || merchantName + '管理员',
            role: 'merchant',
        });
        closeModal();
        showToast('管理员账户创建成功');
        loadMerchants();
    } catch (e) { showToast(e.message, 'error'); }
};

window.resetMerchantPassword = function(merchantId, merchantName, userId, username) {
    showModal(`重置密码 — ${username}`, `
        <p style="margin-bottom:12px;color:var(--text-muted);">商户：${merchantName}</p>
        <div class="form-group"><label>新密码 *</label><input id="rmp-password" type="password" placeholder="输入新密码"></div>
        <div class="form-group"><label>确认密码 *</label><input id="rmp-password2" type="password" placeholder="再次输入新密码"></div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doResetMerchantPassword(${merchantId}, '${merchantName}', ${userId})">重置</button>
    `);
};

window.doResetMerchantPassword = async function(merchantId, merchantName, userId) {
    const password = document.getElementById('rmp-password').value;
    const password2 = document.getElementById('rmp-password2').value;
    if (!password) { showToast('请输入新密码', 'error'); return; }
    if (password !== password2) { showToast('两次密码不一致', 'error'); return; }
    try {
        await api.put(`/staff/${userId}`, { password });
        closeModal();
        showToast('密码已重置');
    } catch (e) { showToast(e.message, 'error'); }
};

window.showMerchantAccounts = async function(merchantId, merchantName) {
    const users = await api.get(`/merchants/${merchantId}/users`);
    showModal(`${merchantName} — 账户管理`, `
        <div style="margin-bottom:12px;text-align:right;">
            <button class="btn-primary btn-sm" onclick="showNewMerchantAccount(${merchantId}, '${merchantName}')">新增账户</button>
        </div>
        <div id="merchant-accounts-table"></div>
    `);
    const tableEl = document.getElementById('merchant-accounts-table');
    if (!users || users.length === 0) {
        tableEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无账户</p></div>';
        return;
    }
    const roleLabels = { merchant: '商户管理员', staff: '员工' };
    const roleBadges = { merchant: 'primary', staff: 'info' };
    const rows = users.map(u => [
        `<span style="font-weight:500;">${u.username}</span>`,
        u.name,
        `<span class="badge badge-${roleBadges[u.role] || 'info'}">${roleLabels[u.role] || u.role}</span>`,
        `<div class="btn-group">
            <button class="btn-sm btn-secondary" onclick="editMerchantAccount(${merchantId}, '${merchantName}', ${u.id}, '${u.username}', '${u.name}', '${u.role}')">编辑</button>
            <button class="btn-sm btn-secondary" onclick="resetMerchantPassword(${merchantId}, '${merchantName}', ${u.id}, '${u.username}')">重置密码</button>
            ${u.role !== 'merchant' ? `<button class="btn-sm btn-danger" onclick="deleteMerchantAccount(${merchantId}, '${merchantName}', ${u.id}, '${u.username}')">删除</button>` : ''}
        </div>`,
    ]);
    renderTable(['用户名', '姓名', '角色', '操作'], rows, tableEl);
};

window.showNewMerchantAccount = function(merchantId, merchantName) {
    showModal(`新增账户 — ${merchantName}`, `
        <div class="form-group"><label>用户名 *</label><input id="ma-username" placeholder="登录用户名"></div>
        <div class="form-group"><label>密码 *</label><input id="ma-password" type="password" placeholder="登录密码"></div>
        <div class="form-group"><label>姓名 *</label><input id="ma-name" placeholder="员工姓名"></div>
        <div class="form-group"><label>角色</label>
            <select id="ma-role">
                <option value="staff">员工</option>
                <option value="merchant">商户管理员</option>
            </select>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewMerchantAccount(${merchantId}, '${merchantName}')">创建</button>
    `);
};

window.doNewMerchantAccount = async function(merchantId, merchantName) {
    const username = document.getElementById('ma-username').value.trim();
    const password = document.getElementById('ma-password').value;
    const name = document.getElementById('ma-name').value.trim();
    if (!username || !password || !name) { showToast('请填写必填项', 'error'); return; }
    try {
        await api.post(`/merchants/${merchantId}/users`, {
            username,
            password,
            name,
            role: document.getElementById('ma-role').value,
        });
        closeModal();
        showToast('账户创建成功');
        showMerchantAccounts(merchantId, merchantName);
    } catch (e) { showToast(e.message, 'error'); }
};

window.editMerchantAccount = function(merchantId, merchantName, userId, username, name, role) {
    showModal(`编辑账户 — ${username}`, `
        <div class="form-group"><label>用户名</label><input value="${username}" disabled></div>
        <div class="form-group"><label>姓名</label><input id="ea-name" value="${name}"></div>
        <div class="form-group"><label>角色</label>
            <select id="ea-role">
                <option value="staff" ${role === 'staff' ? 'selected' : ''}>员工</option>
                <option value="merchant" ${role === 'merchant' ? 'selected' : ''}>商户管理员</option>
            </select>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditMerchantAccount(${merchantId}, '${merchantName}', ${userId})">保存</button>
    `);
};

window.doEditMerchantAccount = async function(merchantId, merchantName, userId) {
    try {
        await api.put(`/staff/${userId}`, {
            display_name: document.getElementById('ea-name').value,
            role: document.getElementById('ea-role').value,
        });
        closeModal();
        showToast('账户已更新');
        showMerchantAccounts(merchantId, merchantName);
    } catch (e) { showToast(e.message, 'error'); }
};

window.deleteMerchantAccount = async function(merchantId, merchantName, userId, username) {
    if (!confirm(`确认删除账户 "${username}"？`)) return;
    try {
        await api.delete(`/staff/${userId}`);
        showToast('账户已删除');
        showMerchantAccounts(merchantId, merchantName);
    } catch (e) { showToast(e.message, 'error'); }
};

registerPage('settings', async (container) => {
    container.innerHTML = `
        <div style="margin-bottom:12px;">
        </div>
        <div style="margin-bottom:32px;">
            <div class="section-header" style="margin-bottom:12px;">
                <h3 style="font-size:15px;">主机管理</h3>
                <button class="btn-primary btn-sm" onclick="showNewConsole()">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增主机
                </button>
            </div>
            <div class="table-wrapper">
                <div id="consoles-list"></div>
            </div>
        </div>
    `;

    const consoles = await api.get('/consoles');
    const consolesEl = document.getElementById('consoles-list');
    if (consoles && consolesEl) {
        const rows = consoles.map(c => [
            `<span style="font-weight:600;">#${c.id}</span>`,
            `<span style="font-weight:500;">${c.name}</span>`,
            c.console_type,
            `<span style="color:var(--accent);font-weight:600;">¥${c.hourly_rate}/时</span>`,
            c.zone,
            `<span class="badge badge-${c.status === 'idle' ? 'success' : c.status === 'in_use' ? 'danger' : 'warning'}">${statusLabels[c.status]}</span>`,
            `<div class="btn-group">
                ${c.status === 'offline' ? `<button class="btn-sm btn-primary" onclick="onlineConsole(${c.id})">上线</button>` : ''}
                ${c.status !== 'offline' && c.status !== 'in_use' ? `<button class="btn-sm btn-warning" onclick="offlineConsole(${c.id})">下线</button>` : ''}
                <button class="btn-sm btn-secondary" onclick="editConsole(${c.id}, '${c.name}', ${c.hourly_rate}, '${c.zone}')">编辑</button>
                <button class="btn-sm btn-danger" onclick="removeConsole(${c.id})">删除</button>
            </div>`,
        ]);
        renderTable(['ID', '名称', '类型', '时价', '区域', '状态', '操作'], rows, consolesEl);
    }
});

window.showNewConsole = function() {
    showModal('新增主机', `
        <div class="form-group">
            <label>主机名称</label>
            <input id="nc-name" placeholder="如：PS5-03">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>主机类型</label>
                <select id="nc-type">
                    <option>PS5</option><option>Xbox</option><option>Switch</option><option>PC</option>
                </select>
            </div>
            <div class="form-group">
                <label>时价（元/时）</label>
                <input id="nc-rate" type="number" value="30">
            </div>
        </div>
        <div class="form-group">
            <label>所属区域</label>
            <input id="nc-zone" value="普通区" placeholder="如：VIP区">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewConsole()">添加主机</button>
    `);
};

window.doNewConsole = async function() {
    try {
        await api.post('/consoles', {
            name: document.getElementById('nc-name').value,
            console_type: document.getElementById('nc-type').value,
            hourly_rate: parseFloat(document.getElementById('nc-rate').value),
            zone: document.getElementById('nc-zone').value,
        });
        closeModal();
        showToast('主机添加成功');
        navigateTo('settings');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.editConsole = function(id, name, rate, zone) {
    showModal('编辑主机', `
        <div class="form-group">
            <label>主机名称</label>
            <input id="ec-name" value="${name}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>时价（元/时）</label>
                <input id="ec-rate" type="number" value="${rate}">
            </div>
            <div class="form-group">
                <label>所属区域</label>
                <input id="ec-zone" value="${zone}">
            </div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditConsole(${id})">保存修改</button>
    `);
};

window.doEditConsole = async function(id) {
    try {
        await api.put(`/consoles/${id}`, {
            name: document.getElementById('ec-name').value,
            hourly_rate: parseFloat(document.getElementById('ec-rate').value),
            zone: document.getElementById('ec-zone').value,
        });
        closeModal();
        showToast('已更新');
        navigateTo('settings');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.onlineConsole = async function(id) {
    try {
        await api.put(`/consoles/${id}/status`, { status: 'idle' });
        showToast('已上线');
        navigateTo('settings');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.offlineConsole = async function(id) {
    if (!confirm('确认下线该主机？')) return;
    try {
        await api.put(`/consoles/${id}/status`, { status: 'offline' });
        showToast('已下线');
        navigateTo('settings');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.removeConsole = async function(id) {
    if (!confirm('确认删除该主机？删除后可在操作记录中撤销。')) return;
    await api.delete(`/consoles/${id}`);
    showToast('已删除');
    navigateTo('settings');
};

registerPage('packages', async (container) => {
    const isAdmin = localStorage.getItem('role') === 'admin' || localStorage.getItem('role') === 'merchant';
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">时段套餐</h2>
                <p class="section-subtitle">管理预付费时长套餐，会员可购买套餐享受优惠</p>
            </div>
            <div class="actions">
                ${isAdmin ? `<button class="btn-primary" onclick="showNewPackage()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增套餐
                </button>` : ''}
            </div>
        </div>
        <div class="table-wrapper">
            <div id="packages-table"></div>
        </div>
    `;

    async function load() {
        const pkgs = await api.get('/time-packages');
        const tableEl = document.getElementById('packages-table');
        if (!tableEl) return;
        if (!pkgs || pkgs.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无时段套餐</p></div>';
            return;
        }
        const rows = pkgs.map(p => {
            const totalHours = p.hours + p.bonus_hours;
            const hourlyPrice = (p.price / totalHours).toFixed(1);
            return [
                `<span style="font-weight:500;">${p.name}</span>`,
                `<span style="font-weight:600;color:var(--accent);">${totalHours}h</span>`,
                p.bonus_hours > 0 ? `<span style="color:var(--success);">+${p.bonus_hours}h</span>` : '-',
                `<span style="font-weight:700;">¥${p.price.toFixed(0)}</span>`,
                `<span style="color:var(--text-muted);">¥${hourlyPrice}/h</span>`,
                `${p.valid_days}天`,
                p.console_types || '全部',
                isAdmin ? `<div class="btn-group">
                    <button class="btn-sm btn-secondary" onclick="editPackage(${p.id})">编辑</button>
                    <button class="btn-sm btn-danger" onclick="deletePackage(${p.id})">停用</button>
                </div>` : '',
            ];
        });
        renderTable(['套餐名称', '总时长', '赠送', '价格', '均价', '有效期', '适用机型', '操作'], rows, tableEl);
    }

    await load();
});

window.showNewPackage = function() {
    showModal('新增时段套餐', `
        <div class="form-group">
            <label>套餐名称</label>
            <input id="np-name" placeholder="如：10小时畅玩卡">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>时长（小时）</label>
                <input id="np-hours" type="number" value="10" min="1">
            </div>
            <div class="form-group">
                <label>赠送时长（小时）</label>
                <input id="np-bonus" type="number" value="0" min="0">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>套餐价格（元）</label>
                <input id="np-price" type="number" value="200" min="1">
            </div>
            <div class="form-group">
                <label>有效期（天）</label>
                <input id="np-days" type="number" value="90" min="1">
            </div>
        </div>
        <div class="form-group">
            <label>适用机型（逗号分隔，留空=全部）</label>
            <input id="np-types" placeholder="PS5,Xbox">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewPackage()">创建套餐</button>
    `);
};

window.doNewPackage = async function() {
    const name = document.getElementById('np-name').value.trim();
    if (!name) { showToast('请输入套餐名称', 'error'); return; }
    try {
        await api.post('/time-packages', {
            name,
            hours: parseFloat(document.getElementById('np-hours').value),
            bonus_hours: parseFloat(document.getElementById('np-bonus').value) || 0,
            price: parseFloat(document.getElementById('np-price').value),
            valid_days: parseInt(document.getElementById('np-days').value) || 90,
            console_types: document.getElementById('np-types').value,
        });
        closeModal();
        showToast('套餐创建成功');
        navigateTo('packages');
    } catch (e) { showToast(e.message, 'error'); }
};

window.editPackage = function(id) {
    showModal('编辑套餐', `
        <div class="form-group">
            <label>套餐名称</label>
            <input id="ep-name" value="">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>时长（小时）</label>
                <input id="ep-hours" type="number" min="1">
            </div>
            <div class="form-group">
                <label>赠送时长</label>
                <input id="ep-bonus" type="number" min="0">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>价格（元）</label>
                <input id="ep-price" type="number" min="1">
            </div>
            <div class="form-group">
                <label>有效期（天）</label>
                <input id="ep-days" type="number" min="1">
            </div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditPackage(${id})">保存</button>
    `);
};

window.doEditPackage = async function(id) {
    try {
        await api.put(`/time-packages/${id}`, {
            name: document.getElementById('ep-name').value,
            hours: parseFloat(document.getElementById('ep-hours').value),
            bonus_hours: parseFloat(document.getElementById('ep-bonus').value) || 0,
            price: parseFloat(document.getElementById('ep-price').value),
            valid_days: parseInt(document.getElementById('ep-days').value) || 90,
        });
        closeModal();
        showToast('套餐已更新');
        navigateTo('packages');
    } catch (e) { showToast(e.message, 'error'); }
};

window.deletePackage = async function(id) {
    if (!confirm('确认停用该套餐？')) return;
    try {
        await api.delete(`/time-packages/${id}`);
        showToast('已停用');
        navigateTo('packages');
    } catch (e) { showToast(e.message, 'error'); }
};

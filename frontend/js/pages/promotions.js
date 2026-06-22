registerPage('promotions', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">促销活动</h2>
                <p class="section-subtitle">创建和管理促销活动</p>
            </div>
            <div class="actions">
                <button class="btn-primary" onclick="showNewPromo()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增活动
                </button>
            </div>
        </div>
        <div class="table-wrapper">
            <div id="promos-table"></div>
        </div>
    `;

    async function load() {
        const promos = await api.get('/promotions');
        const tableEl = document.getElementById('promos-table');
        if (!tableEl) return;
        if (!promos || promos.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无促销活动</p></div>';
            return;
        }
        const typeLabels = { discount_rate: '折扣', fixed_price: '固定价', buy_hours: '买时长' };
        const rows = promos.map(p => [
            `<span style="font-weight:600;">${p.name}</span>`,
            `<span class="badge badge-info">${typeLabels[p.type] || p.type}</span>`,
            p.type === 'discount_rate' ? `${(p.value * 10).toFixed(1)}折` : `¥${p.value}/时`,
            p.console_types || '全部',
            formatDate(p.start_time),
            formatDate(p.end_time),
            p.is_active ? '<span class="badge badge-success">进行中</span>' : '<span class="badge badge-warning">已结束</span>',
            p.is_active ? `<button class="btn-sm btn-danger" onclick="deactivatePromo(${p.id})">停用</button>` : '',
        ]);
        renderTable(['名称', '类型', '优惠', '适用机型', '开始', '结束', '状态', '操作'], rows, tableEl);
    }

    await load();
});

window.showNewPromo = function() {
    showModal('新增促销活动', `
        <div class="form-group">
            <label>活动名称</label>
            <input id="pr-name" placeholder="如：周末特惠">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>活动类型</label>
                <select id="pr-type">
                    <option value="discount_rate">折扣率</option>
                    <option value="fixed_price">固定价格</option>
                </select>
            </div>
            <div class="form-group">
                <label>值（0.8=8折；固定=元/时）</label>
                <input id="pr-value" type="number" step="0.1" value="0.8">
            </div>
        </div>
        <div class="form-group">
            <label>适用机型（逗号分隔，留空=全部）</label>
            <input id="pr-types" placeholder="PS5,Xbox">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>开始时间</label>
                <input id="pr-start" type="datetime-local">
            </div>
            <div class="form-group">
                <label>结束时间</label>
                <input id="pr-end" type="datetime-local">
            </div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewPromo()">创建活动</button>
    `);
};

window.doNewPromo = async function() {
    try {
        await api.post('/promotions', {
            name: document.getElementById('pr-name').value,
            type: document.getElementById('pr-type').value,
            value: parseFloat(document.getElementById('pr-value').value),
            console_types: document.getElementById('pr-types').value,
            start_time: document.getElementById('pr-start').value,
            end_time: document.getElementById('pr-end').value,
        });
        closeModal();
        showToast('促销活动创建成功');
        navigateTo('promotions');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deactivatePromo = async function(id) {
    await api.delete(`/promotions/${id}`);
    showToast('已停用');
    navigateTo('promotions');
};

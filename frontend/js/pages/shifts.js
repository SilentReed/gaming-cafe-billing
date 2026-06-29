registerPage('shifts', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">交班管理</h2>
                <p class="section-subtitle">签到签退、营收统计、现金盘点</p>
            </div>
        </div>
        <div id="shift-current" style="margin-bottom:24px;"></div>
        <div class="section-header" style="margin-bottom:12px;">
            <h3 style="font-size:15px;">交班记录</h3>
        </div>
        <div class="table-wrapper">
            <div id="shift-history"></div>
        </div>
    `;

    async function load() {
        // Current shift
        const current = await api.get('/shifts/current');
        const currentEl = document.getElementById('shift-current');
        if (currentEl) {
            if (current.shift) {
                const s = current.shift;
                const started = new Date(s.started_at + 'Z').toLocaleString('zh-CN');
                currentEl.innerHTML = `
                    <div class="stat-card green" style="border-left:3px solid var(--success);">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <div style="font-size:12px;color:var(--text-muted);">当前班次</div>
                                <div style="font-size:18px;font-weight:600;margin-top:4px;">${s.username} · 签到 ${started}</div>
                            </div>
                            <button class="btn-danger" onclick="showCloseShift(${s.id})">签退交班</button>
                        </div>
                    </div>
                `;
            } else {
                currentEl.innerHTML = `
                    <div class="stat-card" style="border-left:3px solid var(--warning);text-align:center;padding:32px;">
                        <div style="color:var(--text-muted);margin-bottom:12px;">当前未签到</div>
                        <button class="btn-primary" onclick="showStartShift()">签到上岗</button>
                    </div>
                `;
            }
        }

        // History
        const history = await api.get('/shifts/history');
        const historyEl = document.getElementById('shift-history');
        if (!historyEl) return;
        if (!history || history.length === 0) {
            historyEl.innerHTML = '<div class="empty-state"><p>暂无交班记录</p></div>';
            return;
        }
        const rows = history.map(s => [
            `<span style="font-weight:500;">${s.username}</span>`,
            s.started_at ? new Date(s.started_at+'Z').toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-',
            s.ended_at ? new Date(s.ended_at+'Z').toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-',
            `${s.total_sessions}单`,
            `<span style="font-weight:600;">¥${s.total_revenue.toFixed(2)}</span>`,
            `¥${s.cash_collected.toFixed(0)}`,
            s.cash_diff !== null ? `<span style="color:${s.cash_diff === 0 ? 'var(--success)' : 'var(--danger)'};font-weight:600;">${s.cash_diff >= 0 ? '+' : ''}¥${s.cash_diff.toFixed(2)}</span>` : '-',
            `<span class="badge badge-${s.status === 'open' ? 'success' : 'info'}">${s.status === 'open' ? '在岗' : '已签退'}</span>`,
        ]);
        renderTable(['操作员', '签到', '签退', '会话数', '营收', '现金', '现金差异', '状态'], rows, historyEl);
    }

    await load();
});

window.showStartShift = function() {
    showModal('签到上岗', `
        <div class="form-group">
            <label>备用金（开班现金）</label>
            <input id="ss-cash" type="number" value="0" min="0" placeholder="签到时手头现金金额">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doStartShift()">确认签到</button>
    `);
};

window.doStartShift = async function() {
    try {
        await api.post('/shifts/start', {
            opening_cash: parseFloat(document.getElementById('ss-cash').value) || 0,
        });
        closeModal();
        showToast('签到成功');
        navigateTo('shifts');
    } catch (e) { showToast(e.message, 'error'); }
};

window.showCloseShift = function(shiftId) {
    showModal('签退交班', `
        <div style="background:var(--bg-card);padding:16px;border-radius:8px;margin-bottom:16px;">
            <div style="color:var(--text-muted);font-size:12px;">请清点现金后填写实际金额</div>
        </div>
        <div class="form-group">
            <label>实际现金金额</label>
            <input id="cs-cash" type="number" value="0" min="0" step="0.01">
        </div>
        <div class="form-group">
            <label>备注</label>
            <input id="cs-notes" placeholder="可选备注">
        </div>
        <button class="btn-danger" style="width:100%;margin-top:8px;padding:12px;" onclick="doCloseShift(${shiftId})">确认签退</button>
    `);
};

window.doCloseShift = async function(shiftId) {
    try {
        const result = await api.post(`/shifts/${shiftId}/close`, {
            actual_cash: parseFloat(document.getElementById('cs-cash').value) || 0,
            notes: document.getElementById('cs-notes').value,
        });
        closeModal();
        const diff = result.cash_diff;
        if (diff === 0) {
            showToast('签退成功，现金无差异');
        } else {
            showToast(`签退成功，现金差异: ${diff >= 0 ? '+' : ''}¥${diff.toFixed(2)}`, diff === 0 ? 'success' : 'error');
        }
        navigateTo('shifts');
    } catch (e) { showToast(e.message, 'error'); }
};

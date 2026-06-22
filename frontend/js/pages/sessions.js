registerPage('sessions', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">活跃会话</h2>
                <p class="section-subtitle">管理当前所有进行中的会话</p>
            </div>
            <div class="actions">
                <button class="btn-secondary" onclick="showAllSessions()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    刷新
                </button>
            </div>
        </div>
        <div class="table-wrapper">
            <div id="sessions-table"></div>
        </div>
    `;

    async function load() {
        try {
            const sessions = await api.get('/sessions/active');
            const tableEl = document.getElementById('sessions-table');
            if (!tableEl) return;
            if (!sessions || sessions.length === 0) {
                tableEl.innerHTML = '<div class="empty-state"><p>当前无活跃会话</p></div>';
                return;
            }
            const rows = sessions.map(s => [
                `<span style="font-weight:600;">#${s.id}</span>`,
                s.console_name,
                `<span class="badge badge-info">${billingModeLabels[s.billing_mode]}</span>`,
                s.member_name || '<span style="color:var(--text-muted)">散客</span>',
                `<span class="badge badge-${s.status === 'active' ? 'danger' : 'warning'}">${statusLabels[s.status]}</span>`,
                formatDuration(s.elapsed_min),
                `<span style="font-weight:600;color:var(--success);">¥${s.current_cost.toFixed(2)}</span>`,
                `<div class="btn-group">
                    <button class="btn-sm btn-warning" onclick="doPauseSession(${s.id})">暂停</button>
                    <button class="btn-sm btn-primary" onclick="doResumeSession(${s.id})">继续</button>
                    <button class="btn-sm btn-danger" onclick="doEndSession(${s.id})">结束</button>
                </div>`,
            ]);
            renderTable(['ID', '主机', '模式', '会员', '状态', '时长', '费用', '操作'], rows, tableEl);
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    await load();
    window.showAllSessions = load;
});

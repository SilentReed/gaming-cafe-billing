registerPage('reports', async (container) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">报表统计</h2>
                <p class="section-subtitle">经营数据分析</p>
            </div>
            <div class="actions" style="display:flex;align-items:center;gap:8px;">
                <input id="r-start" type="date" value="${today}" style="width:145px;">
                <span style="color:var(--text-muted);">至</span>
                <input id="r-end" type="date" value="${today}" style="width:145px;">
                <button class="btn-primary" onclick="loadReports()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    查询
                </button>
                <button class="btn-secondary" onclick="exportReports()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    导出Excel
                </button>
            </div>
        </div>
        <div id="report-daily" class="stats-bar"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div class="table-wrapper" style="padding:20px;">
                <h3 style="font-size:14px;margin-bottom:16px;color:var(--text-secondary);">主机使用时长</h3>
                <canvas id="util-chart"></canvas>
            </div>
            <div class="table-wrapper" style="padding:20px;">
                <h3 style="font-size:14px;margin-bottom:16px;color:var(--text-secondary);">会员消费排行</h3>
                <div id="member-ranking"></div>
            </div>
        </div>
    `;

    async function loadReports() {
        const start = document.getElementById('r-start').value;
        const end = document.getElementById('r-end').value;
        if (!start || !end) return;

        try {
            const daily = await api.get(`/reports/daily?date=${end}`);
            const dailyEl = document.getElementById('report-daily');
            if (daily && dailyEl) {
                dailyEl.innerHTML = `
                    <div class="stat-card blue"><div class="value">${daily.total_sessions}</div><div class="label">会话数</div></div>
                    <div class="stat-card purple"><div class="value">¥${daily.actual_revenue.toFixed(2)}</div><div class="label">实际收入</div></div>
                    <div class="stat-card" style="border-top:3px solid var(--warning);"><div class="value">¥${(daily.bonus_amount || 0).toFixed(2)}</div><div class="label">赠费金额</div></div>
                    <div class="stat-card green"><div class="value">${daily.total_hours}h</div><div class="label">使用时长</div></div>
                    <div class="stat-card yellow"><div class="value">¥${daily.recharges.toFixed(2)}</div><div class="label">充值金额</div></div>
                    <div class="stat-card" style="border-left:3px solid var(--text-muted);"><div class="value">${daily.new_members}</div><div class="label">新会员</div></div>
                `;
            }

            const util = await api.get(`/reports/console-utilization?start=${start}&end=${end}`);
            if (util) {
                const canvas = document.getElementById('util-chart');
                if (canvas) drawBarChart(canvas, util.map(u => u.name), util.map(u => u.total_hours));
            }

            const ranking = await api.get(`/reports/member-activity?start=${start}&end=${end}`);
            const rankingEl = document.getElementById('member-ranking');
            if (rankingEl) {
                if (ranking && ranking.length > 0) {
                    const rows = ranking.map((m, i) => [
                        `<span style="font-weight:600;color:${i < 3 ? 'var(--warning)' : 'var(--text-muted)'}">${i + 1}</span>`,
                        `<span style="font-weight:500;">${m.name}</span>`,
                        `<span class="badge badge-${tierColors[m.tier] || 'info'}">${tierLabels[m.tier] || m.tier}</span>`,
                        `<span style="font-weight:600;">¥${m.total_spent.toFixed(2)}</span>`,
                        `${m.total_hours.toFixed(1)}h`
                    ]);
                    renderTable(['排名', '姓名', '等级', '消费', '时长'], rows, rankingEl);
                } else {
                    rankingEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无数据</p></div>';
                }
            }
        } catch (e) {
            showToast('加载失败: ' + e.message, 'error');
        }
    }

    await loadReports();
    window.loadReports = loadReports;
});

window.exportReports = function() {
    const start = document.getElementById('r-start').value;
    const end = document.getElementById('r-end').value;
    if (!start || !end) { showToast('请选择日期范围', 'error'); return; }
    const token = localStorage.getItem('token');
    window.open(`/api/v1/reports/export?start_date=${start}&end_date=${end}&token=${token}`, '_blank');
    showToast('正在导出...');
};

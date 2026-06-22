registerPage('logs', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">操作记录</h2>
                <p class="section-subtitle">查看操作历史，支持撤销删除操作</p>
            </div>
            <div class="actions">
                <button class="btn-secondary" onclick="navigateTo('logs')">刷新</button>
            </div>
        </div>
        <div class="table-wrapper">
            <div id="logs-table"></div>
        </div>
    `;

    const logs = await api.get('/audit-logs?limit=100');
    const tableEl = document.getElementById('logs-table');
    if (!logs || logs.length === 0) {
        tableEl.innerHTML = '<div class="empty-state"><p>暂无操作记录</p></div>';
        return;
    }

    const actionLabels = {
        delete_member: '删除会员',
        delete_console: '删除主机',
        reset_members: '清空会员',
        refund_bill: '退款',
        recharge: '充值',
        end_session: '结束会话',
    };

    const actionColors = {
        delete_member: 'danger',
        delete_console: 'danger',
        refund_bill: 'warning',
        recharge: 'success',
        end_session: 'info',
    };

    const rows = logs.map(l => [
        `<span style="font-family:monospace;font-size:12px;">#${l.id}</span>`,
        formatDate(l.created_at),
        l.username || '-',
        `<span class="badge badge-${actionColors[l.action] || 'info'}">${actionLabels[l.action] || l.action}</span>`,
        l.target_name || '-',
        `<span style="font-size:13px;color:var(--text-muted);">${l.description}</span>`,
        l.undone
            ? '<span class="badge badge-warning" style="font-size:11px;">已撤销</span>'
            : (l.can_undo ? `<button class="btn-sm btn-warning" onclick="undoLog(${l.id}, '${l.description}')">撤销</button>` : '<span style="color:var(--text-muted);font-size:12px;">-</span>'),
    ]);
    renderTable(['ID', '时间', '操作人', '操作', '目标', '描述', '撤销'], rows, tableEl);
});

window.undoLog = async function(logId, desc) {
    if (!confirm(`确认撤销：${desc}？`)) return;
    try {
        const res = await api.post(`/audit-logs/${logId}/undo`);
        showToast(res.message);
        navigateTo('logs');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

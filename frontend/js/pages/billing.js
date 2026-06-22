registerPage('bills', async (container) => {
    let currentPage = 1;
    const pageSize = 20;

    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">账单记录</h2>
                <p class="section-subtitle">查看和管理所有账单</p>
            </div>
            <div class="actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <div class="search-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input id="b-member" placeholder="搜索会员" style="width:160px;padding-left:32px;">
                </div>
                <input id="b-start" type="date" style="width:145px;">
                <span style="color:var(--text-muted);">至</span>
                <input id="b-end" type="date" style="width:145px;">
                <button class="btn-primary" onclick="currentPage=1;loadBills()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    查询
                </button>
            </div>
        </div>
        <div id="bills-summary" class="stats-bar"></div>
        <div class="table-wrapper">
            <div id="bills-table"></div>
        </div>
        <div id="bills-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;"></div>
    `;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const startEl = document.getElementById('b-start');
    const endEl = document.getElementById('b-end');
    if (startEl) startEl.value = today;
    if (endEl) endEl.value = today;

    const paymentIcons = { balance: '💰', cash: '💵', wechat: '💚', alipay: '🔵' };
    const paymentLabels = { balance: '余额', cash: '现金', wechat: '微信', alipay: '支付宝' };
    const statusMap = {
        paid: { label: '已付', cls: 'badge-success' },
        unpaid: { label: '未付', cls: 'badge-danger' },
        refunded: { label: '已退款', cls: 'badge-warning' },
    };

    async function loadBills(page) {
        currentPage = page || 1;
        const start = document.getElementById('b-start');
        const end = document.getElementById('b-end');
        const member = document.getElementById('b-member');
        if (!start || !end) return;
        const params = `start_date=${start.value}&end_date=${end.value}&page=${currentPage}&page_size=${pageSize}`;
        const memberParam = member && member.value ? `&member_name=${encodeURIComponent(member.value)}` : '';
        const res = await api.get(`/bills?${params}${memberParam}`);
        if (!res) return;

        const { total, items: bills } = res;

        const summaryEl = document.getElementById('bills-summary');
        const tableEl = document.getElementById('bills-table');
        const pagEl = document.getElementById('bills-pagination');
        if (!summaryEl || !tableEl) return;

        let totalRevenue = 0, totalBonus = 0;
        bills.forEach(b => { totalRevenue += b.final_amount; totalBonus += b.bonus_amount; });

        summaryEl.innerHTML = `
            <div class="stat-card blue"><div class="value">${total}</div><div class="label">账单总数</div></div>
            <div class="stat-card purple"><div class="value">¥${totalRevenue.toFixed(2)}</div><div class="label">当前页金额</div></div>
            <div class="stat-card" style="border-top:3px solid var(--warning);"><div class="value">¥${totalBonus.toFixed(2)}</div><div class="label">赠费金额</div></div>
        `;

        if (bills.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无账单记录</p></div>';
            if (pagEl) pagEl.innerHTML = '';
            return;
        }

        const rows = bills.map(b => {
            const st = statusMap[b.status] || { label: b.status, cls: '' };
            const memberCell = b.member_name
                ? `<div><span style="font-weight:500;">${b.member_name}</span><br><span style="font-size:11px;color:var(--text-muted);">${b.member_phone || b.member_code || ''}</span></div>`
                : '<span style="color:var(--text-muted);">散客</span>';
            return [
                `<span style="font-weight:600;color:var(--accent);">#${b.id}</span>`,
                memberCell,
                `<span class="badge badge-info">${billingModeLabels[b.billing_mode]}</span>`,
                `<div style="font-size:12px;"><div>${b.started_at}</div><div style="color:var(--text-muted);">${b.ended_at}</div></div>`,
                `<span style="font-weight:500;">${b.duration_min.toFixed(1)}分</span>`,
                `<span style="font-weight:700;">¥${b.final_amount.toFixed(2)}</span>`,
                b.bonus_amount > 0 ? `<span style="color:var(--warning);font-size:12px;">含赠费¥${b.bonus_amount.toFixed(2)}</span>` : '<span style="color:var(--text-muted);font-size:12px;">-</span>',
                `${paymentIcons[b.payment_method] || ''} ${paymentLabels[b.payment_method] || b.payment_method}`,
                `<span class="badge ${st.cls}">${st.label}</span>`,
                b.status !== 'refunded' ? `<button class="btn-sm btn-danger" onclick="doRefund(${b.id})">退款</button>` : '',
            ];
        });
        renderTable(['ID', '会员', '模式', '时间', '时长', '费用', '赠费', '支付方式', '状态', '操作'], rows, tableEl);

        // Pagination
        if (pagEl) {
            const totalPages = Math.ceil(total / pageSize);
            if (totalPages <= 1) { pagEl.innerHTML = ''; return; }
            let pagHtml = `<span style="font-size:13px;color:var(--text-muted);">共 ${total} 条，第 ${currentPage}/${totalPages} 页</span>`;
            pagHtml += '<div style="display:flex;gap:4px;">';
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadBills(1)" ${currentPage===1?'disabled':''}>首页</button>`;
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadBills(${currentPage-1})" ${currentPage===1?'disabled':''}>上一页</button>`;
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);
            for (let i = startPage; i <= endPage; i++) {
                pagHtml += `<button class="btn-sm ${i===currentPage?'btn-primary':'btn-secondary'}" onclick="loadBills(${i})">${i}</button>`;
            }
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadBills(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>下一页</button>`;
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadBills(${totalPages})" ${currentPage>=totalPages?'disabled':''}>末页</button>`;
            pagHtml += '</div>';
            pagEl.innerHTML = pagHtml;
        }
    }

    await loadBills(1);
    window.loadBills = loadBills;
    window.currentPage = currentPage;
});

window.doRefund = async function(billId) {
    if (!confirm('确认退款？')) return;
    try {
        await api.post(`/bills/${billId}/refund`, { reason: '管理员退款' });
        showToast('退款成功');
        if (window.loadBills) window.loadBills(window.currentPage);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

registerPage('members', async (container) => {
    const isAdmin = localStorage.getItem('role') === 'admin' || localStorage.getItem('role') === 'merchant';
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">会员管理</h2>
                <p class="section-subtitle">管理会员信息、等级、充值赠费</p>
            </div>
            <div class="actions">
                <div class="search-box">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input id="m-search" placeholder="搜索姓名 / 手机 / 编号" style="width:220px;">
                </div>
                ${isAdmin ? `<button class="btn-primary" onclick="showNewMember()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    新增会员
                </button>` : ''}
            </div>
        </div>
        <div class="table-wrapper">
            <div id="members-table"></div>
        </div>
        ${isAdmin ? `
        <div style="margin-top:32px;">
            <div class="section-header" style="margin-bottom:12px;">
                <h3 style="font-size:15px;">会员等级</h3>
            </div>
            <div id="tiers-list"></div>
        </div>
        <div style="margin-top:24px;">
            <div class="section-header" style="margin-bottom:12px;">
                <h3 style="font-size:15px;">充值赠费规则</h3>
                <button class="btn-primary btn-sm" onclick="showNewBonusRule()">新增规则</button>
            </div>
            <div id="bonus-rules-list" class="table-wrapper"></div>
        </div>` : ''}
    `;

    async function load(q = '') {
        const members = await api.get(`/members${q ? '?q=' + encodeURIComponent(q) : ''}`);
        const tableEl = document.getElementById('members-table');
        if (!tableEl) return;
        if (!members || members.length === 0) {
            tableEl.innerHTML = '<div class="empty-state"><p>暂无会员数据</p></div>';
            return;
        }
        const rows = members.map(m => [
            `<span style="font-family:monospace;font-weight:500;">${m.member_code}</span>`,
            `<span style="font-weight:500;">${m.name}</span>`,
            m.phone || '-',
            `<span class="badge badge-${tierColors[m.tier] || 'info'}">${tierLabels[m.tier] || m.tier}</span>`,
            `<span style="font-weight:600;">¥${m.balance.toFixed(2)}</span>`,
            `¥${m.total_recharged.toFixed(0)}`,
            `<div class="btn-group">
                ${isAdmin ? `<button class="btn-sm btn-primary" onclick="showRecharge(${m.id}, '${m.name}')">充值</button>` : ''}
                <button class="btn-sm btn-secondary" onclick="showMemberDetail(${m.id})">详情</button>
                ${isAdmin ? `<button class="btn-sm btn-danger" onclick="deleteMember(${m.id}, '${m.name}')">删除</button>` : ''}
            </div>`,
        ]);
        renderTable(['编号', '姓名', '手机', '等级', '余额', '累计充值', '操作'], rows, tableEl);
    }

    await load();
    const searchEl = document.getElementById('m-search');
    if (searchEl) searchEl.oninput = function() { load(this.value); };

    // Load tiers from API
    loadTiers();
    // Load bonus rules
    loadBonusRules();
});

async function loadTiers() {
    const tiersEl = document.getElementById('tiers-list');
    if (!tiersEl) return;
    const tiers = await api.get('/tiers');
    if (!tiers || tiers.length === 0) {
        tiersEl.innerHTML = '<div class="empty-state"><p>暂无等级配置</p></div>';
        return;
    }
    const rows = tiers.map(t => [
        `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color};vertical-align:middle;margin-right:6px;"></span><span style="font-weight:500;">${t.tier_name}</span>`,
        `<span class="badge badge-${tierColors[t.tier_code] || 'info'}">${t.tier_code}</span>`,
        `<span style="font-weight:600;">${(t.discount_rate * 10).toFixed(1)}折</span>`,
        `满¥${t.min_recharge}`,
        `<button class="btn-sm btn-secondary" onclick="editTier('${t.tier_code}', '${t.tier_name}', ${t.discount_rate}, ${t.min_recharge}, '${t.color}')">编辑</button>`,
    ]);
    renderTable(['等级名称', '编码', '折扣', '门槛', '操作'], rows, tiersEl);
}

async function loadBonusRules() {
    const rulesEl = document.getElementById('bonus-rules-list');
    if (!rulesEl) return;
    const rules = await api.get('/bonus-rules');
    if (!rules || rules.length === 0) {
        rulesEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无赠费规则，将使用系统默认比例</p></div>';
        return;
    }
    const rows = rules.map(r => [
        `<span style="font-weight:500;">${r.name}</span>`,
        `充¥${r.min_amount}`,
        r.bonus_type === 'fixed' ? `赠¥${r.bonus_value}` : `赠${(r.bonus_value * 100).toFixed(0)}%`,
        r.is_active ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-warning">停用</span>',
        `<div class="btn-group">
            <button class="btn-sm btn-secondary" onclick="editBonusRule(${r.id}, '${r.name}', ${r.min_amount}, '${r.bonus_type}', ${r.bonus_value}, ${r.is_active})">编辑</button>
            <button class="btn-sm btn-danger" onclick="deleteBonusRule(${r.id})">删除</button>
        </div>`,
    ]);
    renderTable(['规则名称', '最低充值', '赠费方式', '状态', '操作'], rows, rulesEl);
}

window.showNewMember = function() {
    showModal('新增会员', `
        <div class="form-group">
            <label>姓名 *</label>
            <input id="nm-name" placeholder="请输入会员姓名">
        </div>
        <div class="form-group">
            <label>手机号 *</label>
            <input id="nm-phone" placeholder="请输入手机号" required>
        </div>
        <div class="form-group">
            <label>初始充值金额</label>
            <input id="nm-recharge" type="number" value="0" min="0">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewMember()">确认创建</button>
    `);
};

window.doNewMember = async function() {
    const name = document.getElementById('nm-name').value.trim();
    const phone = document.getElementById('nm-phone').value.trim();
    if (!name) { showToast('请输入姓名', 'error'); return; }
    if (!phone) { showToast('请输入手机号', 'error'); return; }
    try {
        await api.post('/members', {
            name,
            phone,
            initial_recharge: parseFloat(document.getElementById('nm-recharge').value) || 0,
        });
        closeModal();
        showToast('会员创建成功');
        navigateTo('members');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deleteMember = async function(id, name) {
    if (!confirm(`确认删除会员 "${name}"？`)) return;
    try {
        await api.delete(`/members/${id}`);
        showToast('已删除');
        navigateTo('members');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.showRecharge = async function(memberId, name) {
    let globalBonus = 0;
    try {
        const config = await api.get('/system/config');
        if (config) globalBonus = Math.round(config.recharge_bonus_rate * 100);
    } catch (e) {}
    showModal(`充值 — ${name}`, `
        <div class="form-group">
            <label>充值金额</label>
            <input id="rc-amount" type="number" value="100" min="1">
        </div>
        <div class="form-group">
            <label>赠费比例（默认使用系统设置 ${globalBonus}%）</label>
            <input id="rc-bonus" type="number" value="" min="0" max="100" placeholder="留空使用系统默认">
        </div>
        <div class="form-group">
            <label>支付方式</label>
            <select id="rc-method">
                <option value="cash">现金</option>
                <option value="wechat">微信</option>
                <option value="alipay">支付宝</option>
            </select>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doRecharge(${memberId})">确认充值</button>
    `);
};

window.doRecharge = async function(memberId) {
    try {
        const amount = parseFloat(document.getElementById('rc-amount').value);
        const method = document.getElementById('rc-method').value;
        const bonusInput = document.getElementById('rc-bonus').value;
        const body = { amount, payment_method: method };
        if (bonusInput !== '') body.bonus_rate = parseFloat(bonusInput) / 100;
        await api.post(`/members/${memberId}/recharge`, body);
        closeModal();
        showToast(`充值成功: ¥${amount.toFixed(2)}`);
        navigateTo('members');
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.showMemberDetail = async function(memberId) {
    const m = await api.get(`/members/${memberId}`);
    if (!m) return;
    const txData = await api.get(`/members/${memberId}/transactions?page=1&page_size=3`) || { items: [], total: 0 };
    const txHtml = (txData.items || []).map(t => {
        const typeClass = t.type === 'recharge' ? 'badge-success' : t.type === 'refund' ? 'badge-warning' : 'badge-danger';
        const typeLabel = t.type === 'recharge' ? '充值' : t.type === 'refund' ? '退款' : '消费';
        return `<tr>
            <td>${formatDate(t.created_at)}</td>
            <td><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td style="font-weight:600;color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">¥${t.amount >= 0 ? '+' : ''}${t.amount.toFixed(2)}</td>
            <td>¥${t.balance_after.toFixed(2)}</td>
        </tr>`;
    }).join('');
    showModal(`${m.name} — 会员详情`, `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">会员编号</div>
                <div style="font-family:monospace;font-weight:600;margin-top:4px;">${m.member_code}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">手机号</div>
                <div style="font-weight:600;margin-top:4px;">${m.phone}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">会员等级</div>
                <div style="margin-top:4px;"><span class="badge badge-${tierColors[m.tier] || 'info'}">${tierLabels[m.tier]}</span></div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">账户余额</div>
                <div style="font-size:20px;font-weight:700;color:var(--success);margin-top:4px;">¥${m.balance.toFixed(2)}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">实际充值</div>
                <div style="font-size:20px;font-weight:700;margin-top:4px;">¥${m.total_recharged.toFixed(2)}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">累计赠费</div>
                <div style="font-size:20px;font-weight:700;color:var(--warning);margin-top:4px;">¥${(m.total_bonus || 0).toFixed(2)}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">累计消费</div>
                <div style="font-size:20px;font-weight:700;margin-top:4px;">¥${m.total_spent.toFixed(2)}</div>
            </div>
            <div style="background:var(--bg-card);padding:16px;border-radius:8px;">
                <div style="color:var(--text-muted);font-size:12px;">累计时长</div>
                <div style="font-size:20px;font-weight:700;margin-top:4px;">${m.total_hours.toFixed(1)}h</div>
            </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="font-size:14px;color:var(--text-secondary);">最近交易</h4>
            ${txData.total > 3 ? `<button class="btn-sm btn-secondary" onclick="showAllTransactions(${memberId}, '${m.name}')">全部交易 (${txData.total})</button>` : ''}
        </div>
        <div class="table-wrapper">
            <table>
                <thead><tr><th>时间</th><th>类型</th><th>金额</th><th>余额</th></tr></thead>
                <tbody>${txHtml || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">暂无交易记录</td></tr>'}</tbody>
            </table>
        </div>
    `);
};

window.showAllTransactions = async function(memberId, memberName) {
    let txPage = 1;
    const txPageSize = 10;

    async function loadTx(page) {
        txPage = page;
        const txData = await api.get(`/members/${memberId}/transactions?page=${page}&page_size=${txPageSize}`);
        if (!txData) return;
        const { total, items } = txData;
        const totalPages = Math.ceil(total / txPageSize);

        const txHtml = items.map(t => {
            const typeClass = t.type === 'recharge' ? 'badge-success' : t.type === 'refund' ? 'badge-warning' : 'badge-danger';
            const typeLabel = t.type === 'recharge' ? '充值' : t.type === 'refund' ? '退款' : '消费';
            return `<tr>
                <td>${formatDate(t.created_at)}</td>
                <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                <td style="font-weight:600;color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'}">¥${t.amount >= 0 ? '+' : ''}${t.amount.toFixed(2)}</td>
                <td>¥${t.balance_after.toFixed(2)}</td>
            </tr>`;
        }).join('');

        const tableEl = document.getElementById('all-tx-table');
        if (tableEl) {
            tableEl.innerHTML = `<table><thead><tr><th>时间</th><th>类型</th><th>金额</th><th>余额</th></tr></thead><tbody>${txHtml || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">暂无交易记录</td></tr>'}</tbody></table>`;
        }

        const pagEl = document.getElementById('all-tx-pagination');
        if (pagEl && totalPages > 1) {
            let pagHtml = `<span style="font-size:13px;color:var(--text-muted);">共 ${total} 条，第 ${txPage}/${totalPages} 页</span>`;
            pagHtml += '<div style="display:flex;gap:4px;justify-content:flex-end;">';
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadAllTxPage(${memberId},${1})" ${txPage===1?'disabled':''}>首页</button>`;
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadAllTxPage(${memberId},${txPage-1})" ${txPage===1?'disabled':''}>上一页</button>`;
            const sp = Math.max(1, txPage - 2);
            const ep = Math.min(totalPages, txPage + 2);
            for (let i = sp; i <= ep; i++) {
                pagHtml += `<button class="btn-sm ${i===txPage?'btn-primary':'btn-secondary'}" onclick="loadAllTxPage(${memberId},${i})">${i}</button>`;
            }
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadAllTxPage(${memberId},${txPage+1})" ${txPage>=totalPages?'disabled':''}>下一页</button>`;
            pagHtml += `<button class="btn-sm btn-secondary" onclick="loadAllTxPage(${memberId},${totalPages})" ${txPage>=totalPages?'disabled':''}>末页</button>`;
            pagEl.innerHTML = pagHtml;
        } else if (pagEl) {
            pagEl.innerHTML = '';
        }
    }

    showModal(`${memberName} — 全部交易`, `
        <div id="all-tx-table" class="table-wrapper" style="margin-bottom:12px;"></div>
        <div id="all-tx-pagination"></div>
    `);
    await loadTx(1);
    window.loadAllTxPage = loadTx;
};

window.editTier = function(code, name, rate, minRecharge, color) {
    showModal(`编辑等级 — ${name}`, `
        <div class="form-group">
            <label>等级名称</label>
            <input id="et-name" value="${name}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>折扣率（0.95=95折）</label>
                <input id="et-rate" type="number" value="${rate}" step="0.05" min="0" max="1">
            </div>
            <div class="form-group">
                <label>升级门槛（累计充值¥）</label>
                <input id="et-min" type="number" value="${minRecharge}" min="0">
            </div>
        </div>
        <div class="form-group">
            <label>显示颜色</label>
            <input id="et-color" type="color" value="${color}">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditTier('${code}')">保存</button>
    `);
};

window.doEditTier = async function(code) {
    try {
        await api.put(`/tiers/${code}`, {
            tier_name: document.getElementById('et-name').value,
            discount_rate: parseFloat(document.getElementById('et-rate').value),
            min_recharge: parseFloat(document.getElementById('et-min').value),
            color: document.getElementById('et-color').value,
        });
        closeModal();
        showToast('等级已更新');
        loadTiers();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.showNewBonusRule = function() {
    showModal('新增赠费规则', `
        <div class="form-group">
            <label>规则名称</label>
            <input id="br-name" placeholder="如：充200送30">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>最低充值金额</label>
                <input id="br-min" type="number" value="0" min="0">
            </div>
            <div class="form-group">
                <label>赠费类型</label>
                <select id="br-type">
                    <option value="fixed">固定金额</option>
                    <option value="percent">按比例</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>赠费值（固定=金额，比例=小数如0.1=10%）</label>
            <input id="br-value" type="number" value="0" step="0.01" min="0">
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doNewBonusRule()">创建</button>
    `);
};

window.doNewBonusRule = async function() {
    try {
        await api.post('/bonus-rules', {
            name: document.getElementById('br-name').value,
            min_amount: parseFloat(document.getElementById('br-min').value),
            bonus_type: document.getElementById('br-type').value,
            bonus_value: parseFloat(document.getElementById('br-value').value),
        });
        closeModal();
        showToast('规则创建成功');
        loadBonusRules();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.editBonusRule = function(id, name, minAmount, bonusType, bonusValue, isActive) {
    showModal(`编辑规则 — ${name}`, `
        <div class="form-group">
            <label>规则名称</label>
            <input id="ebr-name" value="${name}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>最低充值金额</label>
                <input id="ebr-min" type="number" value="${minAmount}" min="0">
            </div>
            <div class="form-group">
                <label>赠费类型</label>
                <select id="ebr-type">
                    <option value="fixed" ${bonusType === 'fixed' ? 'selected' : ''}>固定金额</option>
                    <option value="percent" ${bonusType === 'percent' ? 'selected' : ''}>按比例</option>
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>赠费值</label>
                <input id="ebr-value" type="number" value="${bonusValue}" step="0.01" min="0">
            </div>
            <div class="form-group">
                <label>状态</label>
                <select id="ebr-active">
                    <option value="true" ${isActive ? 'selected' : ''}>启用</option>
                    <option value="false" ${!isActive ? 'selected' : ''}>停用</option>
                </select>
            </div>
        </div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doEditBonusRule(${id})">保存</button>
    `);
};

window.doEditBonusRule = async function(id) {
    try {
        await api.put(`/bonus-rules/${id}`, {
            name: document.getElementById('ebr-name').value,
            min_amount: parseFloat(document.getElementById('ebr-min').value),
            bonus_type: document.getElementById('ebr-type').value,
            bonus_value: parseFloat(document.getElementById('ebr-value').value),
            is_active: document.getElementById('ebr-active').value === 'true',
        });
        closeModal();
        showToast('规则已更新');
        loadBonusRules();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.deleteBonusRule = async function(id) {
    if (!confirm('确认删除该赠费规则？')) return;
    try {
        await api.delete(`/bonus-rules/${id}`);
        showToast('已删除');
        loadBonusRules();
    } catch (e) {
        showToast(e.message, 'error');
    }
};

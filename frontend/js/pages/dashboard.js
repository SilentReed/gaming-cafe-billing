registerPage('dashboard', async (container) => {
    container.innerHTML = `
        <div id="dash-stats" class="stats-bar"></div>
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;margin-bottom:4px;">主机状态</h2>
                <p class="section-subtitle">点击主机卡片可开始/管理会话</p>
            </div>
        </div>
        <div id="dash-grid" class="console-grid"></div>
        <div id="unpaid-section" style="margin-top:28px;"></div>
    `;

    let refreshTimer = null;

    async function load() {
        try {
            const data = await api.get('/consoles/dashboard');
            if (!data) return;
            const s = data.summary;
            const statsEl = document.getElementById('dash-stats');
            const gridEl = document.getElementById('dash-grid');
            if (!statsEl || !gridEl) return;

            statsEl.innerHTML = `
                <div class="stat-card blue"><div class="value">${s.total}</div><div class="label">主机总数</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/></svg></div></div>
                <div class="stat-card green"><div class="value">${s.idle}</div><div class="label">空闲中</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg></div></div>
                <div class="stat-card red"><div class="value">${s.in_use}</div><div class="label">使用中</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg></div></div>
                <div class="stat-card purple"><div class="value">¥${s.actual_revenue.toFixed(2)}</div><div class="label">今日实际收入</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div></div>
                <div class="stat-card yellow"><div class="value">${s.today_sessions}</div><div class="label">今日会话</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div></div>
            `;

            gridEl.innerHTML = data.consoles.map(c => {
                let info = '';
                if (c.session) {
                    const elapsedSec = c.session.elapsed_min * 60;
                    const startTime = new Date(c.session.started_at + 'Z').toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
                    const remaining = c.session.duration_limit ? Math.max(0, c.session.duration_limit * 60 - elapsedSec) : 0;
                    const isExpired = c.session.countdown_expired;

                    let countdownHtml = '';
                    if (c.session.billing_mode === 'countdown' && c.session.duration_limit) {
                        countdownHtml = isExpired
                            ? `<div style="margin-top:6px;text-align:center;"><span class="badge badge-warning" style="font-size:11px;">倒计时已结束</span></div>`
                            : `<div style="margin-top:4px;font-size:11px;color:var(--warning);text-align:center;">⏳ 剩余 ${formatTime(remaining)}</div>`;
                    }

                    info = `
                        <div class="session-info">
                            <span>⏱ ${formatDuration(c.session.elapsed_min)}</span>
                            <span>¥${c.session.current_cost.toFixed(2)}</span>
                        </div>
                        <div style="margin-top:6px;font-size:11px;color:var(--text-muted);display:flex;justify-content:space-between;">
                            <span>开始 ${startTime}</span>
                            <span>已用 ${formatTime(elapsedSec)}</span>
                        </div>
                        ${countdownHtml}
                        <div class="card-actions">
                            ${isExpired
                                ? `<button class="btn-end" style="flex:1;" onclick="event.stopPropagation();doEndSession(${c.session.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> 结账</button>`
                                : `<button class="btn-extend" onclick="event.stopPropagation();showExtendSession(${c.session.id}, '${c.name}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg> 续时</button>
                                   <button class="btn-end" onclick="event.stopPropagation();doEndSession(${c.session.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> 结束</button>`
                            }
                        </div>
                    `;
                }
                return `
                    <div class="console-card ${c.status}" onclick="onConsoleClick(${c.id}, '${c.status}')">
                        <div class="card-top">
                            <div><div class="name">${c.name}</div><div class="type">${c.console_type} · ${c.zone}</div></div>
                            <span class="status-badge status-${c.status}"><span class="dot"></span>${statusLabels[c.status]}</span>
                        </div>
                        <div class="rate">¥${c.hourly_rate}<span>/时</span></div>
                        ${info}
                    </div>
                `;
            }).join('');

            // Load unpaid bills
            const unpaidEl = document.getElementById('unpaid-section');
            if (unpaidEl) {
                try {
                    const unpaid = await api.get('/bills/unpaid');
                    if (unpaid && unpaid.length > 0) {
                        unpaidEl.innerHTML = `
                            <div class="section-header" style="margin-bottom:12px;">
                                <h2 style="font-size:16px;"><span style="color:var(--danger);">●</span> 未付账单 (${unpaid.length})</h2>
                            </div>
                            <div class="table-wrapper">
                                <table>
                                    <thead><tr><th>ID</th><th>会员</th><th>类型</th><th>开始时间</th><th>结束时间</th><th>费用</th><th>操作</th></tr></thead>
                                    <tbody>
                                        ${unpaid.map(b => `
                                            <tr>
                                                <td><span style="font-weight:600;color:var(--accent);">#${b.id}</span></td>
                                                <td>${b.member_name || '散客'}${b.member_phone ? '<br><span style="font-size:11px;color:var(--text-muted);">' + b.member_phone + '</span>' : ''}</td>
                                                <td>${b.console_type}</td>
                                                <td style="font-size:12px;">${formatDate(b.started_at)}</td>
                                                <td style="font-size:12px;">${formatDate(b.ended_at)}</td>
                                                <td><span style="font-weight:700;color:var(--danger);">¥${b.final_amount.toFixed(2)}</span></td>
                                                <td><button class="btn-sm btn-primary" onclick="settleUnpaid(${b.id})">收款</button></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `;
                    } else {
                        unpaidEl.innerHTML = '';
                    }
                } catch (e) {}
            }
        } catch (e) {
            showToast('加载失败: ' + e.message, 'error');
        }
    }

    await load();
    refreshTimer = setInterval(load, 1000);
    container._cleanup = () => clearInterval(refreshTimer);
});

window.onConsoleClick = async function(consoleId, status) {
    if (status === 'idle') { showStartSession(consoleId); }
    else if (status === 'in_use' || status === 'paused') {
        const sessions = await api.get('/sessions/active');
        if (!sessions) return;
        const s = sessions.find(x => x.console_id === consoleId);
        if (s) showSessionDetail(s);
    }
};

window.settleUnpaid = async function(billId) {
    try {
        const unpaid = await api.get('/bills/unpaid');
        const bill = unpaid.find(b => b.id === billId);
        if (!bill) { showToast('账单未找到', 'error'); return; }

        showModal('收款', `
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">应付金额</div>
                <div style="font-size:36px;font-weight:700;color:var(--danger);">¥${bill.final_amount.toFixed(2)}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${bill.member_name || '散客'} · ${bill.console_type}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                <div class="pay-method-card active" id="pm-balance" onclick="selectPayMethod('balance')"><div class="pay-icon" style="background:var(--accent-glow);color:var(--accent);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div><div class="pay-info"><div class="pay-name">余额支付</div><div class="pay-desc" id="balance-desc">搜索会员后使用余额支付</div></div></div>
                <div class="pay-method-card" id="pm-cash" onclick="selectPayMethod('cash')"><div class="pay-icon" style="background:var(--success-bg);color:var(--success);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="pay-info"><div class="pay-name">现金</div><div class="pay-desc">线下收取现金</div></div></div>
                <div class="pay-method-card" id="pm-wechat" onclick="selectPayMethod('wechat')"><div class="pay-icon" style="background:var(--success-bg);color:#07c160;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div><div class="pay-info"><div class="pay-name">微信支付</div><div class="pay-desc">扫码或转账</div></div></div>
                <div class="pay-method-card" id="pm-alipay" onclick="selectPayMethod('alipay')"><div class="pay-icon" style="background:var(--accent-glow);color:#1677ff;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M6 16l2-4h8l2 4"/></svg></div><div class="pay-info"><div class="pay-name">支付宝</div><div class="pay-desc">扫码或转账</div></div></div>
            </div>
            <div id="balance-search-area">
                <div style="margin-bottom:8px;font-size:13px;font-weight:500;color:var(--text-secondary);">选择会员</div>
                <div style="position:relative;">
                    <input id="pay-member-search" placeholder="搜索手机号 / 姓名 / 编号" oninput="searchPayMember(this.value)" style="width:100%;padding-left:36px;">
                    <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <div id="pay-member-results" style="max-height:140px;overflow-y:auto;margin-top:4px;"></div>
                <input id="pay-member-id" type="hidden" value="">
                <div id="pay-member-selected" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;"><span id="pay-member-selected-info"></span><span style="cursor:pointer;color:var(--text-muted);font-size:18px;" onclick="clearPayMember()">&times;</span></div></div>
            </div>
            <button class="btn-primary" style="width:100%;margin-top:16px;padding:12px;font-size:15px;" onclick="confirmSettleUnpaid(${billId})">确认收款 ¥${bill.final_amount.toFixed(2)}</button>
        `);
    } catch (e) { showToast(e.message, 'error'); }
};

window.confirmSettleUnpaid = async function(billId) {
    const m = window._spm;
    if (!m) { showToast('请选择支付方式', 'error'); return; }
    if (m === 'balance') {
        const mid = document.getElementById('pay-member-id');
        if (!mid || !mid.value) { showToast('余额支付必须选择会员', 'error'); return; }
    }
    try {
        await api.put(`/bills/${billId}/settle`, { payment_method: m });
        closeModal();
        showToast('收款成功');
        navigateTo('dashboard');
    } catch (e) { showToast(e.message, 'error'); }
};

function showStartSession(consoleId) {
    showModal('开始新会话', `
        <div class="form-group"><label>计费模式</label><select id="s-mode"><option value="count_up">正计时 — 按实际使用时间计费</option><option value="countdown">倒计时 — 预付固定时长</option></select></div>
        <div class="form-group" id="s-duration-group" style="display:none;"><label>预付时长（分钟）</label><input id="s-duration" type="number" value="60" min="1"></div>
        <button class="btn-primary" style="width:100%;margin-top:8px;" onclick="doStartSession(${consoleId})">开始计时</button>
    `);
    document.getElementById('s-mode').onchange = function() {
        const g = document.getElementById('s-duration-group');
        if (g) g.style.display = this.value === 'countdown' ? 'block' : 'none';
    };
}

window.doStartSession = async function(consoleId) {
    const m = document.getElementById('s-mode');
    if (!m) return;
    const body = { console_id: consoleId, billing_mode: m.value };
    if (m.value === 'countdown') { const d = document.getElementById('s-duration'); body.duration_limit = d ? parseFloat(d.value) : 60; }
    try { await api.post('/sessions', body); closeModal(); showToast('会话已开始'); navigateTo('dashboard'); } catch (e) { showToast(e.message, 'error'); }
};

function showSessionDetail(session) {
    const mode = billingModeLabels[session.billing_mode];
    const el = session.elapsed_min * 60;
    let cdHtml = '';
    if (session.billing_mode === 'countdown' && session.duration_limit) {
        const rem = Math.max(0, session.duration_limit * 60 - el);
        cdHtml = rem <= 0 ? `<div style="background:var(--danger-bg);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;"><div style="color:var(--danger);font-size:20px;font-weight:700;">已结束</div></div>` : `<div style="background:var(--warning-bg);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;"><div style="color:var(--warning);font-size:20px;font-weight:700;">${formatTime(rem)}</div><div style="font-size:12px;color:var(--text-muted);">剩余时间</div></div>`;
    }
    showModal('会话详情', `
        <div style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:12px;"><div><div style="font-size:18px;font-weight:600;">${session.console_name}</div><div style="color:var(--text-muted);font-size:13px;">${session.console_type}</div></div><span class="badge badge-${session.status==='active'?'danger':'warning'}">${statusLabels[session.status]}</span></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">计费模式</div><div style="font-weight:600;margin-top:4px;">${mode}</div></div>
            <div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">会员</div><div style="font-weight:600;margin-top:4px;">${session.member_name||'散客'}</div></div>
            <div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">已用时长</div><div style="font-weight:600;margin-top:4px;color:var(--accent);">${formatDuration(session.elapsed_min)}</div></div>
            <div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">当前费用</div><div style="font-weight:600;margin-top:4px;color:var(--success);">¥${session.current_cost.toFixed(2)}</div></div>
        </div>${cdHtml}
        <div style="display:flex;gap:8px;">
            ${session.status==='active'?`<button class="btn-warning" style="flex:1;" onclick="doPauseSession(${session.id})">暂停</button>`:`<button class="btn-primary" style="flex:1;" onclick="doResumeSession(${session.id})">继续</button>`}
            <button class="btn-danger" style="flex:1;" onclick="doEndSession(${session.id})">结束计费</button>
        </div>
    `);
}

window.doPauseSession = async function(id) { try{await api.put(`/sessions/${id}/pause`);closeModal();showToast('已暂停');navigateTo('dashboard');}catch(e){showToast(e.message,'error');} };
window.doResumeSession = async function(id) { try{await api.put(`/sessions/${id}/resume`);closeModal();showToast('已继续');navigateTo('dashboard');}catch(e){showToast(e.message,'error');} };

window.doEndSession = async function(id) {
    try {
        const sessions = await api.get('/sessions/active');
        if (!sessions) return;
        const s = sessions.find(x => x.id === id);
        if (!s) { showToast('会话未找到','error'); return; }
        const amt = s.current_cost;
        showModal('结算', `
            <div style="text-align:center;margin-bottom:20px;"><div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">应付金额</div><div style="font-size:36px;font-weight:700;color:var(--accent);">¥${amt.toFixed(2)}</div></div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
                <div class="pay-method-card active" id="pm-balance" onclick="selectPayMethod('balance')"><div class="pay-icon" style="background:var(--accent-glow);color:var(--accent);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div><div class="pay-info"><div class="pay-name">余额支付</div><div class="pay-desc" id="balance-desc">搜索会员后使用余额支付</div></div></div>
                <div class="pay-method-card" id="pm-cash" onclick="selectPayMethod('cash')"><div class="pay-icon" style="background:var(--success-bg);color:var(--success);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><div class="pay-info"><div class="pay-name">现金</div><div class="pay-desc">线下收取现金</div></div></div>
                <div class="pay-method-card" id="pm-wechat" onclick="selectPayMethod('wechat')"><div class="pay-icon" style="background:var(--success-bg);color:#07c160;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></div><div class="pay-info"><div class="pay-name">微信支付</div><div class="pay-desc">扫码或转账</div></div></div>
                <div class="pay-method-card" id="pm-alipay" onclick="selectPayMethod('alipay')"><div class="pay-icon" style="background:var(--accent-glow);color:#1677ff;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M6 16l2-4h8l2 4"/></svg></div><div class="pay-info"><div class="pay-name">支付宝</div><div class="pay-desc">扫码或转账</div></div></div>
            </div>
            <div id="balance-search-area"><div style="margin-bottom:8px;font-size:13px;font-weight:500;color:var(--text-secondary);">选择会员</div><div style="position:relative;"><input id="pay-member-search" placeholder="搜索手机号 / 姓名 / 编号" oninput="searchPayMember(this.value)" style="width:100%;padding-left:36px;"><svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div id="pay-member-results" style="max-height:140px;overflow-y:auto;margin-top:4px;"></div><input id="pay-member-id" type="hidden" value=""><div id="pay-member-selected" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border);"><div style="display:flex;justify-content:space-between;align-items:center;"><span id="pay-member-selected-info"></span><span style="cursor:pointer;color:var(--text-muted);font-size:18px;" onclick="clearPayMember()">&times;</span></div></div></div>
            <button class="btn-primary" style="width:100%;margin-top:16px;padding:12px;font-size:15px;" onclick="confirmEndSession(${id})">确认收款 ¥${amt.toFixed(2)}</button>
        `);
    } catch(e) { showToast(e.message,'error'); }
};

window._spm='balance';
window.selectPayMethod=function(m){window._spm=m;document.querySelectorAll('.pay-method-card').forEach(e=>{e.classList.remove('active');e.style.borderColor='var(--border)';});const c=document.getElementById('pm-'+m);if(c){c.classList.add('active');c.style.borderColor='var(--accent)';}const sa=document.getElementById('balance-search-area');if(sa)sa.style.display=m==='balance'?'block':'none';};
window.toggleBalanceSearch=function(s){const a=document.getElementById('balance-search-area');if(a)a.style.display=s?'block':'none';};

let _pst=null;
window.searchPayMember=async function(q){clearTimeout(_pst);const re=document.getElementById('pay-member-results');const he=document.getElementById('pay-member-id');if(!re)return;if(!q||q.length<1){re.innerHTML='';if(he)he.value='';return;}_pst=setTimeout(async()=>{const ms=await api.get(`/members?q=${encodeURIComponent(q)}`);if(!ms||ms.length===0){re.innerHTML='<div style="padding:8px;color:var(--text-muted);font-size:13px;">未找到会员</div>';return;}re.innerHTML=ms.slice(0,8).map(m=>`<div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;display:flex;justify-content:space-between;" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''" onclick="selectPayMember(${m.id},'${m.name}','${m.phone||''}',${m.balance})"><div><span style="font-weight:500;">${m.name}</span><span style="color:var(--text-muted);font-size:12px;margin-left:6px;">${m.phone||''}</span></div><span style="font-weight:600;color:var(--success);">¥${m.balance.toFixed(2)}</span></div>`).join('');},200);};

window.selectPayMember=function(id,nm,ph,bal){const se=document.getElementById('pay-member-search');const he=document.getElementById('pay-member-id');const re=document.getElementById('pay-member-results');const sel=document.getElementById('pay-member-selected');const si=document.getElementById('pay-member-selected-info');const de=document.getElementById('balance-desc');if(he)he.value=id;if(re)re.innerHTML='';if(se)se.value='';if(sel)sel.style.display='flex';if(si)si.innerHTML=`<b>${nm}</b> <span style="color:var(--text-muted);font-size:12px;margin-left:4px;">${ph}</span> <span style="color:var(--success);font-weight:600;margin-left:8px;">¥${bal.toFixed(2)}</span>`;if(de)de.textContent=`${nm} · 余额 ¥${bal.toFixed(2)}`;};
window.clearPayMember=function(){const he=document.getElementById('pay-member-id');const sel=document.getElementById('pay-member-selected');const de=document.getElementById('balance-desc');if(he)he.value='';if(sel)sel.style.display='none';if(de)de.textContent='搜索会员后使用余额支付';};

window.confirmEndSession=async function(id){const m=window._spm;if(!m){showToast('请选择支付方式','error');return;}if(m==='balance'){const mid=document.getElementById('pay-member-id');if(!mid||!mid.value){showToast('余额支付必须选择会员','error');return;}}const body={payment_method:m};if(m==='balance'){const mid=document.getElementById('pay-member-id');if(mid&&mid.value)body.member_id=parseInt(mid.value);}try{const r=await api.put(`/sessions/${id}/end`,body);closeModal();const ml={balance:'余额',cash:'现金',wechat:'微信',alipay:'支付宝'};showToast(`收款成功 · ¥${r.final_amount.toFixed(2)} (${ml[r.payment_method]})`);navigateTo('dashboard');}catch(e){showToast(e.message,'error');}};

window.showExtendSession=function(sid,cn){showModal(`续时 — ${cn}`,`<div style="text-align:center;margin-bottom:16px;"><div style="width:48px;height:48px;border-radius:50%;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg></div><div style="font-size:14px;color:var(--text-muted);">选择追加时长</div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;"><button class="btn-secondary ext-quick" onclick="document.getElementById('ext-minutes').value=30;this.parentElement.querySelectorAll('.ext-quick').forEach(b=>b.style.borderColor='var(--border)');this.style.borderColor='var(--accent)'">30分钟</button><button class="btn-secondary ext-quick" onclick="document.getElementById('ext-minutes').value=60;this.parentElement.querySelectorAll('.ext-quick').forEach(b=>b.style.borderColor='var(--border)');this.style.borderColor='var(--accent)'" style="border-color:var(--accent)">60分钟</button><button class="btn-secondary ext-quick" onclick="document.getElementById('ext-minutes').value=120;this.parentElement.querySelectorAll('.ext-quick').forEach(b=>b.style.borderColor='var(--border)');this.style.borderColor='var(--accent)'">2小时</button></div><div class="form-group"><input id="ext-minutes" type="number" value="60" min="1" style="text-align:center;font-size:18px;font-weight:600;padding:12px;"></div><button class="btn-primary" style="width:100%;margin-top:8px;padding:12px;font-size:15px;" onclick="doExtendSession(${sid})">确认续时</button>`);};
window.doExtendSession=async function(sid){const m=parseFloat(document.getElementById('ext-minutes').value);if(!m||m<=0){showToast('请输入有效时长','error');return;}try{await api.put(`/sessions/${sid}/extend`,{additional_minutes:m});closeModal();showToast(`已续时 ${m} 分钟`);navigateTo('dashboard');}catch(e){showToast(e.message,'error');}};

function showSessionDetail(s){const mode=billingModeLabels[s.billing_mode];const el=s.elapsed_min*60;const startT=s.start_time?new Date(s.start_time+'Z').toLocaleString('zh-CN'):'-';let cdHtml='';if(s.billing_mode==='countdown'&&s.duration_limit){const rem=Math.max(0,s.duration_limit*60-el);cdHtml=rem<=0?`<div style="background:var(--danger-bg);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;"><div style="color:var(--danger);font-size:20px;font-weight:700;">已结束</div></div>`:`<div style="background:var(--warning-bg);padding:12px;border-radius:8px;margin-bottom:16px;text-align:center;"><div style="color:var(--warning);font-size:20px;font-weight:700;">${formatTime(rem)}</div><div style="font-size:12px;color:var(--text-muted);">剩余时间</div></div>`;}showModal('会话详情',`<div style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;margin-bottom:12px;"><div><div style="font-size:18px;font-weight:600;">${s.console_name}</div><div style="color:var(--text-muted);font-size:13px;">${s.console_type}</div></div><span class="badge badge-${s.status==='active'?'danger':'warning'}">${statusLabels[s.status]}</span></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;"><div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">计费模式</div><div style="font-weight:600;margin-top:4px;">${mode}</div></div><div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">会员</div><div style="font-weight:600;margin-top:4px;">${s.member_name||'散客'}</div></div><div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">开始时间</div><div style="font-weight:600;margin-top:4px;">${startT}</div></div><div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">已用时长</div><div style="font-weight:600;margin-top:4px;color:var(--accent);">${formatDuration(s.elapsed_min)}</div></div><div style="background:var(--bg-card);padding:12px;border-radius:8px;"><div style="color:var(--text-muted);font-size:12px;">当前费用</div><div style="font-weight:600;margin-top:4px;color:var(--success);">¥${s.current_cost.toFixed(2)}</div></div></div>${cdHtml}<div style="display:flex;gap:8px;">${s.status==='active'?`<button class="btn-warning" style="flex:1;" onclick="doPauseSession(${s.id})">暂停</button>`:`<button class="btn-primary" style="flex:1;" onclick="doResumeSession(${s.id})">继续</button>`}<button class="btn-danger" style="flex:1;" onclick="doEndSession(${s.id})">结束计费</button></div>`);}

registerPage('cashier', async (container) => {
    container.innerHTML = `
        <div id="cashier-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;height:calc(100vh - 140px);">
            <!-- Left: Console grid -->
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="font-size:18px;">主机状态</h2>
                    <button class="btn-secondary" onclick="loadCashier()">刷新</button>
                </div>
                <div id="cashier-consoles" class="console-grid" style="grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));"></div>
            </div>
            <!-- Right: Quick actions -->
            <div>
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;height:100%;">
                    <h3 style="font-size:16px;margin-bottom:16px;">快捷操作</h3>
                    <div id="cashier-actions">
                        <div style="text-align:center;padding:40px;color:var(--text-muted);">
                            点击左侧主机卡片进行操作
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    let refreshTimer = null;
    let ws = null;

    async function loadCashier() {
        try {
            const data = await api.get('/consoles/dashboard');
            if (!data) return;
            const gridEl = document.getElementById('cashier-consoles');
            if (!gridEl) return;

            gridEl.innerHTML = data.consoles.map(c => {
                const statusClass = c.status;
                const statusLabel = {idle:'空闲',in_use:'使用中',maintenance:'维护',offline:'离线'}[c.status] || c.status;
                let sessionInfo = '';
                if (c.session) {
                    sessionInfo = `<div style="font-size:12px;margin-top:4px;">⏱ ${formatDuration(c.session.elapsed_min)} · ¥${c.session.current_cost.toFixed(2)}</div>`;
                }
                return `
                    <div class="console-card ${statusClass}" data-console-id="${c.id}" onclick="cashierAction(${c.id}, '${c.status}', '${c.name}')" style="padding:16px;cursor:pointer;">
                        <div style="font-weight:600;font-size:15px;">${c.name}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${c.console_type} · ¥${c.hourly_rate}/时</div>
                        <div class="status-badge status-${c.status}" style="margin-top:8px;">
                            <span class="dot"></span>${statusLabel}
                        </div>
                        ${sessionInfo}
                    </div>
                `;
            }).join('');
        } catch (e) {
            showToast('加载失败: ' + e.message, 'error');
        }
    }

    // WebSocket for real-time updates
    function connectWS() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsBase = location.pathname.startsWith('/cafe/') ? '/cafe' : '';
        ws = new WebSocket(`${proto}//${location.host}${wsBase}/ws/dashboard`);
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'timer_update' && msg.sessions) {
                    msg.sessions.forEach(s => {
                        const card = document.querySelector(`.console-card[data-console-id="${s.console_id}"]`);
                        if (!card) return;
                        const infoEl = card.querySelector('.session-info-live');
                        if (infoEl) {
                            infoEl.textContent = `⏱ ${formatDuration(s.elapsed_sec / 60)} · ¥${s.current_cost.toFixed(2)}`;
                        }
                    });
                }
            } catch {}
        };
        ws.onclose = () => setTimeout(connectWS, 3000);
    }

    await loadCashier();
    connectWS();
    refreshTimer = setInterval(loadCashier, 30000);
    container._cleanup = () => {
        clearInterval(refreshTimer);
        if (ws) ws.close();
    };
});

window.cashierAction = async function(consoleId, status, consoleName) {
    const actionsEl = document.getElementById('cashier-actions');
    if (!actionsEl) return;

    if (status === 'idle') {
        // Show quick start form
        actionsEl.innerHTML = `
            <h4 style="margin-bottom:16px;">开台 — ${consoleName}</h4>
            <div class="form-group">
                <label>计费模式</label>
                <select id="cs-mode" style="font-size:16px;padding:12px;">
                    <option value="count_up">正计时</option>
                    <option value="countdown">倒计时</option>
                </select>
            </div>
            <div class="form-group" id="cs-duration-group" style="display:none;">
                <label>时长（分钟）</label>
                <input id="cs-duration" type="number" value="60" min="1" style="font-size:16px;padding:12px;">
            </div>
            <div class="form-group">
                <label>会员（可选）</label>
                <input id="cs-member-search" placeholder="搜索手机号/姓名" oninput="cashierSearchMember(this.value)" style="font-size:16px;padding:12px;">
                <div id="cs-member-results"></div>
                <input id="cs-member-id" type="hidden">
                <div id="cs-member-selected" style="display:none;margin-top:8px;padding:8px;background:var(--bg-card-hover);border-radius:6px;">
                    <span id="cs-member-info"></span>
                    <span style="float:right;cursor:pointer;" onclick="cashierClearMember()">×</span>
                </div>
            </div>
            <button class="btn-primary" style="width:100%;padding:16px;font-size:18px;margin-top:12px;" onclick="cashierStartSession(${consoleId})">
                开始计时
            </button>
        `;
        document.getElementById('cs-mode').onchange = function() {
            document.getElementById('cs-duration-group').style.display = this.value === 'countdown' ? 'block' : 'none';
        };
    } else if (status === 'in_use' || status === 'paused') {
        // Show session actions
        const sessions = await api.get('/sessions/active');
        if (!sessions) return;
        const s = sessions.find(x => x.console_id === consoleId);
        if (!s) return;

        const statusLabel = s.status === 'active' ? '使用中' : '已暂停';
        actionsEl.innerHTML = `
            <h4 style="margin-bottom:16px;">${consoleName} — ${statusLabel}</h4>
            <div style="background:var(--bg-card-hover);padding:20px;border-radius:8px;text-align:center;margin-bottom:20px;">
                <div style="font-size:32px;font-weight:700;color:var(--accent);">${formatDuration(s.elapsed_min)}</div>
                <div style="font-size:24px;font-weight:600;color:var(--success);margin-top:8px;">¥${s.current_cost.toFixed(2)}</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${s.member_name || '散客'}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${s.status === 'active'
                    ? `<button class="btn-warning" style="padding:16px;font-size:16px;" onclick="cashierPause(${s.id})">⏸ 暂停</button>`
                    : `<button class="btn-primary" style="padding:16px;font-size:16px;" onclick="cashierResume(${s.id})">▶ 继续</button>`
                }
                <button class="btn-secondary" style="padding:16px;font-size:16px;" onclick="cashierExtend(${s.id}, '${consoleName}')">⏰ 续时</button>
            </div>
            <button class="btn-danger" style="width:100%;padding:16px;font-size:18px;margin-top:12px;" onclick="cashierEndSession(${s.id}, ${s.current_cost})">
                💰 结账 ¥${s.current_cost.toFixed(2)}
            </button>
        `;
    }
};

window.cashierSearchMember = async function(q) {
    if (!q || q.length < 1) {
        document.getElementById('cs-member-results').innerHTML = '';
        return;
    }
    const members = await api.get(`/members?q=${encodeURIComponent(q)}`);
    if (!members) return;
    document.getElementById('cs-member-results').innerHTML = members.slice(0, 5).map(m =>
        `<div style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;" onclick="cashierSelectMember(${m.id},'${m.name}','${m.phone||''}',${m.balance})">
            <span>${m.name} ${m.phone||''}</span>
            <span style="color:var(--success);font-weight:600;">¥${m.balance.toFixed(2)}</span>
        </div>`
    ).join('');
};

window.cashierSelectMember = function(id, name, phone, balance) {
    document.getElementById('cs-member-id').value = id;
    document.getElementById('cs-member-search').value = '';
    document.getElementById('cs-member-results').innerHTML = '';
    document.getElementById('cs-member-selected').style.display = 'block';
    document.getElementById('cs-member-info').innerHTML = `<b>${name}</b> ${phone} <span style="color:var(--success);">¥${balance.toFixed(2)}</span>`;
};

window.cashierClearMember = function() {
    document.getElementById('cs-member-id').value = '';
    document.getElementById('cs-member-selected').style.display = 'none';
};

window.cashierStartSession = async function(consoleId) {
    const mode = document.getElementById('cs-mode').value;
    const body = { console_id: consoleId, billing_mode: mode };
    if (mode === 'countdown') {
        body.duration_limit = parseFloat(document.getElementById('cs-duration').value) || 60;
    }
    const memberId = document.getElementById('cs-member-id').value;
    if (memberId) body.member_id = parseInt(memberId);
    try {
        await api.post('/sessions', body);
        showToast('开台成功');
        loadCashier();
    } catch (e) { showToast(e.message, 'error'); }
};

window.cashierPause = async function(id) {
    try { await api.put(`/sessions/${id}/pause`); showToast('已暂停'); loadCashier(); } catch (e) { showToast(e.message, 'error'); }
};

window.cashierResume = async function(id) {
    try { await api.put(`/sessions/${id}/resume`); showToast('已继续'); loadCashier(); } catch (e) { showToast(e.message, 'error'); }
};

window.cashierExtend = function(id, name) {
    showExtendSession(id, name);
};

window.cashierEndSession = async function(id, amount) {
    showModal('结账', `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">应付金额</div>
            <div style="font-size:40px;font-weight:700;color:var(--accent);">¥${amount.toFixed(2)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
            <button class="btn-primary" style="padding:20px;font-size:16px;" onclick="cashierPay(${id},'cash')">💵 现金</button>
            <button class="btn-primary" style="padding:20px;font-size:16px;background:#07c160;" onclick="cashierPay(${id},'wechat')">💚 微信</button>
            <button class="btn-primary" style="padding:20px;font-size:16px;background:#1677ff;" onclick="cashierPay(${id},'alipay')">🔵 支付宝</button>
            <button class="btn-secondary" style="padding:20px;font-size:16px;" onclick="cashierPay(${id},'balance')">💰 余额</button>
        </div>
        <button class="btn-secondary" style="width:100%;" onclick="closeModal()">取消</button>
    `);
};

window.cashierPay = async function(id, method) {
    try {
        const r = await api.put(`/sessions/${id}/end`, { payment_method: method });
        closeModal();
        showToast(`收款成功 · ¥${r.final_amount.toFixed(2)}`);
        navigateTo('cashier');
    } catch (e) { showToast(e.message, 'error'); }
};

registerPage('platform', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">平台概览</h2>
                <p class="section-subtitle">所有商户的经营数据汇总</p>
            </div>
        </div>
        <div id="platform-stats" class="stats-bar"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px;">
            <div class="table-wrapper" style="padding:20px;">
                <h3 style="font-size:14px;margin-bottom:16px;">商户营收排行</h3>
                <div id="merchant-ranking"></div>
            </div>
            <div class="table-wrapper" style="padding:20px;">
                <h3 style="font-size:14px;margin-bottom:16px;">今日活跃</h3>
                <div id="platform-active"></div>
            </div>
        </div>
    `;

    async function load() {
        try {
            // Get all merchants
            const merchants = await api.get('/merchants');
            if (!merchants) return;

            // Get today's summary for each merchant
            let totalRevenue = 0, totalSessions = 0, totalMembers = 0, activeConsoles = 0;
            const merchantStats = [];

            for (const m of merchants) {
                if (!m.is_active) continue;
                // Get bills for this merchant
                const bills = await api.get(`/bills?merchant_id=${m.id}`);
                const todayBills = bills.items || [];
                const revenue = todayBills.reduce((sum, b) => sum + (b.final_amount || 0), 0);
                totalRevenue += revenue;
                totalSessions += todayBills.length;
                merchantStats.push({ name: m.name, revenue, sessions: todayBills.length });
            }

            // Get total members
            const members = await api.get('/members');
            totalMembers = members ? members.length : 0;

            // Get active consoles
            const consoles = await api.get('/consoles');
            if (consoles) {
                activeConsoles = consoles.filter(c => c.status === 'in_use').length;
            }

            // Render stats
            const statsEl = document.getElementById('platform-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="stat-card blue"><div class="value">${merchants.filter(m=>m.is_active).length}</div><div class="label">活跃商户</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div></div>
                    <div class="stat-card green"><div class="value">${totalMembers}</div><div class="label">总会员数</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div></div>
                    <div class="stat-card purple"><div class="value">${activeConsoles}</div><div class="label">使用中主机</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/></svg></div></div>
                    <div class="stat-card yellow"><div class="value">${totalSessions}</div><div class="label">今日总会话</div><div class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg></div></div>
                `;
            }

            // Render merchant ranking
            const rankingEl = document.getElementById('merchant-ranking');
            if (rankingEl) {
                merchantStats.sort((a, b) => b.revenue - a.revenue);
                if (merchantStats.length > 0) {
                    const rows = merchantStats.map((m, i) => [
                        `<span style="font-weight:600;color:${i < 3 ? 'var(--warning)' : 'var(--text-muted)'}">${i + 1}</span>`,
                        `<span style="font-weight:500;">${m.name}</span>`,
                        `<span style="font-weight:600;">¥${m.revenue.toFixed(2)}</span>`,
                        `${m.sessions}单`,
                    ]);
                    renderTable(['排名', '商户', '营收', '会话'], rows, rankingEl);
                } else {
                    rankingEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无数据</p></div>';
                }
            }

            // Render active info
            const activeEl = document.getElementById('platform-active');
            if (activeEl) {
                const activeList = merchants.filter(m => m.is_active).map(m => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
                        <div>
                            <div style="font-weight:500;">${m.name}</div>
                            <div style="font-size:12px;color:var(--text-muted);">${m.contact || '-'} · ${m.user_count}人</div>
                        </div>
                        <span class="badge badge-success">营业中</span>
                    </div>
                `).join('');
                activeEl.innerHTML = activeList || '<div class="empty-state" style="padding:24px;"><p>暂无商户</p></div>';
            }
        } catch (e) {
            showToast('加载失败: ' + e.message, 'error');
        }
    }

    await load();
});

// Platform config page
registerPage('platform-config', async (container) => {
    container.innerHTML = `
        <div class="section-header">
            <div>
                <h2 style="font-size:16px;">系统配置</h2>
                <p class="section-subtitle">平台级参数设置</p>
            </div>
        </div>
        <div class="table-wrapper" style="padding:24px;max-width:600px;">
            <h3 style="font-size:15px;margin-bottom:20px;">充值赠费</h3>
            <div class="form-group">
                <label>全局默认赠费比例（0.1=10%）</label>
                <input id="cfg-bonus-rate" type="number" step="0.01" min="0" max="1" value="0">
            </div>
            <button class="btn-primary" onclick="savePlatformConfig()">保存配置</button>
        </div>
        <div class="table-wrapper" style="padding:24px;max-width:600px;margin-top:20px;">
            <h3 style="font-size:15px;margin-bottom:20px;">会员等级管理</h3>
            <div id="platform-tiers"></div>
        </div>
    `;

    async function load() {
        try {
            const config = await api.get('/system/config');
            if (config) {
                document.getElementById('cfg-bonus-rate').value = config.recharge_bonus_rate || 0;
            }

            const tiers = await api.get('/tiers');
            const tiersEl = document.getElementById('platform-tiers');
            if (tiers && tiersEl) {
                const tierColors = { basic: '#999', silver: '#C0C0C0', gold: '#FFD700', diamond: '#B9F2FF' };
                const rows = tiers.map(t => [
                    `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${t.color};vertical-align:middle;margin-right:6px;"></span><span style="font-weight:500;">${t.tier_name}</span>`,
                    `<span class="badge badge-info">${t.tier_code}</span>`,
                    `<span style="font-weight:600;">${(t.discount_rate * 10).toFixed(1)}折</span>`,
                    `满¥${t.min_recharge}`,
                ]);
                renderTable(['等级名称', '编码', '折扣', '门槛'], rows, tiersEl);
            }
        } catch (e) {}
    }

    await load();
    window.savePlatformConfig = async function() {
        try {
            await api.put('/system/config', {
                recharge_bonus_rate: parseFloat(document.getElementById('cfg-bonus-rate').value) || 0,
            });
            showToast('配置已保存');
        } catch (e) { showToast(e.message, 'error'); }
    };
});

/**
 * 商户功能配置页面（超管专用）
 */
function loadMerchantFeatures() {
    const container = document.getElementById('page-container');
    container.innerHTML = '<div class="loading">加载中...</div>';
    
    // 并行加载商户列表和可用功能
    Promise.all([
        apiRequest('/merchants'),
        apiRequest('/merchants/features/available')
    ]).then(([merchants, features]) => {
        window._merchants = merchants;
        window._availableFeatures = features;
        renderMerchantFeaturesPage(merchants, features);
    }).catch(err => {
        container.innerHTML = `<div class="error">加载失败: ${err.message}</div>`;
    });
}

function renderMerchantFeaturesPage(merchants, features) {
    const container = document.getElementById('page-container');
    
    container.innerHTML = `
        <div class="page-header">
            <h2>🧩 商户功能配置</h2>
            <p class="subtitle">管理各商户可用的功能模块</p>
        </div>
        
        <div class="merchants-grid">
            ${merchants.map(m => `
                <div class="merchant-card" id="merchant-${m.id}">
                    <div class="merchant-card-header">
                        <h3>${m.name}</h3>
                        <span class="badge ${m.is_active ? 'badge-success' : 'badge-danger'}">
                            ${m.is_active ? '营业中' : '已停业'}
                        </span>
                    </div>
                    <div class="merchant-card-body">
                        <div class="merchant-info">
                            <span>📍 ${m.address || '未设置'}</span>
                            <span>📞 ${m.phone || '未设置'}</span>
                        </div>
                        <div class="features-section">
                            <h4>功能模块</h4>
                            <div class="features-grid" id="features-${m.id}">
                                <div class="loading-small">加载中...</div>
                            </div>
                        </div>
                    </div>
                    <div class="merchant-card-footer">
                        <button class="btn btn-sm btn-primary" onclick="showFeatureEditor(${m.id}, '${m.name}')">
                            ⚙️ 配置功能
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="viewMerchantStaff(${m.id}, '${m.name}')">
                            👥 查看员工
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        
        <!-- 功能编辑弹窗 -->
        <div id="featureEditorModal" class="modal" style="display:none;">
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h3 id="featureEditorTitle">功能配置</h3>
                    <button class="btn-close" onclick="closeFeatureEditor()">&times;</button>
                </div>
                <div class="modal-body" id="featureEditorBody">
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeFeatureEditor()">取消</button>
                    <button class="btn btn-primary" onclick="saveFeatureConfig()">保存配置</button>
                </div>
            </div>
        </div>
    `;
    
    // 加载每个商户的功能状态
    merchants.forEach(m => loadMerchantFeatureStatus(m.id));
}

async function loadMerchantFeatureStatus(merchantId) {
    try {
        const data = await apiRequest(`/merchants/${merchantId}/features`);
        const container = document.getElementById(`features-${merchantId}`);
        if (!container) return;
        
        const enabled = data.enabled_features || [];
        const features = data.available_features || [];
        
        container.innerHTML = features.map(f => `
            <span class="feature-tag ${enabled.includes(f.id) ? 'feature-enabled' : 'feature-disabled'}" 
                  title="${f.description}">
                ${enabled.includes(f.id) ? '✅' : '❌'} ${f.name}
            </span>
        `).join('');
    } catch (err) {
        console.error(`加载商户${merchantId}功能失败:`, err);
    }
}

async function showFeatureEditor(merchantId, merchantName) {
    window._editingMerchantId = merchantId;
    
    try {
        const data = await apiRequest(`/merchants/${merchantId}/features`);
        const enabled = data.enabled_features || [];
        
        document.getElementById('featureEditorTitle').textContent = `功能配置 - ${merchantName}`;
        document.getElementById('featureEditorBody').innerHTML = `
            <div class="feature-editor">
                <p class="hint">选择该商户可以使用的功能模块：</p>
                <div class="feature-checkboxes">
                    ${data.available_features.map(f => `
                        <label class="feature-checkbox ${f.required ? 'feature-required' : ''}">
                            <input type="checkbox" name="feature" value="${f.id}" 
                                   ${enabled.includes(f.id) ? 'checked' : ''}
                                   ${f.required ? 'disabled checked' : ''}>
                            <div class="feature-info">
                                <strong>${f.name}</strong>
                                <span>${f.description}</span>
                                ${f.required ? '<span class="badge badge-info">必选</span>' : ''}
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
        
        document.getElementById('featureEditorModal').style.display = 'flex';
    } catch (err) {
        alert('加载失败: ' + err.message);
    }
}

function closeFeatureEditor() {
    document.getElementById('featureEditorModal').style.display = 'none';
    window._editingMerchantId = null;
}

async function saveFeatureConfig() {
    const merchantId = window._editingMerchantId;
    if (!merchantId) return;
    
    const checkboxes = document.querySelectorAll('#featureEditorBody input[name="feature"]:checked');
    const features = Array.from(checkboxes).map(cb => cb.value);
    
    try {
        await apiRequest(`/merchants/${merchantId}/features`, 'PUT', { enabled_features: features });
        alert('功能配置已保存');
        closeFeatureEditor();
        loadMerchantFeatureStatus(merchantId);
    } catch (err) {
        alert('保存失败: ' + err.message);
    }
}

async function viewMerchantStaff(merchantId, merchantName) {
    try {
        const staff = await apiRequest(`/staff?merchant_id=${merchantId}`);
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content modal-lg">
                <div class="modal-header">
                    <h3>员工列表 - ${merchantName}</h3>
                    <button class="btn-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>用户名</th>
                                <th>姓名</th>
                                <th>角色</th>
                                <th>手机</th>
                                <th>最后登录</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${staff.map(s => `
                                <tr>
                                    <td>${s.username}</td>
                                    <td>${s.display_name}</td>
                                    <td><span class="badge badge-${s.role === 'merchant' ? 'primary' : 'info'}">${s.role_name}</span></td>
                                    <td>${s.phone || '-'}</td>
                                    <td>${s.last_login ? new Date(s.last_login).toLocaleString() : '未登录'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${staff.length === 0 ? '<p class="empty-state">暂无员工</p>' : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (err) {
        alert('加载员工列表失败: ' + err.message);
    }
}

// 注册页面
if (typeof registerPage === 'function') {
    registerPage('merchant-features', loadMerchantFeatures);
}

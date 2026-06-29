/**
 * 餐饮商品管理页面
 */
registerPage('products', async (container) => {
    container.innerHTML = '<div class="loading">加载中...</div>';
    try {
        const products = await api.get('/products');
        
        container.innerHTML = `
            <div class="page-header">
                <h2>☕ 餐饮商品</h2>
                <button class="btn btn-primary" onclick="showAddProductModal()">➕ 添加商品</button>
            </div>
            <div class="stats-bar">
                <div class="stat-card">
                    <div class="stat-value">${products.length}</div>
                    <div class="stat-label">商品总数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${products.filter(p => p.is_active).length}</div>
                    <div class="stat-label">在售中</div>
                </div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>商品名称</th>
                            <th>分类</th>
                            <th>价格</th>
                            <th>库存</th>
                            <th>状态</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${products.map(p => `
                            <tr>
                                <td>${p.name}</td>
                                <td>${p.category || '-'}</td>
                                <td>¥${p.price?.toFixed(2) || '0.00'}</td>
                                <td>${p.stock ?? '-'}</td>
                                <td><span class="badge ${p.is_active ? 'badge-success' : 'badge-danger'}">${p.is_active ? '在售' : '下架'}</span></td>
                                <td>
                                    <button class="btn btn-sm" onclick="editProduct(${p.id})">编辑</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${products.length === 0 ? '<div class="empty-state">暂无商品</div>' : ''}
            </div>
        `;
    } catch (e) {
        container.innerHTML = `<div class="error">加载失败: ${e.message}</div>`;
    }
});

function showAddProductModal() {
    showModal('添加商品', `
        <form id="product-form">
            <div class="form-group">
                <label>商品名称 *</label>
                <input type="text" id="prod-name" required>
            </div>
            <div class="form-group">
                <label>分类</label>
                <input type="text" id="prod-category" placeholder="如：饮料、零食">
            </div>
            <div class="form-group">
                <label>价格 *</label>
                <input type="number" id="prod-price" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label>库存</label>
                <input type="number" id="prod-stock" min="0">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button type="button" class="btn btn-primary" onclick="saveProduct()">保存</button>
            </div>
        </form>
    `);
}

async function saveProduct() {
    const data = {
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value || null,
        price: parseFloat(document.getElementById('prod-price').value),
        stock: parseInt(document.getElementById('prod-stock').value) || null
    };
    
    if (!data.name || isNaN(data.price)) {
        showToast('请填写必填项', 'error');
        return;
    }
    
    try {
        await api.post('/products', data);
        showToast('商品添加成功');
        closeModal();
        navigateTo('products');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function editProduct(id) {
    try {
        const product = await api.get(`/products/${id}`);
        showModal('编辑商品', `
            <form id="edit-product-form">
                <div class="form-group">
                    <label>商品名称</label>
                    <input type="text" id="edit-prod-name" value="${product.name}" required>
                </div>
                <div class="form-group">
                    <label>分类</label>
                    <input type="text" id="edit-prod-category" value="${product.category || ''}">
                </div>
                <div class="form-group">
                    <label>价格</label>
                    <input type="number" id="edit-prod-price" value="${product.price}" step="0.01" min="0" required>
                </div>
                <div class="form-group">
                    <label>库存</label>
                    <input type="number" id="edit-prod-stock" value="${product.stock ?? ''}" min="0">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="edit-prod-active" ${product.is_active ? 'checked' : ''}> 在售
                    </label>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">取消</button>
                    <button type="button" class="btn btn-primary" onclick="updateProduct(${id})">更新</button>
                </div>
            </form>
        `);
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function updateProduct(id) {
    const data = {
        name: document.getElementById('edit-prod-name').value,
        category: document.getElementById('edit-prod-category').value || null,
        price: parseFloat(document.getElementById('edit-prod-price').value),
        stock: parseInt(document.getElementById('edit-prod-stock').value) || null,
        is_active: document.getElementById('edit-prod-active').checked
    };
    
    try {
        await api.put(`/products/${id}`, data);
        showToast('商品已更新');
        closeModal();
        navigateTo('products');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

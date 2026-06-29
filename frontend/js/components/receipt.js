// Receipt printing utility

function generateReceiptHTML(data) {
    const now = new Date().toLocaleString('zh-CN');
    const lines = [];

    lines.push('<div class="receipt">');
    lines.push('<div class="receipt-header">');
    lines.push(`<h2>${data.shopName || '游戏主机计费系统'}</h2>`);
    if (data.shopAddr) lines.push(`<p>${data.shopAddr}</p>`);
    lines.push(`<p>${now}</p>`);
    if (data.receiptNo) lines.push(`<p>单号: ${data.receiptNo}</p>`);
    lines.push('</div>');

    if (data.memberName) {
        lines.push(`<div class="receipt-row"><span>会员</span><span>${data.memberName}</span></div>`);
        if (data.memberCode) lines.push(`<div class="receipt-row"><span>编号</span><span>${data.memberCode}</span></div>`);
    }

    lines.push('<div class="receipt-divider"></div>');

    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            lines.push(`<div class="receipt-row"><span>${item.name}</span><span>¥${item.amount.toFixed(2)}</span></div>`);
            if (item.detail) lines.push(`<div style="font-size:11px;color:#666;padding-left:10px;">${item.detail}</div>`);
        });
        lines.push('<div class="receipt-divider"></div>');
    }

    if (data.duration) {
        lines.push(`<div class="receipt-row"><span>时长</span><span>${data.duration}</span></div>`);
    }
    if (data.console) {
        lines.push(`<div class="receipt-row"><span>主机</span><span>${data.console}</span></div>`);
    }

    if (data.originalAmount && data.originalAmount !== data.finalAmount) {
        lines.push(`<div class="receipt-row"><span>原价</span><span>¥${data.originalAmount.toFixed(2)}</span></div>`);
        if (data.discount > 0) {
            lines.push(`<div class="receipt-row"><span>折扣</span><span>-¥${data.discount.toFixed(2)}</span></div>`);
        }
    }

    lines.push('<div class="receipt-divider"></div>');
    lines.push(`<div class="receipt-total">合计: ¥${(data.finalAmount || 0).toFixed(2)}</div>`);

    if (data.paymentMethod) {
        const methods = {balance:'余额',cash:'现金',wechat:'微信',alipay:'支付宝'};
        lines.push(`<div class="receipt-row"><span>支付方式</span><span>${methods[data.paymentMethod] || data.paymentMethod}</span></div>`);
    }
    if (data.balanceAfter !== undefined) {
        lines.push(`<div class="receipt-row"><span>余额</span><span>¥${data.balanceAfter.toFixed(2)}</span></div>`);
    }

    lines.push('<div class="receipt-divider"></div>');
    lines.push('<div class="receipt-footer">');
    lines.push('<p>谢谢惠顾</p>');
    if (data.footer) lines.push(`<p>${data.footer}</p>`);
    lines.push('</div>');
    lines.push('</div>');

    return lines.join('');
}

function printReceipt(data) {
    const html = generateReceiptHTML(data);
    const win = window.open('', '_blank', 'width=400,height=600');
    win.document.write(`
        <!DOCTYPE html>
        <html><head>
        <title>小票</title>
        <link rel="stylesheet" href="/css/receipt.css">
        <style>body{margin:0;padding:10px;background:#fff;}</style>
        </head><body>
        ${html}
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>
    `);
    win.document.close();
}

function showReceiptPreview(data) {
    const html = generateReceiptHTML(data);
    showModal('小票预览', `
        <div class="receipt-preview">${html}</div>
        <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn-primary" style="flex:1;" onclick="printReceipt(${JSON.stringify(data).replace(/"/g, '&quot;')});closeModal();">打印</button>
            <button class="btn-secondary" style="flex:1;" onclick="closeModal();">关闭</button>
        </div>
    `);
}

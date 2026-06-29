// Keyboard shortcuts for gaming cafe billing system

(function() {
    document.addEventListener('keydown', function(e) {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            // Only Esc works in inputs
            if (e.key === 'Escape') {
                e.target.blur();
                closeModal();
            }
            return;
        }

        // Don't trigger if modal is open (except Esc)
        const modalOpen = !document.getElementById('modal-overlay').classList.contains('hidden');

        switch(e.key) {
            case 'Escape':
                if (modalOpen) {
                    closeModal();
                    e.preventDefault();
                }
                break;

            case '1':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    navigateTo('dashboard');
                    e.preventDefault();
                }
                break;

            case '2':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    navigateTo('members');
                    e.preventDefault();
                }
                break;

            case '3':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    navigateTo('bills');
                    e.preventDefault();
                }
                break;

            case 'n':
            case 'N':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    // Quick new session - open first idle console
                    const page = location.hash.slice(2) || 'dashboard';
                    if (page === 'dashboard') {
                        const idleCards = document.querySelectorAll('.console-card.idle');
                        if (idleCards.length > 0) {
                            const consoleId = idleCards[0].getAttribute('data-console-id');
                            if (consoleId) {
                                onConsoleClick(parseInt(consoleId), 'idle');
                                e.preventDefault();
                            }
                        }
                    }
                }
                break;

            case 'r':
            case 'R':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    // Refresh current page
                    const page = location.hash.slice(2) || 'dashboard';
                    navigateTo(page);
                    showToast('已刷新');
                    e.preventDefault();
                }
                break;

            case '?':
                if (!modalOpen && !e.ctrlKey && !e.altKey) {
                    showShortcuts();
                    e.preventDefault();
                }
                break;

            case 'q':
            if (!modalOpen && e.ctrlKey) {
                e.preventDefault();
                doLogout();
            }
            break;

        case 'F5':
                if (!modalOpen) {
                    const page = location.hash.slice(2) || 'dashboard';
                    navigateTo(page);
                    e.preventDefault();
                }
                break;
        }
    });

    // Show keyboard shortcuts help
    window.showShortcuts = function() {
        showModal('键盘快捷键', `
            <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:14px;">
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">1</kbd>
                <span>计费大厅</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">2</kbd>
                <span>会员管理</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">3</kbd>
                <span>账单记录</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">N</kbd>
                <span>快速开台（空闲主机）</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">R</kbd>
                <span>刷新当前页</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">Esc</kbd>
                <span>关闭弹窗</span>
                <kbd style="background:var(--bg-card);padding:4px 8px;border-radius:4px;font-family:monospace;">?</kbd>
                <span>显示此帮助</span>
            </div>
            <p style="margin-top:16px;font-size:12px;color:var(--text-muted);">快捷键在输入框中无效（Esc除外）</p>
        `);
    };
})();

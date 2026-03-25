/**
 * ui-dialogs.js — 统一弹窗系统
 * ================================
 * 提供两个全局函数替代原生 alert / confirm：
 *
 *   showToast(message, type, duration)   → 右上角 Toast 通知
 *   showConfirm(message, options)        → 自定义确认弹窗 (Promise)
 *
 * type: 'success' | 'error' | 'warning' | 'info' (默认)
 */

(function () {
    'use strict';

    // ── 注入 CSS ────────────────────────────────────────────────────────────
    const STYLES = `
/* ── Toast 通知 ── */
#gm-toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: 340px;
}

.gm-toast {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
    font-size: 13.5px;
    line-height: 1.45;
    color: #1a1a2e;
    pointer-events: auto;
    cursor: pointer;
    border-left: 4px solid #6c757d;
    animation: gm-toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards;
    transition: opacity 0.2s, transform 0.2s;
    max-width: 100%;
    word-break: break-word;
}
.gm-toast.gm-toast-out {
    opacity: 0;
    transform: translateX(12px);
}
.gm-toast-icon {
    font-size: 15px;
    flex-shrink: 0;
    margin-top: 1px;
}
.gm-toast-msg { flex: 1; }
.gm-toast-close {
    flex-shrink: 0;
    opacity: 0.45;
    font-size: 14px;
    margin-top: 1px;
    padding: 0 2px;
    cursor: pointer;
}
.gm-toast-close:hover { opacity: 0.8; }

/* 类型颜色 */
.gm-toast.gm-success { border-left-color: #22c55e; background: #f0fdf4; }
.gm-toast.gm-success .gm-toast-icon { color: #16a34a; }
.gm-toast.gm-error   { border-left-color: #ef4444; background: #fef2f2; }
.gm-toast.gm-error   .gm-toast-icon { color: #dc2626; }
.gm-toast.gm-warning { border-left-color: #f59e0b; background: #fffbeb; }
.gm-toast.gm-warning .gm-toast-icon { color: #d97706; }
.gm-toast.gm-info    { border-left-color: #3b82f6; background: #eff6ff; }
.gm-toast.gm-info    .gm-toast-icon { color: #2563eb; }

@keyframes gm-toast-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
}

/* ── 确认弹窗 ── */
#gm-confirm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(3px);
    z-index: 100000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: gm-overlay-in 0.18s ease forwards;
}
@keyframes gm-overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
}

#gm-confirm-box {
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.2);
    padding: 28px 28px 22px;
    min-width: 300px;
    max-width: 420px;
    width: calc(100vw - 48px);
    animation: gm-box-in 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards;
}
@keyframes gm-box-in {
    from { opacity: 0; transform: scale(0.9) translateY(-8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
}

#gm-confirm-icon {
    font-size: 28px;
    margin-bottom: 12px;
}
#gm-confirm-title {
    font-size: 16px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 8px;
}
#gm-confirm-message {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
    margin-bottom: 22px;
    white-space: pre-line;
}
#gm-confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}
#gm-confirm-actions button {
    padding: 9px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.12s;
}
#gm-confirm-actions button:hover  { opacity: 0.88; }
#gm-confirm-actions button:active { transform: scale(0.97); }

#gm-confirm-cancel {
    background: #f3f4f6;
    color: #374151;
}
#gm-confirm-cancel:hover { background: #e5e7eb; }

#gm-confirm-ok {
    background: #3b82f6;
    color: #fff;
}
#gm-confirm-ok.gm-danger {
    background: #ef4444;
}
`;

    function injectStyles() {
        if (document.getElementById('gm-dialog-styles')) return;
        const style = document.createElement('style');
        style.id = 'gm-dialog-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    // ── Toast 实现 ────────────────────────────────────────────────────────────
    const TOAST_ICONS = {
        success: '✅',
        error:   '❌',
        warning: '⚠️',
        info:    'ℹ️'
    };

    function getOrCreateContainer() {
        let c = document.getElementById('gm-toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'gm-toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    /**
     * 显示 Toast 通知
     * @param {string} message  消息内容
     * @param {'success'|'error'|'warning'|'info'} [type='info']
     * @param {number} [duration=3500] 自动消失毫秒数，0 = 不自动消失
     */
    function showToast(message, type, duration) {
        injectStyles();
        type = type || 'info';
        if (duration === undefined) duration = 3500;

        const container = getOrCreateContainer();

        const toast = document.createElement('div');
        toast.className = `gm-toast gm-${type}`;
        toast.innerHTML = `
            <span class="gm-toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
            <span class="gm-toast-msg">${message}</span>
            <span class="gm-toast-close" title="关闭">✕</span>
        `;

        function dismiss() {
            toast.classList.add('gm-toast-out');
            setTimeout(() => toast.remove(), 220);
        }

        toast.querySelector('.gm-toast-close').addEventListener('click', dismiss);
        toast.addEventListener('click', dismiss);
        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }
    }

    // ── Confirm 实现 ──────────────────────────────────────────────────────────

    /**
     * 显示自定义确认弹窗
     * @param {string} message  提示内容
     * @param {{
     *   title?: string,
     *   confirmText?: string,
     *   cancelText?: string,
     *   danger?: boolean,
     *   icon?: string
     * }} [options]
     * @returns {Promise<boolean>} 用户点击确认返回 true，取消/关闭返回 false
     */
    function showConfirm(message, options) {
        injectStyles();
        options = options || {};

        // 移除已有弹窗
        const existing = document.getElementById('gm-confirm-overlay');
        if (existing) existing.remove();

        return new Promise(function (resolve) {
            const title       = options.title       || '确认';
            const confirmText = options.confirmText || '确定';
            const cancelText  = options.cancelText  || '取消';
            const isDanger    = options.danger !== false; // 默认危险样式（红色）
            const icon        = options.icon || (isDanger ? '⚠️' : 'ℹ️');

            const overlay = document.createElement('div');
            overlay.id = 'gm-confirm-overlay';
            overlay.innerHTML = `
                <div id="gm-confirm-box">
                    <div id="gm-confirm-icon">${icon}</div>
                    <div id="gm-confirm-title">${title}</div>
                    <div id="gm-confirm-message">${message}</div>
                    <div id="gm-confirm-actions">
                        <button id="gm-confirm-cancel">${cancelText}</button>
                        <button id="gm-confirm-ok" class="${isDanger ? 'gm-danger' : ''}">${confirmText}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            function finish(result) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 180);
                resolve(result);
            }

            overlay.querySelector('#gm-confirm-ok').addEventListener('click', () => finish(true));
            overlay.querySelector('#gm-confirm-cancel').addEventListener('click', () => finish(false));

            // 点击遮罩取消
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) finish(false);
            });

            // 键盘支持
            function onKey(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.removeEventListener('keydown', onKey);
                    finish(true);
                } else if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onKey);
                    finish(false);
                }
            }
            document.addEventListener('keydown', onKey);

            // 自动聚焦确认按钮
            setTimeout(() => {
                const okBtn = overlay.querySelector('#gm-confirm-ok');
                if (okBtn) okBtn.focus();
            }, 50);
        });
    }

    // ── 挂载到全局 ───────────────────────────────────────────────────────────
    window.showToast   = showToast;
    window.showConfirm = showConfirm;

    // NOTE: 保留 showBriefMessage 兼容（内部委托给 Toast）
    const _origBriefMsg = window.showBriefMessage;
    window.showBriefMessage = function (message) {
        // showBriefMessage 已有自己的实现；若 ui-dialogs 先加载则保留原有行为
        if (_origBriefMsg) {
            _origBriefMsg(message);
        } else {
            showToast(message, 'info', 2500);
        }
    };

})();

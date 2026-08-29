// ==UserScript==
// @name                 Twitch Channel Points Auto-Highlight
// @name:zh-CN           Twitch 自动频道点数醒目留言 (Ctrl+Enter)
// @namespace            https://github.com/TZFC
// @version              1.5.0
// @description          Press Ctrl+Enter (or Cmd+Enter on Mac) in Twitch chat to automatically spend Channel Points and send a highlighted message. Regular Enter still sends normal messages.
// @description:zh-CN    在 Twitch 聊天框中按 Ctrl+Enter（Mac 上为 Cmd+Enter）自动使用频道积分发送醒目/高亮消息。常规 Enter 仍然发送普通消息。
// @author               tianzifangchen
// @match                https://www.twitch.tv/*
// @match                https://*.twitch.tv/*
// @icon                 https://www.google.com/s2/favicons?sz=64&domain=twitch.tv
// @license              GPL-3.0
// @run-at               document-idle
// @grant                GM_setValue
// @grant                GM_getValue
// @grant                GM_registerMenuCommand
// @grant                unsafeWindow
// @downloadURL          https://github.com/TZFC/twitch-tampermonkey-highlight/raw/refs/heads/main/twitch-auto-highlight.user.js
// @updateURL            https://github.com/TZFC/twitch-tampermonkey-highlight/raw/refs/heads/main/twitch-auto-highlight.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ==========================================
    // Configuration & State
    // ==========================================
    const CONFIG = {
        toastDurationMs: 3500,
        enableToast: GM_getValue('enableToast', true),
        enableIndicator: GM_getValue('enableIndicator', true),
        enableStealth: GM_getValue('enableStealth', true),
    };

    // Multi-language keywords for "Highlight My Message"
    const HIGHLIGHT_KEYWORDS = [
        /highlight.*message/i,
        /highlight/i,
        /突出显示.*消息/i,
        /突出显示/i,
        /醒目.*留言/i,
        /醒目/i,
        /高亮/i,
        /hervorheben/i,
        /mettre en évidence/i,
        /destacar.*mensaje/i,
        /destacar/i,
        /evidenzia.*messaggio/i,
        /evidenzia/i,
        /destaque.*mensagem/i,
        /destaque/i,
        /ハイライト/i,
        /강조/i,
        /send_highlighted_message/i,
        /sendhighlightedmessage/i,
        /highlighted/i
    ];

    let isExecuting = false;

    // ==========================================
    // UI Helpers: Notifications & Indicator
    // ==========================================
    function showToast(message, type = 'info') {
        if (!CONFIG.enableToast) return;

        let toastContainer = document.getElementById('tw-auto-highlight-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'tw-auto-highlight-toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `tah-toast tah-toast-${type}`;

        const icon = type === 'success' ? '✨' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `<span class="tah-toast-icon">${icon}</span><span class="tah-toast-text">${message}</span>`;

        toastContainer.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('tah-toast-show');
        });

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('tah-toast-show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, CONFIG.toastDurationMs);
    }

    function injectStyles() {
        if (document.getElementById('tw-auto-highlight-styles')) return;

        const style = document.createElement('style');
        style.id = 'tw-auto-highlight-styles';
        style.textContent = `
            /* Soft stealth mode keeps elements interactive while dimming during execution */
            .tah-stealth-active [data-test-selector="community-points-reward-list"],
            .tah-stealth-active [data-test-selector="community-points-dialog"],
            .tah-stealth-active [class*="community-points-reward-list"],
            .tah-stealth-active [class*="reward-center-body"],
            .tah-stealth-active div[class*="InjectLayout"][data-target="community-points-summary"] ~ div {
                opacity: 0.05 !important;
                pointer-events: auto !important;
                transition: none !important;
            }

            /* Toast container */
            #tw-auto-highlight-toast-container {
                position: fixed;
                bottom: 85px;
                right: 360px;
                z-index: 9999999;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
                font-family: Inter, Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif;
            }

            @media (max-width: 900px) {
                #tw-auto-highlight-toast-container {
                    right: 20px;
                    bottom: 75px;
                }
            }

            .tah-toast {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                color: #ffffff;
                background: rgba(24, 24, 27, 0.95);
                backdrop-filter: blur(12px);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1);
                opacity: 0;
                transform: translateY(12px) scale(0.95);
                transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: auto;
            }

            .tah-toast.tah-toast-show {
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            .tah-toast-success {
                border-left: 3px solid #9146ff;
                background: linear-gradient(135deg, rgba(35, 22, 60, 0.96), rgba(20, 20, 26, 0.96));
                box-shadow: 0 6px 20px rgba(145, 70, 255, 0.35), 0 0 0 1px rgba(145, 70, 255, 0.3);
            }

            .tah-toast-warning {
                border-left: 3px solid #f59e0b;
                background: linear-gradient(135deg, rgba(50, 35, 15, 0.96), rgba(24, 24, 27, 0.96));
            }

            .tah-toast-error {
                border-left: 3px solid #ef4444;
                background: linear-gradient(135deg, rgba(50, 20, 20, 0.96), rgba(24, 24, 27, 0.96));
            }

            .tah-toast-icon {
                font-size: 15px;
            }

            /* Mini Badge in Chat Input area */
            .tah-shortcut-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                font-weight: 600;
                color: #adadb8;
                padding: 2px 6px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.08);
                user-select: none;
                cursor: default;
                margin-left: 6px;
                transition: color 0.15s, background 0.15s, border-color 0.15s;
            }

            .tah-shortcut-badge:hover {
                color: #bf94ff;
                background: rgba(145, 70, 255, 0.15);
                border-color: rgba(145, 70, 255, 0.3);
            }

            .tah-shortcut-badge kbd {
                font-family: inherit;
                font-size: 10px;
                background: rgba(0, 0, 0, 0.3);
                padding: 1px 4px;
                border-radius: 3px;
                border: 1px solid rgba(255, 255, 255, 0.15);
            }
        `;
        document.head.appendChild(style);
    }

    function updateChatInputBadge() {
        if (!CONFIG.enableIndicator) return;

        const chatButtonsContainer = document.querySelector(
            '[data-a-target="chat-send-button"]'
        )?.parentElement || document.querySelector(
            '.chat-input__buttons-container'
        ) || document.querySelector(
            '[data-test-selector="chat-input-buttons-container"]'
        );

        if (chatButtonsContainer && !document.getElementById('tah-shortcut-hint')) {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const keyLabel = isMac ? '⌘+↵' : 'Ctrl+↵';

            const badge = document.createElement('div');
            badge.id = 'tah-shortcut-hint';
            badge.className = 'tah-shortcut-badge';
            badge.title = `Press ${isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} to send as Highlighted message using Channel Points!`;
            badge.innerHTML = `<span>✨</span> <kbd>${keyLabel}</kbd> <span>Highlight</span>`;

            chatButtonsContainer.insertBefore(badge, chatButtonsContainer.firstChild);
        }
    }

    // ==========================================
    // Slate & React Fiber Text Setter
    // ==========================================
    function getChatInputElement() {
        return (
            document.querySelector('div[data-a-target="chat-input"]') ||
            document.querySelector('div.chat-wysiwyg-input__editor') ||
            document.querySelector('div[contenteditable="true"][data-slate-editor="true"]') ||
            document.querySelector('textarea[data-a-target="chat-input"]') ||
            document.querySelector('.chat-wysiwyg-input div[contenteditable="true"]')
        );
    }

    function getChatText(inputEl) {
        if (!inputEl) return '';
        if (inputEl.tagName.toLowerCase() === 'textarea' || inputEl.tagName.toLowerCase() === 'input') {
            return inputEl.value.trim();
        }
        return (inputEl.innerText || inputEl.textContent || '').trim();
    }

    function setChatText(inputEl, text) {
        if (!inputEl) return;
        inputEl.focus();

        // 1. Standard textarea or text input
        if (inputEl.tagName.toLowerCase() === 'textarea' || inputEl.tagName.toLowerCase() === 'input') {
            const proto = inputEl.tagName.toLowerCase() === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (valueSetter) {
                valueSetter.call(inputEl, text);
            } else {
                inputEl.value = text;
            }
            inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return;
        }

        // 2. Slate.js ContentEditable (Twitch Chat) via React Fiber
        const reactFiberKey = Object.keys(inputEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (reactFiberKey) {
            let current = inputEl[reactFiberKey];
            while (current) {
                if (current.memoizedProps?.editor) {
                    const slateEditor = current.memoizedProps.editor;
                    try {
                        slateEditor.children = [{
                            type: 'paragraph',
                            children: [{ text: text, type: 'text' }]
                        }];
                        slateEditor.selection = {
                            anchor: { path: [0, 0], offset: text.length },
                            focus: { path: [0, 0], offset: text.length }
                        };
                        slateEditor.onChange();
                        return; // Return immediately to prevent duplicate synthetic event insertion!
                    } catch (err) {
                        console.warn('[Twitch Auto-Highlight] Slate editor update error:', err);
                    }
                    break;
                }
                if (typeof current.memoizedProps?.setInputValue === 'function') {
                    try {
                        current.memoizedProps.setInputValue(text);
                    } catch (e) {}
                }
                current = current.return;
            }
        }

        // 3. Synthetic beforeinput & execCommand fallback (only if Slate React Fiber was not found)
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            selection.removeAllRanges();
            selection.addRange(range);

            document.execCommand('delete', false, null);
            if (text) {
                document.execCommand('insertText', false, text);
            }

            inputEl.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                composed: true,
                cancelable: false,
                inputType: text ? 'insertText' : 'deleteContentBackward',
                data: text || null
            }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } catch (err) {
            console.warn('[Twitch Auto-Highlight] execCommand error:', err);
        }
    }

    function robustClick(element) {
        if (!element) return;
        element.focus();
        element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        element.click();
    }

    function getPointsButton() {
        return (
            document.querySelector('button[aria-label*="Balances" i]') ||
            document.querySelector('button[aria-label*="Points" i]') ||
            document.querySelector('button[aria-label*="点数" i]') ||
            document.querySelector('button[aria-label*="Point" i]') ||
            document.querySelector('button[data-test-selector="community-points-summary-button"]') ||
            document.querySelector('button[data-a-target="community-points-summary-button"]') ||
            document.querySelector('div[data-target="community-points-summary"] button') ||
            document.querySelector('.community-points-summary button') ||
            document.querySelector('div[data-test-selector="community-points-summary"] button')
        );
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Precise finder for "Highlight My Message" reward button in Reward Center
    function findHighlightRewardButton() {
        const candidates = Array.from(document.querySelectorAll(
            'button, div[role="button"], [class*="tw-interactable"], [data-test-selector="community-points-reward-item"], div[class*="reward-item"]'
        ));

        for (const el of candidates) {
            // 1. Match by image source or alt text (Twitch standard highlight icon)
            const img = el.querySelector('img');
            if (img) {
                const src = img.getAttribute('src') || '';
                const alt = img.getAttribute('alt') || '';
                const srcset = img.getAttribute('srcset') || '';
                if (src.includes('highlight') || srcset.includes('highlight') || HIGHLIGHT_KEYWORDS.some(r => r.test(alt))) {
                    return el.closest('button, [role="button"], [class*="tw-interactable"]') || el;
                }
            }

            // 2. Match by text, title, aria-label, data-test-selector
            const text = (el.innerText || el.textContent || '').trim();
            const aria = el.getAttribute('aria-label') || '';
            const title = el.getAttribute('title') || '';
            const test = el.getAttribute('data-test-selector') || '';

            if (
                HIGHLIGHT_KEYWORDS.some(r => r.test(text)) ||
                HIGHLIGHT_KEYWORDS.some(r => r.test(aria)) ||
                HIGHLIGHT_KEYWORDS.some(r => r.test(title)) ||
                HIGHLIGHT_KEYWORDS.some(r => r.test(test))
            ) {
                return el.closest('button, [role="button"], [class*="tw-interactable"]') || el;
            }
        }

        return null;
    }

    // ==========================================
    // Core Highlight Redemption Flow
    // ==========================================
    async function sendHighlightedMessage(messageText) {
        if (isExecuting) return;
        if (!messageText || messageText.trim() === '') return;

        isExecuting = true;
        if (CONFIG.enableStealth) {
            document.body.classList.add('tah-stealth-active');
        }

        console.log('[Twitch Auto-Highlight] 🚀 Triggering Highlight for message:', messageText);

        try {
            const pointsBtn = getPointsButton();
            if (!pointsBtn) {
                showToast('Channel Points button not found on this stream', 'warning');
                return;
            }

            // Step 1: Open Channel Points store
            console.log('[Twitch Auto-Highlight] Step 1: Opening Reward Center...');
            robustClick(pointsBtn);

            // Step 2: Search for "Highlight My Message" reward button (up to 2s)
            let highlightRewardBtn = null;
            let attempts = 0;
            const maxAttempts = 35;

            while (attempts < maxAttempts) {
                await sleep(50);

                // Handle first-time "Get Started!" modal if present
                const getStartedBtn = Array.from(document.querySelectorAll('button')).find(b =>
                    (b.innerText || '').includes('Get Started') || (b.innerText || '').includes('开始')
                );
                if (getStartedBtn) {
                    console.log('[Twitch Auto-Highlight] Dismissing onboarding "Get Started"...');
                    robustClick(getStartedBtn);
                    await sleep(150);
                }

                highlightRewardBtn = findHighlightRewardButton();
                if (highlightRewardBtn) break;

                // Try scrolling down the reward list if not found yet
                if (attempts === 15) {
                    const scrollContainer = document.querySelector('[class*="scrollable"], [data-simplebar="init"], div[style*="overflow"]');
                    if (scrollContainer) scrollContainer.scrollTop = 350;
                }

                attempts++;
            }

            if (!highlightRewardBtn) {
                console.warn('[Twitch Auto-Highlight] Highlight reward button not found in Reward Center.');
                showToast('Highlight reward is disabled or not found', 'warning');
                closePointsMenu();
                return;
            }

            console.log('[Twitch Auto-Highlight] Step 2: Found Highlight reward button:', highlightRewardBtn);

            // Check if reward is disabled / on cooldown / insufficient points
            const isRewardDisabled = (
                highlightRewardBtn.disabled ||
                highlightRewardBtn.getAttribute('aria-disabled') === 'true' ||
                highlightRewardBtn.classList.contains('tw-disabled') ||
                highlightRewardBtn.querySelector('[class*="cooldown"]') !== null
            );

            if (isRewardDisabled) {
                console.warn('[Twitch Auto-Highlight] Highlight reward is disabled/cooldown/insufficient points.');
                showToast('Highlight reward on cooldown or insufficient points', 'warning');
                closePointsMenu();
                return;
            }

            // Step 3: Click the Highlight reward button
            console.log('[Twitch Auto-Highlight] Step 3: Clicking Highlight reward button...');
            robustClick(highlightRewardBtn);

            // Step 4: Wait for Twitch to transition into Highlight Redemption Mode and clear input (300ms)
            await sleep(300);

            let dialogInput = document.querySelector(
                '[data-test-selector="reward-redemption-text-area"], ' +
                '[data-test-selector="community-points-dialog"] textarea, ' +
                '[data-test-selector="community-points-dialog"] [contenteditable="true"], ' +
                'div[class*="reward-center"] textarea, ' +
                'div[class*="reward-center"] [contenteditable="true"], ' +
                'div[role="dialog"] textarea, ' +
                'div[role="dialog"] [contenteditable="true"]'
            );

            const activeEditor = dialogInput || getChatInputElement();
            console.log('[Twitch Auto-Highlight] Step 4: Re-typing message into active editor:', activeEditor);

            // Step 5: Re-type message into the active editor
            if (activeEditor) {
                setChatText(activeEditor, messageText);
                // Allow Slate & React state to settle
                await sleep(150);
            }

            // Step 6: Submit the redemption
            let redeemBtn = document.querySelector(
                'button[data-test-selector="community-points-redeem-button"], ' +
                'button[data-a-target="community-points-redeem-button"], ' +
                '[data-test-selector="community-points-dialog"] button.tw-button--primary, ' +
                'div[class*="reward-center"] button.tw-button--primary, ' +
                'div[role="dialog"] button.tw-button--primary'
            );

            let highlightSent = false;

            if (redeemBtn && !redeemBtn.disabled && redeemBtn.getAttribute('aria-disabled') !== 'true') {
                console.log('[Twitch Auto-Highlight] Clicking Redeem confirmation button...');
                robustClick(redeemBtn);
                highlightSent = true;
            } else if (activeEditor) {
                console.log('[Twitch Auto-Highlight] Dispatching Enter on active editor...');
                activeEditor.focus();
                const enterParams = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
                activeEditor.dispatchEvent(new KeyboardEvent('keydown', enterParams));
                activeEditor.dispatchEvent(new KeyboardEvent('keypress', enterParams));
                activeEditor.dispatchEvent(new KeyboardEvent('keyup', enterParams));

                const sendBtn = document.querySelector('button[data-a-target="chat-send-button"]');
                if (sendBtn && !sendBtn.disabled) {
                    robustClick(sendBtn);
                }
                highlightSent = true;
            }

            if (highlightSent) {
                console.log('[Twitch Auto-Highlight] Step 6: Highlight redemption submitted!');
                showToast('Highlighted message sent!', 'success');

                // Clear any leftover duplicate text from the regular chatbox
                await sleep(350);
                const finalChatInput = getChatInputElement();
                if (finalChatInput) {
                    const leftover = getChatText(finalChatInput);
                    if (leftover === messageText) {
                        setChatText(finalChatInput, '');
                    }
                }
            } else {
                showToast('Could not complete highlight redemption', 'warning');
            }

            // Close points menu if still open
            await sleep(200);
            closePointsMenu();

        } catch (error) {
            console.error('[Twitch Auto-Highlight Error]', error);
            showToast('Error executing highlight', 'error');
            closePointsMenu();
        } finally {
            document.body.classList.remove('tah-stealth-active');
            isExecuting = false;
        }
    }

    function closePointsMenu() {
        const popover = document.querySelector(
            '[data-test-selector="community-points-reward-list"], ' +
            '[data-test-selector="community-points-dialog"], ' +
            '[class*="community-points-reward-list"], ' +
            'div[class*="reward-center"]'
        );

        if (!popover) return;

        const closeBtn = popover.querySelector(
            'button[aria-label*="Close" i], ' +
            'button[aria-label*="关闭" i], ' +
            'button[aria-label*="Dismiss" i], ' +
            '[data-a-target="close-button"]'
        );
        if (closeBtn) {
            robustClick(closeBtn);
            return;
        }

        const pointsBtn = getPointsButton();
        if (pointsBtn && pointsBtn.getAttribute('aria-expanded') === 'true') {
            robustClick(pointsBtn);
        }
    }

    // ==========================================
    // Event Interception (Ctrl+Enter / Cmd+Enter)
    // ==========================================
    function handleKeyDown(e) {
        if (e.key !== 'Enter') return;
        if (!e.ctrlKey && !e.metaKey) return; // Only trigger for Ctrl+Enter or Cmd+Enter

        const chatInput = getChatInputElement();
        const activeEl = document.activeElement;

        const isChatFocused = (
            activeEl === chatInput ||
            (chatInput && chatInput.contains(activeEl)) ||
            (activeEl && (
                activeEl.getAttribute('data-a-target') === 'chat-input' ||
                activeEl.classList.contains('chat-wysiwyg-input__editor') ||
                activeEl.getAttribute('data-slate-editor') === 'true' ||
                activeEl.closest('[data-a-target="chat-input"]') ||
                activeEl.closest('.chat-wysiwyg-input')
            ))
        );

        if (!isChatFocused) return;

        // Block regular Enter send behavior
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const targetInput = chatInput || activeEl;
        const messageText = getChatText(targetInput);
        if (!messageText || messageText.trim() === '') return;

        sendHighlightedMessage(messageText);
    }

    // ==========================================
    // Tampermonkey Menu Commands & Init
    // ==========================================
    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`Toggle Toast Notifications (${CONFIG.enableToast ? 'ON' : 'OFF'})`, () => {
                CONFIG.enableToast = !CONFIG.enableToast;
                GM_setValue('enableToast', CONFIG.enableToast);
                showToast(`Toast notifications ${CONFIG.enableToast ? 'Enabled' : 'Disabled'}`);
            });

            GM_registerMenuCommand(`Toggle Shortcut Badge (${CONFIG.enableIndicator ? 'ON' : 'OFF'})`, () => {
                CONFIG.enableIndicator = !CONFIG.enableIndicator;
                GM_setValue('enableIndicator', CONFIG.enableIndicator);
                const badge = document.getElementById('tah-shortcut-hint');
                if (badge) badge.style.display = CONFIG.enableIndicator ? 'inline-flex' : 'none';
            });

            GM_registerMenuCommand(`Toggle Stealth Mode (${CONFIG.enableStealth ? 'ON' : 'OFF'})`, () => {
                CONFIG.enableStealth = !CONFIG.enableStealth;
                GM_setValue('enableStealth', CONFIG.enableStealth);
                showToast(`Stealth mode ${CONFIG.enableStealth ? 'Enabled' : 'Disabled'}`);
            });
        }
    }

    function init() {
        injectStyles();
        registerMenuCommands();

        // Capture keydown before Twitch's native handlers
        window.addEventListener('keydown', handleKeyDown, true);

        // Inject shortcut hint badge
        setInterval(updateChatInputBadge, 1500);

        console.log('[Twitch Auto-Highlight] Ready. Press Ctrl+Enter (or Cmd+Enter) in chat to send a highlighted message!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

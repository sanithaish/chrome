// Content Script for JSON Beautifier Chrome Extension

(function () {
  'use strict';

  let toastContainer = null;
  let isProcessing = false;

  // Utility to create/get toast container
  function getToastContainer() {
    if (!toastContainer || !document.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'json-beautifier-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  // Toast notification alert display
  function showToast(title, message, type = 'info', duration = 4000) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `json-beautifier-toast`;

    const iconSymbol = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';
    const iconClass = type;

    toast.innerHTML = `
      <div class="json-beautifier-toast-icon ${iconClass}">${iconSymbol}</div>
      <div class="json-beautifier-toast-body">
        <div class="json-beautifier-toast-title">${escapeHTML(title)}</div>
        <div class="json-beautifier-toast-message">${escapeHTML(message)}</div>
      </div>
      <button class="json-beautifier-toast-close" title="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.json-beautifier-toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(toast);
      }, duration);
    }
  }

  function removeToast(toast) {
    if (!toast || toast.classList.contains('hide')) return;
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 260);
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Extract selected text safely from active element or window selection
  function getSelectedText() {
    let text = '';
    const activeEl = document.activeElement;

    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      if (start !== undefined && end !== undefined && start !== end) {
        text = activeEl.value.substring(start, end);
      }
    }

    if (!text && window.getSelection) {
      text = window.getSelection().toString();
    }

    return text ? text.trim() : '';
  }

  // Robust JSON parser with lenient fallback parsing
  function validateAndNormalizeJSON(rawText) {
    if (!rawText) return { valid: false, error: 'No text selected.' };

    let cleaned = rawText.trim();

    // Strip markdown code fences if copied from chat/docs
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    // Try standard JSON parse
    try {
      const parsed = JSON.parse(cleaned);
      return { valid: true, parsed, formatted: JSON.stringify(parsed, null, 2), original: cleaned };
    } catch (e1) {
      const firstErr = e1.message;

      // Check if it's single-quoted JS object string
      try {
        // Safe evaluation of JS object literal syntax without execute code risk
        const relaxedJson = cleaned
          .replace(/;\s*$/, '')
          .replace(/(['"])?([a-zA-Z0-9_$]+)(['"])?\s*:/g, '"$2":')
          .replace(/'/g, '"');
        const parsed = JSON.parse(relaxedJson);
        return { valid: true, parsed, formatted: JSON.stringify(parsed, null, 2), original: cleaned };
      } catch (e2) {
        return { valid: false, error: firstErr, original: cleaned };
      }
    }
  }

    // Check if extension context is valid
  function isContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Safe background messaging with context invalidation handling
  function safeSendMessage(message) {
    if (!isContextValid()) {
      showToast(
        'Extension Context Invalidated',
        'The extension was reloaded. Please refresh this web page tab.',
        'error',
        6000
      );
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err && err.message && err.message.includes('Extension context invalidated')) {
          showToast(
            'Extension Context Invalidated',
            'Please refresh this web page tab to reconnect.',
            'error',
            6000
          );
        }
      });
    } catch (e) {
      if (e.message && e.message.includes('Extension context invalidated')) {
        showToast(
          'Extension Context Invalidated',
          'Please refresh this web page tab to reconnect.',
          'error',
          6000
        );
      }
    }
  }

  // Process text check & trigger viewer
  function processSelectedText() {
    if (isProcessing) return;
    isProcessing = true;
    setTimeout(() => { isProcessing = false; }, 300);

    const selectedText = getSelectedText();
    if (!selectedText) {
      // If nothing selected, notify user subtly
      showToast('No Text Selected', 'Please select a JSON string on the page and press Ctrl+Shift.', 'info', 3000);
      return;
    }

    const result = validateAndNormalizeJSON(selectedText);

    if (result.valid) {
      showToast('Valid JSON Detected!', 'Opening beautified interactive viewer...', 'success', 2000);
      // Send message safely to background script to launch viewer tab
      safeSendMessage({
        action: 'open_viewer',
        jsonString: result.formatted,
        originalString: result.original
      });
    } else {
      showToast(
        'Selected Text is NOT Valid JSON',
        `Error: ${result.error}`,
        'error',
        5000
      );
    }
  }

  // Floating Action Button Management
  let floatingBtn = null;
  let selectionCheckTimeout = null;

  function createOrGetFloatingButton() {
    if (!floatingBtn || !document.contains(floatingBtn)) {
      floatingBtn = document.createElement('button');
      floatingBtn.className = 'json-beautifier-floating-btn';
      floatingBtn.innerHTML = `<span class="btn-badge">{ }</span> Beautify JSON`;

      // Prevent button click from losing selection state
      floatingBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      floatingBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideFloatingButton();
        processSelectedText();
      });

      document.body.appendChild(floatingBtn);
    }
    return floatingBtn;
  }

  function hideFloatingButton() {
    if (floatingBtn && floatingBtn.parentNode) {
      floatingBtn.parentNode.removeChild(floatingBtn);
      floatingBtn = null;
    }
  }

  function handleSelectionChange() {
    if (!isContextValid()) {
      hideFloatingButton();
      return;
    }

    clearTimeout(selectionCheckTimeout);
    selectionCheckTimeout = setTimeout(() => {
      if (!isContextValid()) {
        hideFloatingButton();
        return;
      }

      const selectedText = getSelectedText();

      if (!selectedText || selectedText.length < 2) {
        hideFloatingButton();
        return;
      }

      // Check if text is valid JSON
      const validation = validateAndNormalizeJSON(selectedText);
      if (!validation.valid) {
        hideFloatingButton();
        return;
      }

      // Find selection bounding rectangle for positioning
      let rect = null;
      const selection = window.getSelection();

      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        rect = range.getBoundingClientRect();
      }

      const activeEl = document.activeElement;
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          rect = activeEl.getBoundingClientRect();
        }
      }

      if (!rect || (rect.width === 0 && rect.height === 0)) {
        hideFloatingButton();
        return;
      }

      const btn = createOrGetFloatingButton();

      // Position pill right below or above selection
      const topPos = window.scrollY + rect.bottom + 6;
      const leftPos = Math.max(10, window.scrollX + rect.left);

      btn.style.top = `${topPos}px`;
      btn.style.left = `${leftPos}px`;
    }, 180);
  }

  // Listen for selection changes and mouse release
  document.addEventListener('mouseup', handleSelectionChange);
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Control' && e.key !== 'Shift') {
      handleSelectionChange();
    }
  });

  // Hide floating button on mouse down elsewhere
  document.addEventListener('mousedown', (e) => {
    if (floatingBtn && !floatingBtn.contains(e.target)) {
      hideFloatingButton();
    }
  });

  // Keyboard shortcut listener
  // Detects Ctrl + Shift keypress combination when text is selected
  let lastShiftTime = 0;
  let lastCtrlTime = 0;

  document.addEventListener('keydown', function (e) {
    // Check if Ctrl + Shift or Cmd + Shift combination
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;

    // Check for explicit combination: Ctrl+Shift or Ctrl+Shift+J
    if (isCtrlOrCmd && isShift) {
      const selection = getSelectedText();

      // Trigger if key is Shift while Ctrl is held, or key is Ctrl while Shift held, or key is 'J'
      if (selection.length > 0) {
        // Avoid conflict with standard browser input unless intended
        if (e.key === 'Control' || e.key === 'Shift' || e.key.toLowerCase() === 'j') {
          // If text is selected and user presses Ctrl+Shift or Ctrl+Shift+J
          processSelectedText();
        }
      }
    }
  });

  // Listen for background service worker messages (e.g. from context menu or shortcut command)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'check_selection') {
      processSelectedText();
      sendResponse({ status: 'done' });
    } else if (request.action === 'show_toast') {
      showToast(request.title, request.message, request.type, request.duration || 4000);
      sendResponse({ status: 'done' });
    }
    return true;
  });
})();

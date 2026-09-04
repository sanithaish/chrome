// JSON Viewer Engine & Independent Dual Pane Inspector

(function () {
  'use strict';

  // Global Controllers
  let paneLeft = null;
  let paneRight = null;
  let isSyncPanesEnabled = localStorage.getItem('json_sync_panes') === 'true';

  // Global Top Loading Progress Bar Helpers
  let progressBarTimer = null;

  function startTopLoading(percent = 25) {
    const bar = document.getElementById('topProgressBar');
    const fill = document.getElementById('topProgressBarFill');
    if (!bar || !fill) return;
    clearTimeout(progressBarTimer);
    bar.classList.remove('hidden');
    fill.style.width = percent + '%';
  }

  function updateTopLoading(percent) {
    const fill = document.getElementById('topProgressBarFill');
    if (fill) fill.style.width = percent + '%';
  }

  function finishTopLoading() {
    const bar = document.getElementById('topProgressBar');
    const fill = document.getElementById('topProgressBarFill');
    if (!bar || !fill) return;
    fill.style.width = '100%';
    progressBarTimer = setTimeout(() => {
      bar.classList.add('hidden');
      fill.style.width = '0%';
    }, 450);
  }

  // DOM Elements
  const btnLayoutSplit = document.getElementById('btnLayoutSplit');
  const btnLayoutLeft = document.getElementById('btnLayoutLeft');
  const btnLayoutRight = document.getElementById('btnLayoutRight');
  const paneLeftEl = document.getElementById('paneLeft');
  const paneRightEl = document.getElementById('paneRight');
  const paneDividerEl = document.getElementById('paneDivider');

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Initialize Left & Right Pane Controllers
    paneLeft = new JSONPaneController('Left', 'Web Selection / Input A');
    paneRight = new JSONPaneController('Right', 'Manual Input / Input B');
    window.paneLeft = paneLeft;
    window.paneRight = paneRight;

    loadJSONData();
    setupGlobalEventListeners();
  });

  // Independent Pane Controller Class
  class JSONPaneController {
    constructor(prefix, defaultSource) {
      this.prefix = prefix;
      this.rawText = '';
      this.parsedJSON = null;
      this.sourcePath = defaultSource || 'Manual Input';
      this.selectedPath = 'root';

      // DOM Elements
      this.treeRootEl = document.getElementById(`jsonTreeRoot${prefix}`);
      this.rawCodeEl = document.getElementById(`raw${prefix}Content`);
      this.minifiedCodeEl = document.getElementById(`minified${prefix}Content`);
      this.sourceValueEl = document.getElementById(`source${prefix}Value`);
      this.pathValueEl = document.getElementById(`path${prefix}Value`);
      this.textareaEl = document.getElementById(`${prefix.toLowerCase()}Textarea`);
      this.lineNumbersEl = document.getElementById(`${prefix.toLowerCase()}LineNumbers`);
      this.bracketOverlayEl = document.getElementById(prefix === 'Left' ? 'leftBracketOverlay' : 'rightBracketOverlay');
      this.guideCanvasEl = document.getElementById(prefix === 'Left' ? 'leftGuideCanvas' : 'rightGuideCanvas');
      this.editErrorEl = document.getElementById(`${prefix.toLowerCase()}EditError`);

      // Tabs
      this.tabTree = document.getElementById(`tab${prefix}Tree`);
      this.tabEditor = document.getElementById(`tab${prefix}Editor`);
      this.tabRaw = document.getElementById(`tab${prefix}Raw`);
      this.tabMinified = document.getElementById(`tab${prefix}Minified`);

      // Panels
      this.panelTree = document.getElementById(`panel${prefix}Tree`);
      this.panelEditor = document.getElementById(`panel${prefix}Editor`);
      this.panelRaw = document.getElementById(`panel${prefix}Raw`);
      this.panelMinified = document.getElementById(`panel${prefix}Minified`);

      // Action Buttons
      this.isFixedWidth = false;
      this.undoStack = [];
      this.redoStack = [];
      this.foldedLines = new Set();
      this.foldableBlocks = new Map();
      this.btnClear = document.getElementById(`btn${prefix}Clear`);
      this.btnPaste = document.getElementById(`btn${prefix}Paste`);
      this.btnUndo = document.getElementById(`btn${prefix}Undo`);
      this.btnRedo = document.getElementById(`btn${prefix}Redo`);
      this.btnFormat = document.getElementById(`btn${prefix}Format`);
      this.btnMinify = document.getElementById(`btn${prefix}Minify`);
      this.btnWrap = document.getElementById(`btn${prefix}Wrap`);
      this.btnCopySub = document.getElementById(`btn${prefix}CopySub`);
      this.btnApply = document.getElementById(`btn${prefix}Apply`);
      this.btnCopy = document.getElementById(`btnCopy${prefix}`);
      this.btnSave = document.getElementById(`btnSave${prefix}`);
      this.activeSubJSON = '';

      this.setupPaneEvents();
    }

    setSourcePath(info) {
      this.sourcePath = info || 'Manual Input';
      if (this.sourceValueEl) {
        this.sourceValueEl.textContent = this.sourcePath;
        this.sourceValueEl.title = this.sourcePath;
      }
    }

    setSelectPath(path) {
      this.selectedPath = path || 'root';
      if (this.pathValueEl) {
        this.pathValueEl.textContent = this.selectedPath;
      }
    }

    updateLineNumbers() {
      if (!this.textareaEl || !this.lineNumbersEl) return;
      const text = this.textareaEl.value;
      const lines = text.split('\n');
      const lineCount = lines.length || 1;

      this.foldableBlocks = getFoldableBlocks(text);

      for (const foldedLine of Array.from(this.foldedLines)) {
        if (!this.foldableBlocks.has(foldedLine)) {
          this.foldedLines.delete(foldedLine);
        }
      }

      let html = '';
      let i = 1;
      while (i <= lineCount) {
        const isFoldable = this.foldableBlocks.has(i);
        const isCollapsed = this.foldedLines.has(i);

        let foldIcon = isFoldable
          ? `<span class="fold-btn ${isCollapsed ? 'collapsed' : 'expanded'}" data-line="${i}" title="${isCollapsed ? 'Expand block' : 'Collapse block'}">${isCollapsed ? '▶' : '▼'}</span>`
          : `<span class="fold-btn-placeholder"></span>`;

        html += `<div class="line-num-row" data-line="${i}"><span class="line-num-val">${i}</span>${foldIcon}</div>`;

        if (isCollapsed) {
          const endLine = this.foldableBlocks.get(i);
          i = endLine;
        } else {
          i++;
        }
      }

      this.lineNumbersEl.innerHTML = html;
      this.lineNumbersEl.scrollTop = this.textareaEl.scrollTop;
      this.updateBracketHighlightsAndLines();
    }

    updateBracketHighlightsAndLines() {
      if (!this.textareaEl || !this.bracketOverlayEl || !this.guideCanvasEl) return;

      const text = this.textareaEl.value;
      const cursorPos = this.textareaEl.selectionStart;

      this.bracketOverlayEl.scrollTop = this.textareaEl.scrollTop;
      this.bracketOverlayEl.scrollLeft = this.textareaEl.scrollLeft;

      if (!text) {
        this.bracketOverlayEl.innerHTML = '';
        this.guideCanvasEl.innerHTML = '';
        return;
      }

      const pair = findMatchingBracketPair(text, cursorPos);
      const openIdx = pair ? pair.openIdx : undefined;
      const closeIdx = pair ? pair.closeIdx : undefined;

      if (pair) {
        const start = Math.min(openIdx, closeIdx);
        const end = Math.max(openIdx, closeIdx);
        this.activeSubJSON = text.substring(start, end + 1);
        if (this.btnCopySub) {
          this.btnCopySub.classList.remove('hidden');
        }
      } else {
        this.activeSubJSON = '';
        if (this.btnCopySub) {
          this.btnCopySub.classList.add('hidden');
        }
      }

      this.bracketOverlayEl.innerHTML = highlightJSONTokens(text, openIdx, closeIdx, this.foldedLines, this.foldableBlocks);

      this.guideCanvasEl.innerHTML = '';
      if (!pair) return;

      const openPos = getLineAndCol(text, openIdx);
      const closePos = getLineAndCol(text, closeIdx);

      if (this.isLineCollapsed(openPos.line + 1) || this.isLineCollapsed(closePos.line + 1)) return;

      const lineHeight = 18;
      const charWidth = 7.22;
      const paddingTop = 10;
      const paddingLeft = 12;

      const scrollLeft = this.textareaEl.scrollLeft;
      const scrollTop = this.textareaEl.scrollTop;

      const openYBottom = paddingTop + ((openPos.line + 1) * lineHeight) - 2 - scrollTop;
      const openX1 = paddingLeft + (openPos.col * charWidth) - scrollLeft;
      const openX2 = openX1 + charWidth;

      const closeYBottom = paddingTop + ((closePos.line + 1) * lineHeight) - 2 - scrollTop;
      const closeX1 = paddingLeft + (closePos.col * charWidth) - scrollLeft;
      const closeX2 = closeX1 + charWidth;

      const svgNS = 'http://www.w3.org/2000/svg';

      if (openPos.line !== closePos.line) {
        const line1 = document.createElementNS(svgNS, 'line');
        line1.setAttribute('x1', openX1);
        line1.setAttribute('y1', openYBottom);
        line1.setAttribute('x2', openX2);
        line1.setAttribute('y2', openYBottom);
        line1.setAttribute('class', 'bracket-connecting-line');
        this.guideCanvasEl.appendChild(line1);

        const line2 = document.createElementNS(svgNS, 'line');
        line2.setAttribute('x1', closeX1);
        line2.setAttribute('y1', closeYBottom);
        line2.setAttribute('x2', closeX2);
        line2.setAttribute('y2', closeYBottom);
        line2.setAttribute('class', 'bracket-connecting-line');
        this.guideCanvasEl.appendChild(line2);
      } else {
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', openX1);
        line.setAttribute('y1', openYBottom);
        line.setAttribute('x2', closeX2);
        line.setAttribute('y2', openYBottom);
        line.setAttribute('class', 'bracket-connecting-line');
        this.guideCanvasEl.appendChild(line);
      }
    }

    isLineCollapsed(lineNum) {
      if (!this.foldableBlocks || !this.foldedLines) return false;
      for (const [start, end] of this.foldableBlocks.entries()) {
        if (this.foldedLines.has(start) && lineNum > start && lineNum < end) {
          return true;
        }
      }
      return false;
    }

    pushHistory(textOverride) {
      if (!this.textareaEl) return;
      const textToPush = textOverride !== undefined ? textOverride : this.textareaEl.value;
      if (this.undoStack.length === 0 || this.undoStack[this.undoStack.length - 1] !== textToPush) {
        this.undoStack.push(textToPush);
        if (this.undoStack.length > 50) this.undoStack.shift();
      }
      this.redoStack = [];
      this.updateUndoRedoUI();
    }

    undo() {
      if (this.undoStack.length === 0 || !this.textareaEl) return;
      const currentText = this.textareaEl.value;
      this.redoStack.push(currentText);
      const prevText = this.undoStack.pop();
      this.textareaEl.value = prevText;
      this.updateLineNumbers();
      this.hideError();
      this.updateUndoRedoUI();
      showToast(`${this.prefix} Editor: Undone`);
    }

    redo() {
      if (this.redoStack.length === 0 || !this.textareaEl) return;
      const currentText = this.textareaEl.value;
      this.undoStack.push(currentText);
      const nextText = this.redoStack.pop();
      this.textareaEl.value = nextText;
      this.updateLineNumbers();
      this.hideError();
      this.updateUndoRedoUI();
      showToast(`${this.prefix} Editor: Redone`);
    }

    updateUndoRedoUI() {
      if (this.btnUndo) {
        if (this.undoStack.length > 0) this.btnUndo.removeAttribute('disabled');
        else this.btnUndo.setAttribute('disabled', 'disabled');
      }
      if (this.btnRedo) {
        if (this.redoStack.length > 0) this.btnRedo.removeAttribute('disabled');
        else this.btnRedo.setAttribute('disabled', 'disabled');
      }
    }

    showStatusBadge(msg) {
      const badge = document.getElementById(`status${this.prefix}Badge`);
      if (badge) {
        badge.textContent = msg;
        badge.classList.remove('hidden');
      }
    }

    hideStatusBadge() {
      const badge = document.getElementById(`status${this.prefix}Badge`);
      if (badge) badge.classList.add('hidden');
    }

    loadJSON(raw, sourceInfo) {
      if (sourceInfo) this.setSourcePath(sourceInfo);
      this.rawText = raw || '';
      if (!raw || !raw.trim()) {
        this.showEmpty();
        return;
      }

      startTopLoading(35);
      this.showStatusBadge('⏳ Parsing...');

      setTimeout(() => {
        try {
          this.parsedJSON = JSON.parse(raw);
          this.rawText = JSON.stringify(this.parsedJSON, null, 2);
          updateTopLoading(75);
          this.showStatusBadge('🌳 Building Tree...');
          this.renderAllViews();
          finishTopLoading();
          this.hideStatusBadge();
        } catch (err) {
          finishTopLoading();
          this.hideStatusBadge();
          this.showError('Error parsing JSON: ' + err.message);
        }
      }, 10);
    }

    showEmpty() {
      this.parsedJSON = null;
      this.rawText = '';
      if (this.treeRootEl) {
        this.treeRootEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">{ }</div>
            <h2>Blank ${this.prefix} Pane</h2>
            <p>No JSON loaded in ${this.prefix} Pane. Switch to <strong>✏️ Editor</strong> to type or paste JSON.</p>
          </div>
        `;
      }
      if (this.rawCodeEl) this.rawCodeEl.textContent = '// No JSON loaded';
      if (this.minifiedCodeEl) this.minifiedCodeEl.textContent = '// No JSON loaded';
      if (this.textareaEl) this.textareaEl.value = '';
      this.updateLineNumbers();
    }

    renderAllViews() {
      if (!this.parsedJSON) return;

      if (this.textareaEl) {
        this.textareaEl.value = this.rawText;
        const container = this.textareaEl.closest('.code-editor-container');
        if (container) {
          if (this.isFixedWidth) {
            container.classList.remove('wrap-width');
            container.classList.add('fixed-width');
            if (this.btnWrap) this.btnWrap.textContent = 'Width: Fixed';
          } else {
            container.classList.remove('fixed-width');
            container.classList.add('wrap-width');
            if (this.btnWrap) this.btnWrap.textContent = 'Width: Wrap';
          }
        }
      }
      this.updateLineNumbers();

      if (this.rawCodeEl) this.rawCodeEl.textContent = this.rawText;
      if (this.minifiedCodeEl) this.minifiedCodeEl.textContent = JSON.stringify(this.parsedJSON);

      if (this.treeRootEl) {
        this.treeRootEl.innerHTML = '';
        const rootNode = createTreeNode(null, this.parsedJSON, 'root', 1, this);
        rootNode.classList.add('tree-node-root');
        this.treeRootEl.appendChild(rootNode);
      }
    }

    switchTab(activeTab, activePanel) {
      [this.tabTree, this.tabEditor, this.tabRaw, this.tabMinified].forEach(t => t && t.classList.remove('active'));
      [this.panelTree, this.panelEditor, this.panelRaw, this.panelMinified].forEach(p => p && p.classList.remove('active'));

      if (activeTab) activeTab.classList.add('active');
      if (activePanel) activePanel.classList.add('active');
    }

    setupPaneEvents() {
      if (this.tabTree) {
        this.tabTree.addEventListener('click', () => {
          this.switchTab(this.tabTree, this.panelTree);
          if (isSyncPanesEnabled) {
            const other = this.prefix === 'Left' ? paneRight : paneLeft;
            if (other) other.switchTab(other.tabTree, other.panelTree);
          }
        });
      }
      if (this.tabEditor) {
        this.tabEditor.addEventListener('click', () => {
          this.switchTab(this.tabEditor, this.panelEditor);
          this.updateLineNumbers();
          if (this.textareaEl) this.textareaEl.focus();
          if (isSyncPanesEnabled) {
            const other = this.prefix === 'Left' ? paneRight : paneLeft;
            if (other) {
              other.switchTab(other.tabEditor, other.panelEditor);
              other.updateLineNumbers();
            }
          }
        });
      }
      if (this.tabRaw) {
        this.tabRaw.addEventListener('click', () => {
          this.switchTab(this.tabRaw, this.panelRaw);
          if (isSyncPanesEnabled) {
            const other = this.prefix === 'Left' ? paneRight : paneLeft;
            if (other) other.switchTab(other.tabRaw, other.panelRaw);
          }
        });
      }
      if (this.tabMinified) {
        this.tabMinified.addEventListener('click', () => {
          this.switchTab(this.tabMinified, this.panelMinified);
          if (isSyncPanesEnabled) {
            const other = this.prefix === 'Left' ? paneRight : paneLeft;
            if (other) other.switchTab(other.tabMinified, other.panelMinified);
          }
        });
      }

      if (this.textareaEl) {
        let typingDebounce = null;
        let lastStateBeforeTyping = this.textareaEl.value;

        this.textareaEl.addEventListener('focus', () => {
          lastStateBeforeTyping = this.textareaEl.value;
        });

        this.textareaEl.addEventListener('input', () => {
          this.updateLineNumbers();

          clearTimeout(typingDebounce);
          typingDebounce = setTimeout(() => {
            if (this.textareaEl && this.textareaEl.value !== lastStateBeforeTyping) {
              this.pushHistory(lastStateBeforeTyping);
              lastStateBeforeTyping = this.textareaEl.value;
            }
          }, 350);
        });

        this.textareaEl.addEventListener('scroll', () => {
          if (this.lineNumbersEl) this.lineNumbersEl.scrollTop = this.textareaEl.scrollTop;
          if (this.bracketOverlayEl) {
            this.bracketOverlayEl.scrollTop = this.textareaEl.scrollTop;
            this.bracketOverlayEl.scrollLeft = this.textareaEl.scrollLeft;
          }
          this.updateBracketHighlightsAndLines();
        });

        this.textareaEl.addEventListener('click', () => this.updateBracketHighlightsAndLines());
        this.textareaEl.addEventListener('keyup', () => {
          this.updateLineNumbers();
          this.updateBracketHighlightsAndLines();
        });

        if (this.lineNumbersEl) {
          this.lineNumbersEl.addEventListener('click', (e) => {
            const foldBtn = e.target.closest('.fold-btn');
            if (foldBtn) {
              const line = parseInt(foldBtn.getAttribute('data-line'), 10);
              if (this.foldedLines.has(line)) {
                this.foldedLines.delete(line);
              } else {
                this.foldedLines.add(line);
              }
              this.updateLineNumbers();
            }
          });
        }

        if (this.bracketOverlayEl) {
          this.bracketOverlayEl.addEventListener('click', (e) => {
            const foldPill = e.target.closest('.editor-fold-pill');
            if (foldPill) {
              const line = parseInt(foldPill.getAttribute('data-line'), 10);
              this.foldedLines.delete(line);
              this.updateLineNumbers();
            }
          });
        }

        document.addEventListener('selectionchange', () => {
          if (document.activeElement === this.textareaEl) {
            this.updateBracketHighlightsAndLines();
          }
        });

        this.textareaEl.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            clearTimeout(typingDebounce);
            if (this.textareaEl.value !== lastStateBeforeTyping) {
              this.pushHistory(lastStateBeforeTyping);
              lastStateBeforeTyping = this.textareaEl.value;
            }
            this.undo();
            lastStateBeforeTyping = this.textareaEl.value;
          } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
            e.preventDefault();
            clearTimeout(typingDebounce);
            this.redo();
            lastStateBeforeTyping = this.textareaEl.value;
          } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
            if (this.textareaEl.value !== lastStateBeforeTyping) {
              this.pushHistory(lastStateBeforeTyping);
              lastStateBeforeTyping = this.textareaEl.value;
            }
          }
        });
      }

      if (this.btnPaste) {
        this.btnPaste.title = "Paste text from Clipboard into Editor (Ctrl+Click or Sync Both to paste BOTH)";
        this.btnPaste.addEventListener('click', async (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); await paneLeft.doPaste(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); await paneRight.doPaste(); }
            showToast('⚡ Pasted from Clipboard into BOTH Left & Right editors');
            return;
          }
          this.switchTab(this.tabEditor, this.panelEditor);
          await this.doPaste();
        });
      }

      if (this.btnClear) {
        this.btnClear.title = "Clear Editor (Ctrl+Click or Sync Both to clear BOTH Left & Right)";
        this.btnClear.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.doClear(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.doClear(); }
            showToast('⚡ Cleared BOTH Left & Right editors');
            return;
          }
          this.doClear();
          showToast(`${this.prefix} Editor cleared. Use Undo icon to restore.`);
        });
      }

      if (this.btnUndo) {
        this.btnUndo.title = "Undo (Ctrl+Z | Ctrl+Click or Sync Both to undo BOTH)";
        this.btnUndo.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.undo(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.undo(); }
            showToast('⚡ Undone BOTH Left & Right editors');
            return;
          }
          this.undo();
        });
      }

      if (this.btnRedo) {
        this.btnRedo.title = "Redo (Ctrl+Y | Ctrl+Click or Sync Both to redo BOTH)";
        this.btnRedo.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.redo(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.redo(); }
            showToast('⚡ Redone BOTH Left & Right editors');
            return;
          }
          this.redo();
        });
      }

      if (this.btnFormat) {
        this.btnFormat.title = "Format JSON (Ctrl+Click or Sync Both to format BOTH Left & Right)";
        this.btnFormat.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.doFormat(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.doFormat(); }
            showToast('⚡ Formatted BOTH Left & Right editors');
            return;
          }
          this.doFormat();
        });
      }

      if (this.btnMinify) {
        this.btnMinify.title = "Minify JSON (Ctrl+Click or Sync Both to minify BOTH Left & Right)";
        this.btnMinify.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.doMinify(); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.doMinify(); }
            showToast('⚡ Minified BOTH Left & Right editors');
            return;
          }
          this.doMinify();
        });
      }

      if (this.btnWrap) {
        this.btnWrap.title = "Toggle Fixed Width / Word Wrap (Ctrl+Click or Sync Both to toggle BOTH)";
        this.btnWrap.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            const nextState = !this.isFixedWidth;
            if (paneLeft) { paneLeft.switchTab(paneLeft.tabEditor, paneLeft.panelEditor); paneLeft.doToggleWrap(nextState); }
            if (paneRight) { paneRight.switchTab(paneRight.tabEditor, paneRight.panelEditor); paneRight.doToggleWrap(nextState); }
            showToast(`⚡ Set Width mode to '${nextState ? 'Fixed' : 'Wrap'}' on BOTH panes`);
            return;
          }
          this.doToggleWrap();
          showToast(`${this.prefix} Editor: ${this.isFixedWidth ? 'Fixed Width' : 'Word Wrap'} enabled`);
        });
      }

      if (this.btnCopySub) {
        this.btnCopySub.addEventListener('click', (e) => {
          if (this.activeSubJSON) {
            const lineCount = (this.activeSubJSON.match(/\n/g) || []).length + 1;
            copyToClipboard(this.activeSubJSON, `${this.prefix} Pane: Copied selected Sub-JSON block (${lineCount} lines) to clipboard!`);
          }
        });
      }

      if (this.btnApply) {
        this.btnApply.title = "Apply & Render Tree (Ctrl+Click or Sync Both to apply & render BOTH)";
        this.btnApply.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            const okL = paneLeft ? paneLeft.applyFromEditor() : true;
            const okR = paneRight ? paneRight.applyFromEditor() : true;
            if (okL && paneLeft && paneLeft.parsedJSON) paneLeft.switchTab(paneLeft.tabTree, paneLeft.panelTree);
            if (okR && paneRight && paneRight.parsedJSON) paneRight.switchTab(paneRight.tabTree, paneRight.panelTree);
            showToast('⚡ Applied & Rendered BOTH Left & Right panes');
            return;
          }
          const ok = this.applyFromEditor();
          if (ok && this.parsedJSON) {
            this.switchTab(this.tabTree, this.panelTree);
            showToast(`${this.prefix} Pane JSON updated!`);
          }
        });
      }

      if (this.btnCopy) {
        this.btnCopy.title = "Copy JSON (Ctrl+Click or Sync Both to copy BOTH Left & Right JSON)";
        this.btnCopy.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            const leftTxt = (paneLeft && paneLeft.rawText) ? paneLeft.rawText : '';
            const rightTxt = (paneRight && paneRight.rawText) ? paneRight.rawText : '';
            const combined = `// --- LEFT PANE --- \n${leftTxt}\n\n// --- RIGHT PANE ---\n${rightTxt}`;
            copyToClipboard(combined, '⚡ Copied BOTH Left & Right JSON to clipboard!');
            return;
          }
          if (this.rawText) {
            copyToClipboard(this.rawText, `${this.prefix} Pane JSON copied to clipboard!`);
          }
        });
      }

      if (this.btnSave) {
        this.btnSave.title = "Save JSON (Ctrl+Click or Sync Both to save BOTH Left & Right files)";
        this.btnSave.addEventListener('click', (e) => {
          const isDual = e.ctrlKey || e.metaKey || isSyncPanesEnabled;
          if (isDual) {
            e.preventDefault();
            if (paneLeft && paneLeft.parsedJSON) saveJSONToFile(paneLeft.parsedJSON, 'left_beautified');
            if (paneRight && paneRight.parsedJSON) saveJSONToFile(paneRight.parsedJSON, 'right_beautified');
            showToast('⚡ Saved BOTH Left & Right JSON files');
            return;
          }
          if (!this.parsedJSON) return;
          saveJSONToFile(this.parsedJSON, `${this.prefix.toLowerCase()}_beautified`);
        });
      }
    }

    async doPaste() {
      if (!this.textareaEl) return;
      try {
        let textToPaste = '';
        if (navigator.clipboard && navigator.clipboard.readText) {
          textToPaste = await navigator.clipboard.readText();
        }
        if (!textToPaste) {
          showToast('Clipboard is empty or access denied');
          return;
        }

        this.pushHistory();

        const textarea = this.textareaEl;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = textarea.value;

        if (start !== undefined && end !== undefined && (start !== 0 || end !== currentVal.length)) {
          textarea.value = currentVal.substring(0, start) + textToPaste + currentVal.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + textToPaste.length;
        } else {
          textarea.value = textToPaste;
        }

        this.updateLineNumbers();
        this.hideError();
        textarea.focus();

        try {
          const parsed = JSON.parse(textarea.value);
          this.parsedJSON = parsed;
          this.rawText = JSON.stringify(parsed, null, 2);
          this.textareaEl.value = this.rawText;
          this.updateLineNumbers();
          this.renderAllViews();
          showToast(`📋 Pasted & formatted JSON into ${this.prefix} Pane`);
        } catch (e) {
          showToast(`📋 Pasted text into ${this.prefix} Pane Editor`);
        }
      } catch (err) {
        showToast('Could not paste from clipboard: ' + err.message, true);
      }
    }

    doClear() {
      if (this.textareaEl && this.textareaEl.value) {
        this.pushHistory();
        this.textareaEl.value = '';
        this.updateLineNumbers();
        this.hideError();
      }
    }

    doFormat() {
      if (!this.textareaEl) return;
      this.hideError();
      const text = this.textareaEl.value.trim();
      if (!text) return;
      try {
        const parsed = JSON.parse(text);
        this.pushHistory();
        this.loadJSON(JSON.stringify(parsed, null, 2));
      } catch (err) {
        this.showError('Invalid JSON: ' + err.message);
      }
    }

    doMinify() {
      if (!this.textareaEl) return;
      this.hideError();
      const text = this.textareaEl.value.trim();
      if (!text) return;
      try {
        const parsed = JSON.parse(text);
        this.pushHistory();
        this.parsedJSON = parsed;
        this.rawText = JSON.stringify(parsed);
        this.textareaEl.value = this.rawText;
        if (this.rawCodeEl) this.rawCodeEl.textContent = this.rawText;
        if (this.minifiedCodeEl) this.minifiedCodeEl.textContent = this.rawText;
        this.updateLineNumbers();
      } catch (err) {
        this.showError('Invalid JSON: ' + err.message);
      }
    }

    doToggleWrap(targetState) {
      if (targetState !== undefined) {
        this.isFixedWidth = targetState;
      } else {
        this.isFixedWidth = !this.isFixedWidth;
      }
      const container = this.textareaEl ? this.textareaEl.closest('.code-editor-container') : null;
      if (container) {
        if (this.isFixedWidth) {
          container.classList.remove('wrap-width');
          container.classList.add('fixed-width');
          if (this.btnWrap) this.btnWrap.textContent = 'Width: Fixed';
        } else {
          container.classList.remove('fixed-width');
          container.classList.add('wrap-width');
          if (this.btnWrap) this.btnWrap.textContent = 'Width: Wrap';
        }
      }
      this.updateLineNumbers();
    }

    applyFromEditor() {
      if (!this.textareaEl) return true;
      const text = this.textareaEl.value.trim();
      if (!text) return true;
      this.hideError();
      try {
        const parsed = JSON.parse(text);
        this.loadJSON(text, `Manual Input (${this.prefix} Pane)`);
        return true;
      } catch (err) {
        this.showError('Invalid JSON: ' + err.message);
        return false;
      }
    }

    showError(msg) {
      if (this.editErrorEl) {
        this.editErrorEl.textContent = msg;
        this.editErrorEl.classList.remove('hidden');
      }
    }

    hideError() {
      if (this.editErrorEl) {
        this.editErrorEl.classList.add('hidden');
      }
    }
  }

  // Load JSON from Chrome storage or URL into Left Pane
  function loadJSONData() {
    const urlParams = new URLSearchParams(window.location.search);
    const dataId = urlParams.get('id');

    if (dataId && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([dataId], (result) => {
        if (result && result[dataId]) {
          const raw = result[dataId];
          paneLeft.loadJSON(raw, `Web Selection (${dataId.substring(0, 12)})`);
          paneRight.showEmpty();
        } else {
          showDemoJSON();
        }
      });
    } else {
      showDemoJSON();
    }
  }

  function showDemoJSON() {
    const demoObj = {
      status: "success",
      extension: "JSON Beautifier & Viewer",
      version: "1.0.0",
      features: [
        "Select text and press Ctrl+Shift on any webpage",
        "Independent Left and Right dual JSON panes",
        "Source path tracking and inline double-click editing"
      ],
      sampleUser: {
        id: 10842,
        name: "Antigravity User",
        email: "user@example.com",
        isActive: true,
        address: { city: "San Francisco", country: "USA" }
      }
    };

    const raw = JSON.stringify(demoObj, null, 2);
    paneLeft.loadJSON(raw, 'Demo Payload A');

    const demoObjB = {
      compareVersion: "2.0.0",
      status: "active",
      sampleUser: {
        id: 10842,
        name: "Antigravity User (Updated)",
        email: "user.new@example.com",
        address: { city: "New York", country: "USA" }
      }
    };
    paneRight.loadJSON(JSON.stringify(demoObjB, null, 2), 'Demo Payload B (Comparison)');
  }

  // Recursive DOM Tree Node Creator
  function createTreeNode(keyName, value, path, depth, paneController) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'tree-node';
    nodeEl.dataset.path = path;
    nodeEl.dataset.depth = depth;

    const lineEl = document.createElement('div');
    lineEl.className = 'tree-line';

    lineEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (paneController) paneController.setSelectPath(path);
    });

    const isObject = typeof value === 'object' && value !== null;
    const isArray = Array.isArray(value);

    if (keyName !== null) {
      const keyEl = document.createElement('span');
      keyEl.className = 'json-key';
      keyEl.textContent = `"${keyName}"`;
      keyEl.title = `Path: ${path}`;
      lineEl.appendChild(keyEl);

      const colonEl = document.createElement('span');
      colonEl.className = 'json-colon';
      colonEl.textContent = ': ';
      lineEl.appendChild(colonEl);
    }

    if (paneController && paneController.diffMap && paneController.diffMap.has(path)) {
      const diffInfo = paneController.diffMap.get(path);
      if (diffInfo.type === 'ADDED') {
        lineEl.classList.add('diff-node-added');
        const badge = document.createElement('span');
        badge.className = 'diff-badge badge-added';
        badge.textContent = '+ ADDED';
        lineEl.appendChild(badge);
      } else if (diffInfo.type === 'REMOVED') {
        lineEl.classList.add('diff-node-removed');
        const badge = document.createElement('span');
        badge.className = 'diff-badge badge-removed';
        badge.textContent = '- REMOVED';
        lineEl.appendChild(badge);
      } else if (diffInfo.type === 'MODIFIED') {
        lineEl.classList.add('diff-node-modified');
        const badge = document.createElement('span');
        badge.className = 'diff-badge badge-modified';
        badge.textContent = `~ CHANGED`;
        lineEl.appendChild(badge);
      }
    }

    if (isObject) {
      const toggleEl = document.createElement('span');
      toggleEl.className = 'tree-toggle';
      toggleEl.innerHTML = '▼';
      lineEl.insertBefore(toggleEl, lineEl.firstChild);

      const openBracket = isArray ? '[' : '{';
      const closeBracket = isArray ? ']' : '}';
      const itemsCount = isArray ? value.length : Object.keys(value).length;
      const countLabel = isArray ? `${itemsCount} item${itemsCount !== 1 ? 's' : ''}` : `${itemsCount} key${itemsCount !== 1 ? 's' : ''}`;

      const bracketOpenSpan = document.createElement('span');
      bracketOpenSpan.className = 'json-bracket';
      bracketOpenSpan.textContent = openBracket;
      lineEl.appendChild(bracketOpenSpan);

      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'json-size-badge';
      badgeSpan.textContent = countLabel;
      lineEl.appendChild(badgeSpan);

      const placeholderSpan = document.createElement('span');
      placeholderSpan.className = 'collapsed-placeholder';
      placeholderSpan.textContent = ` ... ${closeBracket}`;
      placeholderSpan.title = 'Click to expand';
      placeholderSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNode(nodeEl, true);
      });
      lineEl.appendChild(placeholderSpan);

      nodeEl.appendChild(lineEl);

      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';

      if (isArray) {
        value.forEach((item, index) => {
          const itemPath = path === 'root' ? `[${index}]` : `${path}[${index}]`;
          const childNode = createTreeNode(null, item, itemPath, depth + 1, paneController);
          childrenContainer.appendChild(childNode);
        });
      } else {
        Object.keys(value).forEach(k => {
          const itemPath = path === 'root' ? k : `${path}.${k}`;
          const childNode = createTreeNode(k, value[k], itemPath, depth + 1, paneController);
          childrenContainer.appendChild(childNode);
        });
      }

      nodeEl.appendChild(childrenContainer);

      const closeLine = document.createElement('div');
      closeLine.className = 'tree-line tree-closing-line';
      const bracketCloseSpan = document.createElement('span');
      bracketCloseSpan.className = 'json-bracket';
      bracketCloseSpan.textContent = closeBracket;
      closeLine.appendChild(bracketCloseSpan);
      nodeEl.appendChild(closeLine);

      toggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNode(nodeEl);
      });

    } else {
      const valEl = renderPrimitiveValue(value, path, paneController);
      lineEl.appendChild(valEl);
      nodeEl.appendChild(lineEl);
    }

    return nodeEl;
  }

  // Render Primitives (String, Number, Boolean, Null) with inline double-click editing
  function renderPrimitiveValue(value, path, paneController) {
    const span = document.createElement('span');

    if (typeof value === 'string') {
      span.className = 'json-string';
      const isURL = value.startsWith('http://') || value.startsWith('https://');

      if (isURL) {
        const link = document.createElement('a');
        link.className = 'json-link';
        link.href = value;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `"${value}"`;
        link.title = 'Open URL (Double click to edit value inline)';
        addInlineEditHandler(link, value, path, paneController);
        return link;
      } else {
        span.textContent = `"${value}"`;
      }
    } else if (typeof value === 'number') {
      span.className = 'json-number';
      span.textContent = String(value);
    } else if (typeof value === 'boolean') {
      span.className = 'json-boolean';
      span.textContent = String(value);
    } else if (value === null) {
      span.className = 'json-null';
      span.textContent = 'null';
    } else {
      span.className = 'json-null';
      span.textContent = String(value);
    }

    span.title = 'Double-click to edit value inline';
    addInlineEditHandler(span, value, path, paneController);

    return span;
  }

  function addInlineEditHandler(element, currentVal, path, paneController) {
    element.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      makePrimitiveInlineEditable(element, currentVal, path, paneController);
    });
  }

  function makePrimitiveInlineEditable(element, currentVal, path, paneController) {
    const parent = element.parentNode;
    if (!parent || !paneController) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'json-value-input';
    input.value = typeof currentVal === 'string' ? currentVal : String(currentVal);

    parent.replaceChild(input, element);
    input.focus();
    input.select();

    let saved = false;

    function saveInlineEdit() {
      if (saved) return;
      saved = true;
      const newRaw = input.value.trim();
      let parsedVal = newRaw;

      if (newRaw === 'true') parsedVal = true;
      else if (newRaw === 'false') parsedVal = false;
      else if (newRaw === 'null') parsedVal = null;
      else if (!isNaN(Number(newRaw)) && newRaw !== '') parsedVal = Number(newRaw);

      updateValueByPath(paneController.parsedJSON, path, parsedVal);
      paneController.rawText = JSON.stringify(paneController.parsedJSON, null, 2);
      paneController.renderAllViews();
      showToast(`Updated value at ${path} in ${paneController.prefix} Pane`);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveInlineEdit();
      } else if (e.key === 'Escape') {
        saved = true;
        parent.replaceChild(element, input);
      }
    });

    input.addEventListener('blur', () => {
      saveInlineEdit();
    });
  }

  function updateValueByPath(obj, path, newValue) {
    if (!obj || !path || path === 'root') return;
    const cleanPath = path.replace(/^root[\.\[]?/, '');
    const parts = cleanPath.replace(/\]/g, '').split(/\.|\[/);
    let curr = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (curr[key] !== undefined) {
        curr = curr[key];
      } else {
        return;
      }
    }

    const lastKey = parts[parts.length - 1];
    curr[lastKey] = newValue;
  }

  function toggleNode(nodeEl, forceState) {
    const isCollapsed = nodeEl.classList.contains('collapsed');
    const newState = forceState !== undefined ? !forceState : !isCollapsed;

    if (newState) {
      nodeEl.classList.add('collapsed');
      const toggle = nodeEl.querySelector(':scope > .tree-line > .tree-toggle');
      if (toggle) toggle.classList.add('collapsed');
    } else {
      nodeEl.classList.remove('collapsed');
      const toggle = nodeEl.querySelector(':scope > .tree-line > .tree-toggle');
      if (toggle) toggle.classList.remove('collapsed');
    }
  }

  // Global Event Listeners Setup
  function setupGlobalEventListeners() {
    // Layout Mode Toggles
    btnLayoutSplit.addEventListener('click', () => setLayoutMode('split'));
    btnLayoutLeft.addEventListener('click', () => setLayoutMode('left'));
    btnLayoutRight.addEventListener('click', () => setLayoutMode('right'));

    function setLayoutMode(mode) {
      [btnLayoutSplit, btnLayoutLeft, btnLayoutRight].forEach(b => b.classList.remove('active'));

      if (mode === 'split') {
        btnLayoutSplit.classList.add('active');
        paneLeftEl.style.display = 'flex';
        paneRightEl.style.display = 'flex';
        paneDividerEl.style.display = 'block';
      } else if (mode === 'left') {
        btnLayoutLeft.classList.add('active');
        paneLeftEl.style.display = 'flex';
        paneRightEl.style.display = 'none';
        paneDividerEl.style.display = 'none';
      } else if (mode === 'right') {
        btnLayoutRight.classList.add('active');
        paneLeftEl.style.display = 'none';
        paneRightEl.style.display = 'flex';
        paneDividerEl.style.display = 'none';
      }
    }

    // Theme Toggle
    document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);

    // Sync Both Panes Toggle
    const btnSyncPanesToggle = document.getElementById('btnSyncPanesToggle');
    isSyncPanesEnabled = localStorage.getItem('json_sync_panes') === 'true';

    function updateSyncPanesUI() {
      if (!btnSyncPanesToggle) return;
      const label = btnSyncPanesToggle.querySelector('.sync-label');
      if (isSyncPanesEnabled) {
        btnSyncPanesToggle.classList.add('sync-on');
        if (label) label.textContent = 'Sync Both: ON';
      } else {
        btnSyncPanesToggle.classList.remove('sync-on');
        if (label) label.textContent = 'Sync Both: OFF';
      }
    }

    updateSyncPanesUI();

    if (btnSyncPanesToggle) {
      btnSyncPanesToggle.addEventListener('click', () => {
        isSyncPanesEnabled = !isSyncPanesEnabled;
        localStorage.setItem('json_sync_panes', isSyncPanesEnabled);
        updateSyncPanesUI();
        if (isSyncPanesEnabled) {
          showToast('⚡ Sync Both enabled! All button clicks apply to Left & Right simultaneously.');
        } else {
          showToast('Sync Both disabled. Button clicks apply to individual pane.');
        }
      });
    }

    // Helper function to read and load local file into a pane
    function readAndLoadFile(file, paneController) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        try {
          if (paneController.sourceValueEl) {
            paneController.sourceValueEl.textContent = file.name;
          }
          paneController.loadJSON(content);
          showToast(`📁 Opened '${file.name}' in ${paneController.prefix} Pane`);
        } catch (err) {
          showToast(`Error parsing '${file.name}': ${err.message}`, true);
        }
      };
      reader.readAsText(file);
    }

    // Left Pane Open File & Drag-and-Drop
    const btnOpenFileLeft = document.getElementById('btnOpenFileLeft');
    const fileInputLeft = document.getElementById('fileInputLeft');
    const dragOverlayLeft = document.getElementById('dragOverlayLeft');

    if (btnOpenFileLeft && fileInputLeft) {
      btnOpenFileLeft.addEventListener('click', () => fileInputLeft.click());
      fileInputLeft.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          readAndLoadFile(e.target.files[0], paneLeft);
          fileInputLeft.value = '';
        }
      });
    }

    if (paneLeftEl && dragOverlayLeft) {
      ['dragenter', 'dragover'].forEach(eventName => {
        paneLeftEl.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragOverlayLeft.classList.add('active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dragOverlayLeft.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragOverlayLeft.classList.remove('active');
        }, false);
      });

      dragOverlayLeft.addEventListener('drop', (e) => {
        const files = e.dataTransfer ? e.dataTransfer.files : null;
        if (files && files.length > 0) {
          readAndLoadFile(files[0], paneLeft);
        }
      });
    }

    // Right Pane Open File & Drag-and-Drop
    const btnOpenFileRight = document.getElementById('btnOpenFileRight');
    const fileInputRight = document.getElementById('fileInputRight');
    const dragOverlayRight = document.getElementById('dragOverlayRight');

    if (btnOpenFileRight && fileInputRight) {
      btnOpenFileRight.addEventListener('click', () => fileInputRight.click());
      fileInputRight.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          readAndLoadFile(e.target.files[0], paneRight);
          fileInputRight.value = '';
        }
      });
    }

    if (paneRightEl && dragOverlayRight) {
      ['dragenter', 'dragover'].forEach(eventName => {
        paneRightEl.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragOverlayRight.classList.add('active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dragOverlayRight.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragOverlayRight.classList.remove('active');
        }, false);
      });

      dragOverlayRight.addEventListener('drop', (e) => {
        const files = e.dataTransfer ? e.dataTransfer.files : null;
        if (files && files.length > 0) {
          readAndLoadFile(files[0], paneRight);
        }
      });
    }

    // JSON Comparison Actions
    const btnCompareJSON = document.getElementById('btnCompareJSON');
    const btnClearDiff = document.getElementById('btnClearDiff');
    const diffSummaryBar = document.getElementById('diffSummaryBar');
    const diffStatsAdded = document.getElementById('diffStatsAdded');
    const diffStatsRemoved = document.getElementById('diffStatsRemoved');
    const diffStatsModified = document.getElementById('diffStatsModified');

    if (btnCompareJSON) {
      btnCompareJSON.addEventListener('click', () => {
        const leftOk = paneLeft.applyFromEditor();
        const rightOk = paneRight.applyFromEditor();

        if (!leftOk || !rightOk) {
          showToast('Please fix JSON syntax errors before comparing.');
          return;
        }

        if (!paneLeft.parsedJSON && !paneRight.parsedJSON) {
          showToast('Please load or paste JSON into Left or Right pane first.');
          return;
        }

        const leftObj = paneLeft.parsedJSON || {};
        const rightObj = paneRight.parsedJSON || {};

        const res = calculateJSONDiff(leftObj, rightObj);
        paneLeft.diffMap = res.diffMap;
        paneRight.diffMap = res.diffMap;

        paneLeft.renderAllViews();
        paneRight.renderAllViews();

        if (diffStatsAdded) diffStatsAdded.textContent = `+ ${res.addedCount} Added`;
        if (diffStatsRemoved) diffStatsRemoved.textContent = `- ${res.removedCount} Removed`;
        if (diffStatsModified) diffStatsModified.textContent = `~ ${res.modifiedCount} Modified`;
        if (diffSummaryBar) diffSummaryBar.classList.remove('hidden');

        showToast(`JSON Comparison: ${res.addedCount} Added, ${res.removedCount} Removed, ${res.modifiedCount} Modified`);
      });
    }

    if (btnClearDiff) {
      btnClearDiff.addEventListener('click', () => {
        paneLeft.diffMap = null;
        paneRight.diffMap = null;

        paneLeft.renderAllViews();
        paneRight.renderAllViews();

        if (diffSummaryBar) diffSummaryBar.classList.add('hidden');
        showToast('Comparison cleared');
      });
    }
  }

  // Deep JSON Comparison Engine
  function calculateJSONDiff(leftObj, rightObj) {
    const diffMap = new Map();
    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;

    function walk(lVal, rVal, currentPath) {
      if (lVal === undefined && rVal !== undefined) {
        diffMap.set(currentPath, { type: 'ADDED', rightVal: rVal });
        addedCount++;
        return;
      }
      if (lVal !== undefined && rVal === undefined) {
        diffMap.set(currentPath, { type: 'REMOVED', leftVal: lVal });
        removedCount++;
        return;
      }

      const typeL = getObjectType(lVal);
      const typeR = getObjectType(rVal);

      if (typeL !== typeR) {
        diffMap.set(currentPath, { type: 'MODIFIED', leftVal: lVal, rightVal: rVal });
        modifiedCount++;
        return;
      }

      if (typeL === 'Object') {
        const keysL = lVal ? Object.keys(lVal) : [];
        const keysR = rVal ? Object.keys(rVal) : [];
        const allKeys = Array.from(new Set([...keysL, ...keysR]));

        let hasChildDiff = false;
        for (const key of allKeys) {
          const childPath = currentPath === 'root' ? key : `${currentPath}.${key}`;
          walk(lVal[key], rVal[key], childPath);
          if (diffMap.has(childPath) && diffMap.get(childPath).type !== 'UNCHANGED') {
            hasChildDiff = true;
          }
        }
        if (hasChildDiff) {
          diffMap.set(currentPath, { type: 'CONTAINER_MODIFIED' });
        }
      } else if (typeL === 'Array') {
        const maxLen = Math.max(lVal.length, rVal.length);
        let hasChildDiff = false;
        for (let i = 0; i < maxLen; i++) {
          const childPath = `${currentPath}[${i}]`;
          walk(lVal[i], rVal[i], childPath);
          if (diffMap.has(childPath) && diffMap.get(childPath).type !== 'UNCHANGED') {
            hasChildDiff = true;
          }
        }
        if (hasChildDiff) {
          diffMap.set(currentPath, { type: 'CONTAINER_MODIFIED' });
        }
      } else {
        if (lVal !== rVal) {
          diffMap.set(currentPath, { type: 'MODIFIED', leftVal: lVal, rightVal: rVal });
          modifiedCount++;
        } else {
          diffMap.set(currentPath, { type: 'UNCHANGED' });
        }
      }
    }

    walk(leftObj, rightObj, 'root');
    return { diffMap, addedCount, removedCount, modifiedCount };
  }

  function getObjectType(val) {
    if (val === null) return 'Null';
    if (Array.isArray(val)) return 'Array';
    return typeof val === 'object' ? 'Object' : typeof val;
  }

  // Save Helper with Timestamp
  function saveJSONToFile(parsedObj, prefixName) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeSuffix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const defaultFilename = `${prefixName || 'beautified'}_${timeSuffix}.json`;

    let filename = prompt('Save JSON file as:', defaultFilename);
    if (filename === null) return;

    filename = filename.trim();
    if (!filename) filename = defaultFilename;
    if (!filename.toLowerCase().endsWith('.json')) filename += '.json';

    const blob = new Blob([JSON.stringify(parsedObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloading ${filename}...`);
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('json_beautifier_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('json_beautifier_theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const iconSpan = document.querySelector('.theme-icon');
    if (iconSpan) {
      iconSpan.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
  }

  // Helper Toast Popup
  function copyToClipboard(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg || 'Copied to clipboard!');
      }).catch(() => {
        fallbackCopy(text, successMsg);
      });
    } else {
      fallbackCopy(text, successMsg);
    }
  }

  function fallbackCopy(text, successMsg) {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast(successMsg || 'Copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy text.');
    }
  }

  function getLineAndCol(text, index) {
    const sub = text.substring(0, index);
    const lines = sub.split('\n');
    const line = lines.length - 1;
    const col = lines[lines.length - 1].length;
    return { line, col };
  }

  function findMatchingBracketPair(text, cursorPos) {
    if (!text || cursorPos === undefined) return null;

    const openers = { '{': '}', '[': ']', '(': ')' };
    const closers = { '}': '{', ']': '[', ')': '(' };

    let charAtCursor = text[cursorPos];
    let targetPos = cursorPos;

    if (!openers[charAtCursor] && !closers[charAtCursor] && cursorPos > 0) {
      if (openers[text[cursorPos - 1]] || closers[text[cursorPos - 1]]) {
        charAtCursor = text[cursorPos - 1];
        targetPos = cursorPos - 1;
      }
    }

    if (!openers[charAtCursor] && !closers[charAtCursor]) {
      return null;
    }

    if (openers[charAtCursor]) {
      const openChar = charAtCursor;
      const closeChar = openers[openChar];
      let depth = 0;
      let inString = false;

      for (let i = targetPos; i < text.length; i++) {
        const c = text[i];
        if (c === '"' && (i === 0 || text[i - 1] !== '\\')) {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (c === openChar) depth++;
        else if (c === closeChar) {
          depth--;
          if (depth === 0) {
            return { openIdx: targetPos, closeIdx: i, type: openChar };
          }
        }
      }
    } else if (closers[charAtCursor]) {
      const closeChar = charAtCursor;
      const openChar = closers[closeChar];
      let depth = 0;
      let inString = false;

      for (let i = targetPos; i >= 0; i--) {
        const c = text[i];
        if (c === '"' && (i === 0 || text[i - 1] !== '\\')) {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (c === closeChar) depth++;
        else if (c === openChar) {
          depth--;
          if (depth === 0) {
            return { openIdx: i, closeIdx: targetPos, type: openChar };
          }
        }
      }
    }

    return null;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFoldableBlocks(text) {
    if (!text) return new Map();

    const lines = text.split('\n');
    const foldableBlocks = new Map();
    const stack = [];

    let inString = false;

    for (let l = 0; l < lines.length; l++) {
      const lineStr = lines[l];
      const lineNum = l + 1;

      for (let i = 0; i < lineStr.length; i++) {
        const char = lineStr[i];
        if (char === '"' && (i === 0 || lineStr[i - 1] !== '\\')) {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
          stack.push({ type: char, line: lineNum });
        } else if (char === '}' || char === ']') {
          if (stack.length > 0) {
            const top = stack.pop();
            if ((top.type === '{' && char === '}') || (top.type === '[' && char === ']')) {
              if (lineNum > top.line) {
                foldableBlocks.set(top.line, lineNum);
              }
            }
          }
        }
      }
    }

    return foldableBlocks;
  }

  function highlightJSONTokens(text, bracketOpenIdx, bracketCloseIdx, foldedLines, foldableBlocks) {
    if (!text) return '';

    const lines = text.split('\n');
    let html = '';

    let globalCharIndex = 0;
    let l = 0;

    while (l < lines.length) {
      const lineNum = l + 1;
      const lineText = lines[l];

      const isCollapsed = foldedLines && foldedLines.has(lineNum) && foldableBlocks && foldableBlocks.has(lineNum);

      if (isCollapsed) {
        const endLine = foldableBlocks.get(lineNum);
        const hiddenCount = endLine - lineNum;

        const lineHtml = highlightSingleLineJSON(lineText, globalCharIndex, bracketOpenIdx, bracketCloseIdx);
        html += lineHtml + `<span class="editor-fold-pill" data-line="${lineNum}" title="Click to expand">... ${hiddenCount} lines</span>\n`;

        for (let k = lineNum - 1; k < endLine - 1; k++) {
          globalCharIndex += lines[k].length + 1;
        }
        l = endLine - 1;
      } else {
        html += highlightSingleLineJSON(lineText, globalCharIndex, bracketOpenIdx, bracketCloseIdx) + '\n';
        globalCharIndex += lineText.length + 1;
        l++;
      }
    }

    if (!text.endsWith('\n') && html.endsWith('\n')) {
      html = html.slice(0, -1);
    }

    return html;
  }

  function highlightSingleLineJSON(lineText, lineStartIndex, openIdx, closeIdx) {
    if (!lineText) return '';

    const jsonTokenRegex = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\]:,])/g;

    let lastIndex = 0;
    let html = '';

    let match;
    while ((match = jsonTokenRegex.exec(lineText)) !== null) {
      const token = match[0];
      const matchIndex = match.index;
      const globalMatchIdx = lineStartIndex + matchIndex;

      if (matchIndex > lastIndex) {
        html += renderSubStringWithBracketHighlights(lineText.substring(lastIndex, matchIndex), lineStartIndex + lastIndex, openIdx, closeIdx);
      }
      lastIndex = jsonTokenRegex.lastIndex;

      if (token.startsWith('"')) {
        if (token.endsWith(':')) {
          const keyText = token.slice(0, -1);
          html += `<span class="editor-json-key">${renderSubStringWithBracketHighlights(keyText, globalMatchIdx, openIdx, closeIdx)}</span><span class="editor-json-bracket">:</span>`;
        } else {
          html += `<span class="editor-json-string">${renderSubStringWithBracketHighlights(token, globalMatchIdx, openIdx, closeIdx)}</span>`;
        }
      } else if (token === 'true' || token === 'false') {
        html += `<span class="editor-json-boolean">${token}</span>`;
      } else if (token === 'null') {
        html += `<span class="editor-json-null">${token}</span>`;
      } else if (!isNaN(Number(token))) {
        html += `<span class="editor-json-number">${token}</span>`;
      } else if ('{}[]:,'.includes(token)) {
        html += `<span class="editor-json-bracket">${renderSubStringWithBracketHighlights(token, globalMatchIdx, openIdx, closeIdx)}</span>`;
      } else {
        html += renderSubStringWithBracketHighlights(token, globalMatchIdx, openIdx, closeIdx);
      }
    }

    if (lastIndex < lineText.length) {
      html += renderSubStringWithBracketHighlights(lineText.substring(lastIndex), lineStartIndex + lastIndex, openIdx, closeIdx);
    }

    return html;
  }

  function renderSubStringWithBracketHighlights(subStr, startIndex, openIdx, closeIdx) {
    if (openIdx === undefined || closeIdx === undefined) {
      return escapeHTML(subStr);
    }

    let result = '';
    for (let i = 0; i < subStr.length; i++) {
      const globalIdx = startIndex + i;
      const char = subStr[i];
      if (globalIdx === openIdx || globalIdx === closeIdx) {
        result += `<span class="bracket-tag-highlight">${escapeHTML(char)}</span>`;
      } else {
        result += escapeHTML(char);
      }
    }
    return result;
  }

  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    toast.textContent = msg;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }
})();

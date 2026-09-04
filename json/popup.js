// Popup JS for manual JSON entry and active tab selection triggering

document.addEventListener('DOMContentLoaded', () => {
  const btnFormatSelection = document.getElementById('btnFormatSelection');
  const btnOpenBlank = document.getElementById('btnOpenBlank');
  const btnFormatInput = document.getElementById('btnFormatInput');
  const jsonInput = document.getElementById('jsonInput');
  const errorMessage = document.getElementById('errorMessage');

  // Open blank viewer window tab
  btnOpenBlank.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
    window.close();
  });

  // Open Local JSON File
  const btnOpenLocalFile = document.getElementById('btnOpenLocalFile');
  const popupFileInput = document.getElementById('popupFileInput');

  if (btnOpenLocalFile && popupFileInput) {
    btnOpenLocalFile.addEventListener('click', () => popupFileInput.click());
    popupFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        readAndOpenPopupFile(e.target.files[0]);
      }
    });
  }

  // Drag & Drop JSON file on popup textarea
  if (jsonInput) {
    ['dragenter', 'dragover'].forEach(name => {
      jsonInput.addEventListener(name, (e) => {
        e.preventDefault();
        jsonInput.style.borderColor = '#6366f1';
      });
    });
    ['dragleave', 'drop'].forEach(name => {
      jsonInput.addEventListener(name, (e) => {
        e.preventDefault();
        jsonInput.style.borderColor = '';
      });
    });
    jsonInput.addEventListener('drop', (e) => {
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length > 0) {
        readAndOpenPopupFile(files[0]);
      }
    });
  }

  function readAndOpenPopupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      try {
        const parsed = JSON.parse(content);
        const formatted = JSON.stringify(parsed, null, 2);
        chrome.runtime.sendMessage({
          action: 'open_viewer',
          jsonString: formatted,
          originalString: content,
          source: file.name
        });
        window.close();
      } catch (err) {
        showError(`Invalid JSON file '${file.name}': ` + err.message);
      }
    };
    reader.readAsText(file);
  }

  // Format selection on active tab
  btnFormatSelection.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'check_selection' }, (response) => {
          if (chrome.runtime.lastError) {
            showError('Could not read selection on this tab. Try selecting text and pressing Ctrl+Shift.');
          } else {
            window.close();
          }
        });
      }
    });
  });

  // Beautify manual textarea input
  btnFormatInput.addEventListener('click', () => {
    hideError();
    const raw = jsonInput.value.trim();
    if (!raw) {
      showError('Please paste JSON text first.');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      chrome.runtime.sendMessage({
        action: 'open_viewer',
        jsonString: formatted,
        originalString: raw
      });
      window.close();
    } catch (err) {
      showError('Invalid JSON: ' + err.message);
    }
  });

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
  }

  function hideError() {
    errorMessage.classList.add('hidden');
  }
});

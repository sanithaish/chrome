// Background Service Worker for JSON Beautifier & Viewer Extension

// Setup context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'beautify_selected_json',
    title: 'Beautify Selected JSON (Ctrl+Shift)',
    contexts: ['selection']
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'beautify_selected_json' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'check_selection' }).catch(() => {
      // Fallback if content script was not injected on page
      if (info.selectionText) {
        processAndOpenJSON(info.selectionText);
      }
    });
  }
});

// Handle manifest keyboard shortcut commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'format_selected_json') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'check_selection' });
      }
    });
  }
});

// Listen for messages from content.js or popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open_viewer') {
    processAndOpenJSON(request.jsonString || request.originalString);
    sendResponse({ success: true });
  }
  return true;
});

// Save JSON data in chrome.storage.local and open viewer.html tab
function processAndOpenJSON(rawJsonString) {
  const dataId = 'json_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  chrome.storage.local.set({ [dataId]: rawJsonString }, () => {
    const viewerUrl = chrome.runtime.getURL(`viewer.html?id=${dataId}`);
    chrome.tabs.create({ url: viewerUrl });
  });
}

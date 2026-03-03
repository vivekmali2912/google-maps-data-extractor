// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Google Maps Data Extractor installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.url.includes('google.com/maps')) {
    chrome.tabs.sendMessage(tab.id, { action: 'extractBusiness' });
  }
});

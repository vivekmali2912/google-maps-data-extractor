document.addEventListener('DOMContentLoaded', function() {
  const extractBusinessBtn = document.getElementById('extractBusiness');
  const extractSearchBtn = document.getElementById('extractSearch');
  const extractReviewsBtn = document.getElementById('extractReviews');
  const extractPhonesBtn = document.getElementById('extractPhones');
  const exportCSVBtn = document.getElementById('exportCSV');
  const statusDiv = document.getElementById('status');
  const output = document.getElementById('output');

  let currentData = null;
  let currentTab = null;

  // Initialize
  initializePopup();

  async function initializePopup() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;
      
      if (!tab.url.includes('google.com/maps')) {
        showStatus('Please navigate to Google Maps first', 'error');
        disableButtons();
        return;
      }
      
      showStatus('Ready to extract data from Google Maps', 'success');
      enableButtons();
    } catch (error) {
      showStatus('Error initializing: ' + error.message, 'error');
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }

  function disableButtons() {
    extractBusinessBtn.disabled = true;
    extractSearchBtn.disabled = true;
    extractReviewsBtn.disabled = true;
    extractPhonesBtn.disabled = true;
    exportCSVBtn.disabled = true;
  }

  function enableButtons() {
    extractBusinessBtn.disabled = false;
    extractSearchBtn.disabled = false;
    extractReviewsBtn.disabled = false;
    extractPhonesBtn.disabled = false;
    exportCSVBtn.disabled = currentData ? false : true;
  }

  async function sendMessageToContentScript(action) {
    try {
      if (!currentTab || !currentTab.url.includes('google.com/maps')) {
        showStatus('Please navigate to Google Maps first', 'error');
        return;
      }

      showStatus('Extracting data...', 'success');

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 20000);
      });

      const messagePromise = chrome.tabs.sendMessage(currentTab.id, { 
        action: action,
        timestamp: Date.now()
      });

      const response = await Promise.race([messagePromise, timeoutPromise]);
      
      if (response && response.success) {
        currentData = response.data;
        output.textContent = JSON.stringify(response.data, null, 2);
        exportCSVBtn.disabled = false;
        showStatus(`${action} extracted successfully! Found ${getDataCount(response.data)} items.`, 'success');
      } else {
        throw new Error(response?.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error:', error);
      
      if (error.message.includes('Receiving end does not exist')) {
        showStatus('Content script not loaded. Try refreshing the page.', 'error');
      } else if (error.message.includes('Request timeout')) {
        showStatus('Request timed out. Try again.', 'error');
      } else {
        showStatus('Error: ' + error.message, 'error');
      }
    }
  }

  function getDataCount(data) {
    if (!data) return 0;
    
    if (data.results && Array.isArray(data.results)) {
      return data.results.length;
    } else if (data.businessesWithPhones && Array.isArray(data.businessesWithPhones)) {
      return data.businessesWithPhones.length;
    } else if (data.reviews && Array.isArray(data.reviews)) {
      return data.reviews.length;
    } else if (Array.isArray(data)) {
      return data.length;
    }
    
    return 1;
  }

  function convertToCSV(data) {
    if (!data) {
      console.error('No data provided for CSV conversion');
      return '';
    }
    
    console.log('Converting to CSV:', data);
    
    let items = [];
    let csvType = 'unknown';
    
    // Extract the actual array of items based on data structure
    if (data.results && Array.isArray(data.results)) {
      items = data.results;
      csvType = 'search_results';
      console.log(`Processing ${items.length} search results`);
    } else if (data.businessesWithPhones && Array.isArray(data.businessesWithPhones)) {
      items = data.businessesWithPhones;
      csvType = 'businesses_with_phones';
      console.log(`Processing ${items.length} businesses with phones`);
    } else if (data.reviews && Array.isArray(data.reviews)) {
      items = data.reviews;
      csvType = 'reviews';
      console.log(`Processing ${items.length} reviews`);
    } else if (Array.isArray(data)) {
      items = data;
      csvType = 'array_data';
      console.log(`Processing ${items.length} array items`);
    } else {
      // Single object - convert to array
      items = [data];
      csvType = 'single_business';
      console.log('Processing single business data');
    }
    
    if (items.length === 0) {
      console.log('No items found for CSV');
      return '';
    }
    
    const headers = Object.keys(items[0]);
    const csvRows = [];
    
    // Add header row
    csvRows.push(headers.join(','));
    
    // Add data rows
    for (const item of items) {
      const values = headers.map(header => {
        let value = item[header];
        
        // Handle different data types
        if (Array.isArray(value)) {
          value = value.join('; ');
        } else if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        
        // Escape quotes and wrap in quotes
        const escaped = String(value || '').replace(/"/g, '""');
        return `"${escaped}"`;
      });
      
      csvRows.push(values.join(','));
    }
    
    const csv = csvRows.join('\n');
    console.log(`Generated ${csvType} CSV with ${items.length} rows`);
    return csv;
  }

  function exportToCSV(data) {
    try {
      if (!data) {
        showStatus('No data to export. Please extract data first.', 'error');
        return;
      }

      console.log('Exporting data:', data);
      const csv = convertToCSV(data);
      
      if (!csv || csv.trim() === '') {
        showStatus('No CSV data generated. The extracted data might be empty.', 'error');
        return;
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const action = data.businessesWithPhones ? 'phones' : 
                    data.results ? 'search' : 
                    data.reviews ? 'reviews' : 'business';
      const filename = `google_maps_${action}_${timestamp}.csv`;
      
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          showStatus('Export failed: ' + chrome.runtime.lastError.message, 'error');
        } else {
          showStatus(`CSV exported successfully! File: ${filename}`, 'success');
        }
      });
      
      // Clean up the URL object after download
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Export error:', error);
      showStatus('Export error: ' + error.message, 'error');
    }
  }

  // Event listeners
  extractBusinessBtn.addEventListener('click', () => sendMessageToContentScript('extractBusiness'));
  extractSearchBtn.addEventListener('click', () => sendMessageToContentScript('extractSearchResults'));
  extractReviewsBtn.addEventListener('click', () => sendMessageToContentScript('extractReviews'));
  extractPhonesBtn.addEventListener('click', () => sendMessageToContentScript('extractPhoneNumbers'));
  exportCSVBtn.addEventListener('click', () => {
    if (currentData) {
      exportToCSV(currentData);
    } else {
      showStatus('No data to export. Please extract data first.', 'error');
    }
  });

  // Debug function to check data structure
  window.debugData = function() {
    console.log('Current data structure:', currentData);
    if (currentData) {
      console.log('Data keys:', Object.keys(currentData));
      if (currentData.results) {
        console.log('Results count:', currentData.results.length);
        if (currentData.results.length > 0) {
          console.log('First result:', currentData.results[0]);
        }
      }
      if (currentData.businessesWithPhones) {
        console.log('Businesses with phones count:', currentData.businessesWithPhones.length);
        if (currentData.businessesWithPhones.length > 0) {
          console.log('First business with phone:', currentData.businessesWithPhones[0]);
        }
      }
    }
    return currentData;
  };
});

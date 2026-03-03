// Content script that runs on Google Maps pages
console.log('Google Maps Data Extractor loaded - Content script initialized');

let isProcessing = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request.action);
  
  // Prevent multiple simultaneous processing
  if (isProcessing) {
    console.log('Already processing a request, skipping...');
    sendResponse({ success: false, error: 'Already processing another request' });
    return true;
  }
  
  isProcessing = true;
  
  // Process the request
  processRequest(request)
    .then(result => {
      console.log('Sending success response for:', request.action);
      sendResponse({ 
        success: true, 
        data: result,
        action: request.action 
      });
    })
    .catch(error => {
      console.error('Error processing request:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        action: request.action 
      });
    })
    .finally(() => {
      isProcessing = false;
    });
  
  return true; // Keep message channel open for async response
});

async function processRequest(request) {
  console.log('Processing request:', request.action);
  
  switch (request.action) {
    case 'extractBusiness':
      return await extractBusinessData();
    case 'extractSearchResults':
      return await extractSearchResults();
    case 'extractReviews':
      return await extractReviews();
    case 'extractPhoneNumbers':
      return await extractAllBusinessData();
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

// ==================== REVIEWS EXTRACTION ====================
function extractReviews() {
  console.log('Starting reviews extraction...');
  
  return new Promise((resolve) => {
    const reviewTabSelectors = [
      'button[aria-label*="reviews i"]',
      'button[aria-label*="Reviews"]',
      '[data-tab-index="1"]',
      '[role="tab"]:contains("Reviews")',
      'button:contains("Reviews")',
      '.RWPxGd',
      '[jsaction*="reviews"]'
    ];

    let reviewTab = null;
    for (const selector of reviewTabSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.textContent && element.textContent.toLowerCase().includes('review')) {
          reviewTab = element;
          console.log('Found reviews tab:', selector);
          break;
        }
      } catch (e) {
        console.log(`Selector ${selector} failed:`, e);
      }
    }

    if (reviewTab) {
      console.log('Clicking reviews tab to expand...');
      reviewTab.click();
      
      setTimeout(() => {
        const reviews = extractReviewsContent();
        resolve(reviews);
      }, 3000);
    } else {
      console.log('No reviews tab found, trying to extract directly...');
      const reviews = extractReviewsContent();
      resolve(reviews);
    }
  });
}

function extractReviewsContent() {
  console.log('Extracting reviews content...');
  const reviews = [];
  
  try {
    const reviewSelectors = [
      '[data-review-id]',
      '.jftiEf',
      '.gws-localreviews__google-review',
      '.WMFCJb',
      '.d4r55',
      '.KV1Qvd',
      '[jsaction*="review"]',
      '.jxjCjc',
      '.ODSEW-ShBeI-text',
      '.MyEned',
      '.wiI7pd',
      '.rsqaWe'
    ];

    let reviewElements = [];
    
    reviewSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          elements.forEach(el => {
            if (el.textContent && el.textContent.trim().length > 10) {
              reviewElements.push(el);
            }
          });
        }
      } catch (error) {
        console.log(`Selector ${selector} failed:`, error);
      }
    });

    reviewElements = [...new Set(reviewElements)];
    console.log(`Total unique review elements found: ${reviewElements.length}`);

    if (reviewElements.length === 0) {
      console.log('No specific review elements found, searching for review-like content...');
      const allTextElements = document.querySelectorAll('div, span, p');
      allTextElements.forEach(el => {
        const text = el.textContent.trim();
        if (text.length > 50 && text.length < 1000) {
          const reviewIndicators = ['review', 'rating', 'star', 'experience', 'service', 'quality', 'recommend'];
          const hasReviewIndicator = reviewIndicators.some(indicator => 
            text.toLowerCase().includes(indicator)
          );
          
          if (hasReviewIndicator || text.includes('⭐') || /\d\s*stars?/i.test(text)) {
            reviewElements.push(el);
          }
        }
      });
    }

    console.log(`Processing ${reviewElements.length} potential review elements...`);

    reviewElements.forEach((reviewElement, index) => {
      try {
        const reviewData = extractReviewData(reviewElement, index + 1);
        if (reviewData.author || reviewData.content) {
          reviews.push(reviewData);
        }
      } catch (error) {
        console.error(`Error processing review ${index}:`, error);
      }
    });

  } catch (error) {
    console.error('Error in extractReviewsContent:', error);
  }

  console.log(`Successfully extracted ${reviews.length} reviews`);
  
  return {
    totalReviews: reviews.length,
    extractionDate: new Date().toISOString(),
    reviews: reviews,
    status: reviews.length > 0 ? 'success' : 'no_data',
    message: reviews.length > 0 ? 
      `Found ${reviews.length} reviews` : 
      'No reviews found. Make sure you are on a business page with reviews.'
  };
}

function extractReviewData(reviewElement, reviewId) {
  const reviewData = {
    author: '',
    rating: '',
    date: '',
    content: '',
    photos: [],
    reviewId: reviewId,
    source: 'google_maps'
  };

  try {
    reviewData.author = extractReviewAuthor(reviewElement);
    reviewData.rating = extractReviewRating(reviewElement);
    reviewData.date = extractReviewDate(reviewElement);
    reviewData.content = extractReviewContent(reviewElement);
    reviewData.photos = extractReviewPhotos(reviewElement);
  } catch (error) {
    console.error(`Error extracting review data ${reviewId}:`, error);
  }

  return reviewData;
}

function extractReviewAuthor(reviewElement) {
  const authorSelectors = [
    '.d4r55',
    '[aria-label*="review by"]',
    '.TSUbDb',
    '.X43Kjb',
    '.OSrXXb'
  ];

  for (const selector of authorSelectors) {
    const element = reviewElement.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  const text = reviewElement.textContent;
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0 && lines[0].length < 50 && !lines[0].match(/\d/)) {
    return lines[0].trim();
  }

  return 'Unknown Author';
}

function extractReviewRating(reviewElement) {
  const ratingSelectors = [
    'span[aria-label*="star"]',
    '[aria-label*="rating"]',
    '.kvMYJc',
    '.fzvQIb',
    '.ODSEW-ShBeI-N7Eqid'
  ];

  for (const selector of ratingSelectors) {
    const element = reviewElement.querySelector(selector);
    if (element) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        const ratingMatch = ariaLabel.match(/(\d+(\.\d+)?)\s*stars?/i);
        if (ratingMatch) return ratingMatch[1];
      }
      
      const text = element.textContent;
      const ratingMatch = text.match(/(\d+(\.\d+)?)\s*(stars?|⭐)/i);
      if (ratingMatch) return ratingMatch[1];
    }
  }

  const starElements = reviewElement.querySelectorAll('[role="img"], .p9hHf, .hCCjke');
  for (const starElement of starElements) {
    const ariaLabel = starElement.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.includes('star')) {
      const ratingMatch = ariaLabel.match(/(\d+(\.\d+)?)\s*stars?/i);
      if (ratingMatch) return ratingMatch[1];
    }
  }

  return '';
}

function extractReviewDate(reviewElement) {
  const dateSelectors = [
    '.rsqaWe',
    '.xR0PPb',
    '.Ach9Te',
    '.deyxDb',
    '.QErh0b'
  ];

  for (const selector of dateSelectors) {
    const element = reviewElement.querySelector(selector);
    if (element && element.textContent.trim()) {
      const dateText = element.textContent.trim();
      if (dateText.match(/\d/)) return dateText;
    }
  }

  const text = reviewElement.textContent;
  const datePatterns = [
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/i,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
    /\b\d{1,2} (?:months?|years?) ago\b/i,
    /\b(?:a week|a month|a year) ago\b/i,
    /\b\d+ (?:days?|weeks?|months?|years?) ago\b/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return '';
}

function extractReviewContent(reviewElement) {
  const contentSelectors = [
    '.wiI7pd',
    '.MyEned',
    '.Jtu6Td',
    '.qz532c',
    '.hCCjke',
    '.K6NKbf',
    '.rsqaWe',
    '.ODSEW-ShBeI-text'
  ];

  for (const selector of contentSelectors) {
    const element = reviewElement.querySelector(selector);
    if (element && element.textContent.trim()) {
      const content = element.textContent.trim();
      if (content.length > 10 && !content.includes('translated by Google')) {
        return content;
      }
    }
  }

  const text = reviewElement.textContent;
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 10)
    .filter(line => !line.includes('translated by Google'))
    .filter(line => !line.match(/^\d+(\.\d+)?\s*stars?$/i))
    .filter(line => !line.match(/^\d+\s*(months?|years?|days?|weeks?) ago$/i));

  if (lines.length > 0) {
    return lines.reduce((longest, current) => 
      current.length > longest.length ? current : longest, '');
  }

  return '';
}

function extractReviewPhotos(reviewElement) {
  const photos = [];
  const photoSelectors = [
    'img[src*="googleusercontent"]',
    '.lXJkw',
    '.RY3tic',
    '.KxwPGc'
  ];

  photoSelectors.forEach(selector => {
    const elements = reviewElement.querySelectorAll(selector);
    elements.forEach(element => {
      const src = element.getAttribute('src');
      if (src && src.includes('googleusercontent')) {
        photos.push(src);
      }
    });
  });

  return photos;
}

// ==================== BUSINESS DATA EXTRACTION ====================
function extractAllBusinessData() {
  console.log('Extracting complete business data from search results...');
  
  const allBusinesses = [];
  
  try {
    // NEW: Better selectors for Google Maps 2024
    const cardSelectors = [
      '[role="main"] [jsaction*="pane"]',
      '.Nv2PK', 
      '.THOPZb',
      '[class*="section-result"]',
      '[data-result-index]',
      '.qjESne', // New selector
      '.lI9IFe', // New selector
      '[jsaction*="mouseover:pane"]',
      'a[href*="/place/"]',
      '.hfpxzc' // New selector for scrollable results
    ];
    
    let businessCards = [];
    
    // Try each selector
    for (const selector of cardSelectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        console.log(`Found ${cards.length} cards with selector: ${selector}`);
        businessCards = Array.from(cards);
        break;
      }
    }
    
    // NEW: If no cards found, try to find business links
    if (businessCards.length === 0) {
      const businessLinks = document.querySelectorAll('a[href*="/place/"]');
      console.log(`Found ${businessLinks.length} business links`);
      businessCards = Array.from(businessLinks);
    }
    
    console.log(`Total business elements found: ${businessCards.length}`);
    
    // Process each business card
    businessCards.forEach((card, index) => {
      try {
        const business = extractBusinessFromCard(card, index + 1);
        if (business.name && business.name.trim().length > 0) {
          allBusinesses.push(business);
          console.log(`Processed business ${index + 1}:`, business.name);
        }
      } catch (error) {
        console.error(`Error processing business card ${index}:`, error);
      }
    });

  } catch (error) {
    console.error('Error in extractAllBusinessData:', error);
    throw error;
  }

  console.log(`Extracted complete data for ${allBusinesses.length} businesses`);
  
  return {
    totalBusinesses: allBusinesses.length,
    businessesWithPhones: allBusinesses.filter(b => b.phone && b.phone.length > 0),
    businessesWithoutPhones: allBusinesses.filter(b => !b.phone || b.phone.length === 0),
    businessesWithAddress: allBusinesses.filter(b => b.address && b.address.length > 0),
    extractionDate: new Date().toISOString(),
    results: allBusinesses
  };
}

function extractBusinessFromCard(card, position) {
  const business = {
    name: '',
    phone: '',
    address: '',
    rating: '',
    reviews: '',
    type: '',
    distance: '',
    hours: '',
    position: position
  };

  business.name = extractBusinessName(card);
  business.phone = extractPhoneFromCard(card);
  business.address = extractAddressFromCard(card);
  business.rating = extractRatingFromCard(card);
  business.reviews = extractReviewsCountFromCard(card);
  business.type = extractBusinessType(card);
  business.distance = extractDistanceFromCard(card);
  business.hours = extractHoursFromCard(card);

  return business;
}

function extractBusinessName(card) {
  const nameSelectors = [
    'div[role="heading"]',
    'div.fontHeadlineSmall',
    'h3',
    '.qBF1Pd',
    '.fontHeadlineSmall',
    '.bfdHYd',
    '.NrDZNb',
    '.DUwDvf',
    '.qBF1Pd-fontHeadlineSmall', // New selector
    '[aria-label*="place"]' // New selector
  ];
  
  for (const selector of nameSelectors) {
    const element = card.querySelector(selector);
    if (element && element.textContent && element.textContent.trim()) {
      const name = element.textContent.trim();
      if (name.length > 0) return name;
    }
  }
  
  // NEW: Try to find name in aria-label
  const ariaLabel = card.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.includes('place')) {
    const nameMatch = ariaLabel.match(/(.*?)(?=\s*place|\s*\d|$)/);
    if (nameMatch) return nameMatch[1].trim();
  }
  
  const cardText = card.textContent;
  const lines = cardText.split('\n').filter(line => line.trim().length > 0);
  return lines.length > 0 ? lines[0].trim() : 'Unknown Business';
}

// FIXED: Phone number extraction - SIMPLIFIED for 10-digit numbers only
function extractPhoneFromCard(card) {
  console.log('Extracting phone from card...');
  
  // Method 1: Look for phone buttons
  const phoneSelectors = [
    'button[data-tooltip*="phone"]',
    'button[data-item-id*="phone"]',
    '[aria-label*="Phone"]',
    'button[aria-label*="Call"]',
    '[jsaction*="phone"]',
    '.iP3XFd',
    '.CsEnBe',
    '[data-phone-number]'
  ];

  for (const selector of phoneSelectors) {
    const element = card.querySelector(selector);
    if (element) {
      console.log('Found phone element with selector:', selector);
      
      // Try data attributes first
      const dataPhone = element.getAttribute('data-phone-number') || 
                       element.getAttribute('data-tooltip');
      if (dataPhone) {
        const phone = extractSimplePhone(dataPhone);
        if (phone) {
          console.log('Found phone in data attribute:', phone);
          return phone;
        }
      }
      
      // Try text content
      const text = element.textContent || element.getAttribute('aria-label') || '';
      const phone = extractSimplePhone(text);
      if (phone) {
        console.log('Found phone in text:', phone);
        return phone;
      }
    }
  }

  // Method 2: Search entire card text for Indian phone patterns
  const cardText = card.textContent || card.innerText || '';
  console.log('Searching card text for phone patterns...');
  
  // SIMPLIFIED: Only look for 10-digit Indian mobile numbers
  const phonePatterns = [
    /\b[6-9]\d{9}\b/g, // Simple 10-digit Indian mobile
    /\b\d{5}[\s\-]?\d{5}\b/g // 12345 67890 format
  ];

  for (const pattern of phonePatterns) {
    const matches = cardText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const phone = match.replace(/[\s\-]/g, '');
        if (phone.length === 10 && /^[6-9]/.test(phone)) {
          console.log('Found phone in card text:', phone);
          return phone; // Return plain 10-digit number
        }
      }
    }
  }

  console.log('No phone number found in card');
  return '';
}

// NEW: Simplified phone extraction - returns only 10-digit numbers
function extractSimplePhone(text) {
  if (!text) return '';
  
  // Only look for 10-digit numbers starting with 6-9
  const simplePattern = /\b([6-9]\d{9})\b/g;
  const matches = text.match(simplePattern);
  
  if (matches && matches[0]) {
    return matches[0]; // Return plain 10-digit number
  }
  
  return '';
}

function extractAddressFromCard(card) {
  const addressSelectors = [
    'div.fontBodyMedium > span:last-child',
    '.W4Efsd:last-child',
    '.W4Efsd > span:last-child',
    '.UY7F9',
    '.LrzXr',
    '[data-item-id="address"]',
    '[aria-label*="Address"]',
    '.Io6YTe.fontBodyMedium',
    '[class*="location"]',
    '[class*="area"]',
    '[class*="locality"]'
  ];

  for (const selector of addressSelectors) {
    const element = card.querySelector(selector);
    if (element && element.textContent && element.textContent.trim()) {
      const text = element.textContent.trim();
      if (isValidAddress(text)) return text;
    }
  }

  const fontBodyElements = card.querySelectorAll('.fontBodyMedium, .W4Efsd');
  if (fontBodyElements.length >= 2) {
    const lastElement = fontBodyElements[fontBodyElements.length - 1];
    if (lastElement && lastElement.textContent) {
      const text = lastElement.textContent.trim();
      if (isValidAddress(text)) return text;
    }
  }

  const cardText = card.textContent || '';
  const address = findAddressInText(cardText);
  if (address) return address;

  return '';
}

function extractRatingFromCard(card) {
  const ratingElement = card.querySelector('span[aria-label*="stars"]');
  if (ratingElement) {
    const ratingText = ratingElement.getAttribute('aria-label') || '';
    const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
    return ratingMatch ? ratingMatch[1] : '';
  }
  return '';
}

function extractReviewsCountFromCard(card) {
  const reviewsElement = card.querySelector('span[aria-label*="reviews"]');
  if (reviewsElement) {
    const reviewsText = reviewsElement.getAttribute('aria-label') || '';
    const reviewsMatch = reviewsText.match(/(\d+)/);
    return reviewsMatch ? reviewsMatch[1] : '';
  }
  return '';
}

function extractBusinessType(card) {
  const typeElement = card.querySelector('div.fontBodyMedium > span:first-child, [class*="type"]');
  if (typeElement && typeElement.textContent) {
    return typeElement.textContent.trim();
  }
  return '';
}

function extractDistanceFromCard(card) {
  const distanceElement = card.querySelector('[class*="distance"], [aria-label*="km"], [aria-label*="miles"]');
  if (distanceElement && distanceElement.textContent) {
    return distanceElement.textContent.trim();
  }
  return '';
}

function extractHoursFromCard(card) {
  const hoursElement = card.querySelector('[class*="hours"], [aria-label*="Open"], [aria-label*="Closed"]');
  if (hoursElement && hoursElement.textContent) {
    return hoursElement.textContent.trim();
  }
  return '';
}

function findAddressInText(text) {
  if (!text) return '';
  
  const addressPatterns = [
    /\b\d+\s+[A-Za-z\s,]+,?\s*Surat\b/i,
    /\bSurat[,.\s].*?\b\d{6}\b/i,
    /\b[A-Za-z\s]+\d+[A-Za-z]?\s*,\s*Surat\b/i,
    /\b\d+\s+[A-Za-z\s]+(?:Road|Street|Ave|Avenue|Lane|Rd|St)\b/i
  ];

  for (const pattern of addressPatterns) {
    const matches = text.match(pattern);
    if (matches && isValidAddress(matches[0])) {
      return matches[0].trim();
    }
  }

  return '';
}

function isValidAddress(text) {
  if (!text || text.length < 5) return false;
  
  const excludePatterns = [
    /^\d{10}$/,
    /^\+\d+$/,
    /^\d{1,5} reviews?$/i,
    /^\d+\.\d+ stars?$/i,
    /^Open|Closed|Hours?$/i,
    /^[A-Za-z]+\s+[A-Za-z]+\s*$/,
    /^₹/,
    /^\d+\s*km$/,
    /^\d+\s*miles$/
  ];

  for (const pattern of excludePatterns) {
    if (pattern.test(text.trim())) return false;
  }

  const includePatterns = [
    /\d+/, // Contains numbers
    /[A-Za-z]/, // Contains letters
    /(Road|Street|Ave|Avenue|Lane|Rd|St|Dr|Drive|Square|Plaza)/i, // Street indicators
    /(Surat|Gujarat|India)/i, // Location indicators
    /\b\d{6}\b/ // PIN code
  ];

  let score = 0;
  for (const pattern of includePatterns) {
    if (pattern.test(text)) score++;
  }

  return score >= 2 || (text.length > 10 && /\d/.test(text) && /[A-Za-z]/.test(text));
}

// ==================== SINGLE BUSINESS EXTRACTION ====================
function extractBusinessData() {
  console.log('Extracting business data...');
  
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        resolve(performBusinessExtraction());
      });
    } else {
      resolve(performBusinessExtraction());
    }
  });
}

function performBusinessExtraction() {
  const businessData = {
    name: '',
    address: '',
    phone: '',
    website: '',
    rating: '',
    reviewsCount: '',
    hours: [],
    coordinates: '',
    category: '',
    priceLevel: '',
    description: '',
    extractedAt: new Date().toISOString(),
    status: 'success'
  };

  try {
    // Extract business name
    const nameSelectors = [
      'h1[class*="fontHeadline"]',
      'h1.DUwDvf',
      '[role="main"] h1',
      'h1',
      '.x3AX1-LfntMc-header-title-title'
    ];
    
    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        businessData.name = element.textContent.trim();
        break;
      }
    }

    // Extract address
    const addressSelectors = [
      'button[data-item-id="address"]',
      '[data-tooltip*="address"]',
      '[aria-label*="Address"]',
      'button[aria-label*="Address"]'
    ];
    
    for (const selector of addressSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        businessData.address = element.textContent.trim();
        break;
      }
    }

    // Extract phone (SIMPLIFIED)
    businessData.phone = extractSimplePhoneNumber();

    // Extract website
    const websiteSelectors = [
      'a[data-tooltip*="website"]',
      'a[href*="http"][data-item-id]',
      '[aria-label*="Website"]',
      'a[aria-label*="Website"]'
    ];
    
    for (const selector of websiteSelectors) {
      const element = document.querySelector(selector);
      if (element && element.href) {
        businessData.website = element.href;
        break;
      }
    }

    // Extract rating
    const ratingElement = document.querySelector('span[aria-label*="stars"]');
    if (ratingElement) {
      const ratingText = ratingElement.getAttribute('aria-label') || '';
      const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
      businessData.rating = ratingMatch ? ratingMatch[1] : '';
    }

    // Extract reviews count
    const reviewsElement = document.querySelector('span[aria-label*="reviews"]');
    if (reviewsElement) {
      const reviewsText = reviewsElement.getAttribute('aria-label') || '';
      const reviewsMatch = reviewsText.match(/(\d+)/);
      businessData.reviewsCount = reviewsMatch ? reviewsMatch[1] : '';
    }

    // Extract hours
    const hoursSelectors = [
      '[data-attribution*="hours"] div',
      '[jsaction*="hours"] div',
      '.t39EBf-G0jgY-d0wEjd-content',
      '[aria-label*="hours"]'
    ];
    
    hoursSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        Array.from(elements).forEach(el => {
          if (el.textContent) {
            const text = el.textContent.trim();
            if (text && !businessData.hours.includes(text)) {
              businessData.hours.push(text);
            }
          }
        });
      }
    });

    // Extract category
    const categoryElement = document.querySelector('button[jsaction*="category"], [aria-label*="Category"]');
    if (categoryElement && categoryElement.textContent) {
      businessData.category = categoryElement.textContent.trim();
    }

    // Extract price level
    const priceElement = document.querySelector('span[aria-label*="Price"]');
    if (priceElement) {
      businessData.priceLevel = priceElement.getAttribute('aria-label');
    }

    // Extract description
    const descElement = document.querySelector('[data-attribution*="description"], [class*="description"]');
    if (descElement && descElement.textContent) {
      businessData.description = descElement.textContent.trim();
    }

    // Extract coordinates from URL
    const urlParams = new URLSearchParams(window.location.search);
    const coords = urlParams.get('q');
    if (coords) {
      businessData.coordinates = coords;
    }

    if (!businessData.name && !businessData.address) {
      businessData.status = 'no_data';
      businessData.message = 'No business data found. Make sure you are on a business page and not just search results.';
    }

  } catch (error) {
    console.error('Error in extractBusinessData:', error);
    businessData.status = 'error';
    businessData.error = error.message;
  }

  console.log('Business data extracted:', businessData);
  return businessData;
}

// NEW: Simplified phone extraction for single business
function extractSimplePhoneNumber() {
  console.log('Extracting phone number from business page...');
  
  const phoneSelectors = [
    'button[data-tooltip*="phone"]',
    'button[data-item-id*="phone"]',
    '[aria-label*="Phone"]',
    'button[aria-label*="Phone"]',
    'button[data-item-id="phone"]',
    '[data-phone-number]',
    '.CsEnBe',
    '.iP3XFd'
  ];

  // Method 1: Check phone-specific elements
  for (const selector of phoneSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      // Check data attributes
      const dataPhone = element.getAttribute('data-phone-number') || 
                       element.getAttribute('data-tooltip');
      if (dataPhone) {
        const phone = extractSimplePhone(dataPhone);
        if (phone) {
          console.log('Found phone in data attribute:', phone);
          return phone;
        }
      }
      
      // Check text content
      if (element.textContent) {
        const phone = extractSimplePhone(element.textContent);
        if (phone) {
          console.log('Found phone in text:', phone);
          return phone;
        }
      }
    }
  }

  // Method 2: Search entire page for 10-digit numbers
  console.log('Searching entire page for phone numbers...');
  const allText = document.body.textContent || '';
  const phonePattern = /\b([6-9]\d{9})\b/g;
  const matches = allText.match(phonePattern);
  
  if (matches) {
    console.log('Found phones in page text:', matches);
    return matches[0]; // Return first 10-digit number found
  }

  console.log('No phone number found');
  return '';
}

// ==================== SEARCH RESULTS EXTRACTION ====================
function extractSearchResults() {
  console.log('Extracting search results...');
  
  const results = [];
  
  try {
    // Use the same card detection as extractAllBusinessData
    const cardSelectors = [
      '[role="main"] [jsaction*="pane"]',
      '.Nv2PK', 
      '.THOPZb',
      '[class*="section-result"]',
      '[data-result-index]',
      '.qjESne',
      '.lI9IFe',
      '[jsaction*="mouseover:pane"]',
      'a[href*="/place/"]',
      '.hfpxzc'
    ];
    
    let businessCards = [];
    
    for (const selector of cardSelectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        console.log(`Found ${cards.length} cards with selector: ${selector}`);
        businessCards = Array.from(cards);
        break;
      }
    }
    
    // Fallback to business links
    if (businessCards.length === 0) {
      const businessLinks = document.querySelectorAll('a[href*="/place/"]');
      console.log(`Found ${businessLinks.length} business links`);
      businessCards = Array.from(businessLinks);
    }
    
    console.log(`Total business elements found: ${businessCards.length}`);
    
    // Process each card
    businessCards.forEach((card, index) => {
      try {
        const business = extractBusinessFromCard(card, index + 1);
        if (business.name && business.name.trim().length > 0) {
          results.push(business);
        }
      } catch (error) {
        console.error(`Error processing business card ${index}:`, error);
      }
    });

  } catch (error) {
    console.error('Error in extractSearchResults:', error);
    throw error;
  }

  console.log(`Extracted ${results.length} search results`);
  return {
    totalResults: results.length,
    extractionDate: new Date().toISOString(),
    results: results,
    status: results.length > 0 ? 'success' : 'no_data'
  };
}

// ==================== TEST FUNCTIONS ====================
window.testExtraction = function(action = 'extractBusiness') {
  console.log('Manual test:', action);
  processRequest({ action })
    .then(result => console.log('Test result:', result))
    .catch(error => console.error('Test error:', error));
};

window.testReviews = function() {
  console.log('Testing reviews extraction...');
  extractReviews()
    .then(result => {
      console.log('Reviews test result:', result);
      return result;
    })
    .catch(error => {
      console.error('Reviews test error:', error);
      return error;
    });
};

window.testAllBusinessData = function() {
  console.log('Testing complete business data extraction...');
  extractAllBusinessData()
    .then(result => console.log('Complete business data:', result))
    .catch(error => console.error('Test error:', error));
};

// NEW: Test phone extraction
window.testPhoneExtraction = function() {
  console.log('Testing phone extraction...');
  const cards = document.querySelectorAll('[role="main"] [jsaction*="pane"], .Nv2PK, a[href*="/place/"]');
  console.log(`Found ${cards.length} cards to test`);
  
  cards.forEach((card, index) => {
    const phone = extractPhoneFromCard(card);
    const name = extractBusinessName(card);
    console.log(`Card ${index + 1}: ${name} - Phone: ${phone}`);
  });
};

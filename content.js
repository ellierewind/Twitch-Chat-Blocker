// Content script for Twitch VOD chat blocking
let blockedUsers = [];

// Initialize blocked users list
function initializeBlockedUsers() {
  chrome.runtime.sendMessage({ action: 'getBlockedUsers' }, (response) => {
    if (response && response.blockedUsers) {
      blockedUsers = response.blockedUsers;
      hideBlockedMessages();
    }
  });
}

// Hide messages from blocked users
function hideBlockedMessages() {
  // Handle VOD chat messages
  const vodChatMessages = document.querySelectorAll('li[class*="InjectLayout"] div[data-user]');
  
  vodChatMessages.forEach(messageDiv => {
    const username = messageDiv.getAttribute('data-user');
    if (username && blockedUsers.includes(username.toLowerCase())) {
      // Hide the entire message container (li element)
      const messageContainer = messageDiv.closest('li');
      if (messageContainer) {
        messageContainer.style.display = 'none';
        messageContainer.setAttribute('data-blocked', 'true');
      }
    }
  });
  
  // Handle live chat messages
  const liveChatMessages = document.querySelectorAll('div[class*="chat-line__message"][data-user]');
  
  liveChatMessages.forEach(messageDiv => {
    const username = messageDiv.getAttribute('data-user');
    if (username && blockedUsers.includes(username.toLowerCase())) {
      // Hide the entire live chat message container
      const messageContainer = messageDiv.closest('div[class*="Layout-sc-"]') || messageDiv;
      if (messageContainer) {
        messageContainer.style.display = 'none';
        messageContainer.setAttribute('data-blocked', 'true');
      }
    }
  });
}

// Create a MutationObserver to watch for new messages
function createMessageObserver() {
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if new chat messages were added
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for VOD chat messages
            if (node.matches('li[class*="InjectLayout"]') || 
                node.querySelector('li[class*="InjectLayout"]')) {
              shouldCheck = true;
            }
            // Check for live chat messages
            if (node.matches('div[class*="chat-line__message"]') || 
                node.querySelector('div[class*="chat-line__message"]') ||
                node.matches('div[class*="Layout-sc-"]') ||
                node.querySelector('div[class*="Layout-sc-"]')) {
              shouldCheck = true;
            }
          }
        });
      }
    });
    
    if (shouldCheck) {
      hideBlockedMessages();
    }
  });
  
  // Start observing multiple possible chat containers
  const chatContainers = [
    // VOD chat container
    document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]'),
    // Live chat container
    document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]'),
    document.querySelector('.chat-list'),
    document.querySelector('[class*="chat-scrollable-area"]'),
    // Fallback to body if specific containers aren't found
    document.body
  ].filter(Boolean);
  
  chatContainers.forEach(container => {
    if (container) {
      observer.observe(container, {
        childList: true,
        subtree: true
      });
    }
  });
  
  return observer;
}

// Listen for messages from background script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'userBlocked') {
    blockedUsers.push(message.username);
    hideBlockedMessages();
    
    // Show notification
    showNotification(`Blocked user: ${message.username}`);
  } else if (message.action === 'refreshBlockedUsers') {
    // Refresh blocked users list and show previously hidden messages
    showAllMessages();
    initializeBlockedUsers();
  }
});

// Show all messages (remove blocking)
function showAllMessages() {
  // Show VOD chat messages
  const hiddenVodMessages = document.querySelectorAll('li[data-blocked="true"]');
  hiddenVodMessages.forEach(message => {
    message.style.display = '';
    message.removeAttribute('data-blocked');
  });
  
  // Show live chat messages
  const hiddenLiveMessages = document.querySelectorAll('div[class*="Layout-sc-"][data-blocked="true"], div[class*="chat-line__message"][data-blocked="true"]');
  hiddenLiveMessages.forEach(message => {
    message.style.display = '';
    message.removeAttribute('data-blocked');
  });
}

// Show notification when user is blocked
function showNotification(message) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #9146ff;
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 10000;
    font-family: "Roobert", "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Initialize when page loads
function initialize() {
  initializeBlockedUsers();
  createMessageObserver();
}

// Wait for page to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Re-initialize when navigating to different pages (SPA behavior)
let currentUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    setTimeout(initialize, 1000); // Delay to allow page to load
  }
});

urlObserver.observe(document, { subtree: true, childList: true });
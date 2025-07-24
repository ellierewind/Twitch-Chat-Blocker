// Background script for handling context menu
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu item
  chrome.contextMenus.create({
    id: "blockTwitchUser",
    title: "Block this Twitch user",
    contexts: ["link"],
    documentUrlPatterns: ["*://*.twitch.tv/*"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "blockTwitchUser") {
    const url = info.linkUrl;
    
    // Extract username from Twitch URL
    const match = url.match(/twitch\.tv\/([^/?#]+)/);
    if (match && match[1]) {
      const username = match[1];
      
      // Store blocked user
      chrome.storage.sync.get(['blockedUsers'], (result) => {
        const blockedUsers = result.blockedUsers || [];
        if (!blockedUsers.includes(username)) {
          blockedUsers.push(username);
          chrome.storage.sync.set({ blockedUsers }, () => {
            // Notify content script to update blocked users
            chrome.tabs.sendMessage(tab.id, {
              action: 'userBlocked',
              username: username
            });
          });
        }
      });
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getBlockedUsers') {
    chrome.storage.sync.get(['blockedUsers'], (result) => {
      sendResponse({ blockedUsers: result.blockedUsers || [] });
    });
    return true; // Keep message channel open for async response
  }
});
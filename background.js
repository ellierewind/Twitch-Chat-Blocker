// Background script for handling context menu
chrome.runtime.onInstalled.addListener(() => {
  // Remove all existing context menu items first to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    // Create context menu item for links (VOD chat usernames)
    chrome.contextMenus.create({
      id: "blockTwitchUser",
      title: "Block this Twitch user",
      contexts: ["link"],
      documentUrlPatterns: ["*://*.twitch.tv/*"]
    });
    
    // Create context menu item for selected text (live chat usernames)
    chrome.contextMenus.create({
      id: "blockTwitchUserSelection",
      title: "Block this Twitch user",
      contexts: ["selection"],
      documentUrlPatterns: ["*://*.twitch.tv/*"]
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let username = null;
  
  if (info.menuItemId === "blockTwitchUser") {
    const url = info.linkUrl;
    
    // Extract username from Twitch URL
    const match = url.match(/twitch\.tv\/([^/?#]+)/);
    if (match && match[1]) {
      username = match[1].toLowerCase();
    }
  } else if (info.menuItemId === "blockTwitchUserSelection") {
    // Handle selected text (for live chat usernames)
    const selectedText = info.selectionText.trim();
    
    // Basic validation for Twitch usernames
    if (/^[a-zA-Z0-9_]{1,25}$/.test(selectedText)) {
      username = selectedText.toLowerCase();
    }
  }
  
  if (username) {
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
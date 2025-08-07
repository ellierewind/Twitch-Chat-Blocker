// Enhanced background script with chunked storage system
class StorageManager {
  constructor() {
    this.CHUNK_SIZE = 100; // Users per chunk
    this.METADATA_KEY = 'blockedUsers_metadata';
    this.CHUNK_PREFIX = 'blockedUsers_chunk_';
  }

  // Get all blocked users from chunked storage
  async getBlockedUsers() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([this.METADATA_KEY], (result) => {
        const metadata = result[this.METADATA_KEY];
        
        if (!metadata || metadata.totalUsers === 0) {
          // Check for legacy storage format
          chrome.storage.sync.get(['blockedUsers'], (legacyResult) => {
            const legacyUsers = legacyResult.blockedUsers || [];
            if (legacyUsers.length > 0) {
              // Migrate legacy storage to chunked format
              this.setBlockedUsers(legacyUsers).then(() => {
                // Remove legacy storage
                chrome.storage.sync.remove(['blockedUsers']);
                resolve(legacyUsers);
              });
            } else {
              resolve([]);
            }
          });
          return;
        }

        // Get all chunks
        const chunkKeys = [];
        for (let i = 0; i < metadata.chunkCount; i++) {
          chunkKeys.push(this.CHUNK_PREFIX + i);
        }

        chrome.storage.sync.get(chunkKeys, (chunkResults) => {
          const allUsers = [];
          for (let i = 0; i < metadata.chunkCount; i++) {
            const chunkKey = this.CHUNK_PREFIX + i;
            const chunk = chunkResults[chunkKey] || [];
            allUsers.push(...chunk);
          }
          resolve(allUsers);
        });
      });
    });
  }

  // Set blocked users using chunked storage
  async setBlockedUsers(users) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      
      // Split users into chunks
      for (let i = 0; i < users.length; i += this.CHUNK_SIZE) {
        chunks.push(users.slice(i, i + this.CHUNK_SIZE));
      }

      const chunkCount = chunks.length;
      const storageData = {};

      // Prepare metadata
      storageData[this.METADATA_KEY] = {
        totalUsers: users.length,
        chunkCount: chunkCount,
        lastUpdated: Date.now()
      };

      // Prepare chunks
      chunks.forEach((chunk, index) => {
        storageData[this.CHUNK_PREFIX + index] = chunk;
      });

      // Clean up old chunks first
      this.cleanupOldChunks(chunkCount).then(() => {
        // Store new data
        chrome.storage.sync.set(storageData, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // Add a single user
  async addBlockedUser(username) {
    const users = await this.getBlockedUsers();
    if (!users.includes(username)) {
      users.push(username);
      await this.setBlockedUsers(users);
      return true;
    }
    return false;
  }

  // Remove a single user
  async removeBlockedUser(username) {
    const users = await this.getBlockedUsers();
    const filteredUsers = users.filter(user => user !== username);
    if (filteredUsers.length !== users.length) {
      await this.setBlockedUsers(filteredUsers);
      return true;
    }
    return false;
  }

  // Clean up old chunk storage
  async cleanupOldChunks(newChunkCount) {
    return new Promise((resolve) => {
      chrome.storage.sync.get([this.METADATA_KEY], (result) => {
        const metadata = result[this.METADATA_KEY];
        if (!metadata) {
          resolve();
          return;
        }

        const oldChunkCount = metadata.chunkCount || 0;
        if (oldChunkCount <= newChunkCount) {
          resolve();
          return;
        }

        // Remove excess chunks
        const keysToRemove = [];
        for (let i = newChunkCount; i < oldChunkCount; i++) {
          keysToRemove.push(this.CHUNK_PREFIX + i);
        }

        chrome.storage.sync.remove(keysToRemove, () => {
          resolve();
        });
      });
    });
  }

  // Import users (merge with existing)
  async importBlockedUsers(newUsers) {
    const existingUsers = await this.getBlockedUsers();
    const uniqueNewUsers = newUsers.filter(user => !existingUsers.includes(user));
    
    if (uniqueNewUsers.length > 0) {
      const mergedUsers = [...existingUsers, ...uniqueNewUsers];
      await this.setBlockedUsers(mergedUsers);
    }
    
    return {
      imported: uniqueNewUsers.length,
      duplicates: newUsers.length - uniqueNewUsers.length,
      total: existingUsers.length + uniqueNewUsers.length
    };
  }
}

const storageManager = new StorageManager();

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
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
    try {
      const wasAdded = await storageManager.addBlockedUser(username);
      if (wasAdded) {
        // Notify content script to update blocked users
        chrome.tabs.sendMessage(tab.id, {
          action: 'userBlocked',
          username: username
        });
      }
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getBlockedUsers') {
    storageManager.getBlockedUsers().then(users => {
      sendResponse({ blockedUsers: users });
    }).catch(error => {
      console.error('Error getting blocked users:', error);
      sendResponse({ blockedUsers: [] });
    });
    return true; // Keep message channel open for async response
    
  } else if (message.action === 'addBlockedUser') {
    storageManager.addBlockedUser(message.username).then(wasAdded => {
      sendResponse({ success: true, wasAdded });
    }).catch(error => {
      console.error('Error adding blocked user:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
    
  } else if (message.action === 'removeBlockedUser') {
    storageManager.removeBlockedUser(message.username).then(wasRemoved => {
      sendResponse({ success: true, wasRemoved });
    }).catch(error => {
      console.error('Error removing blocked user:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
    
  } else if (message.action === 'setBlockedUsers') {
    storageManager.setBlockedUsers(message.users).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error setting blocked users:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
    
  } else if (message.action === 'importBlockedUsers') {
    storageManager.importBlockedUsers(message.users).then(result => {
      sendResponse({ success: true, result });
    }).catch(error => {
      console.error('Error importing blocked users:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});
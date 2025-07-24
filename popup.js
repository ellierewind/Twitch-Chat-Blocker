// Popup script for managing blocked users
document.addEventListener('DOMContentLoaded', function() {
  loadBlockedUsers();
  
  document.getElementById('clearAll').addEventListener('click', clearAllBlockedUsers);
});

function loadBlockedUsers() {
  chrome.storage.sync.get(['blockedUsers'], function(result) {
    const blockedUsers = result.blockedUsers || [];
    displayBlockedUsers(blockedUsers);
  });
}

function displayBlockedUsers(blockedUsers) {
  const container = document.getElementById('blockedUsersList');
  const clearAllBtn = document.getElementById('clearAll');
  
  if (blockedUsers.length === 0) {
    container.innerHTML = '<div class="empty-state">No blocked users yet</div>';
    clearAllBtn.style.display = 'none';
  } else {
    container.innerHTML = '';
    clearAllBtn.style.display = 'block';
    
    blockedUsers.forEach(username => {
      const userDiv = document.createElement('div');
      userDiv.className = 'blocked-user';
      
      userDiv.innerHTML = `
        <span class="username">${escapeHtml(username)}</span>
        <button class="unblock-btn" data-username="${escapeHtml(username)}">Unblock</button>
      `;
      
      const unblockBtn = userDiv.querySelector('.unblock-btn');
      unblockBtn.addEventListener('click', function() {
        unblockUser(username);
      });
      
      container.appendChild(userDiv);
    });
  }
}

function unblockUser(username) {
  chrome.storage.sync.get(['blockedUsers'], function(result) {
    const blockedUsers = result.blockedUsers || [];
    const updatedUsers = blockedUsers.filter(user => user !== username);
    
    chrome.storage.sync.set({ blockedUsers: updatedUsers }, function() {
      displayBlockedUsers(updatedUsers);
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'refreshBlockedUsers'
          });
        }
      });
    });
  });
}

function clearAllBlockedUsers() {
  if (confirm('Are you sure you want to unblock all users?')) {
    chrome.storage.sync.set({ blockedUsers: [] }, function() {
      displayBlockedUsers([]);
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'refreshBlockedUsers'
          });
        }
      });
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
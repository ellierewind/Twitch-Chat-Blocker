// Popup script for managing blocked users
document.addEventListener('DOMContentLoaded', function() {
  loadBlockedUsers();
  
  document.getElementById('clearAll').addEventListener('click', clearAllBlockedUsers);
  document.getElementById('exportBtn').addEventListener('click', exportBlockedUsers);
  document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', importBlockedUsers);
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

function exportBlockedUsers() {
  chrome.storage.sync.get(['blockedUsers'], function(result) {
    const blockedUsers = result.blockedUsers || [];
    const dataStr = JSON.stringify({
      blockedUsers: blockedUsers,
      exportDate: new Date().toISOString(),
      version: "1.0"
    }, null, 2);
    
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitch-blocked-users-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function importBlockedUsers(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.blockedUsers || !Array.isArray(data.blockedUsers)) {
        alert('Invalid file format. Please select a valid blocked users export file.');
        return;
      }
      
      const importedUsers = data.blockedUsers.filter(user => typeof user === 'string');
      
      if (importedUsers.length === 0) {
        alert('No valid users found in the import file.');
        return;
      }
      
      chrome.storage.sync.get(['blockedUsers'], function(result) {
        const existingUsers = result.blockedUsers || [];
        const mergedUsers = [...new Set([...existingUsers, ...importedUsers])];
        
        chrome.storage.sync.set({ blockedUsers: mergedUsers }, function() {
          displayBlockedUsers(mergedUsers);
          
          // Notify content script
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'refreshBlockedUsers'
              });
            }
          });
          
          const newUsersCount = mergedUsers.length - existingUsers.length;
          if (newUsersCount > 0) {
            alert(`Successfully imported ${newUsersCount} new blocked users!`);
          } else {
            alert('All users from the import file were already blocked.');
          }
        });
      });
      
    } catch (error) {
      alert('Error reading file. Please make sure it\'s a valid JSON file.');
    }
  };
  
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}
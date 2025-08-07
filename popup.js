// Enhanced popup script for managing blocked users with chunked storage
document.addEventListener('DOMContentLoaded', function() {
  loadBlockedUsers();
  
  document.getElementById('exportBtn').addEventListener('click', exportBlockedUsers);
  document.getElementById('importBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', importBlockedUsers);
  document.getElementById('addUserBtn').addEventListener('click', addUserManually);
  document.getElementById('usernameInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      addUserManually();
    }
  });
});

function loadBlockedUsers() {
  chrome.runtime.sendMessage({ action: 'getBlockedUsers' }, function(response) {
    if (response && response.blockedUsers) {
      displayBlockedUsers(response.blockedUsers);
    } else {
      displayBlockedUsers([]);
    }
  });
}

function displayBlockedUsers(blockedUsers) {
  const container = document.getElementById('blockedUsersList');
  
  if (blockedUsers.length === 0) {
    container.innerHTML = '<div class="empty-state">No blocked users yet</div>';
  } else {
    container.innerHTML = '';
    

    
    // Add users list
    blockedUsers.forEach(username => {
      const userDiv = document.createElement('div');
      userDiv.className = 'blocked-user';
      
      userDiv.innerHTML = `
        <span class="username">${escapeHtml(username)}</span>
        <button class="unblock-btn" data-username="${escapeHtml(username)}">Unblock</button>
      `;
      
      const unblockBtn = userDiv.querySelector('.unblock-btn');
      unblockBtn.addEventListener('click', function() {
        showConfirmation(`Unblock user "${username}"?`, () => unblockUser(username));
      });
      
      container.appendChild(userDiv);
    });


  }
}

function unblockUser(username) {
  chrome.runtime.sendMessage({ 
    action: 'removeBlockedUser', 
    username: username 
  }, function(response) {
    if (response && response.success) {
      loadBlockedUsers();
      showNotification(`Successfully unblocked user: ${username}`, 'success');
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'refreshBlockedUsers'
          });
        }
      });
    } else {
      showNotification('Error unblocking user', 'error');
    }
  });
}

function clearAllBlockedUsers() {
  chrome.runtime.sendMessage({ 
    action: 'setBlockedUsers', 
    users: [] 
  }, function(response) {
    if (response && response.success) {
      displayBlockedUsers([]);
      showNotification('All users unblocked successfully', 'success');
      
      // Notify content script to refresh
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'refreshBlockedUsers'
          });
        }
      });
    } else {
      showNotification('Error clearing blocked users', 'error');
    }
  });
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type}`;
  
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

function showConfirmation(message, onConfirm) {
  const dialog = document.createElement('div');
  dialog.className = 'confirmation-dialog';
  
  dialog.innerHTML = `
    <div class="confirmation-content">
      <div>${escapeHtml(message)}</div>
      <div class="confirmation-buttons">
        <button class="confirm-btn">Yes</button>
        <button class="cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  
  const confirmBtn = dialog.querySelector('.confirm-btn');
  const cancelBtn = dialog.querySelector('.cancel-btn');
  
  confirmBtn.addEventListener('click', () => {
    document.body.removeChild(dialog);
    onConfirm();
  });
  
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
  
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  });
  
  document.body.appendChild(dialog);
}

function addUserManually() {
  const input = document.getElementById('usernameInput');
  const username = input.value.trim().toLowerCase();
  
  if (!username) {
    showNotification('Please enter a username', 'error');
    return;
  }
  
  // Basic validation for Twitch usernames
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(username)) {
    showNotification('Invalid username format. Use only letters, numbers, and underscores (1-25 characters)', 'error');
    return;
  }
  
  chrome.runtime.sendMessage({ 
    action: 'addBlockedUser', 
    username: username 
  }, function(response) {
    if (response && response.success) {
      if (response.wasAdded) {
        loadBlockedUsers();
        showNotification(`Successfully blocked user: ${username}`, 'success');
        input.value = '';
        
        // Notify content script
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'refreshBlockedUsers'
            });
          }
        });
      } else {
        showNotification('User is already blocked', 'info');
        input.value = '';
      }
    } else {
      showNotification('Error blocking user: ' + (response.error || 'Unknown error'), 'error');
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function exportBlockedUsers() {
  chrome.runtime.sendMessage({ action: 'getBlockedUsers' }, function(response) {
    const blockedUsers = response.blockedUsers || [];
    const dataStr = JSON.stringify({
      blockedUsers: blockedUsers,
      exportDate: new Date().toISOString(),
      version: "2.0", // Updated version to indicate chunked storage support
      totalUsers: blockedUsers.length
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
    
    showNotification(`Exported ${blockedUsers.length} blocked users`, 'success');
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
        showNotification('Invalid file format. Please select a valid blocked users export file.', 'error');
        return;
      }
      
      const importedUsers = data.blockedUsers.filter(user => 
        typeof user === 'string' && /^[a-zA-Z0-9_]{1,25}$/.test(user)
      );
      
      if (importedUsers.length === 0) {
        showNotification('No valid users found in the import file.', 'error');
        return;
      }
      
      // Show loading notification
      showNotification(`Importing ${importedUsers.length} users...`, 'info');
      
      chrome.runtime.sendMessage({ 
        action: 'importBlockedUsers', 
        users: importedUsers 
      }, function(response) {
        if (response && response.success) {
          const result = response.result;
          loadBlockedUsers();
          
          // Notify content script
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs[0] && tabs[0].url.includes('twitch.tv')) {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'refreshBlockedUsers'
              });
            }
          });
          
          // Show detailed import results
          if (result.imported > 0) {
            showNotification(
              `Import complete! Added ${result.imported} new users. ` +
              `${result.duplicates} were already blocked. Total: ${result.total}`,
              'success'
            );
          } else {
            showNotification(
              `All ${importedUsers.length} users from the import file were already blocked.`,
              'info'
            );
          }
        } else {
          showNotification('Error importing users: ' + (response.error || 'Unknown error'), 'error');
        }
      });
      
    } catch (error) {
      showNotification('Error reading file. Please make sure it\'s a valid JSON file.', 'error');
    }
  };
  
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}
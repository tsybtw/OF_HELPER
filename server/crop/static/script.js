function copyToClipboard(text, event) {
    var dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    var replacedText = text.replace(/<br\s*\/?>/gi, "\n");  
    replacedText = replacedText.replace(/\n{2,}/g, "\n\n"); 
    dummy.value = replacedText;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);

    var copyButton = event.target;
    copyButton.classList.add('animate');
    copyButton.classList.add('active');

    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    setTimeout(function() {
        copyButton.classList.remove('active');
    }, 2000);
  }

  function getAllTags() {
    const allTags = new Set();
    document.querySelectorAll('.text-button').forEach(button => {
        const text = button.textContent;
        const idx = text.indexOf('@');
        if (idx !== -1) {
            const tag = text.slice(idx);
            allTags.add(tag);
        }
    });
    return Array.from(allTags).join(' ');
  }

  function copyTagToClipboard(tag, event) {
    if (tag) {
        const tagToCopy = tag.startsWith('@') ? tag.slice(1) : tag;
        copyToClipboard(tagToCopy, event);
    } else {
        const allTagsText = getAllTags();
        copyToClipboard(allTagsText, event);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tagButtons = document.querySelectorAll('.copy-button.tag-button');

    tagButtons.forEach(button => {
        button.removeAttribute('onclick');
        let hasCopied = false;

        button.addEventListener('click', e => {
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);

        button.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            e.preventDefault();
            hasCopied = false;
            button.classList.add('holding');
        });

        button.addEventListener('pointerup', e => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            if (!hasCopied) {
                hasCopied = true;
                button.classList.remove('holding');
                button.classList.add('animate');
                button.classList.add('completed');
                const textButton = button.previousElementSibling;
                if (textButton && textButton.classList.contains('text-button')) {
                    let text = textButton.textContent;
                    let idx = text.indexOf('@');
                    if (idx !== -1) {
                        let tag = text.slice(idx);
                        copyTagToClipboard(tag, e);
                    }
                }
                setTimeout(() => button.classList.remove('animate'), 300);
                setTimeout(() => button.classList.remove('completed'), 2000);
            }
        });

        button.addEventListener('animationend', e => {
            if (e.animationName === 'clockFill') {
                hasCopied = true;
                button.classList.remove('holding');
                button.classList.add('completed');
                copyTagToClipboard(null, e);
                setTimeout(() => button.classList.remove('completed'), 2000);
            }
        });

        button.addEventListener('pointercancel', () => {
            button.classList.remove('holding','animate','completed');
        });
    });
  });

  let rotationStates = {};

  async function rotateMedia(mediaId, direction, filePath, mediaType) {
    const mediaElement = document.getElementById(mediaId);

    if (!mediaElement) return;

    if (!rotationStates[mediaId]) {
        rotationStates[mediaId] = 0;
    }

    rotationStates[mediaId] += (direction === 'right' ? 90 : -90);
    rotationStates[mediaId] = ((rotationStates[mediaId] % 360) + 360) % 360;

    try {
        const response = await fetch('/rotate-media', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filePath: filePath,
                direction: direction,
                mediaType: mediaType
            })
        });

        if (!response.ok) {
            console.error('Failed to rotate media on server');
            return;
        }

        if (!mediaElement) return;

        mediaElement.style.transform = `rotate(${rotationStates[mediaId]}deg)`;

        if (rotationStates[mediaId] % 180 === 0) {
            mediaElement.style.maxWidth = '310px';
            mediaElement.style.maxHeight = '';
        } else {
            mediaElement.style.maxWidth = '';
            mediaElement.style.maxHeight = '310px';
        }

        try { await saveBetweenQueueUsers(); } catch (_) {}

    } catch (error) {
        console.error('Error rotating media:', error);
    }
  }

  function copyImageToClipboard(imgBase64, event) {
    var img = new Image();
    img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(this, 0, 0);
        canvas.toBlob(function(blob) {
            var item = new ClipboardItem({ 'image/png': blob });
            navigator.clipboard.write([item]);

            var copyButton = event.target;
            copyButton.classList.add('animate');
            copyButton.classList.add('active');

            setTimeout(function() {
                copyButton.classList.remove('animate');
            }, 200);

            setTimeout(function() {
                copyButton.classList.remove('active');
            }, 2000);
        });
    };
    img.src = imgBase64;
  }

  async function copyVideoToClipboard(videoPath, event) {
    try {
        var copyButton = event.target;
        copyButton.classList.add('animate');
        copyButton.classList.add('active');

        setTimeout(function() {
            copyButton.classList.remove('animate');
        }, 200);

        setTimeout(function() {
            copyButton.classList.remove('active');
        }, 2000);

        await fetch('/copy-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: videoPath }),
        });
    } catch (err) {
        console.error('Could not copy video: ', err);
    }
  }

  async function openFolder() {
    var copyButton = document.getElementById('open-folder-button');
    copyButton.classList.add('animate');
    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    fetch('/open-folder', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('delete-status');
        if (data.message) {
        element.textContent = data.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    }
    });
  }

  async function copyFiles() {
    var copyButton = document.getElementById('copy-files-button');
    copyButton.classList.add('animate');
    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    fetch('/copy-files', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('delete-status');
        if (data.message) {
        element.textContent = data.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    }
    });
  }

  function sendFiles(receiver_id, client_id, event) {
    var copyButton = event.target;
    copyButton.classList.add('animate');

    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    var data = {
        receiver_id: receiver_id,
        client_id: client_id,
    };

    var statusElement = document.getElementById('send-status');
    if (statusElement) {
        statusElement.textContent = "Sending files...";
        statusElement.classList.add('show');
        statusElement.style.animation = 'slide-up 0.5s forwards';
    }

    fetch('/sendFiles', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        startStatusCheck(copyButton);
    })
    .catch((error) => {
        console.error('Error:', error);
        if (statusElement) {
            statusElement.textContent = "Error: " + error;
        }
        copyButton.style.backgroundColor = '#FF6B6B'; 
    });
  }

  function startStatusCheck(button) {
    var statusCheckInterval = setInterval(function() {
        checkSendStatus(button, function() {
            clearInterval(statusCheckInterval);
        });
    }, 1000);

    setTimeout(function() {
        clearInterval(statusCheckInterval);
    }, 30000);
  }

  function checkSendStatus(button, callback) {
    fetch('/get_send_status')
        .then(response => response.json())
        .then(data => {
            var statusElement = document.getElementById('send-status');

            if (data.message && data.success !== null) {

                if (statusElement) {
                    statusElement.textContent = data.message;

                    setTimeout(function() {
                        statusElement.classList.remove('show');
                        statusElement.style.animation = 'none';
                    }, 5000);
                }

                if (button) {
                    button.style.backgroundColor = data.success ? '#D0FF6B' : '#FF6B6B';
                }

                if (callback) callback();
            }
        })
        .catch(error => {
            console.error('Error checking status:', error);
        });
  }

  let lastProcessedStatusId = null;

  function setupStatusMonitor() {
    setInterval(function() {
        fetch('/get_send_status')
            .then(response => response.json())
            .then(data => {
                const statusId = data.message + "_" + data.success + "_" + new Date().getTime();

                if (data.success !== null && data.message && statusId !== lastProcessedStatusId) {
                    lastProcessedStatusId = statusId;

                    var button = document.getElementById('send-button');
                    var statusElement = document.getElementById('send-status');

                    if (statusElement) {
                        statusElement.textContent = data.message;
                        statusElement.classList.add('show');
                        statusElement.style.animation = 'slide-up 0.5s forwards';

                        setTimeout(function() {
                            statusElement.classList.remove('show');
                            statusElement.style.animation = 'none';

                            fetch('/get_send_status?clear=true')
                                .catch(err => console.error('Error clearing status:', err));
                        }, 5000);
                    }

                    if (button) {
                        button.style.backgroundColor = data.success ? '#D0FF6B' : '#FF6B6B';
                    }
                }
            })
            .catch(error => {
                console.error('Error checking status:', error);
            });
    }, 2000);
  }

  function deleteFiles() {
    var copyButton = document.getElementsByClassName('button2')[0];
    copyButton.classList.add('animate');
    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    fetch('/delete-files', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('delete-status');
        if (data.message) {
        element.textContent = data.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    }
    });
  }

  function deleteOneFile() {
    var copyButton = document.getElementsByClassName('button1')[0];;
    copyButton.classList.add('animate');
    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);

    fetch('/delete-files-one', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('delete-status');
        if (data.message) {
        element.textContent = data.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    }
    });
  }

  function checkFiles(nickname) {
    fetch('/check-files')
    .then(response => response.json())
    .then(data => {
        document.getElementById('button-text').textContent = data.files
        document.getElementById('send-button').textContent = 'Send ' + data.files + ' files to ' + nickname;
        document.getElementById('file-count').textContent = data.count;
        document.getElementById('file-size').textContent = data.size;
    });
  }

  function toggleQueueDropdown() {
    const dropdown = document.getElementById('queue-dropdown');
    const isOpening = !dropdown.classList.contains('show');

    if (!isOpening) {
      try { 
        const currentUserIndex = currentQueueData?.current_user;
        saveQueueDropdownScroll(currentUserIndex); 
      } catch (_) {}
    }

    dropdown.classList.toggle('show');

    localStorage.setItem('queueDropdownOpen', isOpening ? 'true' : 'false');

    if (dropdown.classList.contains('show')) {
        try { ensurePersistQueueControl(); } catch (_) {}
        try { 
          const currentUserIndex = currentQueueData?.current_user;
          restoreQueueDropdownScroll(currentUserIndex); 
        } catch (_) {}
        loadInitialQueueData();
      }
  }

  function getQueueScrollStorageKey(userIndex = null) {
    try {
      if (typeof currentQueueData === 'object' && currentQueueData && Array.isArray(currentQueueData.users)) {

        const idx = userIndex !== null ? userIndex : (Number.isInteger(currentQueueData.current_user) ? currentQueueData.current_user : 0);
        const user = currentQueueData.users[idx] || {};
        const id = user.user_id || user.user_number || user.nickname || idx;
        return `queueDropdownScroll_${String(id)}`;
      }
    } catch (_) {}
    return 'queueDropdownScroll_global';
  }

  function saveQueueDropdownScroll(userIndex = null) {
    try {
      const dropdown = document.getElementById('queue-dropdown');
      if (!dropdown) return;
      const key = getQueueScrollStorageKey(userIndex);
      localStorage.setItem(key, String(dropdown.scrollTop || 0));
    } catch (_) {}
  }

  function restoreQueueDropdownScroll(userIndex = null) {
    try {
      const dropdown = document.getElementById('queue-dropdown');
      if (!dropdown) return;
      const key = getQueueScrollStorageKey(userIndex);
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const val = parseInt(raw, 10);
        if (Number.isFinite(val) && val >= 0) {
          requestAnimationFrame(() => { dropdown.scrollTop = val; });
        }
      }
    } catch (_) {}
  }

  let queueScrollSaveRaf = null;

  function ensurePersistQueueControl() {
    try {
      const dropdown = document.getElementById('queue-dropdown');
      if (!dropdown) return;
      const modeSwitch = dropdown.querySelector('.queue-mode-switch');
      if (!modeSwitch) return;

      let row = modeSwitch.querySelector('.queue-mode-row');
      if (!row) {
        row = document.createElement('div');
        row.className = 'queue-mode-row';

        const label = modeSwitch.querySelector('.queue-mode-label');
        const toggle = modeSwitch.querySelector('.queue-mode-toggle');
        if (label) row.appendChild(label);
        if (toggle) row.appendChild(toggle);

        modeSwitch.insertAdjacentElement('afterbegin', row);
      }

      let persistRow = modeSwitch.querySelector('.persist-queue-row');
      if (!persistRow) {
        persistRow = document.createElement('div');
        persistRow.className = 'persist-queue-row setting-row-inline';
        persistRow.innerHTML = `
          <input type="checkbox" id="persist-queue-enabled" class="hint-checkbox" onchange="updateQueueSettings()">
          <label for="persist-queue-enabled" class="setting-label">Save queue on exit</label>
        `;
        modeSwitch.appendChild(persistRow);
      }
    } catch (_) {}
  }

  function toggleQueueMode() {
    fetch('/toggle-queue-mode', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        updateQueueModeUI(data.enabled);

        if (data.enabled) {
            loadInitialQueueData();
        }
    })
    .catch(error => {
        console.error('Error toggling queue mode:', error);
    });
  }

  function updateQueueModeUI(enabled) {
    const toggleBtn = document.querySelector('.queue-toggle-btn');
    const modeToggle = document.querySelector('.queue-mode-toggle');
    try { ensurePersistQueueControl(); } catch (_) {}
    const actionButtons = document.getElementById('queue-action-buttons');
    const queueStatus = document.getElementById('queue-status');
    const userButtons = document.getElementById('user-buttons');
    const browserStatus = document.getElementById('browser-status');
    const browserSettings = document.getElementById('browser-settings');

    toggleBtn.innerHTML = `Q ${enabled ? 'ON' : 'OFF'} <span>▼</span>`;

    if (enabled) {
        toggleBtn.classList.add('active');
        modeToggle.classList.add('active');
        try {
          const dropdown = document.getElementById('queue-dropdown');
          const persistRow = dropdown ? dropdown.querySelector('.persist-queue-row') : null;
          if (persistRow) persistRow.style.display = 'flex';
        } catch (_) {}
        actionButtons.style.display = 'flex';
        queueStatus.style.display = 'block';
        userButtons.style.display = 'block';
        browserStatus.style.display = 'block';
        browserSettings.style.display = 'block';

    } else {
        toggleBtn.classList.remove('active');
        modeToggle.classList.remove('active');
        try {
          const dropdown = document.getElementById('queue-dropdown');
          const persistRow = dropdown ? dropdown.querySelector('.persist-queue-row') : null;
          if (persistRow) persistRow.style.display = 'none';
        } catch (_) {}
        actionButtons.style.display = 'none';
        queueStatus.style.display = 'none';
        userButtons.style.display = 'none';
        browserStatus.style.display = 'none';
        browserSettings.style.display = 'none';

        const dropdown = document.getElementById('queue-dropdown');
        if (dropdown) {
            try { saveQueueDropdownScroll(); } catch (_) {}
            dropdown.classList.remove('show');
            localStorage.setItem('queueDropdownOpen', 'false');
        }
    }
  }

  function startQueue() {

    const queueData = currentQueueData;
    if (queueData && queueData.users && queueData.users.length > 1 && queueData.current_user > 0) {
        const currentUser = queueData.users[queueData.current_user];
        const firstUser = queueData.users[0];

        showQueueStartModal(currentUser, firstUser);
    } else {

        fetch('/start-queue', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus('Queue started', 'success');

                loadInitialQueueData();
            } else {
                if (data.invalid_users && Array.isArray(data.invalid_users) && data.invalid_users.length > 0) {
                    showInvalidUsersPrompt(data.invalid_users);
                } else {
                    showStatus(data.message, 'error');
                }
            }
        });
    }
  }

  function showQueueStartModal(currentUser, firstUser) {

    let modal = document.getElementById('queue-start-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'queue-start-modal';
        modal.className = 'queue-modal hidden';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="queue-modal-content">
            <div class="queue-modal-header">
                <h3>Start Queue Processing</h3>
            </div>
            <div class="queue-modal-body">
                <p>Current active user is <strong>User ${currentUser.user_number} (${currentUser.nickname})</strong></p>
                <p>Choose where to start queue processing:</p>
            </div>
            <div class="queue-modal-buttons">
                <button class="queue-modal-btn queue-modal-btn-primary" onclick="startQueueFromFirst()">
                    Start from User ${firstUser.user_number}
                </button>
                <button class="queue-modal-btn queue-modal-btn-secondary" onclick="startQueueFromCurrent()">
                    Start from User ${currentUser.user_number}
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeQueueStartModal();
        }
    });
  }

  function closeQueueStartModal() {
    const modal = document.getElementById('queue-start-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
  }

  function startQueueFromFirst() {
    closeQueueStartModal();

    fetch('/start-queue', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_to_first: true })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Queue started from first user', 'success');
            loadInitialQueueData();
        } else {
            if (data.invalid_users && Array.isArray(data.invalid_users) && data.invalid_users.length > 0) {
                showInvalidUsersPrompt(data.invalid_users);
            } else {
                showStatus(data.message, 'error');
            }
        }
    });
  }

  function startQueueFromCurrent() {
    closeQueueStartModal();

    fetch('/start-queue', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ switch_to_first: false })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Queue started from current user', 'success');
            loadInitialQueueData();
        } else {
            if (data.invalid_users && Array.isArray(data.invalid_users) && data.invalid_users.length > 0) {
                showInvalidUsersPrompt(data.invalid_users);
            } else {
                showStatus(data.message, 'error');
            }
        }
    });
  }

  function showInvalidUsersPrompt(invalidUsers) {
    let modal = document.getElementById('queue-invalid-hints-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'queue-invalid-hints-modal';
        modal.className = 'queue-modal hidden';
        document.body.appendChild(modal);
    }

    const items = invalidUsers.map(u => `
      <div class="invalid-user-item">
        <div class="invalid-user-text">User ${u.user_number} (${u.nickname || 'Unknown'})</div>
        <div class="invalid-user-actions">
          <button class="queue-modal-btn queue-modal-btn-secondary" onclick="switchToUser(${u.index}); closeInvalidUsersPrompt()">Switch</button>
          <button class="queue-modal-btn queue-modal-btn-danger" onclick="removeQueueUser(${u.index}); closeInvalidUsersPrompt()">Remove</button>
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="queue-modal-content">
        <div class="queue-modal-header">
          <h3>Invalid Active Hints</h3>
        </div>
        <div class="queue-modal-body">
          <p>These users have no required posts count in their active hint:</p>
          <div class="invalid-users-list">${items}</div>
        </div>
        <div class="queue-modal-buttons">
          <button class="queue-modal-btn queue-modal-btn-secondary" onclick="closeInvalidUsersPrompt()">Close</button>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeInvalidUsersPrompt();
      }
    });
  }

  function closeInvalidUsersPrompt() {
    const modal = document.getElementById('queue-invalid-hints-modal');
    if (modal) modal.classList.add('hidden');
  }

  function stopQueue() {
    fetch('/stop-queue', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
        showStatus(data.message, 'success');

        loadInitialQueueData();
    });
  }

  async function switchToUser(userIndex) {
    const button = document.querySelector(`button[onclick="switchToUser(${userIndex})"]`);
    if (button && button.disabled) {
        console.log('Switch already in progress, ignoring click');
        return;
    }

    try { 
      const currentUserIndex = currentQueueData?.current_user;
      if (currentUserIndex !== null && currentUserIndex !== undefined) {
        saveQueueDropdownScroll(currentUserIndex); 
      }
    } catch (_) {}

    const allUserButtons = document.querySelectorAll('.user-btn');
    allUserButtons.forEach(btn => btn.disabled = true);

    try {

        let saveAttempts = 0;
        const maxSaveAttempts = 3;

        while (saveAttempts < maxSaveAttempts) {
            try {
                await saveBetweenQueueUsers();
                console.log('State saved successfully');
                break;
            } catch (error) {
                saveAttempts++;
                console.warn(`Save attempt ${saveAttempts} failed:`, error);
                if (saveAttempts >= maxSaveAttempts) {
                    throw new Error('Failed to save current state after multiple attempts');
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        showStatus('Switching user...', 'info');

        let switchAttempts = 0;
        const maxSwitchAttempts = 3;
        let switchSuccess = false;

        while (switchAttempts < maxSwitchAttempts && !switchSuccess) {
            try {
                const response = await fetch(`/switch-to-user/${userIndex}`, { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();

                if (data.success) {
                    showStatus(data.message, 'success');
                    switchSuccess = true;

                    if (currentQueueData && currentQueueData.queue_mode_enabled) {
                        clearAllHintCheckboxes();
                    }

                    try {
                        setTimeout(() => {
                            restoreQueueDropdownScroll(userIndex);
                        }, 100);
                    } catch (_) {}

                    try {
                        const chatIdFromResponse = data?.user_data?.chat_id;
                        if (chatIdFromResponse) {
                            refreshHintsByChatId(String(chatIdFromResponse), userIndex);
                        } else {

                            const qres = await fetch('/get-queue-data', { method: 'GET' });
                            if (qres.ok) {
                                const qdata = await qres.json();
                                const target = qdata?.queue_data?.users?.[userIndex];
                                if (target && target.chat_id) {
                                    refreshHintsByChatId(String(target.chat_id), userIndex);
                                }
                            }
                        }
                    } catch (_) {}

                } else {
                    throw new Error(data.error || 'Switch failed without specific error');
                }
            } catch (error) {
                switchAttempts++;
                console.warn(`Switch attempt ${switchAttempts} failed:`, error);

                if (switchAttempts >= maxSwitchAttempts) {
                    showStatus(`Failed to switch after ${maxSwitchAttempts} attempts: ${error.message}`, 'error');
                } else {
                    showStatus(`Switch attempt ${switchAttempts} failed, retrying...`, 'info');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
    } catch (error) {
        console.error('Error in switchToUser:', error);
        showStatus('Error switching user: ' + error.message, 'error');
    } finally {
        setTimeout(() => {
            allUserButtons.forEach(btn => btn.disabled = false);
        }, 2000);
    }
  }

  function removeQueueUser(userIndex) {
    if (confirm('Are you sure you want to remove this user from queue?')) {
        fetch(`/remove-queue-user/${userIndex}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus(data.message, 'success');
                loadInitialQueueData();
            } else {
                showStatus(data.message, 'error');
            }
        })
        .catch(error => {
            console.error('Error removing user:', error);
            showStatus('Error removing user', 'error');
        });
    }
  }

  function updateQueueSettings() {
    const tabThreshold = document.getElementById('tab-threshold-input').value;
    const minOverrideEnabledEl = document.getElementById('min-override-enabled');
    const minOverrideTabsEl = document.getElementById('min-override-tabs');
    const switchTabsEnabledEl = document.getElementById('switch-tabs-enabled');
    const persistQueueEnabledEl = document.getElementById('persist-queue-enabled');
    const minOverrideEnabled = !!(minOverrideEnabledEl && minOverrideEnabledEl.checked);
    if (minOverrideTabsEl) {
      minOverrideTabsEl.disabled = !minOverrideEnabled;
    }
    let minOverrideTabs = minOverrideTabsEl ? parseInt(minOverrideTabsEl.value || '1', 10) : 1;
    if (minOverrideTabs < 1) minOverrideTabs = 1;

    fetch('/update-queue-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tab_threshold: parseInt(tabThreshold),
            min_override_enabled: minOverrideEnabled,
            min_override_tabs: minOverrideTabs,
            switch_tabs_enabled: !!(switchTabsEnabledEl && switchTabsEnabledEl.checked),
            persist_queue_enabled: !!(persistQueueEnabledEl && persistQueueEnabledEl.checked)
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('Queue settings updated', 'success');

            loadInitialQueueData();
        }
    })
    .catch(error => {
        console.error('Error updating settings:', error);
        showStatus('Error updating settings', 'error');
    });
  }

  function clearAllBrowsers() {
    if (confirm('Are you sure you want to clear all browsers from tracking?')) {
        fetch('/clear-all-browsers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus(data.message, 'success');

                loadInitialQueueData();
            } else {
                showStatus(data.message || 'Error clearing browsers', 'error');
            }
        })
        .catch(error => {
            console.error('Error clearing browsers:', error);
            showStatus('Error clearing browsers', 'error');
        });
    }
  }

  window.skipSwitchTabsPhase = function() {
    fetch('/switch-tabs-skip', { method: 'POST' })
      .then(()=>{
        showStatus('Switch check skipped', 'warning');
      })
      .catch(()=>{});
  }

  function showQueueCompletionModal() {

    let modal = document.getElementById('queue-completion-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'queue-completion-modal';
        modal.className = 'queue-modal hidden';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="queue-modal-content">
            <div class="queue-modal-header">
                <h3>Queue Processing Completed</h3>
            </div>
            <div class="queue-modal-body">
                <p>All users in the queue have been processed successfully!</p>
                <p>Would you like to clear the queue and keep only the current user?</p>
            </div>
            <div class="queue-modal-buttons">
                <button class="queue-modal-btn queue-modal-btn-primary" onclick="clearQueueExceptCurrent()">
                    Yes, Clear Queue
                </button>
                <button class="queue-modal-btn queue-modal-btn-secondary" onclick="closeQueueCompletionModal()">
                    No, Keep Queue
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    showStatus('Queue processing completed!', 'success');

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeQueueCompletionModal();
        }
    });
  }

  function closeQueueCompletionModal() {
    const modal = document.getElementById('queue-completion-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
  }

  function clearQueueExceptCurrent() {
    closeQueueCompletionModal();

    fetch('/clear-queue-except-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            loadInitialQueueData();
        } else {
            showStatus(data.message || 'Error clearing queue', 'error');
        }
    })
    .catch(error => {
        console.error('Error clearing queue:', error);
        showStatus('Error clearing queue', 'error');
    });
  }

  function disableBrowser(browserNumber) {
    if (confirm(`Are you sure you want to disable Browser ${browserNumber}?`)) {
        fetch('/disable-browser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                browser_number: browserNumber
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showStatus(`Browser ${browserNumber} disabled`, 'success');

                loadInitialQueueData();
            }
        })
        .catch(error => {
            console.error('Error disabling browser:', error);
            showStatus('Error disabling browser', 'error');
        });
    }
  }

  let currentQueueData = null;
  let currentBrowserData = null;

  let lastHintsChatIdRefreshed = null;

  function beginHintsLoading() {
    try {
      const container = document.getElementById('hints-container');
      if (!container) return;
      if (!container.hasAttribute('data-prev-display')) {
        container.setAttribute('data-prev-display', container.style.display || '');
      }
      container.style.display = 'none';
      container.innerHTML = '';
    } catch (_) {}
  }

  function endHintsLoading() {
    try {
      const container = document.getElementById('hints-container');
      if (!container) return;
      const prev = container.getAttribute('data-prev-display') || '';
      container.style.display = prev;
      container.removeAttribute('data-prev-display');
    } catch (_) {}
  }

  async function refreshHintsByChatId(chatId, userIndex = null) {
    try {
      beginHintsLoading();

      const res = await fetch('/get-hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: chatId,
          user_index: userIndex
        })
      });
      const payload = await res.json();
      if (!payload || !payload.success) return;
      lastHintsChatIdRefreshed = String(chatId);
      const personal = payload.personal || {};
      const general = payload.general || { hints: [], checkbox: '' };

      const personalKeys = Object.keys(personal).filter(k => k !== 'now' && k !== 'checkbox');
      const activePersonal = personal.checkbox && personalKeys.includes(personal.checkbox) ? personal.checkbox : '';
      const activeGeneral = general.checkbox || '';
      let currentMode = localStorage.getItem('sortMode') || 'usage';

      const totalHintsCount = (activePersonal ? 1 : 0) + personalKeys.length + (Array.isArray(general.hints) ? general.hints.length : 0);
      if (totalHintsCount === 0) {
        try {

          if (userIndex !== null) {
            const userContainers = document.querySelectorAll('.user-container');
            userContainers.forEach(userContainer => {
              const userBtn = userContainer.querySelector('.user-btn');
              if (userBtn) {

                let currentUserIndex;
                if (userBtn.hasAttribute('data-user-index')) {
                  currentUserIndex = parseInt(userBtn.getAttribute('data-user-index'));
                } else {

                  currentUserIndex = parseInt(userBtn.textContent.trim());
                }

                if (currentUserIndex === userIndex) {
                  const activeHintDisplay = userContainer.querySelector('.active-hint-display');
                  if (activeHintDisplay) {
                    activeHintDisplay.remove();
                  }
                }
              }
            });
          }
        } catch (_) {}

        const container = document.getElementById('hints-container');
        if (container) {
          container.remove();
        }
        endHintsLoading();
        return;
      }

      let container = document.getElementById('hints-container');
      if (!container) {

        let chatSection = document.querySelector('.chat-section');
        if (!chatSection) {
          chatSection = document.createElement('div');
          chatSection.className = 'chat-section';
          document.body.appendChild(chatSection);
        }
        container = document.createElement('div');
        container.id = 'hints-container';
        container.className = 'hints-container';
        chatSection.appendChild(container);
      }

      container.innerHTML = '';

      let html = '';
      if (totalHintsCount >= 2) {
        html += `
            <div class="sort-buttons">
                <button onclick="switchSortMode('usage')" class="sort-btn ${currentMode === 'usage' ? 'active' : ''}">
                    <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000" class="bi bi-sort-numeric-down-alt">
                        <g id="SVGRepo_iconCarrier">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M11.36 7.098c-1.137 0-1.708-.657-1.762-1.278h1.004c.058.223.343.45.773.45.824 0 1.164-.829 1.133-1.856h-.059c-.148.39-.57.742-1.261.742-.91 0-1.72-.613-1.72-1.758 0-1.148.848-1.836 1.973-1.836 1.09 0 2.063.637 2.063 2.688 0 1.867-.723 2.848-2.145 2.848zm.062-2.735c.504 0 .933-.336.933-.972 0-.633-.398-1.008-.94-1.008-.52 0-.927.375-.927 1 0 .64.418.98.934.98z"/>
                            <path d="M12.438 8.668V14H11.39V9.684h-.051l-1.211.859v-.969l1.262-.906h1.046zM4.5 2.5a.5.5 0 0 0-1 0v9.793l-1.146-1.147a.5.5 0 0 0-.708.708l2 1.999.007.007a.497.497 0 0 0 .7-.006l2-2a.5.5 0 0 0-.707-.708L4.5 12.293V2.5z"/>
                        </g>
                    </svg>
                </button>
                <button onclick="switchSortMode('time')" class="sort-btn ${currentMode === 'time' ? 'active' : ''}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000" stroke-width="0.00024">
                        <g id="SVGRepo_iconCarrier">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 7C1.25 6.58579 1.58579 6.25 2 6.25H10C10.4142 6.25 10.75 6.58579 10.75 7C10.75 7.41421 10.4142 7.75 10 7.75H2C1.58579 7.75 1.25 7.41421 1.25 7ZM17 7.75C14.6528 7.75 12.75 9.65279 12.75 12C12.75 14.3472 14.6528 16.25 17 16.25C19.3472 16.25 21.25 14.3472 21.25 12C21.25 9.65279 19.3472 7.75 17 7.75ZM11.25 12C11.25 8.82436 13.8244 6.25 17 6.25C20.1756 6.25 22.75 8.82436 22.75 12C22.75 15.1756 20.1756 17.75 17 17.75C13.8244 17.75 11.25 15.1756 11.25 12ZM17 9.25C17.4142 9.25 17.75 9.58579 17.75 10V11.5664L18.5668 12.5088C18.838 12.8218 18.8042 13.2955 18.4912 13.5668C18.1782 13.838 17.7045 13.8042 17.4332 13.4912L16.4332 12.3374C16.3151 12.201 16.25 12.0266 16.25 11.8462V10C16.25 9.58579 16.5858 9.25 17 9.25ZM1.25 12C1.25 11.5858 1.58579 11.25 2 11.25H8C8.41421 11.25 8.75 11.5858 8.75 12C8.75 12.4142 8.41421 12.75 8 12.75H2C1.58579 12.75 1.25 12.4142 1.25 12ZM1.25 17C1.25 16.5858 1.58579 16.25 2 16.25H10C10.4142 16.25 10.75 16.5858 10.75 17C10.75 17.4142 10.4142 17.75 10 17.75H2C1.58579 17.75 1.25 17.4142 1.25 17Z" fill="#000000"/>
                        </g>
                    </svg>
                </button>
            </div>`;
      }
      html += `
            <div class="hints-wrapper">`;
      if (activePersonal) {
        html += `
            <div class="hint-item active">
                <div class="hint-wrapper">
                    <input type="checkbox" id="checkbox-personal-${activePersonal}" checked class="hint-checkbox" onchange="updateHintCheckbox('${payload.chat_id}', '${activePersonal}', 'update', 'personal', ${userIndex !== null ? userIndex : 'null'})">
                    <label for="checkbox-personal-${activePersonal}" class="hint-label">${activePersonal}</label>
                    <button class="hint-delete-btn" onclick="deleteHint('${payload.chat_id}', '${activePersonal}', 'personal', ${userIndex !== null ? userIndex : 'null'})" aria-label="Delete personal hint"></button>
                </div>
            </div>`;
      }
      personalKeys.filter(k => k !== activePersonal).forEach(h => {
        html += `
            <div class="hint-item">
                <div class="hint-wrapper">
                    <input type="checkbox" id="checkbox-personal-${h}" class="hint-checkbox" onchange="updateHintCheckbox('${payload.chat_id}', '${h}', 'update', 'personal', ${userIndex !== null ? userIndex : 'null'})">
                    <label for="checkbox-personal-${h}" class="hint-label">${h}</label>
                    <button class="hint-delete-btn" onclick="deleteHint('${payload.chat_id}', '${h}', 'personal', ${userIndex !== null ? userIndex : 'null'})" aria-label="Delete personal hint"></button>
                </div>
            </div>`;
      });
      const generalHints = Array.isArray(general.hints) ? general.hints : [];
      generalHints.forEach(h => {
        const isChecked = activeGeneral && h === activeGeneral;
        html += `
            <div class="hint-item general-hint ${isChecked ? 'active' : ''}">
                <div class="hint-wrapper">
                    <input type="checkbox" id="checkbox-general-${h}" ${isChecked ? 'checked' : ''} class="hint-checkbox" onchange="updateHintCheckbox('${payload.chat_id}', '${h}', 'update', 'general', ${userIndex !== null ? userIndex : 'null'})">
                    <label for="checkbox-general-${h}" class="hint-label general">${h}"></label>
                    <button class="hint-delete-btn" onclick="deleteHint('${payload.chat_id}', '${h}', 'general', ${userIndex !== null ? userIndex : 'null'})" aria-label="Delete general hint"></button>
                </div>
            </div>`;
      });
      html += '</div>';
      container.innerHTML = html;

      const deleteBtnSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
          <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
          <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
          <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
          <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
          <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
          <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
          <path fill="#8d6c9f" d="M53,6H9A3,3 0,0,0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0,0,0 15,60H47a3,3 0,0,0 1.11 -5.78l2.28 -17.3a1 1 0,0,0 .06 -.47L52.92 18H53a3,3 0,0,0 3 -3V9A3,3 0,0,0 53,6ZM24.59 18l5 5 -4.78 4.78a1 1 0,1,0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0,0,0-1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0,0,0 1.41-1.41L43.41 18h7.17L39 29.59 32.41 23l5-5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0,0,0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8-8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0,0,0 1.41-1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0,0,0 1.41-1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7-43a1,1 0,0,1-1 1H9a1,1 0,0,1-1-1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
        </svg>`;
      container.querySelectorAll('.hint-delete-btn').forEach(btn => {
        if (!btn.innerHTML || btn.innerHTML.trim() === '') {
          btn.innerHTML = deleteBtnSvg;
        }
      });
      try { switchSortMode(currentMode); } catch (_) {}
      endHintsLoading();
    } catch (_) {}
  }

  function getHintAdjustmentFromText(activeHint) {
    if (!activeHint || typeof activeHint !== 'string') return 0;
    const trimmed = activeHint.trim();
    if (trimmed.length === 0) return 0;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return 0;
    const secondToken = parts[1] || '';
    const match = secondToken.match(/\d+/);
    if (!match) return 0;
    const value = parseInt(match[0], 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function getActiveHintAdjustmentFromDOM() {
    try {
      const hintsContainer = document.getElementById('hints-container');
      if (!hintsContainer) return 0;
      let labelEl = hintsContainer.querySelector('.hint-item.active .hint-label');
      if (!labelEl) {
        const checked = hintsContainer.querySelector('.hint-checkbox:checked');
        if (checked) {
          labelEl = checked.nextElementSibling;
        }
      }
      if (!labelEl) return 0;
      const text = labelEl.textContent || '';
      return getHintAdjustmentFromText(text);
    } catch (_) {
      return 0;
    }
  }

  function updateQueueStatus(queueData = null, browserData = null) {

    const data = queueData || currentQueueData;
    const browserInfo = browserData || currentBrowserData;

    if (!data) return;

    checkQueueCompletion(data);

    if (browserInfo) {
      data.browser_tab_counts = browserInfo.browser_tab_counts;
      data.queue_settings = browserInfo.queue_settings;
    }

    if (queueData) {
      currentQueueData = JSON.parse(JSON.stringify(queueData));
    }
    if (browserData) {
      currentBrowserData = JSON.parse(JSON.stringify(browserData)); 
    }

        const statusDiv = document.getElementById('queue-status');
        const userButtonsDiv = document.getElementById('user-buttons');
        const browserStatusDiv = document.getElementById('browser-status');
        const browserSettingsDiv = document.getElementById('browser-settings');

        const startBtn = document.querySelector('.queue-start-btn');
        const stopBtn = document.querySelector('.queue-stop-btn');

        if (browserSettingsDiv) {
            const currentInput = browserSettingsDiv.querySelector('#tab-threshold-input');
            const currentThreshold = data.queue_settings?.tab_threshold || 25;

            if (!currentInput || parseInt(currentInput.value) !== currentThreshold) {

                const activeElement = document.activeElement;
                const isInputFocused = activeElement && activeElement.id === 'tab-threshold-input';

                if (!isInputFocused) {
                    const minEnabled = !!data.queue_settings?.min_override_enabled;
                    const minTabs = parseInt(data.queue_settings?.min_override_tabs || 5);
                    const switchTabsEnabled = !!data.queue_settings?.switch_tabs_enabled;
                    let settingsHtml = `
                        <div class="browser-settings-header">Browser Settings</div>
                        <div class="setting-row">
                            <span class="setting-label upper-limit-label">Upper tabs limit:</span>
                            <input type="number" id="tab-threshold-input" class="setting-input" 
                                   value="${currentThreshold}" 
                                   onchange="updateQueueSettings()" min="1" max="100">
                        </div>
                        <div class="setting-row setting-row-inline">
                            <input type="checkbox" id="min-override-enabled" class="hint-checkbox" ${minEnabled ? 'checked' : ''} onchange="updateQueueSettings()">
                            <label for="min-override-enabled" class="setting-label">Lower tabs limit:</label>
                            <input type="number" id="min-override-tabs" class="setting-input" value="${minTabs}" min="1" max="100" ${minEnabled ? '' : 'disabled'} onchange="updateQueueSettings()">
                        </div>
                        <div class="setting-row switch-tabs-row setting-row-inline">
                            <input type="checkbox" id="switch-tabs-enabled" class="hint-checkbox" ${switchTabsEnabled ? 'checked' : ''} onchange="updateQueueSettings()">
                            <label for="switch-tabs-enabled" class="setting-label">Switch tabs</label>
                        </div>

                        <div id="switch-tabs-status-inline" class="switch-tabs-inline"></div>
                        <div class="setting-row">
                            <button class="clear-browsers-btn" onclick="clearAllBrowsers()">Clear all browsers</button>
                        </div>
                    `;
                    browserSettingsDiv.innerHTML = settingsHtml;
                }
            }

            browserSettingsDiv.style.display = data.queue_mode_enabled ? 'block' : 'none';

            try {
              const switchRow = browserSettingsDiv.querySelector('.switch-tabs-row');
              let inlineContainer = browserSettingsDiv.querySelector('#switch-tabs-status-inline');
              if (!inlineContainer) {
                inlineContainer = document.createElement('div');
                inlineContainer.id = 'switch-tabs-status-inline';
                inlineContainer.className = 'switch-tabs-inline';
              }
              if (switchRow && inlineContainer.previousElementSibling !== switchRow) {
                switchRow.insertAdjacentElement('afterend', inlineContainer);
              }
            } catch (_) {}
        }
        if (browserStatusDiv) {
            browserStatusDiv.style.display = data.queue_mode_enabled ? 'block' : 'none';
        }

        let browserListDiv = document.getElementById('browser-list');
        if (!browserListDiv && browserStatusDiv) {
            browserListDiv = document.createElement('div');
            browserListDiv.id = 'browser-list';
            browserStatusDiv.appendChild(browserListDiv);
        }
        if (browserListDiv) {
            const threshold = data.queue_settings?.tab_threshold || 25;
            const browsers = data.browser_tab_counts || {};

            let hintAdjustment = 0;
            const domAdjPrimary = getActiveHintAdjustmentFromDOM();
            if (Number.isFinite(domAdjPrimary) && domAdjPrimary > 0) {
                hintAdjustment = domAdjPrimary;
            } else {

                if (data.queue_mode_enabled && data.users && data.users.length > 0) {
                    const currentUser = data.users[data.current_user];
                    if (currentUser && currentUser.active_hint) {
                        const fromHint = getHintAdjustmentFromText(currentUser.active_hint);
                        if (Number.isFinite(fromHint) && fromHint > 0) {
                            hintAdjustment = fromHint;
                        }
                    }
                }

                if (!(Number.isFinite(hintAdjustment) && hintAdjustment > 0)) {
                    if (browserInfo && typeof browserInfo.hint_adjustment === 'number') {
                        hintAdjustment = browserInfo.hint_adjustment;
                    } else if (data.browser_data && typeof data.browser_data.hint_adjustment === 'number') {
                        hintAdjustment = data.browser_data.hint_adjustment;
                    } else if (data.hint_adjustment && typeof data.hint_adjustment === 'number') {
                        hintAdjustment = data.hint_adjustment;
                    } else if (data.queue_data && typeof data.queue_data.hint_adjustment === 'number') {
                        hintAdjustment = data.queue_data.hint_adjustment;
                    } else if (currentBrowserData && typeof currentBrowserData.hint_adjustment === 'number') {
                        hintAdjustment = currentBrowserData.hint_adjustment;
                    }
                }
            }

            if (Object.keys(browsers).length === 0) {
                const noBrowsersContent = '<div class="no-browsers">No browser data received yet<br><small>Please wait or reload your browser tabs...</small></div>';
                if (browserListDiv.innerHTML !== noBrowsersContent) {
                    browserListDiv.innerHTML = noBrowsersContent;
                }
            } else {
                let browserHtml = '';

                Object.keys(browsers)
                    .map(num => parseInt(num))
                    .sort((a, b) => a - b)
                    .forEach(browserNum => {
                        const currentTabCount = browsers[browserNum];

                        let effectiveAdjustment = hintAdjustment;
                        if (!Number.isFinite(effectiveAdjustment) || effectiveAdjustment === 0) {
                            const domAdj = getActiveHintAdjustmentFromDOM();
                            if (Number.isFinite(domAdj) && domAdj > 0) {
                                effectiveAdjustment = domAdj;
                            }
                        }
                        const adjustedTabCount = currentTabCount + (Number.isFinite(effectiveAdjustment) ? effectiveAdjustment : 0);

                        let tabClass = '';
                        if (adjustedTabCount > threshold) tabClass = 'danger';
                        else if (adjustedTabCount === threshold || adjustedTabCount >= threshold * 0.8) tabClass = 'warning';

                        let currentTabClass = '';
                        if (currentTabCount > threshold) currentTabClass = 'danger';
                        else if (currentTabCount === threshold || currentTabCount >= threshold * 0.8) currentTabClass = 'warning';

                        const minEnabled = !!data.queue_settings?.min_override_enabled;
                        const minTabs = parseInt(data.queue_settings?.min_override_tabs || 5);
                        if (minEnabled && currentTabCount <= minTabs) {
                            currentTabClass = 'lowlimit';
                        }

                        let displayContent;
                        if ((Number.isFinite(effectiveAdjustment) ? effectiveAdjustment : 0) > 0) {
                            displayContent = `
                                <span class="tab-count ${currentTabClass}">${currentTabCount}</span>
                                <span class="arrow">→</span>
                                <span class="tab-count ${tabClass}">${adjustedTabCount}</span>
                            `;
                        } else {
                            displayContent = `<span class=\"tab-count ${currentTabClass}\">${currentTabCount}</span>`;
                        }

                        browserHtml += `
                            <div class="browser-item">
                                <span class="browser-name">Browser ${browserNum}:</span>
                                <div class="browser-tabs-container">${displayContent}</div>
                                <button class="browser-close-btn" onclick="disableBrowser(${browserNum})" title="Off browser">✕</button>
                            </div>
                        `;
                    });

                if (browserListDiv.innerHTML !== browserHtml) {
                    browserListDiv.innerHTML = browserHtml;
                }

                try {
                  const status = (data.status && data.status.switch_tabs) ? data.status.switch_tabs : {};

                  let statusContainer = document.getElementById('switch-tabs-status-inline');
                  if (!statusContainer) {
                    statusContainer = document.getElementById('switch-tabs-status');
                    if (!statusContainer) {
                      statusContainer = document.createElement('div');
                      statusContainer.id = 'switch-tabs-status';
                      browserStatusDiv.appendChild(statusContainer);
                    }
                  }
                  const enabled = !!data.queue_settings?.switch_tabs_enabled;
                  statusContainer.style.display = enabled ? 'block' : 'none';
                  if (enabled) {
                    function buildPhaseBlock(phaseKey, title, isActive) {
                      const browsersKeys = Object.keys(browsers).map(n=>String(n));
                      const phase = status && status[phaseKey] ? status[phaseKey] : null;
                      const expected = (phase && Array.isArray(phase.expected)) ? phase.expected.slice().sort((a,b)=>parseInt(a)-parseInt(b)) : browsersKeys.slice().sort((a,b)=>parseInt(a)-parseInt(b));
                      const results = (phase && phase.results) ? phase.results : {};
                      const items = expected.map(k => {
                        let cls = 'none';
                        if (isActive) {
                          cls = (results[k] === true) ? 'success' : (results[k] === false ? 'error' : 'pending');
                        } else {
                          if (results[k] === true) cls = 'success';
                          else if (results[k] === false) cls = 'error';
                          else cls = 'none';
                        }
                        return `<div class="user-screenshot-status ${cls}"><span class="user-number">B${k}</span></div>`;
                      }).join('');
                      return `
                        <div class="queue-status-item full-width">
                          <span class="queue-status-label">${title}:</span>
                          <div class="screenshots-status-grid">${items}</div>
                        </div>`;
                    }
                    const activePhase = (status && status.active) ? String(status.active) : null;

                    const stateSignature = JSON.stringify({
                      enabled,
                      active: activePhase,
                      first: {
                        exp: (status && status.first && Array.isArray(status.first.expected)) ? status.first.expected.slice().sort((a,b)=>parseInt(a)-parseInt(b)) : Object.keys(browsers).map(String).sort((a,b)=>parseInt(a)-parseInt(b)),
                        res: (status && status.first && status.first.results) ? status.first.results : {}
                      },
                      last: {
                        exp: (status && status.last && Array.isArray(status.last.expected)) ? status.last.expected.slice().sort((a,b)=>parseInt(a)-parseInt(b)) : Object.keys(browsers).map(String).sort((a,b)=>parseInt(a)-parseInt(b)),
                        res: (status && status.last && status.last.results) ? status.last.results : {}
                      }
                    });

                    if (statusContainer.getAttribute('data-state') !== stateSignature) {
                      const html = `
                        ${buildPhaseBlock('last','Switch to last tab', activePhase === 'last')}
                        <div style="display:flex; justify-content:center; margin: 6px 0;">
                          <button class="skip-switch-btn-neutral" onclick="skipSwitchTabsPhase()">Skip</button>
                        </div>
                        ${buildPhaseBlock('first','Switch to first tab', activePhase === 'first')}
                      `;
                      statusContainer.innerHTML = html;
                      statusContainer.setAttribute('data-state', stateSignature);
                    }
                  } else {
                    if (statusContainer.innerHTML !== '') {
                      statusContainer.innerHTML = '';
                      statusContainer.removeAttribute('data-state');
                    }
                  }
                } catch (e) {}
            }
        }

        if (statusDiv && data.queue_mode_enabled) {
            let statusHTML = '';

            const generateScreenshotsHTML = (users, currentUserIndex) => {
                let screenshotsHTML = '';
                users.forEach((user, index) => {
                    const status = user.screenshot_status || 'none';
                    const isCurrent = index === currentUserIndex;
                    let className = '';

                    switch (status) {
                        case 'success':
                            className = 'success';
                            break;
                        case 'failed':
                            className = 'error';
                            break;
                        case 'pending':
                            className = 'pending';
                            break;
                        default:
                            className = 'none';
                    }

                    screenshotsHTML += `
                    <div class="user-screenshot-status ${isCurrent ? 'current' : ''} ${className}">
                        <span class="user-number">U${user.user_number}</span>
                    </div>
                `;
                });
                return screenshotsHTML;
            };

            if (data.queue_running) {
                const currentUser = data.users[data.current_user] || {};
                const threshold = data.queue_settings?.tab_threshold;
                const browsers = data.browser_tab_counts || {};

                let hintAdjustment = 0;
                const domAdj2 = getActiveHintAdjustmentFromDOM();
                if (Number.isFinite(domAdj2) && domAdj2 > 0) {
                    hintAdjustment = domAdj2;
                } else {

                    if (data.queue_mode_enabled && data.users && data.users.length > 0) {
                        const currentUserForHint = data.users[data.current_user];
                        if (currentUserForHint && currentUserForHint.active_hint) {
                            const fromHint = getHintAdjustmentFromText(currentUserForHint.active_hint);
                            if (Number.isFinite(fromHint) && fromHint > 0) {
                                hintAdjustment = fromHint;
                            }
                        }
                    }

                    if (!(Number.isFinite(hintAdjustment) && hintAdjustment > 0)) {
                        if (browserInfo && typeof browserInfo.hint_adjustment === 'number') {
                            hintAdjustment = browserInfo.hint_adjustment;
                        } else if (data.browser_data && typeof data.browser_data.hint_adjustment === 'number') {
                            hintAdjustment = data.browser_data.hint_adjustment;
                        } else if (data.hint_adjustment && typeof data.hint_adjustment === 'number') {
                            hintAdjustment = data.hint_adjustment;
                        } else if (data.queue_data && typeof data.queue_data.hint_adjustment === 'number') {
                            hintAdjustment = data.queue_data.hint_adjustment;
                        } else if (currentBrowserData && typeof currentBrowserData.hint_adjustment === 'number') {
                            hintAdjustment = currentBrowserData.hint_adjustment;
                        }
                    }
                }

                let browsersReady = true;
                if (Object.keys(browsers).length > 0) {
                    const minEnabled = !!data.queue_settings?.min_override_enabled;
                    const minTabs = parseInt(data.queue_settings?.min_override_tabs || 5);

                    let allUpperOk = true;
                    let allLowerOk = minEnabled;

                    for (const [, currentTabs] of Object.entries(browsers)) {
                        const adjustedTabs = currentTabs + hintAdjustment;
                        if (adjustedTabs > threshold) allUpperOk = false;
                        if (minEnabled && currentTabs > minTabs) allLowerOk = false;
                    }

                    browsersReady = allUpperOk || (minEnabled && allLowerOk);
                }

                const totalPosts = browserInfo?.total_queue_posts || 0;
                const screenshotsHTML = generateScreenshotsHTML(data.users, data.current_user);

                statusHTML = `
                <div class="queue-status-header">Queue Processing Status</div>
                <div class="queue-status-grid">
                    <div class="queue-status-item">
                        <span class="queue-status-label">Current User:</span>
                        <span class="queue-status-value">
                            <span class="queue-total-users">${data.current_user + 1}/${data.total_users}</span>
                        </span>
                    </div>
                    ${totalPosts > 0 ? `
                    <div class="queue-status-item">
                        <span class="queue-status-label">Total Posts:</span>
                        <span class="queue-status-value">
                            <span class="queue-total-posts">${totalPosts}</span>
                        </span>
                    </div>` : ''}
                    <div class="queue-status-item">
                        <span class="queue-status-label">Browsers Ready:</span>
                        <span class="queue-status-value">
                            <span class="queue-status-icon ${browsersReady ? 'success' : 'error'}">
                                ${browsersReady ? '✓' : '✗'}
                            </span>
                        </span>
                    </div>
                    ${screenshotsHTML ? `
                    <div class="queue-status-item full-width">
                        <span class="queue-status-label">Screenshots Status:</span>
                        <div class="screenshots-status-grid">
                            ${screenshotsHTML}
                        </div>
                    </div>` : ''}
                </div>
            `;

                if (startBtn && !startBtn.disabled) {
                    startBtn.disabled = true;
                    startBtn.style.opacity = '0.5';
                }
                if (stopBtn && stopBtn.disabled) {
                    stopBtn.disabled = false;
                    stopBtn.style.opacity = '1';
                }
            } else {
                const totalPosts = browserInfo?.total_queue_posts || 0;
                const screenshotsHTML = generateScreenshotsHTML(data.users, -1); 

                statusHTML = `
                    <div class="queue-status-header">Queue Status</div>
                    <div class="queue-status-grid">
                        <div class="queue-status-item">
                            <span class="queue-status-label">Status:</span>
                            <span class="queue-status-value">
                                <span style="color: #ccc;">${data.total_users} loaded</span>
                            </span>
                        </div>
                        ${totalPosts > 0 ? `
                        <div class="queue-status-item">
                            <span class="queue-status-label">Total Posts:</span>
                            <span class="queue-status-value">
                                <span class="queue-total-posts">${totalPosts}</span>
                            </span>
                        </div>` : ''}
                        ${screenshotsHTML ? `
                        <div class="queue-status-item full-width">
                            <span class="queue-status-label">Screenshots Status:</span>
                            <div class="screenshots-status-grid">
                                ${screenshotsHTML}
                            </div>
                        </div>` : ''}
                    </div>
                `;

                if (startBtn && (startBtn.disabled !== (data.total_users === 0))) {
                    startBtn.disabled = data.total_users === 0;
                    startBtn.style.opacity = data.total_users === 0 ? '0.5' : '1';
                }
                if (stopBtn && !stopBtn.disabled) {
                    stopBtn.disabled = true;
                    stopBtn.style.opacity = '0.5';
                }
            }

            if (statusDiv.innerHTML !== statusHTML) {
                statusDiv.innerHTML = statusHTML;
                try { 
                  if (document.getElementById('queue-dropdown')?.classList.contains('show')) {
                    const currentUserIndex = data?.current_user;
                    restoreQueueDropdownScroll(currentUserIndex); 
                  }
                } catch (_) {}
            }
        }

        if (userButtonsDiv && data.queue_mode_enabled && data.users && data.users.length > 0) {
            const currentActiveUser = data.current_user;
            const canDelete = data.users.length > 1; 

            const stateHash = JSON.stringify({
                users: data.users.map(u => ({
                    user_number: u.user_number,
                    nickname: u.nickname,
                    status: u.status,
                    active_hint: u.active_hint
                })),
                current_user: currentActiveUser,
                can_delete: canDelete
            });

            if (userButtonsDiv.getAttribute('data-state-hash') === stateHash) {

                if (userButtonsDiv.querySelectorAll('.queue-user-item').length > 0) {
                    updateDragAndDropListeners();
                }
                return;
            }

            let newUserButtonsHTML = '';
            data.users.forEach((user, index) => {
                const activeClass = index === currentActiveUser ? ' active' : '';
                const completedClass = user.status === 'completed' ? ' completed' : '';
                const processingClass = user.status === 'processing' ? ' processing' : '';
                const deleteButtonDisabled = !canDelete ? ' disabled' : '';
                const deleteButtonStyle = !canDelete ? ' style="opacity: 0.3; cursor: not-allowed;"' : '';
                const deleteOnClick = canDelete ? ` onclick="removeQueueUser(${index})"` : '';

                let activeHintDisplay = '';
                if (user.active_hint) {
                    activeHintDisplay = ` <span class="active-hint-display">[${user.active_hint}]</span>`;
                }

                newUserButtonsHTML += `
                    <div class="user-container queue-user-item" data-user-index="${index}">
                        <button class="user-btn${activeClass}${completedClass}${processingClass}" onclick="switchToUser(${index})" data-user-index="${index}">
                            ${user.user_number || (index + 1)}
                        </button>
                        <span class="user-nickname">${(user.nickname ? user.nickname.split(' ')[0] : 'Unknown')}${activeHintDisplay}</span>
                        <button class="user-delete-btn${deleteButtonDisabled}"${deleteOnClick} title="${canDelete ? 'Remove ' + (user.nickname || 'User ' + (index + 1)) : 'Cannot remove last user'}"${deleteButtonStyle}>×</button>
                    </div>
                `;
            });

            userButtonsDiv.innerHTML = newUserButtonsHTML;
            userButtonsDiv.setAttribute('data-state-hash', stateHash);
            try { updateDragAndDropListeners(); } catch (_) {}

            try { 
              if (document.getElementById('queue-dropdown')?.classList.contains('show')) {
                const currentUserIndex = data?.current_user;
                restoreQueueDropdownScroll(currentUserIndex); 
              }
            } catch (_) {}

            userButtonsDiv.querySelectorAll('.queue-user-item').forEach(el => {
                el.removeAttribute('data-drag-listeners-attached');
            });

            try {
                const activeUser = data.users && typeof currentActiveUser === 'number' ? data.users[currentActiveUser] : null;
                const activeChatId = activeUser ? activeUser.chat_id : null;
                if (activeChatId) {
                    const targetId = String(activeChatId);
                    if (targetId !== lastHintsChatIdRefreshed) {
                        refreshHintsByChatId(targetId, currentActiveUser);
                    }
                }
            } catch (_) {}
        } else if (userButtonsDiv && data.queue_mode_enabled && (!data.users || data.users.length === 0)) {
            const noUsersContent = '<div style="color: #ccc; text-align: center; padding: 10px; font-style: italic;">No users in queue</div>';
            if (userButtonsDiv.innerHTML !== noUsersContent) {
                userButtonsDiv.innerHTML = noUsersContent;
            }
        } else if (userButtonsDiv && !data.queue_mode_enabled) {
            userButtonsDiv.style.display = 'none';
            if (userButtonsDiv.innerHTML !== '') {
                userButtonsDiv.innerHTML = '';
            }
        }

        const queueToggleBtn = document.querySelector('.queue-toggle-btn');
        const queueModeToggle = document.querySelector('.queue-mode-toggle');
        const actionButtons = document.getElementById('queue-action-buttons');
        const queueStatus = document.getElementById('queue-status');
        const userButtons = document.getElementById('user-buttons');

        if (queueToggleBtn) {
            const newInnerHTML = `Q ${data.queue_mode_enabled ? 'ON' : 'OFF'} <span>▼</span>`;
            if (queueToggleBtn.innerHTML !== newInnerHTML) {
                queueToggleBtn.innerHTML = newInnerHTML;
            }
            if (data.queue_mode_enabled && !queueToggleBtn.classList.contains('active')) {
                queueToggleBtn.classList.add('active');
            } else if (!data.queue_mode_enabled && queueToggleBtn.classList.contains('active')) {
                queueToggleBtn.classList.remove('active');
            }
        }

        if (queueModeToggle) {
            if (data.queue_mode_enabled && !queueModeToggle.classList.contains('active')) {
                queueModeToggle.classList.add('active');
            } else if (!data.queue_mode_enabled && queueModeToggle.classList.contains('active')) {
                queueModeToggle.classList.remove('active');
            }
        }

        if (actionButtons) {
            const targetDisplay = data.queue_mode_enabled ? 'flex' : 'none';
            if (actionButtons.style.display !== targetDisplay) {
                actionButtons.style.display = targetDisplay;
            }
        }

        if (queueStatus) {
            const targetDisplay = data.queue_mode_enabled ? 'block' : 'none';
            if (queueStatus.style.display !== targetDisplay) {
                queueStatus.style.display = targetDisplay;
            }
        }

        if (userButtons) {
            const targetDisplay = data.queue_mode_enabled ? 'block' : 'none';
            if (userButtons.style.display !== targetDisplay) {
                userButtons.style.display = targetDisplay;
            }
        }

    }

  function switchAutoDelete(){
    var copyButton = document.getElementsByClassName('button3')[0];
    copyButton.classList.add('animate');
    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);
    fetch('/switch-auto-delete', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('delete-status');
        if (data.message) {
            element.textContent = data.message;
            element.classList.add('show');
            element.style.animation = 'slide-up 0.5s forwards';
            setTimeout(function() {
                element.classList.remove('show');
                element.style.animation = 'none';
            }, 5000);
        }

        const isEnabled = data.message.includes('on');
        copyButton.style.backgroundColor = isEnabled ? '#488b5b' : '#a42004';
    });
  }

  function switchAutoSend(){
    var sendButton = document.getElementsByClassName('button4')[0];
    sendButton.classList.add('animate');
    setTimeout(function() {
        sendButton.classList.remove('animate');
    }, 200);

    fetch('/switch-auto-send', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        var element = document.getElementById('send-status');
        if (data.message) {
            element.textContent = data.message;
            element.classList.add('show');
            element.style.animation = 'slide-up 0.5s forwards';
            setTimeout(function() {
                element.classList.remove('show');
                element.style.animation = 'none';
            }, 5000);
        }

        const isEnabled = data.message.includes('on');
        sendButton.style.backgroundColor = isEnabled ? '#488b5b' : '#a42004';
    });
  }

  function toggleAutoDelete() {
    fetch('/toggle_auto_delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        const toggleSwitch = document.querySelector('.toggle-switch');
        toggleSwitch.classList.toggle('active', data.enabled);
        var element = document.getElementById('delete-status');
        if (data.message) {
        element.textContent = data.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    }
    })
    .catch(error => console.error('Error:', error));
  }

function clearAllHintCheckboxes() {
    const hintsContainer = document.getElementById('hints-container');
    if (!hintsContainer) return;

    const allCheckboxes = hintsContainer.querySelectorAll('input[type="checkbox"]');
    const allHintItems = hintsContainer.querySelectorAll('.hint-item');

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    allHintItems.forEach(item => {
        item.classList.remove('active');
    });
}

function updateHintCheckbox(chatId, hintKey, action = 'update', hintType = 'personal', userIndex = null) {
    fetch('/update_hints', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            hint_key: hintKey,
            action: action,
            hint_type: hintType,
            user_index: userIndex
        })
    })
    .then(response => response.json())
    .then(data => {
        const hintsContainer = document.getElementById('hints-container');
        const allCheckboxes = Array.from(hintsContainer.querySelectorAll('input[type="checkbox"]'));
        const allHintItems = Array.from(hintsContainer.querySelectorAll('.hint-item'));
        const checkboxId = `checkbox-${hintType}-${hintKey}`;

        if (action === 'delete') {
            const indexToRemove = allHintItems.findIndex(item => item.querySelector('input').id === checkboxId);
            if (indexToRemove !== -1) {
                allHintItems[indexToRemove].remove();
            }

            const remainingItems = hintsContainer.querySelectorAll('.hint-item');
            if (remainingItems.length === 0) {
                try {

                    if (userIndex !== null) {
                        const userContainers = document.querySelectorAll('.user-container');
                        userContainers.forEach(userContainer => {
                            const userBtn = userContainer.querySelector('.user-btn');
                            if (userBtn) {

                                let currentUserIndex;
                                if (userBtn.hasAttribute('data-user-index')) {
                                    currentUserIndex = parseInt(userBtn.getAttribute('data-user-index'));
                                } else {

                                    currentUserIndex = parseInt(userBtn.textContent.trim());
                                }

                                if (currentUserIndex === userIndex) {
                                    const activeHintDisplay = userContainer.querySelector('.active-hint-display');
                                    if (activeHintDisplay) {
                                        activeHintDisplay.remove();
                                    }
                                }
                            }
                        });
                    }
                } catch (_) {}
                hintsContainer.remove();
                return;
            }

            const newActiveCheckbox = hintsContainer.querySelector('input[type="checkbox"]');
            if (newActiveCheckbox) {
                const newActiveItem = newActiveCheckbox.closest('.hint-item');

                clearAllHintCheckboxes();
                newActiveCheckbox.checked = true;
                newActiveItem.classList.add('active');

                const isGeneralHint = newActiveItem.classList.contains('general-hint');
                const newHintType = isGeneralHint ? 'general' : 'personal';

                const newHintKey = newActiveCheckbox.id.split('-').pop();
                fetch('/update_hints', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        chat_id: chatId,
                        hint_key: newHintKey,
                        action: 'update',
                        hint_type: newHintType,
                        user_index: userIndex
                    })
                });
            }

            const hintsWrapper = document.querySelector('.hints-wrapper');
            if (hintsWrapper) {
                const remainingItems = hintsWrapper.children.length;
                if (remainingItems === 0) {
                    try {

                        if (userIndex !== null) {
                            const userContainers = document.querySelectorAll('.user-container');
                            userContainers.forEach(userContainer => {
                                const userBtn = userContainer.querySelector('.user-btn');
                                if (userBtn) {

                                    let currentUserIndex;
                                    if (userBtn.hasAttribute('data-user-index')) {
                                        currentUserIndex = parseInt(userBtn.getAttribute('data-user-index'));
                                    } else {

                                        currentUserIndex = parseInt(userBtn.textContent.trim());
                                    }

                                    if (currentUserIndex === userIndex) {
                                        const activeHintDisplay = userContainer.querySelector('.active-hint-display');
                                        if (activeHintDisplay) {
                                            activeHintDisplay.remove();
                                        }
                                    }
                                }
                            });
                        }
                    } catch (_) {}
                    hintsContainer.remove();
                } else if (remainingItems < 2) {
                    const sortButtons = hintsContainer.querySelector('.sort-buttons');
                    if (sortButtons) {
                        sortButtons.remove();
                    }
                }
            }
        } else if (action === 'update') {

            clearAllHintCheckboxes();

            const targetCheckbox = allCheckboxes.find(cb => cb.id === checkboxId);
            if (targetCheckbox) {
                targetCheckbox.checked = true;
                targetCheckbox.closest('.hint-item').classList.add('active');
            }

            const currentMode = localStorage.getItem('sortMode') || 'usage';
            switchSortMode(currentMode);

            setTimeout(() => {
                fetch('/get-queue-data', {
                    method: 'GET'
                })
                .then(response => response.json())
                .then(data => {
                    if (data && data.success && data.queue_data && data.browser_data) {
                        console.log('Updating queue status after hint change');
                        updateQueueStatus(data.queue_data, data.browser_data);
                    }
                })
                .catch(error => console.log('Error refreshing queue data after hint change:', error));
            }, 200);
        }
    })
    .catch(error => console.error('Error:', error));
}

  function deleteHint(chatId, hintKey, hintType = 'personal', userIndex = null) {
            updateHintCheckbox(chatId, hintKey, 'delete', hintType, userIndex);
  }

  function saveHint(chatId, messageCount, hintType = 'personal', userIndex = null) {
    const newHintInput = document.getElementById(hintType === 'personal' ? 'hint-input' : 'general-hint-input');
    const newHintKey = newHintInput.value.trim();

    if (!newHintKey) {
        alert('Hint is not valid!');
        return;
    }

    fetch('/add-hint', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            hint_key: newHintKey,
            message_count: messageCount,
            hint_type: hintType,
            user_index: userIndex
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const fullHintKey = data.full_hint_key;
            let hintsContainer = document.getElementById('hints-container');

            if (!hintsContainer) {
                let chatSection = document.querySelector('.chat-section');
                if (!chatSection) {
                    chatSection = document.createElement('div');
                    chatSection.className = 'chat-section';
                    document.body.appendChild(chatSection);
                }
                hintsContainer = document.createElement('div');
                hintsContainer.id = 'hints-container';
                hintsContainer.className = 'hints-container';
                hintsContainer.innerHTML = `
                    <div class="sort-buttons">
                        <button onclick="switchSortMode('usage')" class="sort-btn active">
                            <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000" class="bi bi-sort-numeric-down-alt">
                                <g id="SVGRepo_iconCarrier">
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M11.36 7.098c-1.137 0-1.708-.657-1.762-1.278h1.004c.058.223.343.45.773.45.824 0 1.164-.829 1.133-1.856h-.059c-.148.39-.57.742-1.261.742-.91 0-1.72-.613-1.72-1.758 0-1.148.848-1.836 1.973-1.836 1.09 0 2.063.637 2.063 2.688 0 1.867-.723 2.848-2.145 2.848zm.062-2.735c.504 0 .933-.336.933-.972 0-.633-.398-1.008-.94-1.008-.52 0-.927.375-.927 1 0 .64.418.98.934.98z"/>
                                    <path d="M12.438 8.668V14H11.39V9.684h-.051l-1.211.859v-.969l1.262-.906h1.046zM4.5 2.5a.5.5 0 0 0-1 0v9.793l-1.146-1.147a.5.5 0 0 0-.708.708l2 1.999.007.007a.497.497 0 0 0 .7-.006l2-2a.5.5 0 0 0-.707-.708L4.5 12.293V2.5z"/>
                                </g>
                            </svg>
                        </button>
                        <button onclick="switchSortMode('time')" class="sort-btn">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000" stroke-width="0.00024">
                                <g id="SVGRepo_iconCarrier">
                                    <path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 7C1.25 6.58579 1.58579 6.25 2 6.25H10C10.4142 6.25 10.75 6.58579 10.75 7C10.75 7.41421 10.4142 7.75 10 7.75H2C1.58579 7.75 1.25 7.41421 1.25 7ZM17 7.75C14.6528 7.75 12.75 9.65279 12.75 12C12.75 14.3472 14.6528 16.25 17 16.25C19.3472 16.25 21.25 14.3472 21.25 12C21.25 9.65279 19.3472 7.75 17 7.75ZM11.25 12C11.25 8.82436 13.8244 6.25 17 6.25C20.1756 6.25 22.75 8.82436 22.75 12C22.75 15.1756 20.1756 17.75 17 17.75C13.8244 17.75 11.25 15.1756 11.25 12ZM17 9.25C17.4142 9.25 17.75 9.58579 17.75 10V11.5664L18.5668 12.5088C18.838 12.8218 18.8042 13.2955 18.4912 13.5668C18.1782 13.838 17.7045 13.8042 17.4332 13.4912L16.4332 12.3374C16.3151 12.201 16.25 12.0266 16.25 11.8462V10C16.25 9.58579 16.5858 9.25 17 9.25ZM1.25 12C1.25 11.5858 1.58579 11.25 2 11.25H8C8.41421 11.25 8.75 11.5858 8.75 12C8.75 12.4142 8.41421 12.75 8 12.75H2C1.58579 12.75 1.25 12.4142 1.25 12ZM1.25 17C1.25 16.5858 1.58579 16.25 2 16.25H10C10.4142 16.25 10.75 16.5858 10.75 17C10.75 17.4142 10.4142 17.75 10 17.75H2C1.58579 17.75 1.25 17.4142 1.25 17Z" fill="#000000"/>
                                </g>
                            </svg>
                        </button>
                    </div>
                    <div class="hints-wrapper"></div>
                `;
                chatSection.appendChild(hintsContainer);
            }

            const hintsWrapper = hintsContainer.querySelector('.hints-wrapper');
            if (!hintsWrapper) {
                console.error('Hints wrapper not found');
                return;
            }

            const checkboxId = `checkbox-${hintType}-${fullHintKey}`;
            const newHintItem = document.createElement('div');
            newHintItem.className = `hint-item ${hintType === 'general' ? 'general-hint' : ''} active`;
            newHintItem.innerHTML = `
                <div class="hint-wrapper">
                    <input type="checkbox" 
                        id="${checkboxId}" 
                        onchange="updateHintCheckbox('${chatId}', '${fullHintKey}', 'update', '${hintType}', ${userIndex !== null ? userIndex : 'null'})"
                        class="hint-checkbox"
                        checked>
                    <label for="${checkboxId}" 
                        class="hint-label ${hintType === 'general' ? 'general' : ''}">${fullHintKey}</label>
                    <button class="hint-delete-btn" 
                        onclick="deleteHint('${chatId}', '${fullHintKey}', '${hintType}', ${userIndex !== null ? userIndex : 'null'})"
                        aria-label="Delete ${hintType} hint">
                        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                            <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                            <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                            <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                            <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                            <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                            <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                    <path fill="#8d6c9f" d="M53,6H9A3,3 0,0,0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0,0,0 15,60H47a3,3 0,0,0 1.11 -5.78l2.28 -17.3a1 1 0,0,0 .06 -.47L52.92 18H53a3,3 0,0,0 3 -3V9A3,3 0,0,0 53,6ZM24.59 18l5 5 -4.78 4.78a1 1 0,1,0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0,0,0-1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0,0,0 1.41-1.41L43.41 18h7.17L39 29.59 32.41 23l5-5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0,0,0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8-8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0,0,0 1.41-1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0,0,0 1.41-1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7-43a1,1 0,0,1-1 1H9a1,1 0,0,1-1-1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
                </svg>
            </button>
        </div>
    `;

            if (hintsWrapper.children.length === 0) {
                hintsWrapper.appendChild(newHintItem);
            } else {

                clearAllHintCheckboxes();
                hintsWrapper.appendChild(newHintItem);
            }

            if (hintsWrapper.children.length >= 2) {
                const sortButtons = hintsContainer.querySelector('.sort-buttons');
                if (sortButtons) {
                    sortButtons.style.display = 'flex';
                }
            }

            fetch('/update_hints', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    hint_key: fullHintKey,
                    action: 'update',
                    hint_type: hintType
                })
            });

            const currentMode = localStorage.getItem('sortMode') || 'usage';
            switchSortMode(currentMode);

            setTimeout(() => {
                fetch('/get-queue-data', {
                    method: 'GET'
                })
                .then(response => response.json())
                .then(data => {
                    if (data && data.success && data.queue_data && data.browser_data) {
                        console.log('Updating queue status after hint change');
                        updateQueueStatus(data.queue_data, data.browser_data);
                    }
                })
                .catch(error => console.log('Error refreshing queue data after hint change:', error));
            }, 200);
        } else {
            alert(data.message || 'Ошибка при добавлении ключа');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при добавлении ключа.');
    });
  }

  function processContentLoader(button, messageData, client_id) {
    const currentReverseMode = localStorage.getItem('reverseMode') === 'true';
    const useReverseOrder = messageData.is_all_button ? currentReverseMode : messageData.reverse_order || false;

    const buttonNumber = button.dataset.number;
    updateActiveButton(buttonNumber);

    const data = {
        message_id: messageData.message_id,
        sender_id: messageData.sender_id,
        client_id: client_id,
        chat_id_to_use: messageData.chat_id_to_use,
        is_all_button: messageData.is_all_button || false,
        reverse_order: useReverseOrder
    };

    fetch('/process_content_loader', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {

            updateActiveButton(buttonNumber);
            localStorage.setItem('activeButtonNumber', buttonNumber);
            localStorage.setItem('reverseMode', data.reverse_order ? 'true' : 'false');
        } else {

            const previousActive = localStorage.getItem('activeButtonNumber') || '0';
            updateActiveButton(previousActive);
        }
    })
    .catch(error => {
        console.error('Error processing message:', error);

        const previousActive = localStorage.getItem('activeButtonNumber') || '0';
        updateActiveButton(previousActive);
    });
  }

  function updateActiveButton(activeNumber) {
    const buttons = document.querySelectorAll('.message-button');

    buttons.forEach(button => {
        button.classList.remove('active');
    });

    buttons.forEach(button => {
        if (button.dataset.number === String(activeNumber)) {
            button.classList.add('active');
        }
    });

    localStorage.setItem('activeButtonNumber', String(activeNumber));
  }

  function parse_time(time_str) {
    const match = time_str.match(/^(\d+)([as])$/);
    if (!match) return null;

    let [ _, digits, period] = match;
    const is_pm = period === 's';

    let hours, minutes;
    if (digits.length === 3) {
        hours = parseInt(digits[0]);
        minutes = parseInt(digits.slice(1, 3));
    } else if (digits.length === 4) {
        hours = parseInt(digits.slice(0, 2));
        minutes = parseInt(digits.slice(2, 4));
    } else {
        return null;
    }

    if (is_pm && hours !== 12) hours += 12;
    else if (!is_pm && hours === 12) hours = 0;

    return [hours, minutes];
  }

  function extract_leading_number(s) {
    const match = s.match(/^\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  function sort_hints_by_time(hints) {

    let checkedHint = Array.from(hints).find(hint => 
        hint.classList.contains('active') || 
        hint.querySelector('input[type="checkbox"]').checked
    );

    if (!checkedHint) {
        const hintsData = JSON.parse(document.getElementById('hints-data').textContent);
        const chatId = JSON.parse(document.getElementById('chat-id').textContent);
        const chatData = hintsData[chatId] || {};
        const checkedValue = chatData.checkbox || '';
        checkedHint = Array.from(hints).find(hint => 
            hint.querySelector('.hint-label').textContent === checkedValue
        );
    }

    const groups = {
        numeric: [],
        q: [],
        w: [],
        e: [],
        other: []
    };

    Array.from(hints).forEach(hint => {
        if (hint === checkedHint) return;

        const label = hint.querySelector('.hint-label').textContent;
        const parts = label.split(' ');
        const firstPart = parts[0] || '';

        if (!firstPart) {
            groups.other.push(hint);
            return;
        }

        const firstChar = firstPart[0].toLowerCase();
        if (/^\d/.test(firstChar)) {
            const num = parseInt(firstPart.match(/^\d+/)[0]);
            groups.numeric.push([num, hint]);
        } else if (['q', 'w', 'e'].includes(firstChar)) {
            const timeCode = firstPart.slice(1);
            const time = parse_time(timeCode);
            groups[firstChar].push([time, hint]);
        } else {
            groups.other.push(hint);
        }
    });

    ['numeric', 'q', 'w', 'e'].forEach(group => {
        groups[group].sort((a, b) => {
            if (!a[0]) return 1;
            if (!b[0]) return -1;
            if (Array.isArray(a[0])) {
                return a[0][0] === b[0][0] ? a[0][1] - b[0][1] : a[0][0] - b[0][0];
            }
            return a[0] - b[0];
        });
    });

    return [
        ...(checkedHint ? [checkedHint] : []),
        ...groups.numeric.map(x => x[1]),
        ...groups.q.map(x => x[1]),
        ...groups.w.map(x => x[1]),
        ...groups.e.map(x => x[1]),
        ...groups.other
    ];
  }

  function sort_hints_by_usage(hints) {

    const hintsData = JSON.parse(document.getElementById('hints-data').textContent);
    const chatId = JSON.parse(document.getElementById('chat-id').textContent);
    const chatData = hintsData[chatId] || {};

    let checkedHint = Array.from(hints).find(hint => 
        hint.querySelector('input[type="checkbox"]').checked
    );

    if (!checkedHint) {
        const hintsData = JSON.parse(document.getElementById('hints-data').textContent);
        const chatId = JSON.parse(document.getElementById('chat-id').textContent);
        const chatData = hintsData[chatId] || {};
        const checkedValue = chatData.checkbox || '';
        checkedHint = Array.from(hints).find(hint => 
            hint.querySelector('.hint-label').textContent === checkedValue
        );
    }

    const usageGroups = new Map(); 

    Array.from(hints)
        .filter(hint => hint !== checkedHint)
        .forEach(hint => {
            const label = hint.querySelector('.hint-label').textContent;
            const usage = chatData[label] || 0;

            if (!usageGroups.has(usage)) {
                usageGroups.set(usage, []);
            }
            usageGroups.get(usage).push(hint);
        });

    for (let [usage, hintGroup] of usageGroups) {
        hintGroup.sort((a, b) => {
            const labelA = a.querySelector('.hint-label').textContent;
            const labelB = b.querySelector('.hint-label').textContent;

            const timeStrA = labelA.split(' ')[0];
            const timeStrB = labelB.split(' ')[0];

            const typeA = timeStrA[0].toLowerCase();
            const typeB = timeStrB[0].toLowerCase();

            if (typeA !== typeB) {
                if (typeA === 'q') return -1;
                if (typeB === 'q') return 1;
                if (typeA === 'w') return -1;
                if (typeB === 'w') return 1;
                return 0;
            }

            const timeA = parse_time(timeStrA.slice(1));
            const timeB = parse_time(timeStrB.slice(1));

            if (!timeA) return 1;
            if (!timeB) return -1;

            if (timeA[0] !== timeB[0]) {
                return timeA[0] - timeB[0];
            }
            return timeA[1] - timeB[1];
        });
    }

    const sortedHints = [];

    if (checkedHint) {
        sortedHints.push(checkedHint);
    }

    Array.from(usageGroups.keys())
        .sort((a, b) => b - a) 
        .forEach(usage => {
            sortedHints.push(...usageGroups.get(usage));
        });

    return sortedHints;
  }

  function switchSortMode(newMode) {

    if (!localStorage.getItem('sortMode')) {
        localStorage.setItem('sortMode', 'usage');
    }

    const currentMode = localStorage.getItem('sortMode');
    if (currentMode === newMode) return;

    localStorage.setItem('sortMode', newMode);

    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`button[onclick*="switchSortMode('${newMode}')"]`).classList.add('active');

    const container = document.getElementById('hints-container');
    if (!container) return;

    const hints = Array.from(container.querySelectorAll('.hint-item'));

    const sortedHints = newMode === 'usage' 
        ? sort_hints_by_usage(hints)
        : sort_hints_by_time(hints);

    const hintsWrapper = container.querySelector('.hints-wrapper') || container;
    hintsWrapper.replaceChildren(...sortedHints);
  }

  function saveImageToServer(imageData, imagePath) {

    var statusElement = document.getElementById('delete-status');
    statusElement.textContent = 'Saving image...';
    statusElement.classList.add('show');
    statusElement.style.animation = 'slide-up 0.5s forwards';

    fetch('/save_cropped_image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_data: imageData,
            file_path: imagePath
        })
    })
    .then(response => response.json())
    .then(data => {

        var element = document.getElementById('delete-status');
        if (data.success) {
            element.textContent = 'Image successfully saved';
        } else {
            element.textContent = 'Error saving image: ' + (data.error || 'unknown error');
        }

        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);
    })
    .catch(error => {

        var element = document.getElementById('delete-status');
        element.textContent = 'Error saving image: ' + error.message;
        element.classList.add('show');
        element.style.animation = 'slide-up 0.5s forwards';
        setTimeout(function() {
            element.classList.remove('show');
            element.style.animation = 'none';
        }, 5000);

        console.error('Error saving image:', error);
    });
  }

  function recropImage(mediaId, imagePath) {
    const img = document.getElementById(mediaId);
    if (!img) return;

    const currentTransform = img.style.transform || '';
    const rotateMatch = currentTransform.match(/rotate\(([^)]+)\)/);
    const currentRotation = rotateMatch ? rotateMatch[1] : '0deg';
    const rotationDegrees = parseInt(currentRotation) || 0;

    const normalizedRotation = ((rotationDegrees % 360) + 360) % 360;
    const shouldSwapDimensions = (normalizedRotation > 45 && normalizedRotation < 135) || 
                                (normalizedRotation > 225 && normalizedRotation < 315);

    const cropContainer = document.createElement('div');
    cropContainer.className = 'crop-container';

    const imgContainer = document.createElement('div');
    imgContainer.className = 'img-container';

    const imgClone = new Image();
    imgClone.src = img.src;
    imgClone.className = 'img-clone';
    imgClone.style.transform = `rotate(${currentRotation})`;
    imgContainer.appendChild(imgClone);

    const cropRect = document.createElement('div');
    cropRect.className = 'crop-rect';
    cropRect.style.boxSizing = 'border-box';

    const markers = ['nw', 'ne', 'sw', 'se'];
    markers.forEach(pos => {
        const marker = document.createElement('div');
        marker.dataset.position = pos;
        marker.className = `marker marker-${pos}`;
        cropRect.appendChild(marker);
    });

    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';

    const infoContainer = document.createElement('div');
    infoContainer.className = 'info-container';

    const dimensionsInfo = document.createElement('div');
    dimensionsInfo.className = 'info-text dimensions-info';

    const rotationInfo = document.createElement('div');
    rotationInfo.textContent = `Current rotation: ${rotationDegrees}°`;
    rotationInfo.className = 'info-text';

    const instructions = document.createElement('div');
    instructions.textContent = 'Drag to move. Use corners to resize.';
    instructions.className = 'info-text';

    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.className = 'button apply-button';
    applyButton.onmouseover = function() {
        this.classList.add('button-hover');
    };
    applyButton.onmouseout = function() {
        this.classList.remove('button-hover');
    };

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'button cancel-button';
    cancelButton.onmouseover = function() {
        this.classList.add('button-hover');
    };
    cancelButton.onmouseout = function() {
        this.classList.remove('button-hover');
    };

    controlsContainer.appendChild(applyButton);
    controlsContainer.appendChild(cancelButton);
    cropContainer.appendChild(imgContainer);
    infoContainer.appendChild(dimensionsInfo);
    infoContainer.appendChild(rotationInfo);
    infoContainer.appendChild(instructions);                                
    document.body.appendChild(cropContainer);               
    document.body.appendChild(infoContainer)
    document.body.appendChild(controlsContainer)

    let originalWidth, originalHeight;

    let normalizedCropCoords = {
        left: 0,
        top: 0,
        width: 1,
        height: 1
    };

    imgClone.onload = function() {
        originalWidth = imgClone.naturalWidth;
        originalHeight = imgClone.naturalHeight;

        initCropArea();
    };

    function initCropArea() {
        setTimeout(() => {

            const containerBox = imgContainer.getBoundingClientRect();
            const imageBox = imgClone.getBoundingClientRect();

            const offsetX = Math.floor(imageBox.left - containerBox.left);
            const offsetY = Math.floor(imageBox.top - containerBox.top);

            const imgDisplayWidth = Math.floor(imageBox.width);
            const imgDisplayHeight = Math.floor(imageBox.height);

            const minX = offsetX + 1;
            const minY = offsetY + 1;
            const maxX = offsetX + imgDisplayWidth - 1;
            const maxY = offsetY + imgDisplayHeight - 1;

            const initialWidth = Math.max(1, imgDisplayWidth - 2);
            const initialHeight = Math.max(1, imgDisplayHeight - 2);

            if (normalizedCropCoords.width === 1) {
                cropRect.style.left = minX + 'px';
                cropRect.style.top = minY + 'px';
                cropRect.style.width = initialWidth + 'px';
                cropRect.style.height = initialHeight + 'px';

                normalizedCropCoords = {
                    left: 1 / imgDisplayWidth,
                    top: 1 / imgDisplayHeight,
                    width: initialWidth / imgDisplayWidth,
                    height: initialHeight / imgDisplayHeight
                };
            } else {

                const newCropLeft = offsetX + (normalizedCropCoords.left * imgDisplayWidth);
                const newCropTop = offsetY + (normalizedCropCoords.top * imgDisplayHeight);
                const newCropWidth = normalizedCropCoords.width * imgDisplayWidth;
                const newCropHeight = normalizedCropCoords.height * imgDisplayHeight;

                cropRect.style.left = Math.max(minX, Math.min(maxX - newCropWidth, newCropLeft)) + 'px';
                cropRect.style.top = Math.max(minY, Math.min(maxY - newCropHeight, newCropTop)) + 'px';
                cropRect.style.width = Math.min(newCropWidth, maxX - parseInt(cropRect.style.left)) + 'px';
                cropRect.style.height = Math.min(newCropHeight, maxY - parseInt(cropRect.style.top)) + 'px';
            }

            if (!imgContainer.contains(cropRect)) {
                imgContainer.appendChild(cropRect);
            }

            updateDimensionsInfo();

            setupEventListeners();
        }, 50);
    }

    function setupEventListeners() {

        const oldEventListeners = cropRect._eventHandlers || {};

        if (oldEventListeners.mousedown) {
            cropRect.removeEventListener('mousedown', oldEventListeners.mousedown);
        }
        if (oldEventListeners.mousemove) {
            document.removeEventListener('mousemove', oldEventListeners.mousemove);
        }
        if (oldEventListeners.mouseup) {
            document.removeEventListener('mouseup', oldEventListeners.mouseup);
        }

        let isDragging = false;
        let isResizing = false;
        let resizeDirection = '';
        let startX, startY;
        let startLeft, startTop, startWidth, startHeight;
        let lastX, lastY; 

        function onMouseDown(e) {
            if (e.target.dataset.position) return;
            isDragging = true;
            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            startLeft = parseInt(cropRect.style.left) || 0;
            startTop = parseInt(cropRect.style.top) || 0;
            e.preventDefault();
        }

        function onResizeStart(e) {
            isResizing = true;
            resizeDirection = e.target.dataset.position;

            startX = lastX = e.clientX;
            startY = lastY = e.clientY;
            startLeft = parseInt(cropRect.style.left) || 0;
            startTop = parseInt(cropRect.style.top) || 0;
            startWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
            startHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

            e.preventDefault();
            e.stopPropagation();
        }

        function onMouseMove(e) {

            const currentImageBox = imgClone.getBoundingClientRect();
            const containerBox = imgContainer.getBoundingClientRect();

            const imgWidth = Math.floor(currentImageBox.width);
            const imgHeight = Math.floor(currentImageBox.height);

            const offsetX = Math.ceil(currentImageBox.left - containerBox.left);
            const offsetY = Math.ceil(currentImageBox.top - containerBox.top);

            const minX = offsetX + 1;
            const minY = offsetY + 1;
            const maxX = offsetX + imgWidth - 1; 
            const maxY = offsetY + imgHeight - 1; 

            if (isDragging) {

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;
                const rectWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
                const rectHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

                if (newLeft < minX) newLeft = minX;
                if (newLeft + rectWidth > maxX) newLeft = maxX - rectWidth;
                if (newTop < minY) newTop = minY;
                if (newTop + rectHeight > maxY) newTop = maxY - rectHeight;

                cropRect.style.left = newLeft + 'px';
                cropRect.style.top = newTop + 'px';
                cropRect.classList.add('active');

                updateNormalizedCoords();
                updateDimensionsInfo();
            } else if (isResizing) {

                const deltaX = e.clientX - lastX;
                const deltaY = e.clientY - lastY;

                let currentLeft = parseInt(cropRect.style.left) || 0;
                let currentTop = parseInt(cropRect.style.top) || 0;
                let currentWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
                let currentHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

                if (resizeDirection.includes('n')) {

                    let newTop = currentTop + deltaY;
                    let newHeight = currentHeight - deltaY;

                    if (newHeight <= 0) {

                        newHeight = 1;
                        newTop = currentTop + currentHeight - 1;

                        resizeDirection = resizeDirection.replace('n', 's');
                    }

                    if (newTop < minY) {
                        newHeight = currentHeight + (currentTop - minY);
                        newTop = minY;
                    }

                    cropRect.style.top = newTop + 'px';
                    cropRect.style.height = newHeight + 'px';
                }

                if (resizeDirection.includes('s')) {

                    let newHeight = currentHeight + deltaY;

                    if (newHeight <= 0) {

                        newHeight = 1;
                        cropRect.style.top = (currentTop + currentHeight - 1) + 'px';

                        resizeDirection = resizeDirection.replace('s', 'n');
                    } else if (currentTop + newHeight > maxY) {

                        newHeight = maxY - currentTop;
                    }

                    cropRect.style.height = newHeight + 'px';
                }

                if (resizeDirection.includes('w')) {

                    let newLeft = currentLeft + deltaX;
                    let newWidth = currentWidth - deltaX;

                    if (newWidth <= 0) {

                        newWidth = 1;
                        newLeft = currentLeft + currentWidth - 1;

                        resizeDirection = resizeDirection.replace('w', 'e');
                    }

                    if (newLeft < minX) {
                        newWidth = currentWidth + (currentLeft - minX);
                        newLeft = minX;
                    }

                    cropRect.style.left = newLeft + 'px';
                    cropRect.style.width = newWidth + 'px';
                }

                if (resizeDirection.includes('e')) {

                    let newWidth = currentWidth + deltaX;

                    if (newWidth <= 0) {

                        newWidth = 1;
                        cropRect.style.left = (currentLeft + currentWidth - 1) + 'px';

                        resizeDirection = resizeDirection.replace('e', 'w');
                    } else if (currentLeft + newWidth > maxX) {

                        newWidth = maxX - currentLeft;
                    }

                    cropRect.style.width = newWidth + 'px';
                }

                cropRect.classList.add('active');

                updateNormalizedCoords();
                updateDimensionsInfo();

                lastX = e.clientX;
                lastY = e.clientY;
            }
        }

        function onMouseUp() {
            isDragging = false;
            isResizing = false;
            cropRect.classList.remove('active');
        }

        cropRect._eventHandlers = {
            mousedown: onMouseDown,
            mousemove: onMouseMove,
            mouseup: onMouseUp
        };

        cropRect.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        const resizeMarkers = cropRect.querySelectorAll('[data-position]');
        resizeMarkers.forEach(marker => {

            const oldHandler = marker._resizeStartHandler;
            if (oldHandler) {
                marker.removeEventListener('mousedown', oldHandler);
            }

            marker._resizeStartHandler = onResizeStart;
            marker.addEventListener('mousedown', onResizeStart);
        });
    }

    function updateNormalizedCoords() {
        const imageBox = imgClone.getBoundingClientRect();
        const containerBox = imgContainer.getBoundingClientRect();
        const offsetX = imageBox.left - containerBox.left;
        const offsetY = imageBox.top - containerBox.top;

        const cropLeft = parseInt(cropRect.style.left) || 0;
        const cropTop = parseInt(cropRect.style.top) || 0;
        const cropWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
        const cropHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

        const relativeLeft = Math.max(0, cropLeft - offsetX);
        const relativeTop = Math.max(0, cropTop - offsetY);

        normalizedCropCoords = {
            left: relativeLeft / imageBox.width,
            top: relativeTop / imageBox.height,
            width: cropWidth / imageBox.width,
            height: cropHeight / imageBox.height
        };
    }

    function updateDimensionsInfo() {
        const imageBox = imgClone.getBoundingClientRect();
        const rectWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
        const rectHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

        const scaleX = originalWidth / (shouldSwapDimensions ? imageBox.height : imageBox.width);
        const scaleY = originalHeight / (shouldSwapDimensions ? imageBox.width : imageBox.height);

        let actualWidth, actualHeight;

        if (shouldSwapDimensions) {
            actualWidth = Math.round(rectHeight * scaleY);
            actualHeight = Math.round(rectWidth * scaleX);      
        } else {
            actualWidth = Math.round(rectWidth * scaleX);
            actualHeight = Math.round(rectHeight * scaleY);
        }
        dimensionsInfo.textContent = `${originalWidth}×${originalHeight}px → ${actualWidth}×${actualHeight}px`;
    }

    const handleResize = function() {

        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            if (document.body.contains(cropContainer)) {
                initCropArea();
            }
        }, 100);
    };

    let resizeTimeout;
    window.addEventListener('resize', handleResize);

    cancelButton.addEventListener('click', function() {
        window.removeEventListener('resize', handleResize);
        document.body.removeChild(cropContainer);
        document.body.removeChild(infoContainer);
        document.body.removeChild(controlsContainer);
    });

    applyButton.addEventListener('click', function() {
        const statusElement = document.getElementById('delete-status');
        if (statusElement) {
            statusElement.textContent = 'Processing image...';
            statusElement.classList.add('show');
            statusElement.style.animation = 'slide-up 0.5s forwards';
        }

        const rectLeft = parseInt(cropRect.style.left) || 0;
        const rectTop = parseInt(cropRect.style.top) || 0;
        const rectWidth = parseInt(cropRect.style.width) || cropRect.offsetWidth;
        const rectHeight = parseInt(cropRect.style.height) || cropRect.offsetHeight;

        const containerBox = imgContainer.getBoundingClientRect();
        const imageBox = imgClone.getBoundingClientRect();
        const offsetX = imageBox.left - containerBox.left;
        const offsetY = imageBox.top - containerBox.top;

        const relativeLeft = rectLeft - offsetX;
        const relativeTop = rectTop - offsetY;
        const relativeRight = relativeLeft + rectWidth;
        const relativeBottom = relativeTop + rectHeight;

        let normalizedLeft, normalizedTop, normalizedRight, normalizedBottom;

        if (shouldSwapDimensions) {
            const imageWidth = imageBox.width;
            const imageHeight = imageBox.height;

            if (normalizedRotation > 45 && normalizedRotation < 135) {
                normalizedLeft = relativeTop / imageHeight;
                normalizedTop = (imageWidth - relativeRight) / imageWidth;
                normalizedRight = relativeBottom / imageHeight;
                normalizedBottom = (imageWidth - relativeLeft) / imageWidth;
            } else {
                normalizedLeft = (imageHeight - relativeBottom) / imageHeight;
                normalizedTop = relativeLeft / imageWidth;
                normalizedRight = (imageHeight - relativeTop) / imageHeight;
                normalizedBottom = relativeRight / imageWidth;
            }
        } else {
            normalizedLeft = relativeLeft / imageBox.width;
            normalizedTop = relativeTop / imageBox.height;
            normalizedRight = relativeRight / imageBox.width;
            normalizedBottom = relativeBottom / imageBox.height;

            if (normalizedRotation > 135 && normalizedRotation < 225) {
                [normalizedLeft, normalizedRight] = [1 - normalizedRight, 1 - normalizedLeft];
                [normalizedTop, normalizedBottom] = [1 - normalizedBottom, 1 - normalizedTop];
            }
        }

        window.removeEventListener('resize', handleResize);

        const originalImg = new Image();
        originalImg.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const origLeft = Math.max(0, Math.round(normalizedLeft * originalImg.width));
            const origTop = Math.max(0, Math.round(normalizedTop * originalImg.height));
            const origWidth = Math.min(originalImg.width - origLeft, Math.round((normalizedRight - normalizedLeft) * originalImg.width));
            const origHeight = Math.min(originalImg.height - origTop, Math.round((normalizedBottom - normalizedTop) * originalImg.height));

            canvas.width = origWidth;
            canvas.height = origHeight;

            ctx.drawImage(
                originalImg,
                origLeft, origTop, origWidth, origHeight,
                0, 0, origWidth, origHeight
            );

            const croppedImageData = canvas.toDataURL('image/png');

            const tempImg = new Image();
            tempImg.onload = function() {
                img.src = croppedImageData;

                saveImageToServer(croppedImageData, imagePath, rotationDegrees);

                document.body.removeChild(cropContainer);
                document.body.removeChild(infoContainer);
                document.body.removeChild(controlsContainer);
            };
            tempImg.src = croppedImageData;
        };

        originalImg.src = img.src;
    });
  }

  function saveImageToServer(imageData, imagePath, rotation = 0) {
    fetch('/save_cropped_image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            image_data: imageData,
            file_path: imagePath,
            rotation: rotation
        })
    })
    .then(response => response.json())
    .then(async data => {
        const statusElement = document.getElementById('delete-status');
        if (statusElement) {
            if (data.success) {
                statusElement.textContent = 'Image saved successfully!';
                setTimeout(() => {
                    statusElement.classList.remove('show');
                    statusElement.style.animation = 'slide-down 0.5s forwards';
                }, 2000);
            } else {
                statusElement.textContent = 'Error: ' + (data.error || 'Unknown error');
                statusElement.style.backgroundColor = '#f44336';
            }
        }
        try { await saveBetweenQueueUsers(); } catch (_) {}
    })
    .catch(error => {
        console.error('Error saving image:', error);
        const statusElement = document.getElementById('delete-status');
        if (statusElement) {
            statusElement.textContent = 'Error saving image';
            statusElement.style.backgroundColor = '#f44336';
        }
    });
  }

  function replaceMedia(mediaId, mediaPath) {
    navigator.clipboard.read()
        .then(clipboardItems => {
            let foundImage = false;

            for (const clipboardItem of clipboardItems) {
                for (const type of clipboardItem.types) {
                    if (type.startsWith('image/')) {
                        foundImage = true;
                        clipboardItem.getType(type)
                            .then(blob => {
                                const reader = new FileReader();
                                reader.onload = function(e) {
                                    const mediaElement = document.getElementById(mediaId);
                                    if (mediaElement) {
                                        processAndReplaceImage(e.target.result, mediaElement, mediaPath);
                                    }
                                };
                                reader.readAsDataURL(blob);
                            })
                            .catch(error => {
                                console.error('Ошибка получения изображения из буфера:', error);
                                showStatus('No image in buffer...');
                            });
                        return;
                    }
                }
            }

            if (!foundImage) {
                showStatus('No image in buffer...');
            }
        })          
        .catch(error => {
            console.error('Buffer access error...', error);
            showStatus('Buffer access error...');
        });
  }

  function processAndReplaceImage(dataUrl, mediaElement, mediaPath) {
    const tempImg = new Image();
    tempImg.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = tempImg.width;
        let height = tempImg.height;
        const maxSize = 1000;

        if (width > maxSize || height > maxSize) {
            const ratio = width / height;
            if (width > height) {
                width = maxSize;
                height = maxSize / ratio;
            } else {
                height = maxSize;
                width = maxSize * ratio;
            }
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(tempImg, 0, 0, width, height);

        const processedDataUrl = canvas.toDataURL('image/png');

        replaceElementWithImage(mediaElement, processedDataUrl, mediaPath);
    };
    tempImg.src = dataUrl;
  }

  function replaceElementWithImage(mediaElement, dataUrl, mediaPath) {
    const container = mediaElement.parentElement;
    const mediaId = mediaElement.id;
    const newImage = document.createElement('img');

    newImage.id = mediaId;
    newImage.src = dataUrl;

    const pathParts = mediaPath.split('.');
    const basePath = pathParts.slice(0, pathParts.length - 1).join('.');
    const newPath = `${basePath}.png`;

    container.replaceChild(newImage, mediaElement);

    const replaceBtn = container.querySelector('.replace-button');
    if (replaceBtn) {
        replaceBtn.setAttribute('onclick', `replaceMedia('${mediaId}', '${newPath}')`);
    }

    const rotateLeftBtn = container.querySelector('.rotate-button.left');
    const rotateRightBtn = container.querySelector('.rotate-button.right');

    if (rotateLeftBtn) {
        rotateLeftBtn.setAttribute('onclick', `rotateMedia('${mediaId}', 'left', '${newPath}', 'image')`);
    }

    if (rotateRightBtn) {
        rotateRightBtn.setAttribute('onclick', `rotateMedia('${mediaId}', 'right', '${newPath}', 'image')`);
    }

    const isVideoElement = mediaElement.tagName.toLowerCase() === 'video';

    if (isVideoElement && !container.querySelector('.crop-button')) {
        const controlsContainer = container.querySelector('.media-controls');

        if (controlsContainer) {
            const cropButton = document.createElement('span');
            cropButton.className = 'crop-button control-button';
            cropButton.setAttribute('onclick', `recropImage('${mediaId}', '${newPath}')`);
            cropButton.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 21C8.65685 21 10 19.6569 10 18C10 16.3431 8.65685 15 7 15C5.34315 15 4 16.3431 4 18C4 19.6569 5.34315 21 7 21Z" stroke="white" stroke-width="2"/>
                    <path d="M17 21C18.6569 21 20 19.6569 20 18C20 16.3431 18.6569 15 17 15C15.3431 15 14 16.3431 14 18C14 19.6569 15.3431 21 17 21Z" stroke="white" stroke-width="2"/>
                    <path d="M16.0001 3L8.66479 15.2255" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M8.00007 3L15.3066 15.1776" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;

            controlsContainer.insertBefore(cropButton, controlsContainer.firstChild);
        }
    }

    const mainContainer = container.closest('.main-container');
    const copyBtn = mainContainer.nextElementSibling;

    if (copyBtn && copyBtn.classList.contains('copy-button')) {
        copyBtn.setAttribute('onclick', `copyImageToClipboard('data:image/png;base64,${dataUrl.split(',')[1]}', event)`);
        copyBtn.textContent = 'copy image';
    }

    fetch('/replace_media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            media_data: dataUrl,
            file_path: mediaPath,
            new_file_path: newPath,
            media_type: 'image'
        })
    })
    .then(response => response.json())
    .then(async data => {
        showStatus(data.success ? "Success!" : "Error!");
        try { await saveBetweenQueueUsers(); } catch (_) {}
    })
    .catch(error => {
        console.error('Ошибка отправки данных на сервер:', error);
        showStatus('Server error...');
    });
  }

  function showStatus(message) {
    var element = document.getElementById('delete-status');
    element.textContent = message;
    element.classList.add('show');
    element.style.animation = 'slide-up 0.5s forwards';
    setTimeout(function() {
        element.classList.remove('show');
        element.style.animation = 'none';
    }, 5000);
  }

  function loadInitialQueueData() {

    const queueDataToSend = currentQueueData ? {
      queue_mode_enabled: currentQueueData.queue_mode_enabled || false,
      queue_running: currentQueueData.queue_running || false,
      current_user: currentQueueData.current_user || 0,
      total_users: currentQueueData.total_users || 0,
      status: currentQueueData.status || {},
      users: currentQueueData.users || []
    } : {};

    const browserDataToSend = currentBrowserData ? {
      browser_tab_counts: currentBrowserData.browser_tab_counts || {},
      queue_settings: currentBrowserData.queue_settings || {}
    } : {};

    fetch('/get-queue-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue_data: queueDataToSend,
        browser_data: browserDataToSend
      })
    })
      .then(response => {
        if (response.status === 204) {
          console.log('No changes in initial queue data');
          return null;
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data && data.success && data.queue_data && data.browser_data) {
          updateQueueStatus(data.queue_data, data.browser_data);

          setTimeout(() => {
            initializeDragAndDrop();
          }, 100);

          try {
            const shouldOpen = localStorage.getItem('queueDropdownOpen') === 'true';
            const dropdown = document.getElementById('queue-dropdown');
            if (dropdown) {
              if (shouldOpen) {
                dropdown.classList.add('show');
                try { 
                  const currentUserIndex = data?.queue_data?.current_user;
                  restoreQueueDropdownScroll(currentUserIndex); 
                } catch (_) {}
              } else {
                dropdown.classList.remove('show');
              }
            }
          } catch (_) {}
        }
      })
      .catch(error => console.log('Error loading initial queue data:', error));
  }

  let pollingActive = true;
  let pollingTimeoutId = null;

  function startQueueDataPolling() {
    function pollQueueData() {
      if (!pollingActive) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); 

      const queueDataToSend = currentQueueData ? {
        queue_mode_enabled: currentQueueData.queue_mode_enabled || false,
        queue_running: currentQueueData.queue_running || false,
        current_user: currentQueueData.current_user || 0,
        total_users: currentQueueData.total_users || 0,
        status: currentQueueData.status || {},
        users: currentQueueData.users || []
      } : {};

      const browserDataToSend = currentBrowserData ? {
        browser_tab_counts: currentBrowserData.browser_tab_counts || {},
        queue_settings: currentBrowserData.queue_settings || {}
      } : {};

      fetch('/get-queue-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_data: queueDataToSend,
          browser_data: browserDataToSend
        }),
        signal: controller.signal
      })
        .then(response => {
          clearTimeout(timeoutId);
          if (response.status === 204) {
            return null;
          }
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && data.success && data.queue_data && data.browser_data) {
            updateQueueStatus(data.queue_data, data.browser_data);

            try {
              const shouldOpen = localStorage.getItem('queueDropdownOpen') === 'true';
              const dropdown = document.getElementById('queue-dropdown');
              if (dropdown) {
                if (shouldOpen) {
                  dropdown.classList.add('show');
                  try { 
                    const currentUserIndex = data?.queue_data?.current_user;
                    restoreQueueDropdownScroll(currentUserIndex); 
                  } catch (_) {}
                } else {
                  dropdown.classList.remove('show');
                }
              }
            } catch (_) {}
          }
        })
        .catch(error => {
          clearTimeout(timeoutId);
          if (error.name !== 'AbortError') {
            console.log('Queue polling error:', error);
          }
        })
        .finally(() => {
          if (pollingActive) {
            pollingTimeoutId = setTimeout(pollQueueData, 2000);
          }
        });
    }

    pollQueueData();
  }

  function stopQueueDataPolling() {
    pollingActive = false;
    if (pollingTimeoutId) {
      clearTimeout(pollingTimeoutId);
      pollingTimeoutId = null;
    }
  }

  let lastQueueRunning = null;

  function checkQueueCompletion(currentQueueData) {

    if (currentQueueData.queue_running === false && 
        currentQueueData.total_users > 1 && 
        lastQueueRunning === true) {

        console.log('Queue finished with multiple users, showing completion modal');
        showQueueCompletionModal();
    } else if (currentQueueData.queue_running === false && 
               currentQueueData.total_users === 1 && 
               lastQueueRunning === true) {

        console.log('Queue finished with single user, no modal needed');
        showStatus('Queue processing completed!', 'success');
    }
    lastQueueRunning = currentQueueData.queue_running;
  }

  function collectDOMState() {
    const state = {
      checkboxes: [],
      removedElements: [],
      transforms: [],
      replacedImages: [],
      activeButtons: [],
      hintsOrder: []
    };

    document.querySelectorAll('input[type="checkbox"]').forEach((checkbox, index) => {
      const selector = checkbox.id ? `#${checkbox.id}` : `input[type="checkbox"]:nth-of-type(${index + 1})`;
      state.checkboxes.push({
        selector: selector,
        checked: checkbox.checked
      });
    });

    document.querySelectorAll('[style*="transform"]').forEach(element => {
      const selector = element.id ? `#${element.id}` : element.className ? `.${element.className.split(' ')[0]}` : element.tagName.toLowerCase();
      state.transforms.push({
        selector: selector,
        transform: element.style.transform,
        maxWidth: element.style.maxWidth,
        maxHeight: element.style.maxHeight
      });
    });

    document.querySelectorAll('.message-button.active').forEach(button => {
      const selector = button.dataset.number ? `[data-number="${button.dataset.number}"]` : 
                      button.id ? `#${button.id}` : `.message-button.active`;
      state.activeButtons.push(selector);
    });

    const hintsContainer = document.querySelector('.hints-wrapper') || document.getElementById('hints-container');
    if (hintsContainer) {
      const hints = hintsContainer.querySelectorAll('.hint-item');
      hints.forEach(hint => {
        const label = hint.querySelector('.hint-label');
        if (label) {
          state.hintsOrder.push(label.textContent);
        }
      });
    }

    document.querySelectorAll('img[src*="data:image"]').forEach(img => {
      if (img.id) {
        state.replacedImages.push({
          selector: `#${img.id}`,
          src: img.src
        });
      }
    });

    return state;
  }

  function saveBetweenQueueUsers() {
    if (!currentQueueData?.queue_mode_enabled) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        const currentHtml = document.documentElement.outerHTML;
        const domState = collectDOMState();

        if (!currentHtml || currentHtml.length < 100 || 
            (!currentHtml.includes('<!DOCTYPE html>') && !currentHtml.includes('<html>'))) {
          console.warn('Invalid HTML content detected, skipping save');
          resolve(); 
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); 

        fetch('/auto-save-user-state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            html_content: currentHtml,
            dom_state: domState,
            save_type: 'full_state'
          }),
          signal: controller.signal
        })
        .then(response => {
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (data.success) {
            console.log('State saved before switching user');
            resolve();
          } else {
            console.warn('Save failed:', data.error);
            reject(new Error(data.error || 'Unknown save error'));
          }
        })
        .catch(error => {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            reject(new Error('Save operation timed out'));
          } else {
            console.error('Save error:', error);
            reject(error);
          }
        });

      } catch (error) {
        console.error('Error in saveBetweenQueueUsers:', error);
        reject(error);
      }
    });
  }

  function setupAutoSave() {
    if (!currentQueueData?.queue_mode_enabled) return;

    let saveTimeout;

    function triggerAutoSave() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveBetweenQueueUsers().catch(err => {
          console.log('Auto-save failed:', err);
        });
      }, 2000);
    }

    document.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        triggerAutoSave();
      }
    });

    const observer = new MutationObserver((mutations) => {
      let shouldSave = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && (mutation.removedNodes.length > 0 || mutation.addedNodes.length > 0)) {
          shouldSave = true;
        }
        if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
          shouldSave = true;
        }
      });

      if (shouldSave) {
        triggerAutoSave();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'src']
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupStatusMonitor();

    loadAppState(); 
    loadInitialQueueData();
    startQueueDataPolling();
    setupAutoSave();

    setTimeout(() => {
      initializeDragAndDrop();
    }, 1000);

    (function enforceSingleActiveHintOnLoad() {
      try {
        const hintsContainer = document.getElementById('hints-container');
        if (!hintsContainer) return;
        const activeItem = hintsContainer.querySelector('.hint-item.active');
        const checked = hintsContainer.querySelectorAll('.hint-checkbox:checked');
        if (activeItem && checked.length > 1) {
          const allItems = hintsContainer.querySelectorAll('.hint-item');
          allItems.forEach(item => {
            const checkbox = item.querySelector('.hint-checkbox');
            if (!checkbox) return;
            if (item === activeItem) {
              checkbox.checked = true;
              item.classList.add('active');
            } else {
              checkbox.checked = false;
              item.classList.remove('active');
            }
          });
        }
      } catch (e) {
        console.warn('Failed to enforce single active hint on load:', e);
      }
    })();

    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('queue-dropdown');
        const toggleBtn = document.querySelector('.queue-toggle-btn');

        if (dropdown && !dropdown.contains(event.target) && !toggleBtn.contains(event.target)) {
            try { 
              const currentUserIndex = currentQueueData?.current_user;
              saveQueueDropdownScroll(currentUserIndex); 
            } catch (_) {}
            dropdown.classList.remove('show');

            localStorage.setItem('queueDropdownOpen', 'false');
        }
    });

    if (!document.getElementById('send-status')) {
        var statusElement = document.createElement('div');
        statusElement.id = 'send-status';
        statusElement.className = 'status-message';
        document.body.appendChild(statusElement);
    }

    const setupModal = (config) => {
        const { 
            addBtn, 
            saveBtn, 
            modal, 
            closeBtn, 
            inputField 
        } = config;

        const toggleModal = (show = false) => {
            modal?.classList.toggle('hidden', !show);
            if (inputField) inputField.value = '';
        };

        addBtn?.addEventListener('click', () => toggleModal(true));
        saveBtn?.addEventListener('click', () => toggleModal());
        closeBtn?.addEventListener('click', () => toggleModal());

        modal?.addEventListener('click', (event) => {
            if (event.target === modal) toggleModal();
        });
    };

    setupModal({    
        addBtn: document.getElementById('add-hint-btn'),
        saveBtn: document.getElementById('save-hint-btn'),
        modal: document.getElementById('hint-modal'),
        closeBtn: document.getElementById('close-modal-btn'),
        inputField: document.getElementById('hint-input')
    });

    setupModal({
        addBtn: document.getElementById('add-general-hint-btn'),
        saveBtn: document.getElementById('save-general-hint-btn'), 
        modal: document.getElementById('hint-modal-general'),
        closeBtn: document.getElementById('close-general-modal-btn'),
        inputField: document.getElementById('general-hint-input')
    });

    if (!localStorage.getItem('sortMode')) {
        localStorage.setItem('sortMode', 'usage');
    }

    try {
      const shouldOpen = localStorage.getItem('queueDropdownOpen') === 'true';
      const dropdown = document.getElementById('queue-dropdown');
      if (dropdown) {
        if (shouldOpen) { 
          dropdown.classList.add('show'); 
          try { 
            const currentUserIndex = currentQueueData?.current_user;
            restoreQueueDropdownScroll(currentUserIndex); 
          } catch (_) {} 
        }
        else dropdown.classList.remove('show');

        dropdown.addEventListener('scroll', () => {
          if (queueScrollSaveRaf) return;
          queueScrollSaveRaf = requestAnimationFrame(() => {
            queueScrollSaveRaf = null;
            try { 
              const currentUserIndex = currentQueueData?.current_user;
              saveQueueDropdownScroll(currentUserIndex); 
            } catch (_) {}
          });
        }, { passive: true });
      }
    } catch (_) {}

    const activeNumber = localStorage.getItem('activeButtonNumber') || '0';

    setTimeout(() => {
        updateActiveButton(activeNumber);

        const activeButtons = document.querySelectorAll('.message-button.active');
        if (activeButtons.length > 1) {
            console.warn('Multiple active buttons detected, fixing...');
            activeButtons.forEach((btn, index) => {
                if (index > 0) {
                    btn.classList.remove('active');
                }
            });
        }
    }, 100);

    const currentMode = localStorage.getItem('sortMode');
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    try {
        document.querySelector(`button[onclick*="switchSortMode('${currentMode}')"]`).classList.add('active');
        const hintsWrapper = document.querySelector('.hints-wrapper')
        const hints = Array.from(hintsWrapper.querySelectorAll('.hint-item'));
        const sortedHints = currentMode === 'usage' 
                ? sort_hints_by_usage(hints)
                : sort_hints_by_time(hints);
        hintsWrapper.replaceChildren(...sortedHints);
    }
    catch {}
  });

  async function deleteMedia(mediaId, mediaPath, messageIndex) {
    if (!confirm('Are you sure you want to delete this media?')) {
        return;
    }

    messageIndex = parseInt(messageIndex);

    try {
        const chatIdRaw = document.getElementById('chat-id').textContent;
        const chatId = chatIdRaw.replace(/"/g, '').trim();

        if (!mediaId || !mediaPath || isNaN(messageIndex)) {
            console.error('Missing parameters:', { mediaId, mediaPath, messageIndex });
            return;
        }

        const response = await fetch('/delete-media', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                media_id: mediaId,
                media_path: mediaPath,
                message_index: messageIndex,
                chat_id: chatId,
                user_index: (currentQueueData && typeof currentQueueData.current_user === 'number') ? currentQueueData.current_user : null,
                confirmed: true
            })
        });

        const data = await response.json();

        if (data.success) {
            const mediaContainer = document.getElementById(mediaId)?.closest('.main-container');
            if (mediaContainer) {

                let nextElement = mediaContainer.nextElementSibling;
                while (nextElement) {
                    if (nextElement.classList.contains('button-container')) {
                        nextElement.remove();
                        break;
                    }
                    nextElement = nextElement.nextElementSibling;
                }

                const copyImgButton = mediaContainer.nextElementSibling;
                if (copyImgButton && copyImgButton.classList.contains('copy-button') && copyImgButton.classList.contains('img')) {
                    copyImgButton.remove();
                }

                mediaContainer.remove();
            }
            const textBlock = document.getElementById(`text-block-${messageIndex}`);
            if (textBlock) {
                textBlock.remove();
            }
            const lenMessagesDiv = document.querySelector('.len-messages');

            if (lenMessagesDiv) {
                const parts = lenMessagesDiv.textContent.split('/');
                let currentCount = parseInt(parts[0]);
                let totalCount = parseInt(parts[1]);
                if (currentCount > totalCount) {
                    currentCount = totalCount
                }
                lenMessagesDiv.textContent = `${currentCount - 1} / ${totalCount - 1}`;
                newNumber = currentCount - 1;
            }

            const allSeparators = document.querySelectorAll('.message-separator');
            allSeparators.forEach(separator => {
                let hasMediaBelow = false;
                let nextElement = separator.nextElementSibling;

                while (nextElement) {
                    if (nextElement.classList.contains('main-container')) {
                        const mediaElement = nextElement.querySelector('img, video');
                        if (mediaElement) {
                            hasMediaBelow = true;
                            break;
                        }
                    }

                    if (nextElement.classList.contains('message-separator')) {
                        break;
                    }
                    nextElement = nextElement.nextElementSibling;
                }

                if (!hasMediaBelow) {
                    separator.remove();
                }
            });

            const allContainers = document.querySelectorAll('.main-container');

            allContainers.forEach((container, index) => {
                const imageNumber = container.querySelector('.image-number');
                if (imageNumber) {
                    imageNumber.textContent = index;
                }

                const mediaElement = container.querySelector('img, video');
                if (mediaElement) {
                    const mediaId = mediaElement.id;

                    const deleteButton = container.querySelector('.delete-button');
                    let mediaPath = '';
                    if (deleteButton) {
                        const onclickAttr = deleteButton.getAttribute('onclick');
                        const match = onclickAttr.match(/deleteMedia\('.*?', '(.*?)',/);
                        if (match) {
                            mediaPath = match[1];
                        }
                    }

                    if (mediaPath) {
                        if (deleteButton) {
                            const newOnclick = `deleteMedia('${mediaId}', '${mediaPath}', ${index})`;
                            deleteButton.setAttribute('onclick', newOnclick);
                        }

                        const rotateLeftButton = container.querySelector('.rotate-button.left');
                        if (rotateLeftButton) {
                            rotateLeftButton.setAttribute('onclick', `rotateMedia('${mediaId}', 'left', '${mediaPath}', '${mediaElement.tagName.toLowerCase()}')`);
                        }
                        const rotateRightButton = container.querySelector('.rotate-button.right');
                        if (rotateRightButton) {
                            rotateRightButton.setAttribute('onclick', `rotateMedia('${mediaId}', 'right', '${mediaPath}', '${mediaElement.tagName.toLowerCase()}')`);
                        }

                        const replaceButton = container.querySelector('.replace-button');
                        if (replaceButton) {
                            replaceButton.setAttribute('onclick', `replaceMedia('${mediaId}', '${mediaPath}')`);
                        }

                        const cropButton = container.querySelector('.crop-button');
                        if (cropButton && mediaElement.tagName.toLowerCase() === 'img') {
                            cropButton.setAttribute('onclick', `recropImage('${mediaId}', '${mediaPath}')`);
                        }
                    } else {
                        console.error('Failed to extract mediaPath for container:', index);
                    }
                }
            });

            try {
                const resHints = await fetch('/get-hints', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId })
                });
                const hintsPayload = await resHints.json();
                if (hintsPayload && hintsPayload.success) {
                    const personal = hintsPayload.personal || {};
                    const general = hintsPayload.general || { hints: [], checkbox: '' };
                    const container = document.getElementById('hints-container');
                    if (container) {

                        container.innerHTML = '';

                        const personalKeys = Object.keys(personal).filter(k => k !== 'now' && k !== 'checkbox');
                        const activePersonal = personal.checkbox && personalKeys.includes(personal.checkbox) ? personal.checkbox : '';
                        const activeGeneral = general.checkbox || '';

                        let currentMode = localStorage.getItem('sortMode') || 'usage';
                        let html = `
                            <div class="sort-buttons">
                                <button onclick="switchSortMode('usage')" class="sort-btn ${currentMode === 'usage' ? 'active' : ''}">
                                    <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000" class="bi bi-sort-numeric-down-alt">
                                        <g id="SVGRepo_iconCarrier">
                                            <path fill-rule="evenodd" clip-rule="evenodd" d="M11.36 7.098c-1.137 0-1.708-.657-1.762-1.278h1.004c.058.223.343.45.773.45.824 0 1.164-.829 1.133-1.856h-.059c-.148.39-.57.742-1.261.742-.91 0-1.72-.613-1.72-1.758 0-1.148.848-1.836 1.973-1.836 1.09 0 2.063.637 2.063 2.688 0 1.867-.723 2.848-2.145 2.848zm.062-2.735c.504 0 .933-.336.933-.972 0-.633-.398-1.008-.94-1.008-.52 0-.927.375-.927 1 0 .64.418.98.934.98z"/>
                                            <path d="M12.438 8.668V14H11.39V9.684h-.051l-1.211.859v-.969l1.262-.906h1.046zM4.5 2.5a.5.5 0 0 0-1 0v9.793l-1.146-1.147a.5.5 0 0 0-.708.708l2 1.999.007.007a.497.497 0 0 0 .7-.006l2-2a.5.5 0 0 0-.707-.708L4.5 12.293V2.5z"/>
                                        </g>
                                    </svg>
                                </button>
                                <button onclick="switchSortMode('time')" class="sort-btn ${currentMode === 'time' ? 'active' : ''}">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="#000000" stroke-width="0.00024">
                                        <g id="SVGRepo_iconCarrier">
                                            <path fill-rule="evenodd" clip-rule="evenodd" d="M1.25 7C1.25 6.58579 1.58579 6.25 2 6.25H10C10.4142 6.25 10.75 6.58579 10.75 7C10.75 7.41421 10.4142 7.75 10 7.75H2C1.58579 7.75 1.25 7.41421 1.25 7ZM17 7.75C14.6528 7.75 12.75 9.65279 12.75 12C12.75 14.3472 14.6528 16.25 17 16.25C19.3472 16.25 21.25 14.3472 21.25 12C21.25 9.65279 19.3472 7.75 17 7.75ZM11.25 12C11.25 8.82436 13.8244 6.25 17 6.25C20.1756 6.25 22.75 8.82436 22.75 12C22.75 15.1756 20.1756 17.75 17 17.75C13.8244 17.75 11.25 15.1756 11.25 12ZM17 9.25C17.4142 9.25 17.75 9.58579 17.75 10V11.5664L18.5668 12.5088C18.838 12.8218 18.8042 13.2955 18.4912 13.5668C18.1782 13.838 17.7045 13.8042 17.4332 13.4912L16.4332 12.3374C16.3151 12.201 16.25 12.0266 16.25 11.8462V10C16.25 9.58579 16.5858 9.25 17 9.25ZM1.25 12C1.25 11.5858 1.58579 11.25 2 11.25H8C8.41421 11.25 8.75 11.5858 8.75 12C8.75 12.4142 8.41421 12.75 8 12.75H2C1.58579 12.75 1.25 12.4142 1.25 12ZM1.25 17C1.25 16.5858 1.58579 16.25 2 16.25H10C10.4142 16.25 10.75 16.5858 10.75 17C10.75 17.4142 10.4142 17.75 10 17.75H2C1.58579 17.75 1.25 17.4142 1.25 17Z" fill="#000000"/>
                                        </g>
                                    </svg>
                                </button>
                            </div>
                            <div class="hints-wrapper">`;

                        if (activePersonal) {
                            html += `
                                <div class="hint-item active">
                                    <div class="hint-wrapper">
                                        <input type="checkbox" id="checkbox-personal-${activePersonal}" checked class="hint-checkbox" onchange="updateHintCheckbox('${hintsPayload.chat_id}', '${activePersonal}', 'update', 'personal')">
                                        <label for="checkbox-personal-${activePersonal}" class="hint-label">${activePersonal}</label>
                                        <button class="hint-delete-btn" onclick="deleteHint('${hintsPayload.chat_id}', '${activePersonal}', 'personal')" aria-label="Delete personal hint">
                                            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                                                <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                                                <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                                                <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                                                <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                                                <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7 -43a1,1 0,0,1 -1 1H9a1,1 0,0,1 -1 -1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>`;
                        }
                        personalKeys.filter(k => k !== activePersonal).forEach(h => {
                            html += `
                                <div class="hint-item">
                                    <div class="hint-wrapper">
                                        <input type="checkbox" id="checkbox-personal-${h}" class="hint-checkbox" onchange="updateHintCheckbox('${hintsPayload.chat_id}', '${h}', 'update', 'personal')">
                                        <label for="checkbox-personal-${h}" class="hint-label">${h}</label>
                                        <button class="hint-delete-btn" onclick="deleteHint('${hintsPayload.chat_id}', '${h}', 'personal')" aria-label="Delete personal hint">
                                            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                                                <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                                                <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                                                <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                                                <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                                                <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7 -43a1,1 0,0,1 -1 1H9a1,1 0,0,1 -1 -1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>`;
                        });
                        const generalHints = Array.isArray(general.hints) ? general.hints : [];
                        generalHints.forEach(h => {
                            const isChecked = activeGeneral && h === activeGeneral;
                            html += `
                                <div class="hint-item general-hint ${isChecked ? 'active' : ''}">
                                    <div class="hint-wrapper">
                                        <input type="checkbox" id="checkbox-general-${h}" ${isChecked ? 'checked' : ''} class="hint-checkbox" onchange="updateHintCheckbox('${hintsPayload.chat_id}', '${h}', 'update', 'general')">
                                        <label for="checkbox-general-${h}" class="hint-label general">${h}</label>
                                        <button class="hint-delete-btn" onclick="deleteHint('${hintsPayload.chat_id}', '${h}', 'general')" aria-label="Delete general hint">
                                            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                                                <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                                                <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                                                <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                                                <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                                                <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                                                <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7 -43a1,1 0,0,1 -1 1H9a1,1 0,0,1 -1 -1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>`;
                        });

                        html += '</div>';

                        container.innerHTML = html;

                        const deleteBtnSvg = `
                            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                                <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                                <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                                <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                                <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                                <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                                <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                                <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6,9v6a3,3 0,0,0 3,3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.41 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19-3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0,0,1 0 -2H47a1,1 0,0,1 0 2Zm7 -43a1,1 0,0,1 -1 1H9a1,1 0,0,1 -1 -1V9A3,3 0,0,1 9 8H53a1,1 0,0,1 1 1Z"></path>
                            </svg>`;

                        container.querySelectorAll('.hint-delete-btn').forEach(btn => {
                            if (!btn.innerHTML || btn.innerHTML.trim() === '') {
                                btn.innerHTML = deleteBtnSvg;
                            }
                        });

                        try { switchSortMode(currentMode); } catch (_) {}

                        const hintsDataScript = document.getElementById('hints-data');
                        if (hintsDataScript) {
                            const existing = (() => { try { return JSON.parse(hintsDataScript.textContent || '{}'); } catch(_) { return {}; } })();
                            if (hintsPayload.chat_id) {
                                existing[String(hintsPayload.chat_id)] = personal;
                                hintsDataScript.textContent = JSON.stringify(existing);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to refresh hints after deletion', e);
            }

            try {
                if (currentQueueData && currentQueueData.queue_mode_enabled) {
                    const userIndex = currentQueueData.current_user;
                    if (currentQueueData.users && typeof userIndex === 'number' && currentQueueData.users[userIndex]) {
                        if (typeof data.active_hint === 'string') {
                            currentQueueData.users[userIndex].active_hint = data.active_hint;
                        }

                        const userButtonsDiv = document.getElementById('user-buttons');
                        if (userButtonsDiv) {
                            try {
                                updateQueueStatus(currentQueueData, currentBrowserData || null);
                            } catch (_) {}
                        }
                    }
                }
            } catch (_) {}

            try {
                await saveBetweenQueueUsers();
            } catch (err) {
                console.warn('Auto-save after delete failed:', err);
            }
        } else {
            console.error('Failed to delete media:', data.error);
        }
    } catch (error) {
        console.error('Error deleting media:', error);
    }
  }

  let draggedElement = null;
  let draggedIndex = null;
  let dropTarget = null;
  let dragPlaceholder = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragContainer = null;
  let isCustomDragging = false;
  let dragRaf = 0;
  let dragNextX = 0;
  let dragNextY = 0;

  function initializeDragAndDrop() {
    const userButtonsDiv = document.getElementById('user-buttons');
    if (!userButtonsDiv) return;

    updateDragAndDropListeners();
  }

  function updateDragAndDropListeners() {
    const userButtonsDiv = document.getElementById('user-buttons');
    if (!userButtonsDiv) return;

    const queueUsers = userButtonsDiv.querySelectorAll('.queue-user-item');

    if (queueUsers.length === 0) {
      return;
    }

    const firstUser = queueUsers[0];
    if (firstUser && firstUser.hasAttribute('data-drag-listeners-attached')) {
      return; 
    }

    queueUsers.forEach((userElement, index) => {
      userElement.setAttribute('data-user-index', index);
      userElement.setAttribute('data-drag-listeners-attached', 'true');
      userElement.removeAttribute('draggable');
      userElement.addEventListener('mousedown', startCustomDrag);
      userElement.style.cursor = 'grab';
    });
  }

  function startCustomDrag(e) {
    if (e.button !== 0) return; 
    const targetDeleteBtn = e.target.closest('.user-delete-btn');
    if (targetDeleteBtn) return;

    draggedElement = e.currentTarget.closest('.queue-user-item');
    if (!draggedElement) return;

    dragContainer = draggedElement.parentElement;
    const rect = draggedElement.getBoundingClientRect();
    draggedIndex = parseInt(draggedElement.getAttribute('data-user-index'));
    if (!Number.isInteger(draggedIndex) || draggedIndex < 0) return;

    isCustomDragging = true;
    document.body.classList.add('drag-active-cursor');
    draggedElement.classList.add('dragging');

    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    dragPlaceholder = document.createElement('div');
    dragPlaceholder.className = 'queue-user-placeholder';
    dragPlaceholder.style.height = rect.height + 'px';
    dragPlaceholder.style.marginBottom = getComputedStyle(draggedElement).marginBottom;

    draggedElement.parentNode.insertBefore(dragPlaceholder, draggedElement.nextSibling);

    draggedElement.style.width = rect.width + 'px';
    draggedElement.style.position = 'fixed';
    draggedElement.style.left = '0px';
    draggedElement.style.top = '0px';
    draggedElement.style.transform = `translate3d(${(e.clientX - dragOffsetX)}px, ${(e.clientY - dragOffsetY)}px, 0)`;
    draggedElement.style.zIndex = '10001';
    draggedElement.style.pointerEvents = 'none';
    draggedElement.style.transition = 'none';
    draggedElement.style.willChange = 'transform';

    document.addEventListener('mousemove', onCustomDragMove);
    document.addEventListener('mouseup', endCustomDrag);
    e.preventDefault();
  }

  function onCustomDragMove(e) {
    if (!isCustomDragging || !draggedElement) return;
    dragNextX = e.clientX - dragOffsetX;
    dragNextY = e.clientY - dragOffsetY;
    if (!dragRaf) {
      dragRaf = requestAnimationFrame(() => {
        if (draggedElement) {
          draggedElement.style.transform = `translate3d(${dragNextX}px, ${dragNextY}px, 0)`;
        }
        dragRaf = 0;
      });
    }

    const siblings = Array.from(dragContainer.querySelectorAll('.queue-user-item')).filter(el => el !== draggedElement);
      const mouseY = e.clientY;

    let inserted = false;
    for (let i = 0; i < siblings.length; i++) {
      const r = siblings[i].getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      if (mouseY < centerY) {
        dragContainer.insertBefore(dragPlaceholder, siblings[i]);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      dragContainer.appendChild(dragPlaceholder);
    }
  }

  function endCustomDrag() {
    if (!isCustomDragging || !draggedElement) return;
    document.removeEventListener('mousemove', onCustomDragMove);
    document.removeEventListener('mouseup', endCustomDrag);
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = 0;
    }

    const newIndex = Array.from(dragContainer.children).indexOf(dragPlaceholder);

    draggedElement.style.position = '';
    draggedElement.style.left = '';
    draggedElement.style.top = '';
    draggedElement.style.width = '';
    draggedElement.style.zIndex = '';
    draggedElement.style.pointerEvents = '';
    draggedElement.style.transform = '';
    draggedElement.style.willChange = '';
    draggedElement.style.transition = '';
    draggedElement.classList.remove('dragging');
    document.body.classList.remove('drag-active-cursor');

    dragContainer.insertBefore(draggedElement, dragPlaceholder);
    dragPlaceholder.remove();

    isCustomDragging = false;

    if (Number.isInteger(newIndex) && newIndex !== draggedIndex) {
      try { showLoadingOverlay(); } catch (_) {}
      reorderQueueUsers(draggedIndex, newIndex).catch(() => { try { hideLoadingOverlay(); } catch (_) {} });
    }

    draggedElement = null;
    dragPlaceholder = null;
    dragContainer = null;
    draggedIndex = null;
  }

  async function reorderQueueUsers(fromIndex, toIndex) {
    try {
      const localUsers = (currentQueueData && Array.isArray(currentQueueData.users)) ? currentQueueData.users : null;

      if (localUsers && localUsers.length > 0) {
        if (fromIndex < 0 || fromIndex >= localUsers.length || toIndex < 0 || toIndex > localUsers.length) {
          throw new Error(`Invalid indices: ${fromIndex} -> ${toIndex}`);
        }
        if (fromIndex === toIndex) return;

        const newOrder = Array.from({ length: localUsers.length }, (_, i) => i);
        const moved = newOrder.splice(fromIndex, 1)[0];
        newOrder.splice(toIndex, 0, moved);

        const reorderResponse = await fetch('/reorder-queue-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newOrder })
        });
        if (!reorderResponse.ok) throw new Error('Failed to reorder users');
        const result = await reorderResponse.json();
        if (result.success) {
          await refreshQueueDisplay();
          showStatus('Order was changed');
          return;
        }
        throw new Error(result.message || 'Failed to reorder users');
      }

      const response = await fetch('/get-queue-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error('Failed to get queue data from server');
      const data = await response.json();
      if (!data.success) throw new Error('Server returned unsuccessful response');
      const queueData = data.queue_data;
      if (!queueData) throw new Error('No queue_data in server response');

      currentQueueData = JSON.parse(JSON.stringify(queueData));
      const queueUsers = queueData.users || [];
      if (queueUsers.length === 0) throw new Error('No users found in queue data');
      if (fromIndex < 0 || fromIndex >= queueUsers.length || toIndex < 0 || toIndex >= queueUsers.length) {
        throw new Error(`Invalid user indices: fromIndex=${fromIndex}, toIndex=${toIndex}, totalUsers=${queueUsers.length}`);
      }
      if (fromIndex === toIndex) return;

      const newOrder = Array.from({ length: queueUsers.length }, (_, i) => i);
      const draggedElementIndex = newOrder.splice(fromIndex, 1)[0];
      newOrder.splice(toIndex, 0, draggedElementIndex);

      const reorderResponse = await fetch('/reorder-queue-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOrder })
      });
      if (!reorderResponse.ok) throw new Error('Failed to reorder users');
      const result = await reorderResponse.json();
      if (result.success) {
        await refreshQueueDisplay();
        showStatus('Order was changed');
      } else {
        throw new Error(result.message || 'Failed to reorder users');
      }
    } catch (error) {
      console.error('Error reordering queue users:', error);
      showStatus('Error while changing order: ' + error.message);
      try { hideLoadingOverlay(); } catch (_) {}
    }
  }

  async function refreshQueueDisplay() {
    try {

      const response = await fetch('/get-queue-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();

        if (data && data.success) {
          currentQueueData = JSON.parse(JSON.stringify(data.queue_data || {}));
          currentBrowserData = JSON.parse(JSON.stringify(data.browser_data || {}));
          updateQueueStatus(data.queue_data, data.browser_data || null);
        }

      }
    } catch (error) {
      console.error('Error refreshing queue display:', error);
    }
  }

  function showLoadingOverlay() {
    let overlay = document.getElementById('queue-loading-overlay');
    if (overlay) return; 
    overlay = document.createElement('div');
    overlay.id = 'queue-loading-overlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner" role="status" aria-live="polite" aria-label="Updating order">
        <span class="ring"></span>
        <span class="ring"></span>
        <span class="ring"></span>
        <span class="spinner-center-glow"></span>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById('queue-loading-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function loadAppState() {
    fetch('/get-app-state', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {

        updateQueueModeUI(data.queue_mode_enabled);
        try {
          ensurePersistQueueControl();
          const dropdown = document.getElementById('queue-dropdown');
          const persistEl = dropdown ? dropdown.querySelector('#persist-queue-enabled') : null;
          if (persistEl && typeof data.persist_queue_enabled !== 'undefined') {
            persistEl.checked = !!data.persist_queue_enabled;
          }
        } catch (_) {}

        const autoDeleteBtn = document.querySelector('.button3');
        if (autoDeleteBtn) {
          const color = data.auto_delete_enabled ? '#488b5b' : '#a42004';
          autoDeleteBtn.style.backgroundColor = color;
        }

        const autoSendBtn = document.querySelector('.button4');
        if (autoSendBtn) {
          const color = data.auto_send_enabled ? '#488b5b' : '#a42004';
          autoSendBtn.style.backgroundColor = color;
        }
      }
    })
    .catch(error => console.log('Error loading app state:', error));
  }
  
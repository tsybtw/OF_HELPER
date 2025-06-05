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

    if (!copyButton.dataset.clickCount || copyButton.dataset.clickCount % 2 === 0) {
        copyButton.style.backgroundColor = '#fbdf56';
        copyButton.dataset.clickCount = 1;
    } else {
        copyButton.style.backgroundColor = '#D26BFF';
        copyButton.dataset.clickCount++;
    }

    setTimeout(function() {
        copyButton.classList.remove('animate');
    }, 200);
}

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

        const mediaElement = document.getElementById(mediaId);
        if (!mediaElement) return;

        mediaElement.style.transform = `rotate(${rotationStates[mediaId]}deg)`;

        if (rotationStates[mediaId] % 180 === 0) {
            mediaElement.style.maxWidth = '310px';
            mediaElement.style.maxHeight = '';
        } else {
            mediaElement.style.maxWidth = '';
            mediaElement.style.maxHeight = '310px';
        }

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
            if (!copyButton.dataset.clickCount || copyButton.dataset.clickCount % 2 === 0) {
                copyButton.style.backgroundColor = '#6B8FFF';
                copyButton.dataset.clickCount = 1;
            } else {
                copyButton.style.backgroundColor = '#6BFF96';
                copyButton.dataset.clickCount++;
            }

            setTimeout(function() {
                copyButton.classList.remove('animate');
            }, 200);
        });
    };
    img.src = imgBase64;
}

async function copyVideoToClipboard(videoPath, event) {
    try {

        var copyButton = event.target;
        copyButton.classList.add('animate');
        if (!copyButton.dataset.clickCount || copyButton.dataset.clickCount % 2 === 0) {
            copyButton.style.backgroundColor = '#6B8FFF';
            copyButton.dataset.clickCount = 1;
        } else {
            copyButton.style.backgroundColor = '#6BFF96';
            copyButton.dataset.clickCount++;
        }

        setTimeout(function () {
            copyButton.classList.remove('animate');
        }, 200);

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
            statusElement.textContent = "Ошибка: " + error;
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

function updateHintCheckbox(chatId, hintKey, action = 'update', hintType = 'personal') {
    fetch('/update_hints', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            hint_key: hintKey,
            action: action,
            hint_type: hintType
        })
    })
    .then(response => response.json())
    .then(data => {

        const hintsContainer = document.getElementById('hints-container');
        const allCheckboxes = Array.from(hintsContainer.querySelectorAll('input[type="checkbox"]'));
        const allHintItems = Array.from(hintsContainer.querySelectorAll('.hint-item'));
        const checkboxId = `checkbox-${hintType}-${hintKey}`;

        if (action === 'delete') {
            const indexToRemove = allCheckboxes.findIndex(cb => cb.id === checkboxId);
            if (indexToRemove !== -1) {
                allHintItems[indexToRemove].remove();
            }
            const remainingKeys = hintsContainer.querySelectorAll('.hint-item');
            if (remainingKeys.length === 0) {
                hintsContainer.remove();
                return;
            }

            const newActiveCheckbox = hintsContainer.querySelector('input[type="checkbox"]');
            const newActiveItem = newActiveCheckbox.closest('.hint-item');

            allCheckboxes.forEach(cb => cb.checked = false);
            allHintItems.forEach(item => item.classList.remove('active'));

            newActiveCheckbox.checked = true;
            newActiveItem.classList.add('active');
            const hintsWrapper =  document.querySelector('.hints-wrapper');
            if (hintsContainer) {
                const remainingItems = hintsWrapper.children.length;
                if (remainingItems === 0) {
                    hintsContainer.remove();
                } else if (remainingItems < 2) {
                    const sortButtons = hintsContainer.querySelector('.sort-buttons');
                    sortButtons?.remove();
                }
            }

        } else {

            allCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
                checkbox.closest('.hint-item').classList.remove('active');
            });

            const currentMode = localStorage.getItem('sortMode') || 'usage';
            switchSortMode(currentMode);

            hintsContainer.querySelectorAll('.hint-item').forEach(item => {
                item.classList.remove('active');
                item.querySelector('input').checked = false;
            });

            const targetCheckboxId = `checkbox-${hintType}-${hintKey}`;
            const targetCheckbox = allCheckboxes.find(cb => cb.id === targetCheckboxId);

            if (targetCheckbox) {
                targetCheckbox.checked = true;
                targetCheckbox.closest('.hint-item').classList.add('active');
            }
        }
    })
    .catch(error => console.error('Error:', error));
}

function deleteHint(chatId, hintKey, hintType = 'personal') {
    updateHintCheckbox(chatId, hintKey, 'delete', hintType);
}

function saveHint(chatIdToUse, messageCount, hintType = 'personal') {
    const newHintInput = document.getElementById(hintType === 'personal' ? 'hint-input' : 'general-hint-input');
    const newHintKey = newHintInput.value.trim();

    if (!newHintKey) {
        alert('Пожалуйста, введите ключ');
        return;
    }

    fetch('/add-hint', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatIdToUse,
            hint_key: newHintKey,
            message_count: messageCount,
            hint_type: hintType
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const fullHintKey = data.full_hint_key;
            let hintsContainer = document.getElementById('hints-container');

            if (!hintsContainer) {
                hintsContainer = document.createElement('div');
                hintsContainer.id = 'hints-container';
                const hintItems = document.querySelectorAll('.hint-item');
                if (hintItems.length > 1) { 
                hintsContainer.innerHTML = `
                  <div class="sort-buttons">
                            <button onclick="switchSortMode('usage')" class="sort-btn active">
                                <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000" class="bi bi-sort-numeric-down-alt">
                                    <g id="SVGRepo_iconCarrier">
                                        <path fill-rule="evenodd" d="M11.36 7.098c-1.137 0-1.708-.657-1.762-1.278h1.004c.058.223.343.45.773.45.824 0 1.164-.829 1.133-1.856h-.059c-.148.39-.57.742-1.261.742-.91 0-1.72-.613-1.72-1.758 0-1.148.848-1.836 1.973-1.836 1.09 0 2.063.637 2.063 2.688 0 1.867-.723 2.848-2.145 2.848zm.062-2.735c.504 0 .933-.336.933-.972 0-.633-.398-1.008-.94-1.008-.52 0-.927.375-.927 1 0 .64.418.98.934.98z"/>
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
                    </div>
                    <div class="hints-wrapper"></div>
                `;
                }
                else {
                       hintsContainer.innerHTML = ` <div class="hints-wrapper"></div> `;
                }

                const chatSection = document.querySelector('.chat-section') || document.body;
                chatSection.appendChild(hintsContainer);
            }

            const hintsWrapper = hintsContainer.querySelector('.hints-wrapper');
            const checkboxId = `checkbox-${hintType}-${fullHintKey}`;

            const newHintItem = document.createElement('div');
            newHintItem.className = `hint-item ${hintType === 'general' ? 'general-hint' : ''}`;
            newHintItem.innerHTML = `
                <div class="hint-wrapper">
                    <input type="checkbox" 
                        id="${checkboxId}" 
                        onchange="updateHintCheckbox('${chatIdToUse}', '${fullHintKey}', 'update', '${hintType}')"
                        class="hint-checkbox"
                        checked>
                    <label for="${checkboxId}" 
                        class="hint-label ${hintType === 'general' ? 'general' : ''}">${fullHintKey}</label>
                    <button class="hint-delete-btn" 
                        onclick="deleteHint('${chatIdToUse}', '${fullHintKey}', '${hintType}')"
                        aria-label="Delete hint">
                        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                                    <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                                    <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                                    <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                                    <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                                    <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                                    <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                                    <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6 9v6a3,3 0 0 0 3 3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.59 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19 -3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0 0 1 0 -2H47a1,1 0 0 1 0 2Zm7 -43a1,1 0 0 1 -1 1H9a1,1 0 0 1 -1 -1V9A1,1 0 0 1 9 8H53a1,1 0 0 1 1 1Z"></path>
                                </svg>
                    </button>
                </div>
            `;

            hintsWrapper.querySelectorAll('.hint-item').forEach(item => {
                item.classList.remove('active');
                item.querySelector('input').checked = false;
            });

            newHintItem.classList.add('active');
            newHintItem.querySelector('input').checked = true;
            hintsWrapper.appendChild(newHintItem);
            const hintItems = document.querySelectorAll('.hint-item');
            if (hintItems.length > 1) {
                const sortButtons = hintsContainer.querySelector('.sort-buttons');
                if (!sortButtons) {
                    const sortHTML = `
                  <div class="sort-buttons">
                            <button onclick="switchSortMode('usage')" class="sort-btn active">
                                <svg width="24" height="24" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000" class="bi bi-sort-numeric-down-alt">
                                    <g id="SVGRepo_iconCarrier">
                                        <path fill-rule="evenodd" d="M11.36 7.098c-1.137 0-1.708-.657-1.762-1.278h1.004c.058.223.343.45.773.45.824 0 1.164-.829 1.133-1.856h-.059c-.148.39-.57.742-1.261.742-.91 0-1.72-.613-1.72-1.758 0-1.148.848-1.836 1.973-1.836 1.09 0 2.063.637 2.063 2.688 0 1.867-.723 2.848-2.145 2.848zm.062-2.735c.504 0 .933-.336.933-.972 0-.633-.398-1.008-.94-1.008-.52 0-.927.375-.927 1 0 .64.418.98.934.98z"/>
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
                    `;
                    hintsContainer.insertAdjacentHTML('afterbegin', sortHTML);
                }
            }

            const currentMode = localStorage.getItem('sortMode') || 'usage';
            switchSortMode(currentMode);
            newHintInput.value = '';
        }
        else {
            alert(data.message || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при добавлении ключа');
    });
}

function processContentLoader(button, messageData, client_id) {
    const currentReverseMode = localStorage.getItem('reverseMode') === 'true';
    const useReverseOrder = messageData.is_all_button ? currentReverseMode : messageData.reverse_order || false;
    
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
            updateActiveButton(button.dataset.number);
            localStorage.setItem('activeButtonNumber', button.dataset.number);
            localStorage.setItem('reverseMode', data.reverse_order ? 'true' : 'false');
        }
    })
    .catch(error => console.error('Error processing message:', error));
}

function updateActiveButton(activeNumber) {
    const buttons = document.querySelectorAll('.message-button');
    buttons.forEach(button => {
        if (button.dataset.number === activeNumber) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function parse_time(time_str) {
    const match = time_str.match(/^(\d+)([as])$/);
    if (!match) return null;

    let [_, digits, period] = match;
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
    .then(data => {
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
    .then(data => {
        showStatus(data.success ? "Success!" : "Error!");
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

document.addEventListener('DOMContentLoaded', () => {

    setupStatusMonitor();

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

    const activeNumber = localStorage.getItem('activeButtonNumber') || '0';
    updateActiveButton(activeNumber);

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
                confirmed: true
            })
        });

        const data = await response.json();
        
        if (data.success) {
            const mediaContainer = document.getElementById(mediaId)?.closest('.main-container');
            if (mediaContainer) {
                const copyButtons = mediaContainer.querySelectorAll('.copy-button');
                copyButtons.forEach(btn => btn.remove());
                let next = mediaContainer.nextElementSibling;
                while (next && next.classList.contains('copy-button')) {
                    let toRemove = next;
                    next = next.nextElementSibling;
                    toRemove.remove();
                }
                mediaContainer.remove();
            }
            const textBlock = document.getElementById(`text-block-${messageIndex}`);
            if (textBlock) {
                textBlock.remove();
            }
            const lenMessagesDiv = document.querySelector('.len-messages');
            let newNumber = null;
            if (lenMessagesDiv) {
                const parts = lenMessagesDiv.textContent.split('/');
                const currentCount = parseInt(parts[0]);
                const totalCount = parseInt(parts[1]);
                lenMessagesDiv.textContent = `${currentCount - 1} / ${totalCount - 1}`;
                newNumber = currentCount - 1;
            }

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

            if (newNumber !== null) {
                const hintsContainer = document.getElementById('hints-container');
                if (hintsContainer) {
                    let nowFlag = true;
                    const hintsDataScript = document.getElementById('hints-data');
                    if (hintsDataScript) {
                        try {
                            const hintsData = JSON.parse(hintsDataScript.textContent);
                            const chatIdKey = Object.keys(hintsData).find(k => k.trim() === chatId);
                            if (chatIdKey && hintsData[chatIdKey] && typeof hintsData[chatIdKey].now !== 'undefined') {
                                nowFlag = hintsData[chatIdKey].now;
                            }
                        } catch {}
                    }
                    const hintLabels = hintsContainer.querySelectorAll('.hint-label');
                    hintLabels.forEach(label => {
                        const parts = label.textContent.split(' ');
                        if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
                            const old_number = parseInt(parts[1]);
                            let new_number = old_number;
                            if (nowFlag === true) {
                                new_number = old_number - 1;
                            } else if (nowFlag === false) {
                                new_number = old_number - 2;
                            }
                            parts[1] = String(new_number);
                            label.textContent = parts.join(' ');
                        }
                    });
                }
            }
        } else {
            console.error('Failed to delete media:', data.error);
        }
    } catch (error) {
        console.error('Error deleting media:', error);
    }
}

function createHintItem(hint, isChecked, chatId, hintType) {
    const div = document.createElement('div');
    div.className = `hint-item ${hintType === 'general' ? 'general-hint' : ''} ${isChecked ? 'active' : ''}`;
    
    div.innerHTML = `
        <div class="hint-wrapper">
            <input type="checkbox" 
                id="checkbox-${hintType}-${hint}" 
                ${isChecked ? 'checked' : ''} 
                onchange="updateHintCheckbox('${chatId}', '${hint}', 'update', '${hintType}')"
                class="hint-checkbox">
            <label for="checkbox-${hintType}-${hint}" class="hint-label ${hintType === 'general' ? 'general' : ''}">${hint}</label>
            <button 
                class="hint-delete-btn" 
                onclick="deleteHint('${chatId}', '${hint}', '${hintType}')"
                aria-label="Delete ${hintType} hint">
                <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="32" height="32" viewBox="0 0 64 64">
                    <rect width="48" height="10" x="7" y="7" fill="#f9e3ae" rx="2" ry="2"></rect>
                    <rect width="36" height="4" x="13" y="55" fill="#f9e3ae" rx="2" ry="2"></rect>
                    <path fill="#c2cde7" d="M47 55L15 55 10 17 52 17 47 55z"></path>
                    <path fill="#ced8ed" d="M25 55L15 55 10 17 24 17 25 55z"></path>
                    <path fill="#b5c4e0" d="M11,17v2a3,3 0,0,0 3,3H38L37,55H47l5-38Z"></path>
                    <path fill="#8d6c9f" d="M16 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 16 10zM11 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 11 10zM21 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 21 10zM26 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 26 10zM31 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 31 10zM36 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 36 10zM41 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 41 10zM46 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 46 10zM51 10a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0V11A1 1 0 0 0 51 10z"></path>
                    <path fill="#8d6c9f" d="M53,6H9A3,3 0 0 0 6 9v6a3,3 0 0 0 3 3c0,.27 4.89 36.22 4.89 36.22A3 3 0 0 0 15 60H47a3,3 0 0 0 1.11 -5.78l2.28 -17.3a1 1 0 0 0 .06 -.47L52.92 18H53a3,3 0 0 0 3 -3V9A3,3 0 0 0 53 6ZM24.59 18l5 5 -4.78 4.78a1 1 0 1 0 1.41 1.41L31 24.41 37.59 31 31 37.59l-7.29 -7.29h0l-5.82 -5.82a1 1 0 0 0 -1.41 1.41L21.59 31l-7.72 7.72L12.33 27.08 21.41 18Zm16 0 3.33 3.33a1 1 0 0 0 1.41 -1.41L43.41 18h7.17L39 29.59 32.41 23l5 -5Zm-11 21L23 45.59l-5.11 -5.11a1 1 0 0 0 -1.41 1.41L21.59 47l-5.86 5.86L14.2 41.22l8.8 -8.8Zm7.25 4.42L32.41 39 39 32.41l5.14 5.14a1 1 0 0 0 1.41 -1.41L40.41 31 47 24.41l2.67 2.67 -1.19 9L38.3 46.28h0L31 53.59 24.41 47 31 40.41l4.42 4.42a1 1 0 0 0 1.41 -1.41ZM23 48.41 28.59 54H17.41Zm16 0L44.59 54H33.41ZM40.41 47 48 39.37 46.27 52.86ZM50 24.58 48.41 23l2.06 -2.06Zm-19 -3L27.41 18h7.17Zm-19.47 -.64L13.59 23 12 24.58Zm3.47 .64L11.41 18h7.17ZM47 58H15a1,1 0 0 1 0 -2H47a1,1 0 0 1 0 2Zm7 -43a1,1 0 0 1 -1 1H9a1,1 0 0 1 -1 -1V9A1,1 0 0 1 9 8H53a1,1 0 0 1 1 1Z"></path>
                </svg>
            </button>
        </div>
    `;
    
    return div;
}
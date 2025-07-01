// script.js

// Global variables
let currentGroup = null; // Current group object being viewed
let editingItem = null; // If in edit mode, the item object being edited
let isLoggedIn = false; // Whether the user is logged in (for admin)
let isAdmin = false;    // Whether the user is an admin
let allGlobalPlayers = []; // Tüm oyuncuları tutmak için global değişken

/**
 * Sends a request to the PHP API on the server.
 * @param {string} action - The action to be called in the API (e.g., 'getGroups', 'createGroup').
 * @param {string} method - HTTP method ('GET', 'POST'). Defaults to 'GET'.
 * @param {object|null} data - JSON data to be sent. Defaults to null.
 * @returns {Promise<object>} JSON response from the API.
 */
async function apiCall(action, method = 'GET', data = null) {
    let url = `api.php?action=${action}`;
    const options = {
        method: method,
    };

    // For GET or HEAD methods, add data to URL query parameters
    if (method === 'GET' || method === 'HEAD') {
        if (data) {
            const params = new URLSearchParams(data).toString();
            url += `&${params}`; // Append parameters to the URL
        }
    } else {
        // For other methods (POST, PUT, DELETE), add data as JSON to the request body
        if (data) {
            options.headers = {
                'Content-Type': 'application/json',
            };
            options.body = JSON.stringify(data);
        }
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status code: ${response.status}`);
        }
        const result = await response.json();
        if (!result.success) {
            // Use the error message from the API
            throw new Error(result.message || 'API operation failed.');
        }
        return result;
    } catch (error) {
        console.error('API Call Error:', error);
        showToast(error.message || 'An error occurred.', 'error');
        return { success: false, message: error.message };
    }
}

/**
 * Displays short-term notification messages to the user (toast).
 * @param {string} message - The message to display.
 * @param {'success' | 'error' | 'warning' | 'info'} type - The type of notification (for CSS class).
 */
function showToast(message, type) {
    const toastContainer = document.getElementById('toast-container') || (() => {
        const div = document.createElement('div');
        div.id = 'toast-container';
        document.body.appendChild(div);
        return div;
    })();

    const toast = document.createElement('div');
    toast.classList.add('toast', type);
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

/**
 * Formats a currency value as 000.000,000.
 * @param {number} value - The numerical value to format.
 * @returns {string} The formatted currency string.
 */
function formatCurrency(value) {
    // Return "0,000" for invalid or empty values
    if (value === null || typeof value === 'undefined' || isNaN(value)) {
        return '0,000';
    }
    // Format the number with Turkish locale (tr-TR) with 3 decimal places
    return parseFloat(value).toLocaleString('tr-TR', {
        minimumFractionDigits: 3, // Minimum 3 decimal places
        maximumFractionDigits: 3, // Maximum 3 decimal places
        useGrouping: true         // Use thousand separators (defaults to dot)
    });
}

// ---------------- AUTHENTICATION ----------------
/**
 * Opens the admin login modal.
 */
function openAdminLoginModal() {
    const adminLoginModal = document.getElementById('adminLoginModal');
    if (adminLoginModal) {
        adminLoginModal.classList.add('active');
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
            const loginUsernameInput = document.getElementById('loginUsername');
            if (loginUsernameInput) {
                loginUsernameInput.focus();
            }
        }
    }
}

/**
 * Closes the admin login modal.
 */
function closeAdminLoginModal() {
    const adminLoginModal = document.getElementById('adminLoginModal');
    if (adminLoginModal) {
        adminLoginModal.classList.remove('active');
    }
}

/**
 * Checks the user's login status from the server and updates the UI.
 */
async function checkAuthStatusAndUpdateUI() {
    try {
        const response = await fetch('auth.php');
        const result = await response.json();

        isLoggedIn = result.success;
        isAdmin = isLoggedIn && result.user.role === 'admin';

        // Update UI elements
        const authControlsDiv = document.querySelector('.auth-controls');
        if (authControlsDiv) {
            if (isLoggedIn) {
                // HTML for logged-in admin
                authControlsDiv.innerHTML = `
                    Hoş geldin, <span class="username">${result.user.username}</span> (${isAdmin ? 'Yönetici' : 'Kullanıcı'})
                    <button id="logoutButton" class="btn btn-danger btn-sm"><i class="fas fa-sign-out-alt"></i> Çıkış Yap</button>
                `;
                const logoutButton = document.getElementById('logoutButton');
                if (logoutButton) { // Null check added
                    logoutButton.addEventListener('click', handleLogout);
                }
                closeAdminLoginModal(); // Close modal if login is successful
            } else {
                // HTML for not logged-in state
                authControlsDiv.innerHTML = `
                    <button id="openLoginModalBtn" class="btn btn-primary btn-sm"><i class="fas fa-sign-in-alt"></i> Yönetici Girişi</button>
                `;
                const openLoginModalBtn = document.getElementById('openLoginModalBtn');
                if (openLoginModalBtn) { // Null check added
                    openLoginModalBtn.addEventListener('click', openAdminLoginModal);
                }
            }
        }
        
        // Dynamically set visibility of admin-specific sections
        document.querySelectorAll('.hidden-for-non-admin').forEach(el => {
            el.style.display = isAdmin ? '' : 'none'; // Use default display value
        });
        document.querySelectorAll('.full-width-for-non-admin').forEach(el => {
            el.style.gridColumn = isAdmin ? '' : '1 / -1'; // Set grid column
        });

        // Handle player management tab and section visibility
        // These elements only exist in the DOM if isAdmin is true in index.php
        const playersTab = document.getElementById('tab-players');
        const playersSection = document.getElementById('players-section');

        // Only proceed if playersTab exists (meaning the user is an admin as per PHP structure)
        if (playersTab) {
            // Also ensure playersSection exists to be safe
            if (playersSection) {
                // Safely check classList.contains only if playersTab.classList is available
                if (playersTab.classList && playersTab.classList.contains('active')) {
                    if (isAdmin) {
                        await renderPlayers();
                    } else {
                        // This scenario should ideally not happen if PHP hides the tab for non-admins,
                        // but if it somehow becomes visible and active for a non-admin, show message.
                        playersSection.innerHTML = '<p style="text-align: center; margin-top: 50px;">Bu bölümü görüntüleme yetkiniz yok.</p>';
                    }
                }
            } else {
                console.warn('Players tab found, but players section not found. HTML structure might be inconsistent.');
            }
        }
        // If playersTab does not exist (e.g., for non-admin users), no action needed here for rendering players or error message.
        // The display will be managed by the hidden-for-non-admin class via PHP.

    } catch (error) {
        console.error('checkAuthStatusAndUpdateUI error:', error);
        isLoggedIn = false;
        isAdmin = false;
        showToast('Authentication status could not be checked.', 'error');
    }
}


/**
 * Handles the admin login process.
 * @param {Event} e - Form submit event.
 */
async function handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');

    if (!usernameInput || !passwordInput) {
        showToast('Login form elements not found.', 'error');
        return;
    }

    const username = usernameInput.value;
    const password = passwordInput.value;

    const formData = new FormData();
    formData.append('action', 'login');
    formData.append('username', username);
    formData.append('password', password);

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (result.success) {
            showToast('Login successful!', 'success');
            await checkAuthStatusAndUpdateUI(); // Update UI
            await renderGroupList(); // Reload group with admin privileges
            // No need to fully refresh the page, managed dynamically with JS
        } else {
            showToast(result.message || 'Login failed.', 'error');
        }
    } catch (error) {
        showToast('An error occurred during the login request.', 'error');
        console.error('Login error:', error);
    }
}

/**
 * Handles the user logout process.
 */
async function handleLogout() {
    const formData = new FormData();
    formData.append('action', 'logout');

    try {
        const response = await fetch('auth.php', {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (result.success) {
            showToast('Logout successful!', 'info');
            await checkAuthStatusAndUpdateUI(); // Update UI (admin login button appears)
            await renderGroupList(); // Reload group as admin privileges are removed
        } else {
            showToast(result.message || 'Logout failed.', 'error');
        }
    } catch (error) {
        showToast('An error occurred during the logout request.', 'error');
        console.error('Logout error:', error);
    }
}

// ---------------- When DOM is Loaded ----------------
document.addEventListener('DOMContentLoaded', async () => {
    // Uygulama yüklendiğinde tüm oyuncuları çek
    await fetchAllGlobalPlayers(); 
    await checkAuthStatusAndUpdateUI();

    // Add event listeners to navigation buttons
    document.querySelectorAll('.app-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.app-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Hide all sections
            document.querySelectorAll('.app-content section').forEach(sec => sec.classList.remove('active'));

            const targetSectionId = btn.id.replace('tab-', '') + '-section';
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) { // Null check added
                targetSection.classList.add('active');
            }

            if (btn.id === 'tab-players') renderPlayers();
            if (btn.id === 'tab-report') renderReport();
            if (btn.id === 'tab-global-receivables') renderGlobalReceivables(); // New tab
        });
    });

    // Admin login modal open button listener (visible on initial load)
    // Bu listener'ın checkAuthStatusAndUpdateUI tarafından tekrar eklenmesi gerektiği unutulmamalıdır.
    // Bu ilk ekleme, sayfa yüklendiğinde butonun DOM'da var olup olmamasına göre çalışır.
    // auth-controls'un innerHTML'i değiştiğinde eski listener kaybolur, yenisi checkAuthStatusAndUpdateUI içinde eklenir.
    const openLoginModalBtn = document.getElementById('openLoginModalBtn');
    if (openLoginModalBtn) {
        openLoginModalBtn.addEventListener('click', openAdminLoginModal);
    }

    // Admin login form submit listener
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // On application load, display the group list by default
    await renderGroupList();
});


/**
 * Fetches all global players and stores them in allGlobalPlayers.
 */
async function fetchAllGlobalPlayers() {
    try {
        const result = await apiCall('getPlayers');
        if (result.success && result.players) {
            allGlobalPlayers = result.players;
        } else {
            console.error('Failed to fetch global players:', result.message);
            showToast('Global oyuncular yüklenemedi.', 'error');
        }
    } catch (error) {
        console.error('Error fetching global players:', error);
        showToast('Global oyuncular yüklenirken bir hata oluştu.', 'error');
    }
}

// ---------------- GROUP MANAGEMENT ----------------
/**
 * Creates a new farm group. Only administrators can do this.
 */
async function createGroup() {
    if (!isAdmin) {
        showToast('You do not have administrative privileges to perform this action.', 'error');
        return;
    }
    const nameInput = document.getElementById('newGroupName');
    const playersInput = document.getElementById('newGroupPlayers');

    if (!nameInput || !playersInput) { // Null check added
        showToast('Group creation form elements not found.', 'error');
        return;
    }

    const name = nameInput.value.trim();
    const playersRaw = playersInput.value.trim();

    if (!name) {
        showToast('Grup adı boş bırakılamaz.', 'warning');
        return;
    }
    if (!playersRaw) {
        showToast('Oyuncu adları boş bırakılamaz.', 'warning');
        return;
    }

    const playerNames = playersRaw.split(',').map(p => p.trim()).filter(p => p);
    if (playerNames.length === 0) {
        showToast('Lütfen geçerli oyuncu adları girin.', 'warning');
        return;
    }

    const result = await apiCall('createGroup', 'POST', { name: name, players: playerNames });
    if (result.success) {
        nameInput.value = '';
        playersInput.value = '';
        await renderGroupList(); // Refresh list
        if (result.groupId) {
            await openGroupDetail(result.groupId); // Open the newly created group
        }
        showToast(result.message, 'success');
    }
}

/**
 * Fetches the group list from the server and renders it to the DOM.
 */
async function renderGroupList() {
    const list = document.getElementById('groupList');
    const searchInput = document.getElementById('searchGroup');
    
    if (!list) return; // Null check added for groupList

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    list.innerHTML = '';
    const groupDetail = document.getElementById('groupDetail');
    if (groupDetail) { // Null check added
        groupDetail.innerHTML = ''; // Clear detail section
    }

    const result = await apiCall('getGroups');
    if (!result.success || !result.groups) {
        list.innerHTML = '<p style="text-align: center; color: #777; margin-top: 20px;">Gruplar yüklenemedi.</p>';
        return;
    }

    const groups = result.groups.filter(g => g.name.toLowerCase().includes(searchTerm));

    if (groups.length === 0) {
        list.innerHTML = `<p style="text-align: center; color: #777; margin-top: 20px;">${searchTerm ? 'Hiç grup bulunamadı.' : 'Henüz hiç grup oluşturulmadı.'}</p>`;
        currentGroup = null; // Reset currentGroup if no groups
        return;
    }

    let groupToDisplay = null;
    // If there was a previously selected group and it's still in search results, display it
    if (currentGroup && groups.some(g => g.id === currentGroup.id)) {
        groupToDisplay = currentGroup;
    } else {
        // Otherwise, display the first group in the filtered results
        if (groups.length > 0) { // Ensure there's a group to display
            groupToDisplay = groups[0];
        }
    }

    groups.forEach(g => {
        const div = document.createElement('div');
        div.classList.add('group-item');
        if (groupToDisplay && g.id === groupToDisplay.id) {
            div.classList.add('active-group'); // Highlight selected group
        }
        div.innerHTML = `<strong>${g.name}</strong><br><small>${g.player_count} oyuncu, ${g.item_count} item</small>`;
        div.onclick = async () => await openGroupDetail(g.id); // Open details on click
        list.appendChild(div);
    });

    // Update detail view
    if (groupToDisplay) {
        await openGroupDetail(groupToDisplay.id);
    } else {
        if (groupDetail) { // Null check added
            groupDetail.innerHTML = '<p style="text-align: center; color: #777; margin-top: 20px;">Lütfen bir grup seçin veya yeni bir grup oluşturun.</p>';
        }
        currentGroup = null;
    }
}

/**
 * Fetches the details of a specific group from the server and renders them to the DOM.
 * @param {number} id - The ID of the group.
 */
async function openGroupDetail(id) {
    const groupDetailDiv = document.getElementById('groupDetail');
    if (!groupDetailDiv) return; // Null check

    // For 'getGroupDetail' action, use GET method and add data to URL
    const result = await apiCall('getGroupDetail', 'GET', { id: id });
    if (!result.success || !result.group) {
        showToast('Grup detayları yüklenemedi.', 'error');
        groupDetailDiv.innerHTML = '<p style="text-align: center; color: #777; margin-top: 20px;">Grup detayları yüklenirken bir hata oluştu.</p>';
        currentGroup = null;
        return;
    }
    currentGroup = result.group; // Update global currentGroup variable

    // Remove active highlight from all group items, then add to the selected one
    document.querySelectorAll('.group-item').forEach(item => {
        item.classList.remove('active-group');
    });
    const selectedGroupDiv = Array.from(document.querySelectorAll('.group-item')).find(div => {
        const strongElement = div.querySelector('strong');
        return strongElement && strongElement.textContent === currentGroup.name;
    });
    if (selectedGroupDiv) {
        selectedGroupDiv.classList.add('active-group');
    }

    // Show/hide buttons based on authorization
    const deleteBtnHtml = isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteGroup(${currentGroup.id})"><i class="fas fa-trash-alt"></i> Grubu Sil</button>` : '';
    const addItemBtnHtml = isAdmin ? `<button class="btn btn-primary" onclick="openItemModal()" style="margin-top:25px;"><i class="fas fa-plus"></i> Yeni Item Ekle</button>` : '';


    const html = `
        <div class="section-header">
            <h2><i class="fas fa-users"></i> Grup: ${currentGroup.name}</h2>
            ${deleteBtnHtml}
        </div>
        <p><i class="fas fa-users-line"></i> Oyuncular: ${currentGroup.players.map(p => p.name).join(', ')}</p>
        <div class="summary-cards">
            ${summary('Toplam Item', currentGroup.items.length, 'fas fa-box')}
            ${summary('Toplam Değer', formatCurrency(sumRaw(currentGroup.items, 'price')), 'fas fa-hand-holding-usd')}
            ${summary('Bekleyen Satış', formatCurrency(sumRaw(currentGroup.items.filter(i => i.status !== 'sold'), 'price')), 'fas fa-hourglass-half')}
            ${summary('Tamamlanan Satış', formatCurrency(sumGroupItemsSold(currentGroup)), 'fas fa-check-circle')}
        </div>
        ${addItemBtnHtml}
        ${renderItemsTable()}
        ${await oyuncuPayTablosu()}
    `;
    groupDetailDiv.innerHTML = html;
}

/**
 * Deletes a group from the server. Only administrators can do this.
 * @param {number} id - The ID of the group to delete.
 */
async function deleteGroup(id) {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        return;
    }
    // Using a custom modal/confirmation instead of browser's default confirm()
    showCustomConfirm('Bu grubu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.', async () => {
        const result = await apiCall('deleteGroup', 'POST', { id: id });
        if (result.success) {
            showToast(result.message, 'success');
            currentGroup = null; // The deleted group no longer exists
            await renderGroupList(); // Redraw the list, selecting the first group if any
        }
    });
}

/**
 * Creates an HTML string for summary cards.
 * @param {string} title - Card title.
 * @param {string|number} val - Card value.
 * @param {string} iconClass - Font Awesome icon class.
 * @returns {string} HTML string.
 */
function summary(title, val, iconClass) {
    return `
        <div class="summary-card">
            <h3><i class="${iconClass}"></i> ${title}</h3>
            <div class="val">${val}</div>
        </div>
    `;
}

/**
 * Sums the values of a specific key within an array and formats them.
 * @param {Array<object>} arr - Array of objects to sum.
 * @param {string} key - The key of the value to be summed.
 * @returns {string} Formatted total value.
 */
function sum(arr, key) {
    // Calculate the sum and format it with formatCurrency
    return formatCurrency(arr.reduce((t, x) => t + (parseFloat(x[key]) || 0), 0));
}

/**
 * Sums the values of a specific key within an array (returns raw number).
 * This function returns the summed value itself, without formatting.
 * @param {Array<object>} arr - Array of objects to sum.
 * @param {string} key - The key of the value to be summed.
 * @returns {number} Raw total value.
 */
function sumRaw(arr, key) {
    return arr.reduce((t, x) => t + (parseFloat(x[key]) || 0), 0);
}

/**
 * Sums the total price of items that have 'sold' status in a given group.
 * @param {object} group - The group object containing 'items'.
 * @returns {number} The total price of sold items.
 */
function sumGroupItemsSold(group) {
    if (!group || !group.items) return 0;
    return group.items.filter(item => item.status === 'sold')
                      .reduce((total, item) => total + (parseFloat(item.price) || 0), 0);
}


// ---------------- ITEM TABLE ----------------
/**
 * Renders the table containing group items.
 * Only shows edit/delete buttons to administrators.
 * @returns {string} HTML string.
 */
function renderItemsTable() {
    if (!currentGroup || !currentGroup.items.length) {
        return '<p style="text-align: center; color: #777; margin-top: 20px;">Bu grupta henüz item yok.</p>';
    }
    // If admin, show action header and buttons
    const actionButtonsHeader = isAdmin ? '<th>İşlem</th>' : '';
    const actionButtonsRow = (itemIndex) => isAdmin ? `
        <td class="action-buttons">
            <button class="btn btn-primary btn-sm" onclick="editItem(${itemIndex})" title="Düzenle"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm" onclick="deleteItem(${itemIndex})" title="Sil"><i class="fas fa-trash-alt"></i></button>
        </td>` : '';

    return `
        <h3 style="margin-top:30px;"><i class="fas fa-boxes"></i> Grup Itemları</h3>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Item Adı</th>
                        <th>Fiyat</th>
                        <th>Satıcı</th>
                        <th>Durum</th>
                        <th>Tarih</th>
                        ${actionButtonsHeader}
                    </tr>
                </thead>
                <tbody>
                    ${currentGroup.items.map((it, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${it.name}</td>
                            <td>${it.price ? formatCurrency(it.price) : '-'}</td>
                            <td>${it.seller_name || 'Yok'}</td> <!-- Seller can be null -->
                            <td><span class="tag ${it.status}">${statusText(it.status)}</span></td>
                            <td>${it.date}</td>
                            ${actionButtonsRow(i)}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Returns the item status text.
 * @param {string} status - The status of the item.
 * @returns {string} Turkish text equivalent of the status.
 */
function statusText(status) {
    switch (status) {
        case 'pending': return 'Beklemede';
        case 'sold': return 'Satıldı';
        case 'reserved': return 'Rezerve';
        default: return status;
    }
}

/**
 * Calculates shares for group members and seller based on item price.
 * @param {Array<object>} groupPlayers - Players in the current group.
 * @param {number} itemPrice - Original price of the item.
 * @param {number|null} sellerId - ID of the seller (can be null if no seller).
 * @returns {{groupShares: Object, sellerBonus: number}} Object containing group player shares and seller bonus.
 * groupShares is an object mapping player ID to their share.
 */
function calculateShares(groupPlayers, itemPrice, sellerId) {
    const shares = {}; // Stores shares for group members
    let sellerBonus = 0; // Seller's extra half share

    if (!itemPrice || itemPrice <= 0) {
        return { groupShares: shares, sellerBonus: 0 };
    }

    const numGroupMembers = groupPlayers.length;
    let remainingAmount = itemPrice;

    // Check if the seller is one of the group members
    const sellerIsGroupMember = groupPlayers.some(p => p.id == sellerId);

    if (sellerId !== null) {
        // Calculate the base unit value considering the seller's extra 0.5 share
        const totalEffectiveUnits = numGroupMembers + 0.5; // Each member 1 unit, seller an additional 0.5 unit
        const unitValue = itemPrice / totalEffectiveUnits;

        sellerBonus = 0.5 * unitValue; // Seller's additional half share
        remainingAmount = itemPrice - sellerBonus; // Amount left for equal distribution among group members
    }

    // Distribute the remaining amount equally among all group members
    const equalSharePerGroupMember = numGroupMembers > 0 ? remainingAmount / numGroupMembers : 0;

    groupPlayers.forEach(p => {
        shares[p.id] = equalSharePerGroupMember;
    });

    return { groupShares: shares, sellerBonus: sellerBonus };
}


/**
 * Renders the table showing players' total earnings, given payments, and remaining payments.
 * @returns {Promise<string>} HTML string.
 */
async function oyuncuPayTablosu() {
    if (!currentGroup || !currentGroup.items.length) {
        return '';
    }

    // `playerTotalEarnings` will store total earnings for ALL relevant players (group members + external sellers)
    const playerTotalEarnings = {};
    const groupPlayers = currentGroup.players; 

    // Initialize each group player with 0 total earnings
    groupPlayers.forEach(p => playerTotalEarnings[p.id] = { name: p.name, total: 0 }); 

    // Calculate earnings for each sold item
    currentGroup.items.forEach(item => {
        if (item.price && item.status === 'sold') {
            const { groupShares, sellerBonus } = calculateShares(groupPlayers, parseFloat(item.price), item.seller_id);

            // Add group members' shares
            Object.keys(groupShares).forEach(playerId => {
                if (playerTotalEarnings[playerId]) { // Ensure player exists in our tracking object
                    playerTotalEarnings[playerId].total += groupShares[playerId];
                } else {
                    // This scenario shouldn't happen if groupPlayers init is correct, but as fallback
                    const player = allGlobalPlayers.find(p => p.id == playerId);
                    if (player) {
                         playerTotalEarnings[playerId] = { name: player.name, total: groupShares[playerId] };
                    }
                }
            });

            // Add seller's bonus if a seller exists
            if (item.seller_id !== null && sellerBonus > 0) {
                const seller = allGlobalPlayers.find(p => p.id == item.seller_id);
                if (seller) {
                    // If seller is already in playerTotalEarnings (as a group member or previously added external seller), add bonus to existing total
                    if (playerTotalEarnings[seller.id]) {
                        playerTotalEarnings[seller.id].total += sellerBonus;
                    } else { // If seller is NOT a group member and not previously added, add them as a new entry
                        playerTotalEarnings[seller.id] = {
                            name: seller.name,
                            total: sellerBonus
                        };
                    }
                }
            }
        }
    });

    // Fetch paid amounts for players from the API
    const paidAmountsResult = await apiCall('getPaidAmounts', 'GET', { groupId: currentGroup.id });
    const playerPaidAmounts = paidAmountsResult.success ? paidAmountsResult.paidAmounts : {};

    const rows = Object.entries(playerTotalEarnings) // Use playerTotalEarnings for rendering
        .sort(([, a], [, b]) => b.total - a.total) // Sort by total earnings
        .map(([playerId, data], i) => {
            const totalPay = data.total; // This is the calculated total earnings
            // Retrieve paid amount for this player from the API result
            const givenPay = playerPaidAmounts[playerId] ? parseFloat(playerPaidAmounts[playerId]) : 0;
            const remainingPay = totalPay - givenPay; // Calculate remaining payment

            // Checkbox status: Checked if Given Pay == Total Pay
            const isFullyPaid = (Math.abs(givenPay - totalPay) < 0.001); // Small tolerance for floating point precision

            // Show given pay input for admin, just the value for regular user
            const givenPayInputHtml = isAdmin ? `
                <input type="number"
                       class="given-pay-input"
                       value="${givenPay.toFixed(3)}"
                       data-player-id="${playerId}"
                       data-group-id="${currentGroup.id}"
                       data-original-value="${givenPay.toFixed(3)}"
                       onchange="updateGivenPay(this)">
            ` : `<span>${formatCurrency(givenPay)}</span>`;

            // Show checkbox for admin, static checkbox for regular user
            const paidCheckboxHtml = isAdmin ? `
                <input type="checkbox"
                       class="paid-checkbox"
                       ${isFullyPaid ? 'checked' : ''}
                       data-player-id="${playerId}"
                       data-group-id="${currentGroup.id}"
                       data-total-pay="${totalPay.toFixed(3)}"
                       onchange="togglePaidStatus(this)">
            ` : `<input type="checkbox" ${isFullyPaid ? 'checked' : ''} disabled>`;


            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${data.name}</td>
                    <td>${givenPayInputHtml}</td>
                    <td>${paidCheckboxHtml}</td> <!-- New "Paid" checkbox -->
                    <td class="${remainingPay < 0 ? 'negative-pay' : ''}">${formatCurrency(remainingPay)}</td>
                    <td>${formatCurrency(totalPay)}</td>
                </tr>
            `;
        })
        .join('');

    return `
        <h3 style="margin-top:30px;"><i class="fas fa-sack-dollar"></i> Oyuncu Toplam Kazançları (Satıcı Dahil)</h3>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Oyuncu</th>
                        <th>Verilen Pay</th>
                        <th>Verildi</th> <!-- New table header -->
                        <th>Kalan Pay</th>
                        <th>Toplam Pay</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="6" style="text-align: center;">Satış henüz yapılmadı veya oyuncu kazançları hesaplanamadı.</td></tr>'}</tbody>
            </table>
        </div>
    `;
}

/**
 * Updates the given payment for a player (admin only).
 * @param {HTMLInputElement} inputElement - The "Given Pay" input element.
 */
async function updateGivenPay(inputElement) {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        // If not admin, revert input to original value
        inputElement.value = parseFloat(inputElement.dataset.originalValue || 0).toFixed(3);
        return;
    }

    const playerId = inputElement.dataset.playerId;
    const groupId = inputElement.dataset.groupId;
    const newGivenPay = parseFloat(inputElement.value);

    // Check if input is a valid number
    if (isNaN(newGivenPay) || newGivenPay < 0) {
        showToast('Lütfen geçerli bir sayı girin.', 'warning');
        // Revert to old value on invalid input
        inputElement.value = parseFloat(inputElement.dataset.originalValue || 0).toFixed(3);
        return;
    }

    // Update the original value (last valid value of input)
    inputElement.dataset.originalValue = newGivenPay.toFixed(3); // Store updated value

    // Send update request to API
    const result = await apiCall('updatePaidAmount', 'POST', {
        groupId: groupId,
        playerId: playerId,
        amount: newGivenPay
    });

    if (result.success) {
        showToast('Verilen pay başarıyla güncellendi.', 'success');
        await openGroupDetail(currentGroup.id); // Reload group details to update remaining payment
    } else {
        // On error, revert input to original value
        inputElement.value = parseFloat(inputElement.dataset.originalValue || 0).toFixed(3);
        showToast(result.message || 'Verilen pay güncellenemedi.', 'error');
    }
}

/**
 * Toggles a player's paid status (with checkbox).
 * Only administrators can do this.
 * @param {HTMLInputElement} checkboxElement - The checkbox element.
 */
async function togglePaidStatus(checkboxElement) {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        checkboxElement.checked = !checkboxElement.checked; // Revert checkbox status
        return;
    }

    const playerId = checkboxElement.dataset.playerId;
    const groupId = checkboxElement.dataset.groupId;
    const totalPay = parseFloat(checkboxElement.dataset.totalPay);

    let newAmount;
    if (checkboxElement.checked) {
        newAmount = totalPay; // Set as fully paid
    } else {
        newAmount = 0; // Set as not paid (or old "Given Pay" value, 0 is simpler for this scenario)
    }

    // Update amount via updatePaidAmount API call
    const result = await apiCall('updatePaidAmount', 'POST', {
        groupId: groupId,
        playerId: playerId,
        amount: newAmount
    });

    if (result.success) {
        showToast('Ödenen durum başarıyla güncellendi.', 'success');
        await openGroupDetail(currentGroup.id); // Reload UI to update the entire table
    } else {
        // On error, revert checkbox status
        checkboxElement.checked = !checkboxElement.checked;
        showToast(result.message || 'Ödenen durum güncellenemedi.', 'error');
    }
}

// ---------------- ITEM MODAL ----------------
/**
 * Opens the item add/edit modal. Only administrators can do this.
 * @param {object|null} item - Item object to edit, null for new item.
 */
async function openItemModal(item = null) {
    if (!isAdmin) {
        showToast('Item ekleme/düzenleme izniniz yok.', 'error');
        return;
    }
    editingItem = item; // Assign the item being edited to the global variable

    const modalItemName = document.getElementById('modalItemName');
    const modalPrice = document.getElementById('modalPrice');
    const modalSeller = document.getElementById('modalSeller');
    const modalStatus = document.getElementById('modalStatus');
    const itemModalTitle = document.getElementById('itemModalTitle');
    const itemModal = document.getElementById('itemModal');

    if (!modalItemName || !modalPrice || !modalSeller || !modalStatus || !itemModalTitle || !itemModal) {
        showToast('Item modal elementleri bulunamadı.', 'error');
        return;
    }

    modalItemName.value = item ? item.name : '';
    modalPrice.value = item ? parseFloat(item.price) : ''; 
    
    modalSeller.innerHTML = ''; // Clear previous seller options

    // Add a default "Satıcı Seçin (Opsiyonel)" option
    const defaultOption = document.createElement('option');
    defaultOption.value = ''; // Empty value for no seller
    defaultOption.textContent = 'Satıcı Seçin (Opsiyonel)';
    modalSeller.appendChild(defaultOption);

    // Populate the seller dropdown with ALL global players
    if (allGlobalPlayers && allGlobalPlayers.length > 0) {
        allGlobalPlayers.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id; // Use player ID as option value
            option.textContent = p.name;
            // If item is being edited and this player is the seller, select it
            if (item && p.id == item.seller_id) { 
                option.selected = true;
            }
            modalSeller.appendChild(option);
        });
    }

    modalStatus.value = item ? item.status : 'pending';
    itemModalTitle.textContent = item ? 'Item Düzenle' : 'Yeni Item Ekle';
    itemModal.classList.add('active'); // Activate modal
}

/**
 * Belirli bir itemı düzenlemek için modalı açar.
 * @param {number} itemIndex - currentGroup.items dizisindeki itemın indeksi.
 */
function editItem(itemIndex) {
    if (!currentGroup || !currentGroup.items || !currentGroup.items[itemIndex]) {
        showToast('Düzenlenecek item bulunamadı.', 'error');
        return;
    }
    // Send the item object itself to openItemModal
    openItemModal(currentGroup.items[itemIndex]);
}

/**
 * Item modalını kapatır.
 */
function closeItemModal() {
    const itemModal = document.getElementById('itemModal');
    if (itemModal) { // Null check added
        itemModal.classList.remove('active'); // Hide modal
    }
    editingItem = null; // Reset edit mode
}

/**
 * Saves the item (adds new or updates existing). Only administrators can do this.
 */
async function saveItem() {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        return;
    }

    const nameInput = document.getElementById('modalItemName');
    const priceInput = document.getElementById('modalPrice');
    const sellerSelect = document.getElementById('modalSeller');
    const statusSelect = document.getElementById('modalStatus');

    if (!nameInput || !priceInput || !sellerSelect || !statusSelect) {
        showToast('Item kaydetme form elementleri bulunamadı.', 'error');
        return;
    }

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value) || null; // Convert to number or null
    const sellerId = sellerSelect.value; // ID of selected seller
    const status = statusSelect.value;

    if (!currentGroup) {
        showToast('Lütfen önce bir grup seçin.', 'error');
        return;
    }
    if (!name) {
        showToast("Item adı boş bırakılamaz.", 'warning');
        return;
    }
    if (price !== null && price < 0) {
        showToast("Fiyat negatif olamaz.", 'warning');
        return;
    }

    const itemData = {
        groupId: currentGroup.id,
        name: name,
        price: price,
        sellerId: sellerId === '' ? null : sellerId, // Send null if "Satıcı Seçin" is selected
        status: status,
    };

    let result;
    if (editingItem) { // Update existing item
        itemData.id = editingItem.id;
        result = await apiCall('saveItem', 'POST', itemData);
    } else { // Add new item
        result = await apiCall('saveItem', 'POST', itemData);
    }

    if (result.success) {
        closeItemModal();
        await openGroupDetail(currentGroup.id); // Reload group details
        showToast(result.message, 'success');
    }
}

/**
 * Deletes an item. Only administrators can do this.
 * @param {number} itemIndex - Index of the item in the currentGroup.items array.
 */
async function deleteItem(itemIndex) {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        return;
    }
    if (!currentGroup || !currentGroup.items || !currentGroup.items[itemIndex]) {
        showToast('Silinecek item bulunamadı.', 'error');
        return;
    }

    const itemId = currentGroup.items[itemIndex].id;

    // Using a custom modal/confirmation instead of browser's default confirm()
    showCustomConfirm('Bu itemı silmek istediğinizden emin misiniz?', async () => {
        const result = await apiCall('deleteItem', 'POST', { id: itemId });
        if (result.success) {
            showToast(result.message, 'success');
            await openGroupDetail(currentGroup.id); // Grup detailını yenile
        }
    });
}


// ---------------- PLAYER MANAGEMENT ----------------
/**
 * Fetches all players from the server and renders them to a table.
 * Visible only to administrators and warns if no admin privileges.
 */
async function renderPlayers() {
    // Although hidden by the hidden-for-non-admin class in PHP, checking in JS is safer.
    if (!isAdmin) {
        const playersSection = document.getElementById('players-section');
        if (playersSection) {
            playersSection.innerHTML = '<p style="text-align: center; margin-top: 50px;">Bu bölümü görüntüleme yetkiniz yok.</p>';
        }
        return;
    }

    const t = document.getElementById('playersTable');
    if (!t) return; // Return if element does not exist

    t.innerHTML = ''; // Clear previous content

    const result = await apiCall('getPlayers');
    if (!result.success || !result.players) {
        t.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #777; padding: 20px;">Oyuncular yüklenemedi.</td></tr>';
        return;
    }

    const players = result.players;
    if (players.length === 0) {
        t.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #777; padding: 20px;">Henüz hiç oyuncu eklenmedi.</td></tr>';
        return;
    }

    players.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${p.name}</td>
            <td class="action-buttons">
                <button class="btn btn-danger btn-sm" onclick="deletePlayer(${p.id})" title="Sil"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        t.appendChild(tr);
    });
}

/**
 * Adds a new global player. Only administrators can do this.
 */
async function addGlobalPlayer() {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        return;
    }
    const nameInput = document.getElementById('newPlayerName');
    if (!nameInput) { // Null check added
        showToast('Yeni oyuncu adı girişi bulunamadı.', 'error');
        return;
    }
    const name = nameInput.value.trim();
    if (!name) {
        showToast('Oyuncu adı boş bırakılamaz.', 'warning');
        return;
    }

    const result = await apiCall('addGlobalPlayer', 'POST', { name: name });
    if (result.success) {
        nameInput.value = '';
        await renderPlayers(); // Refresh player list
        showToast(result.message, 'success');
        // If we successfully added a global player, refresh allGlobalPlayers list
        await fetchAllGlobalPlayers(); 
    }
}

/**
 * Deletes a player from the global player list. Only administrators can do this.
 * @param {number} playerId - The ID of the player to delete.
 */
async function deletePlayer(playerId) {
    if (!isAdmin) {
        showToast('Bu işlemi gerçekleştirmek için yönetici ayrıcalıklarınız yok.', 'error');
        return;
    }
    // Using a custom modal/confirmation instead of browser's default confirm()
    showCustomConfirm(`Bu oyuncuyu silmek istediğinizden emin misiniz?`, async () => {
        const result = await apiCall('deletePlayer', 'POST', { id: playerId });
        if (result.success) {
            showToast(result.message, 'success');
            await renderPlayers(); // Refresh player list
            // If we successfully deleted a global player, refresh allGlobalPlayers list
            await fetchAllGlobalPlayers();
        }
    });
}

// ---------------- REPORTS ----------------
/**
 * Fetches general report data and renders it to the DOM.
 */
async function renderReport() {
    const c = document.getElementById('reportContent');
    if (!c) return; // Null check

    c.innerHTML = '<p style="text-align: center; color: #777; margin-top: 20px;">Rapor verileri yükleniyor...</p>';

    const result = await apiCall('report');
    if (!result.success || !result.report) {
        c.innerHTML = '<p style="text-align: center; color: #777; margin-top: 20px;">Rapor verileri yüklenemedi.</p>';
        return;
    }

    const report = result.report;

    c.innerHTML = `
        ${summary('Toplam Grup', report.groupCount, 'fas fa-layer-group')}
        ${summary('Toplam Item', report.itemCount, 'fas fa-boxes')}
        ${summary('Satılan Item Değeri', formatCurrency(report.totalSoldValue), 'fas fa-hand-holding-usd')}
        ${summary('Bekleyen/Rezerve Değeri', formatCurrency(report.totalPendingValue), 'fas fa-hourglass-half')}
        ${summary('Tüm Itemların Toplam Değeri', formatCurrency(report.totalValueAllItems), 'fas fa-dollar-sign')}
    `;
}

// ---------------- GLOBAL RECEIVABLES ----------------
/**
 * Renders a table showing the total receivables for all players across all groups.
 * This section is for reporting only; no editing is possible.
 */
async function renderGlobalReceivables() {
    const globalReceivablesSection = document.getElementById('global-receivables-section');
    if (!globalReceivablesSection) return; // Ensure the section exists

    // Initialize the table structure, including tbody with a loading message
    let tableHTML = `
        <div class="section-header">
            <h2><i class="fas fa-money-bill-wave"></i> Genel Oyuncu Alacakları</h2>
        </div>
        <div class="card full-width-for-non-admin">
            <h3><i class="fas fa-clipboard-list"></i> Tüm Oyuncuların Özet Alacakları</h3>
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Oyuncu</th>
                            <th>Bulunduğu Gruplar</th>
                            <th>Toplam Kazanç (Tüm Gruplar)</th>
                            <th>Toplam Ödenen (Tüm Gruplar)</th>
                            <th>Kalan Bakiye</th>
                        </tr>
                    </thead>
                    <tbody id="globalReceivablesTableBody">
                        <tr><td colspan="6" style="text-align: center; padding: 20px; color: #777;">Veriler yükleniyor...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    globalReceivablesSection.innerHTML = tableHTML; // Render initial table structure

    const tableBody = document.getElementById('globalReceivablesTableBody'); // Get the tbody element
    if (!tableBody) { // Double check for tbody existence
        console.error("globalReceivablesTableBody not found after rendering initial HTML.");
        return;
    }

    const result = await apiCall('getGlobalPlayerReceivables'); // New API action
    if (!result.success || !result.receivables) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #777;">Genel alacaklar yüklenemedi.</td></tr>';
        return;
    }

    let receivables = result.receivables;

    // Filter out 'Orkun' from the receivables list
    receivables = receivables.filter(player => player.name.toLowerCase() !== 'orkun');

    if (receivables.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #777;">Orkun hariç herhangi bir oyuncu için alacak verisi yok.</td></tr>';
        return;
    }

    let rowsHtml = '';
    receivables.sort((a, b) => b.totalEarned - a.totalEarned) // Sort by total earned
               .forEach((player, i) => {
        const remainingBalance = player.totalEarned - player.totalPaid;
        rowsHtml += `
            <tr>
                <td>${i + 1}</td>
                <td>${player.name}</td>
                <td>${player.groupsParticipatedIn.join(', ') || 'Yok'}</td>
                <td>${formatCurrency(player.totalEarned)}</td>
                <td>${formatCurrency(player.totalPaid)}</td>
                <td class="${remainingBalance < 0 ? 'negative-pay' : ''}">${formatCurrency(remainingBalance)}</td>
            </tr>
        `;
    });
    tableBody.innerHTML = rowsHtml; // Only update the tbody content
}


/**
 * Shows a custom confirmation dialog.
 * @param {string} message - The message to display.
 * @param {Function} onConfirm - Callback function to execute if confirmed.
 */
function showCustomConfirm(message, onConfirm) {
    const confirmModal = document.getElementById('customConfirmModal');
    let confirmMessage = document.getElementById('customConfirmMessage');
    let confirmYesBtn = document.getElementById('customConfirmYes');
    let confirmNoBtn = document.getElementById('customConfirmNo');

    if (!confirmModal) {
        // Create modal elements if they don't exist
        const modalHtml = `
            <div class="modal" id="customConfirmModal">
                <div class="modal-content">
                    <span class="close-button" onclick="closeCustomConfirmModal()"><i class="fas fa-times"></i></span>
                    <h2 id="customConfirmTitle">Onay Gerekli</h2>
                    <p id="customConfirmMessage"></p>
                    <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                        <button class="btn btn-success" id="customConfirmYes">Evet</button>
                        <button class="btn btn-danger" id="customConfirmNo">Hayır</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        confirmModal = document.getElementById('customConfirmModal');
        confirmMessage = document.getElementById('customConfirmMessage');
        confirmYesBtn = document.getElementById('customConfirmYes');
        confirmNoBtn = document.getElementById('customConfirmNo');
    }

    confirmMessage.textContent = message;
    confirmModal.classList.add('active');

    const handleYes = () => {
        onConfirm();
        closeCustomConfirmModal();
        // Remove event listeners to prevent multiple firings
        confirmYesBtn.removeEventListener('click', handleYes);
        confirmNoBtn.removeEventListener('click', handleNo);
    };

    const handleNo = () => {
        closeCustomConfirmModal();
        // Remove event listeners to prevent multiple firings
        confirmYesBtn.removeEventListener('click', handleYes);
        confirmNoBtn.removeEventListener('click', handleNo);
    };

    confirmYesBtn.addEventListener('click', handleYes);
    confirmNoBtn.addEventListener('click', handleNo);
}

/**
 * Closes the custom confirmation dialog.
 */
function closeCustomConfirmModal() {
    const confirmModal = document.getElementById('customConfirmModal');
    if (confirmModal) {
        confirmModal.classList.remove('active');
    }
}

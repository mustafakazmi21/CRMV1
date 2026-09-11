// public/js/app.js

// Global state
let currentUser = null;

// DOM Elements
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const appContainer = document.getElementById('app-container');
const logoutBtn = document.getElementById('logout-btn');
const userDisplayName = document.getElementById('user-display-name');
const userDisplayRole = document.getElementById('user-display-role');
const navLinks = document.querySelectorAll('.nav-link');
const viewPanels = document.querySelectorAll('.view-panel');
const navActivityLogItem = document.getElementById('nav-activity-log-item');
const toastNotification = document.getElementById('toast-notification');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupNavigation();
    setupAuthListeners();
});

// Fetch and populate all agency dropdown filters
async function populateAgencyDropdowns() {
    try {
        const res = await fetch('/api/agencies');
        if (!res.ok) return;
        const data = await res.json();
        const agencies = data.agencies || [];
        
        const brandsAgency = document.getElementById('brands-agency-filter');
        
        if (brandsAgency) {
            brandsAgency.innerHTML = '<option value="">All Agencies</option>';
            agencies.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.agency_name;
                brandsAgency.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Error populating agencies dropdowns:', err);
    }
}

// Check if user is logged in
async function checkSession() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.user) {
            loginSuccess(data.user);
        } else {
            showLogin();
        }
    } catch (err) {
        console.error('Session check failed:', err);
        showLogin();
    }
}

// Set up event listeners for login/logout
function setupAuthListeners() {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        
        loginError.classList.add('hidden');
        loginError.textContent = '';

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: usernameInput.value,
                    password: passwordInput.value
                })
            });
            const data = await res.json();
            
            if (res.ok && data.user) {
                loginSuccess(data.user);
                usernameInput.value = '';
                passwordInput.value = '';
            } else {
                loginError.textContent = data.error || 'Login failed';
                loginError.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login request failed:', err);
            loginError.textContent = 'Server error occurred. Please try again.';
            loginError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) {
                showToast('Successfully logged out', 'success');
                showLogin();
            }
        } catch (err) {
            console.error('Logout failed:', err);
            showToast('Failed to log out cleanly', 'error');
            showLogin(); // Fallback UI cleanup anyway
        }
    });
}

function loginSuccess(user) {
    currentUser = user;
    loginContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Set user profile footer
    userDisplayName.textContent = user.username;
    userDisplayRole.textContent = user.role;
    userDisplayRole.className = `user-role-badge ${user.role}`;

    // Show/hide Admin sections
    const navTeamItem = document.getElementById('nav-team-item');
    if (user.role === 'ADMIN') {
        navActivityLogItem.classList.remove('hidden');
        if (navTeamItem) navTeamItem.classList.remove('hidden');
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
        navActivityLogItem.classList.add('hidden');
        if (navTeamItem) navTeamItem.classList.add('hidden');
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    // Initialize leads tab structures based on role
    initLeadsView();
    populateAgencyDropdowns();

    // Default to dashboard view
    switchView('dashboard-view');
    loadDashboardStats();
}

function showLogin() {
    currentUser = null;
    appContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
}

// Side navigation panel routing
function setupNavigation() {
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = link.getAttribute('data-target');
            
            navLinks.forEach(nl => nl.classList.remove('active'));
            link.classList.add('active');
            
            switchView(targetView);
        });
    });
}

function switchView(viewId) {
    viewPanels.forEach(panel => {
        if (panel.id === viewId) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    });

    // Trigger panel-specific data loads
    if (viewId === 'dashboard-view') {
        loadDashboardStats();
    } else if (viewId === 'brands-view') {
        loadBrands();
    } else if (viewId === 'influencers-view') {
        loadInfluencers();
    } else if (viewId === 'leads-view') {
        loadLeads();
    } else if (viewId === 'activities-view') {
        loadGlobalActivities();
    } else if (viewId === 'team-view') {
        loadTeamMembers();
    } else if (viewId === 'instagram-view') {
        loadInstagramFollowUps();
    } else if (viewId === 'agencies-view') {
        loadAgencies();
    } else if (viewId === 'outreach-view') {
        loadOutreach();
    }
}

// Fetch dashboard statistical counters
async function loadDashboardStats() {
    try {
        const res = await fetch('/api/activities/dashboard');
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        
        document.getElementById('stat-active-brands').textContent = data.activeBrands;
        document.getElementById('stat-archived-brands').textContent = data.archivedBrands;
        document.getElementById('stat-active-influencers').textContent = data.activeInfluencers;
        document.getElementById('stat-archived-influencers').textContent = data.archivedInfluencers;
        const activeAgenciesElem = document.getElementById('stat-active-agencies');
        if (activeAgenciesElem) activeAgenciesElem.textContent = data.activeAgencies || 0;
        const archivedAgenciesElem = document.getElementById('stat-archived-agencies');
        if (archivedAgenciesElem) archivedAgenciesElem.textContent = data.archivedAgencies || 0;
        
        if (currentUser && currentUser.role === 'ADMIN') {
            document.getElementById('stat-total-logs').textContent = data.totalLogs;
        }
    } catch (err) {
        console.error('Error loading dashboard stats:', err);
    }
}

// TOAST NOTIFICATIONS
function showToast(message, type = 'info') {
    toastNotification.textContent = message;
    toastNotification.className = `toast ${type}`;
    
    // Show toast
    toastNotification.classList.remove('hidden');
    
    // Auto hide after 4 seconds
    setTimeout(() => {
        toastNotification.classList.add('hidden');
    }, 4000);
}

// MODAL WINDOW WRAPPERS
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        
        // Reset tabs within this modal if any
        const tabButtons = modal.querySelectorAll('.modal-tab-btn');
        if (tabButtons.length > 0) {
            tabButtons[0].click(); // Activate first tab
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Modal tab switches (Information vs History Logs)
function switchModalTab(tabContentId, btnElement) {
    // Deactivate all sibling tab buttons
    const tabsContainer = btnElement.parentElement;
    tabsContainer.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Activate current tab button
    btnElement.classList.add('active');

    // Hide all sibling tab contents
    const modalContent = tabsContainer.nextElementSibling;
    const allTabContents = modalContent.parentElement.querySelectorAll('.modal-tab-content');
    allTabContents.forEach(content => {
        content.classList.add('hidden');
    });

    // Show current tab content
    document.getElementById(tabContentId).classList.remove('hidden');
}

// HELPER DATE FORMATTER
function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return dateStr;
    }
}

function formatDateOnly(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toISOString().split('T')[0];
    } catch (e) {
        return dateStr;
    }
}

// public/js/influencers.js

let influencersPage = 1;
const influencersLimit = 50;

// DOM Elements
const influencersTableBody = document.querySelector('#influencers-table tbody');
const influencersSearchInput = document.getElementById('influencers-search-input');
const influencersCategoryFilter = document.getElementById('influencers-category-filter');
const influencersStatusFilter = document.getElementById('influencers-status-filter');
const influencersArchivedCheckbox = document.getElementById('influencers-archived-checkbox');
const influencersPaginationInfo = document.getElementById('influencers-pagination-info');
const influencersPrevBtn = document.getElementById('influencers-prev-btn');
const influencersNextBtn = document.getElementById('influencers-next-btn');

const openAddInfluencerBtn = document.getElementById('open-add-influencer-btn');
const addInfluencerForm = document.getElementById('add-influencer-form');
const editInfluencerForm = document.getElementById('edit-influencer-form');
const detailInfluencerArchiveBtn = document.getElementById('detail-influencer-archive-btn');

// Listeners
if (influencersSearchInput) {
    influencersSearchInput.addEventListener('input', debounce(() => {
        influencersPage = 1;
        loadInfluencers();
    }, 300));
}

if (influencersCategoryFilter) {
    influencersCategoryFilter.addEventListener('input', debounce(() => {
        influencersPage = 1;
        loadInfluencers();
    }, 300));
}

if (influencersStatusFilter) {
    influencersStatusFilter.addEventListener('change', () => {
        influencersPage = 1;
        loadInfluencers();
    });
}

if (influencersArchivedCheckbox) {
    influencersArchivedCheckbox.addEventListener('change', () => {
        influencersPage = 1;
        loadInfluencers();
    });
}

if (influencersPrevBtn) {
    influencersPrevBtn.addEventListener('click', () => {
        if (influencersPage > 1) {
            influencersPage--;
            loadInfluencers();
        }
    });
}

if (influencersNextBtn) {
    influencersNextBtn.addEventListener('click', () => {
        influencersPage++;
        loadInfluencers();
    });
}

if (openAddInfluencerBtn) {
    openAddInfluencerBtn.addEventListener('click', () => {
        if (addInfluencerForm) addInfluencerForm.reset();
        openModal('add-influencer-modal');
    });
}

// Add influencer submission
if (addInfluencerForm) {
    addInfluencerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addInfluencerForm);
        const body = {};
        formData.forEach((value, key) => {
            body[key] = value;
        });

        try {
            const res = await fetch('/api/influencers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showToast('Influencer added successfully', 'success');
                closeModal('add-influencer-modal');
                loadInfluencers();
                loadDashboardStats();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to add influencer', 'error');
            }
        } catch (err) {
            console.error('Error adding influencer:', err);
            showToast('Error connecting to server', 'error');
        }
    });
}

// Edit influencer submission
if (editInfluencerForm) {
    editInfluencerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editInfluencerForm);
        const body = {};
        formData.forEach((value, key) => {
            body[key] = value;
        });

        const id = body.id;

        try {
            const res = await fetch(`/api/influencers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showToast('Influencer updated successfully', 'success');
                closeModal('detail-influencer-modal');
                loadInfluencers();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to update influencer', 'error');
            }
        } catch (err) {
            console.error('Error updating influencer:', err);
            showToast('Error connecting to server', 'error');
        }
    });
}

// Load Influencers
async function loadInfluencers() {
    if (!influencersTableBody) return;

    const searchVal = influencersSearchInput ? influencersSearchInput.value.trim() : '';
    const categoryVal = influencersCategoryFilter ? influencersCategoryFilter.value.trim() : '';
    const statusVal = influencersStatusFilter ? influencersStatusFilter.value.trim() : '';
    const isArchived = influencersArchivedCheckbox ? influencersArchivedCheckbox.checked : false;

    try {
        let url = `/api/influencers?page=${influencersPage}&limit=${influencersLimit}&search=${encodeURIComponent(searchVal)}&archived=${isArchived}`;
        if (categoryVal) url += `&category=${encodeURIComponent(categoryVal)}`;
        if (statusVal) url += `&status=${encodeURIComponent(statusVal)}`;

        const res = await fetch(url);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        renderInfluencersTable(data.influencers || []);
        updateInfluencersPagination(data.pagination || { page: 1, totalRows: 0, totalPages: 1 });
    } catch (err) {
        console.error('Error loading influencers:', err);
        showToast('Failed to load influencers list', 'error');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInfluencerStatusBadgeClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('new')) return 'ADMIN';
    if (s.includes('contacted') || s.includes('discussion')) return 'EMPLOYEE';
    if (s.includes('agreed') || s.includes('closed') || s.includes('deal')) return 'ADMIN';
    if (s.includes('declined') || s.includes('lost')) return 'EMPLOYEE';
    return '';
}

function formatForDatetimeLocal(val) {
    if (!val) return '';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

// Render Influencers Table (10 requested columns)
function renderInfluencersTable(influencers) {
    if (!influencersTableBody) return;
    influencersTableBody.innerHTML = '';

    if (influencers.length === 0) {
        influencersTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #a0aec0; padding: 2rem;">No influencers found</td></tr>`;
        return;
    }

    influencers.forEach(inf => {
        const tr = document.createElement('tr');

        // Instagram URL link
        let instaLink = '-';
        if (inf.instagram_url) {
            let href = inf.instagram_url.trim();
            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                href = 'https://' + href;
            }
            instaLink = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); font-weight: 500;">Instagram ↗</a>`;
        }

        // Followers display
        const followersDisplay = inf.followers_formatted || (inf.followers !== null && inf.followers !== undefined ? Number(inf.followers).toLocaleString() : '-');

        // Following display
        const followingDisplay = inf.following !== null && inf.following !== undefined ? Number(inf.following).toLocaleString() : '-';

        // Posts display
        const postsDisplay = inf.posts !== null && inf.posts !== undefined ? Number(inf.posts).toLocaleString() : '-';

        // Status badge
        const statusText = inf.status || 'New';
        const statusBadgeClass = getInfluencerStatusBadgeClass(statusText);

        // Status timestamp display
        let timestampDisplay = '-';
        if (inf.status_timestamp) {
            try {
                timestampDisplay = formatDate(inf.status_timestamp);
            } catch (e) {
                timestampDisplay = String(inf.status_timestamp).substring(0, 16);
            }
        }

        tr.innerHTML = `
            <td><strong>${inf.username ? '@' + escapeHtml(inf.username.replace(/^@/, '')) : '-'}</strong></td>
            <td>${escapeHtml(inf.display_name || '-')}</td>
            <td>${instaLink}</td>
            <td>${escapeHtml(followersDisplay)}</td>
            <td>${escapeHtml(followingDisplay)}</td>
            <td>${escapeHtml(postsDisplay)}</td>
            <td>${escapeHtml(inf.category || '-')}</td>
            <td><span class="user-role-badge ${statusBadgeClass}">${escapeHtml(statusText)}</span></td>
            <td>${timestampDisplay}</td>
            <td>
                <button class="table-action-link" onclick="viewInfluencerDetail(${inf.id})">Open</button>
            </td>
        `;
        influencersTableBody.appendChild(tr);
    });
}

function updateInfluencersPagination(pagination) {
    if (!influencersPaginationInfo) return;
    const { page, totalRows, totalPages } = pagination;
    influencersPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;

    if (influencersPrevBtn) influencersPrevBtn.disabled = page <= 1;
    if (influencersNextBtn) influencersNextBtn.disabled = page >= totalPages;
}

// View detail and history
async function viewInfluencerDetail(id) {
    try {
        const res = await fetch(`/api/influencers/${id}`);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        const influencer = data.influencer;
        const logs = data.activityLogs;

        // Set Title
        const influencerTitle = influencer.display_name || influencer.username || 'Influencer Details';
        document.getElementById('detail-influencer-title').textContent = influencerTitle;

        // Fill form fields
        const formElements = editInfluencerForm.elements;
        for (const key in influencer) {
            if (formElements[key]) {
                if (['status_timestamp', 'first_seen'].includes(key) && influencer[key]) {
                    formElements[key].value = formatForDatetimeLocal(influencer[key]);
                } else {
                    formElements[key].value = influencer[key] !== null && influencer[key] !== undefined ? influencer[key] : '';
                }
            }
        }

        // Configure convert to lead button
        const convertBtn = document.getElementById('detail-influencer-convert-btn');
        if (convertBtn) {
            convertBtn.onclick = () => addToLeads('Influencer', influencer.id);
        }

        // Configure archive button
        if (detailInfluencerArchiveBtn) {
            if (influencer.is_archived) {
                detailInfluencerArchiveBtn.textContent = 'Unarchive Influencer';
                detailInfluencerArchiveBtn.className = 'btn primary-btn';
                detailInfluencerArchiveBtn.onclick = () => handleInfluencerArchiveUnarchive(influencer.id, 'unarchive');
            } else {
                detailInfluencerArchiveBtn.textContent = 'Archive Influencer';
                detailInfluencerArchiveBtn.className = 'btn danger-btn';
                detailInfluencerArchiveBtn.onclick = () => handleInfluencerArchiveUnarchive(influencer.id, 'archive');
            }
        }

        // Render history logs
        renderInfluencerHistoryTable(logs);

        // Open modal
        openModal('detail-influencer-modal');

    } catch (err) {
        console.error('Error fetching influencer details:', err);
        showToast('Failed to load influencer details', 'error');
    }
}

function renderInfluencerHistoryTable(logs) {
    const historyBody = document.querySelector('#influencer-history-table tbody');
    if (!historyBody) return;
    historyBody.innerHTML = '';

    if (!logs || logs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 1.5rem;">No history logged for this influencer</td></tr>`;
        return;
    }

    logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(l.timestamp)}</td>
            <td><strong>${escapeHtml(l.username)}</strong></td>
            <td><span class="user-role-badge">${escapeHtml(l.action_type)}</span></td>
            <td><code>${escapeHtml(l.field_changed || '-')}</code></td>
            <td style="color: #e53e3e; max-width: 150px;" title="${escapeHtml(l.old_value || '')}">${escapeHtml(l.old_value || '-')}</td>
            <td style="color: #38a169; max-width: 150px;" title="${escapeHtml(l.new_value || '')}">${escapeHtml(l.new_value || '-')}</td>
        `;
        historyBody.appendChild(tr);
    });
}

// Archive/unarchive influencer
async function handleInfluencerArchiveUnarchive(id, action) {
    const confirmMsg = `Are you sure you want to ${action} this influencer?`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`/api/influencers/${id}/${action}`, { method: 'POST' });
        if (res.ok) {
            showToast(`Influencer successfully ${action}d`, 'success');
            closeModal('detail-influencer-modal');
            loadInfluencers();
            loadDashboardStats();
        } else {
            const data = await res.json();
            showToast(data.error || `Failed to ${action} influencer`, 'error');
        }
    } catch (err) {
        console.error(`Error during influencer ${action}:`, err);
        showToast('Error connecting to server', 'error');
    }
}


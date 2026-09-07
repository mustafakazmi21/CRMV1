// public/js/influencers.js

let influencersPage = 1;
const influencersLimit = 50;

// DOM Elements
const influencersTableBody = document.querySelector('#influencers-table tbody');
const influencersSearchInput = document.getElementById('influencers-search-input');
const influencersLocationFilter = document.getElementById('influencers-location-filter');
const influencersLeadByFilter = document.getElementById('influencers-lead-by-filter');
const influencersArchivedCheckbox = document.getElementById('influencers-archived-checkbox');
const influencersPaginationInfo = document.getElementById('influencers-pagination-info');
const influencersPrevBtn = document.getElementById('influencers-prev-btn');
const influencersNextBtn = document.getElementById('influencers-next-btn');

const openAddInfluencerBtn = document.getElementById('open-add-influencer-btn');
const addInfluencerForm = document.getElementById('add-influencer-form');
const editInfluencerForm = document.getElementById('edit-influencer-form');
const detailInfluencerArchiveBtn = document.getElementById('detail-influencer-archive-btn');

// Listeners
influencersSearchInput.addEventListener('input', debounce(() => {
    influencersPage = 1;
    loadInfluencers();
}, 300));

influencersLocationFilter.addEventListener('input', debounce(() => {
    influencersPage = 1;
    loadInfluencers();
}, 300));

influencersLeadByFilter.addEventListener('input', debounce(() => {
    influencersPage = 1;
    loadInfluencers();
}, 300));

influencersArchivedCheckbox.addEventListener('change', () => {
    influencersPage = 1;
    loadInfluencers();
});

influencersPrevBtn.addEventListener('click', () => {
    if (influencersPage > 1) {
        influencersPage--;
        loadInfluencers();
    }
});

influencersNextBtn.addEventListener('click', () => {
    influencersPage++;
    loadInfluencers();
});

openAddInfluencerBtn.addEventListener('click', () => {
    addInfluencerForm.reset();
    openModal('add-influencer-modal');
});

// Add influencer submission
addInfluencerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(addInfluencerForm);
    const body = {};
    formData.forEach((value, key) => {
        body[key] = value === '' ? null : value;
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

// Edit influencer submission
editInfluencerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(editInfluencerForm);
    const body = {};
    formData.forEach((value, key) => {
        body[key] = value === '' ? null : value;
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

// Load Influencers
async function loadInfluencers() {
    const searchVal = influencersSearchInput.value.trim();
    const locationVal = influencersLocationFilter.value.trim();
    const leadByVal = influencersLeadByFilter.value.trim();
    const isArchived = influencersArchivedCheckbox.checked;

    try {
        let url = `/api/influencers?page=${influencersPage}&limit=${influencersLimit}&search=${encodeURIComponent(searchVal)}&archived=${isArchived}`;
        if (locationVal) url += `&location=${encodeURIComponent(locationVal)}`;
        if (leadByVal) url += `&lead_by=${encodeURIComponent(leadByVal)}`;

        const res = await fetch(url);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        renderInfluencersTable(data.influencers);
        updateInfluencersPagination(data.pagination);
    } catch (err) {
        console.error('Error loading influencers:', err);
        showToast('Failed to load influencers list', 'error');
    }
}

function renderInfluencersTable(influencers) {
    influencersTableBody.innerHTML = '';

    if (influencers.length === 0) {
        influencersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #a0aec0; padding: 2rem;">No influencers found</td></tr>`;
        return;
    }

    influencers.forEach(inf => {
        const tr = document.createElement('tr');

        // Clean Instagram URL display
        const instaUrl = inf.instagram_url || '';
        const instaDisplay = instaUrl ? `<a href="${instaUrl}" target="_blank">Instagram Link</a>` : '-';

        // Format Date
        const sendDateDisplay = inf.send_date ? formatDateOnly(inf.send_date) : '-';

        tr.innerHTML = `
            <td><strong>${inf.influencer_name || '-'}</strong></td>
            <td>${inf.lead_by || '-'}</td>
            <td>${inf.content_why_this_person || '-'}</td>
            <td>${inf.followers || '-'}</td>
            <td>${instaDisplay}</td>
            <td>${sendDateDisplay}</td>
            <td>
                <button class="table-action-link" onclick="viewInfluencerDetail(${inf.id})">Open</button>
            </td>
        `;
        influencersTableBody.appendChild(tr);
    });
}

function updateInfluencersPagination(pagination) {
    const { page, totalRows, totalPages } = pagination;
    influencersPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;

    influencersPrevBtn.disabled = page <= 1;
    influencersNextBtn.disabled = page >= totalPages;
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
        document.getElementById('detail-influencer-title').textContent = influencer.influencer_name;

        // Fill form fields
        const formElements = editInfluencerForm.elements;
        for (const key in influencer) {
            if (formElements[key]) {
                if (key === 'send_date' && influencer[key]) {
                    formElements[key].value = formatDateOnly(influencer[key]);
                } else {
                    formElements[key].value = influencer[key] !== null ? influencer[key] : '';
                }
            }
        }

        // Configure convert to lead button
        document.getElementById('detail-influencer-convert-btn').onclick = () => addToLeads('Influencer', influencer.id);

        // Configure archive button
        if (influencer.is_archived) {
            detailInfluencerArchiveBtn.textContent = 'Unarchive Influencer';
            detailInfluencerArchiveBtn.className = 'btn primary-btn';
            detailInfluencerArchiveBtn.onclick = () => handleInfluencerArchiveUnarchive(influencer.id, 'unarchive');
        } else {
            detailInfluencerArchiveBtn.textContent = 'Archive Influencer';
            detailInfluencerArchiveBtn.className = 'btn danger-btn';
            detailInfluencerArchiveBtn.onclick = () => handleArchiveUnarchive(influencer.id, 'archive');
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
    historyBody.innerHTML = '';

    if (logs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 1.5rem;">No history logged for this influencer</td></tr>`;
        return;
    }

    logs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(l.timestamp)}</td>
            <td><strong>${l.username}</strong></td>
            <td><span class="user-role-badge">${l.action_type}</span></td>
            <td><code>${l.field_changed || '-'}</code></td>
            <td style="color: #e53e3e; max-width: 150px;" title="${l.old_value || ''}">${l.old_value || '-'}</td>
            <td style="color: #38a169; max-width: 150px;" title="${l.new_value || ''}">${l.new_value || '-'}</td>
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

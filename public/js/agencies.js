// public/js/agencies.js

let agenciesPage = 1;
const agenciesLimit = 50;

// DOM Elements
const agenciesTableBody = document.querySelector('#agencies-table tbody');
const agenciesSearchInput = document.getElementById('agencies-search-input');
const agenciesStatusFilter = document.getElementById('agencies-status-filter');
const agenciesArchivedCheckbox = document.getElementById('agencies-archived-checkbox');
const agenciesPaginationInfo = document.getElementById('agencies-pagination-info');
const agenciesPrevBtn = document.getElementById('agencies-prev-btn');
const agenciesNextBtn = document.getElementById('agencies-next-btn');

const openAddAgencyBtn = document.getElementById('open-add-agency-btn');
const addAgencyForm = document.getElementById('add-agency-form');
const editAgencyForm = document.getElementById('edit-agency-form');
const detailAgencyArchiveBtn = document.getElementById('detail-agency-archive-btn');

document.addEventListener('DOMContentLoaded', () => {
    // Search & Filter listeners
    if (agenciesSearchInput) {
        agenciesSearchInput.addEventListener('input', debounce(() => {
            agenciesPage = 1;
            loadAgencies();
        }, 300));
    }

    if (agenciesStatusFilter) {
        agenciesStatusFilter.addEventListener('change', () => {
            agenciesPage = 1;
            loadAgencies();
        });
    }

    if (agenciesArchivedCheckbox) {
        agenciesArchivedCheckbox.addEventListener('change', () => {
            agenciesPage = 1;
            loadAgencies();
        });
    }

    if (agenciesPrevBtn) {
        agenciesPrevBtn.addEventListener('click', () => {
            if (agenciesPage > 1) {
                agenciesPage--;
                loadAgencies();
            }
        });
    }

    if (agenciesNextBtn) {
        agenciesNextBtn.addEventListener('click', () => {
            agenciesPage++;
            loadAgencies();
        });
    }

    if (openAddAgencyBtn) {
        openAddAgencyBtn.addEventListener('click', () => {
            if (addAgencyForm) addAgencyForm.reset();
            openModal('add-agency-modal');
        });
    }

    if (addAgencyForm) {
        addAgencyForm.addEventListener('submit', handleCreateAgency);
    }

    if (editAgencyForm) {
        editAgencyForm.addEventListener('submit', handleUpdateAgency);
    }
});

async function loadAgencies() {
    if (!agenciesTableBody) return;

    const searchVal = agenciesSearchInput ? agenciesSearchInput.value.trim() : '';
    const statusVal = agenciesStatusFilter ? agenciesStatusFilter.value.trim() : '';
    const isArchived = agenciesArchivedCheckbox ? agenciesArchivedCheckbox.checked : false;

    try {
        let url = `/api/agencies?page=${agenciesPage}&limit=${agenciesLimit}&search=${encodeURIComponent(searchVal)}&archived=${isArchived}`;
        if (statusVal) url += `&status=${encodeURIComponent(statusVal)}`;

        const res = await fetch(url);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        renderAgenciesTable(data.agencies || []);
        updateAgenciesPagination(data.pagination || { page: 1, totalRows: 0, totalPages: 1 });
    } catch (err) {
        console.error('Error loading agencies:', err);
        showToast('Failed to load agencies list', 'error');
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

function renderLink(url, label) {
    if (!url) return '-';
    let href = String(url).trim();
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
        href = 'https://' + href;
    }
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); font-weight: 500;">${label} ↗</a>`;
}

function getAgencyStatusBadgeClass(status) {
    if (!status) return 'NO_DATA';
    return String(status).toUpperCase().replace(/\s+/g, '_');
}

// Render Agencies Table (12 columns: 11 data fields + Actions)
function renderAgenciesTable(agencies) {
    if (!agenciesTableBody) return;
    agenciesTableBody.innerHTML = '';

    if (agencies.length === 0) {
        agenciesTableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: #a0aec0; padding: 2rem;">No agencies found</td></tr>`;
        return;
    }

    agencies.forEach(agency => {
        const tr = document.createElement('tr');

        const companyName = agency.company_name || '-';
        const webLink = renderLink(agency.website, 'Web');
        const linkedinLink = renderLink(agency.linkedin, 'LinkedIn');
        const instaLink = renderLink(agency.instagram, 'Instagram');
        const fbLink = renderLink(agency.facebook, 'Facebook');
        const twitterLink = renderLink(agency.twitter_x, 'X');
        const youtubeLink = renderLink(agency.youtube, 'YouTube');
        const phoneDisplay = agency.phone ? escapeHtml(agency.phone) : '-';
        const emailDisplay = agency.email ? `<a href="mailto:${escapeHtml(agency.email)}" style="color: var(--primary-color);">${escapeHtml(agency.email)}</a>` : '-';
        
        let addressDisplay = '-';
        if (agency.address) {
            const rawAddr = agency.address.trim();
            addressDisplay = rawAddr.length > 30 ? `<span title="${escapeHtml(rawAddr)}">${escapeHtml(rawAddr.substring(0, 30))}...</span>` : escapeHtml(rawAddr);
        }

        const statusText = agency.status || 'NO_DATA';
        const statusBadgeClass = getAgencyStatusBadgeClass(statusText);

        tr.innerHTML = `
            <td><strong>${escapeHtml(companyName)}</strong></td>
            <td>${webLink}</td>
            <td>${linkedinLink}</td>
            <td>${instaLink}</td>
            <td>${fbLink}</td>
            <td>${twitterLink}</td>
            <td>${youtubeLink}</td>
            <td>${phoneDisplay}</td>
            <td>${emailDisplay}</td>
            <td>${addressDisplay}</td>
            <td><span class="user-role-badge ${statusBadgeClass}">${escapeHtml(statusText)}</span></td>
            <td>
                <button class="table-action-link" onclick="viewAgencyDetail(${agency.id})">Open</button>
            </td>
        `;
        agenciesTableBody.appendChild(tr);
    });
}

function updateAgenciesPagination(pagination) {
    if (!agenciesPaginationInfo) return;
    const { page, totalRows, totalPages } = pagination;
    agenciesPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;

    if (agenciesPrevBtn) agenciesPrevBtn.disabled = page <= 1;
    if (agenciesNextBtn) agenciesNextBtn.disabled = page >= totalPages;
}

// Create Agency
async function handleCreateAgency(e) {
    e.preventDefault();
    const formData = new FormData(addAgencyForm);
    const body = {};
    formData.forEach((value, key) => {
        body[key] = value === '' ? null : value;
    });

    if (!body.company_name && !body.website) {
        showToast('Company Name or Website is required', 'error');
        return;
    }

    try {
        const res = await fetch('/api/agencies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            showToast('Agency added successfully', 'success');
            closeModal('add-agency-modal');
            addAgencyForm.reset();
            loadAgencies();
            populateAgencyDropdowns();
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to add agency', 'error');
        }
    } catch (err) {
        console.error('Error adding agency:', err);
        showToast('Error connecting to server', 'error');
    }
}

// View Agency Detail & History
async function viewAgencyDetail(id) {
    try {
        const res = await fetch(`/api/agencies/${id}`);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        const agency = data.agency;
        const logs = data.activityLogs || [];

        // Set Title
        const agencyTitle = agency.company_name || agency.website || 'Agency Details';
        document.getElementById('detail-agency-title').textContent = agencyTitle;

        // Fill form fields
        const formElements = editAgencyForm.elements;
        const fieldMapping = {
            'company_name': agency.company_name || agency.companyName || '',
            'website': agency.website || '',
            'linkedin': agency.linkedin || '',
            'instagram': agency.instagram || '',
            'facebook': agency.facebook || '',
            'twitter_x': agency.twitter_x || agency.twitterX || agency.twitter || '',
            'youtube': agency.youtube || '',
            'phone': agency.phone || '',
            'email': agency.email || '',
            'status': agency.status || 'NO_DATA',
            'address': agency.address || '',
            'id': agency.id || ''
        };

        for (const key in fieldMapping) {
            if (formElements[key]) {
                formElements[key].value = fieldMapping[key];
            }
        }

        // Configure archive/unarchive button
        if (detailAgencyArchiveBtn) {
            if (agency.is_archived) {
                detailAgencyArchiveBtn.textContent = 'Unarchive Agency';
                detailAgencyArchiveBtn.className = 'btn primary-btn';
                detailAgencyArchiveBtn.onclick = () => handleAgencyArchiveUnarchive(agency.id, 'unarchive');
            } else {
                detailAgencyArchiveBtn.textContent = 'Archive Agency';
                detailAgencyArchiveBtn.className = 'btn danger-btn';
                detailAgencyArchiveBtn.onclick = () => handleAgencyArchiveUnarchive(agency.id, 'archive');
            }
        }

        // Render history logs
        renderAgencyHistoryTable(logs);

        // Open modal
        openModal('detail-agency-modal');

    } catch (err) {
        console.error('Error fetching agency details:', err);
        showToast('Failed to load agency details', 'error');
    }
}

// Update Agency
async function handleUpdateAgency(e) {
    e.preventDefault();
    const formData = new FormData(editAgencyForm);
    const body = {};
    formData.forEach((value, key) => {
        body[key] = value === '' ? null : value;
    });

    const id = body.id;

    try {
        const res = await fetch(`/api/agencies/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            showToast('Agency updated successfully', 'success');
            closeModal('detail-agency-modal');
            loadAgencies();
            populateAgencyDropdowns();
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to update agency', 'error');
        }
    } catch (err) {
        console.error('Error updating agency:', err);
        showToast('Error connecting to server', 'error');
    }
}

function renderAgencyHistoryTable(logs) {
    const historyBody = document.querySelector('#agency-history-table tbody');
    if (!historyBody) return;
    historyBody.innerHTML = '';

    if (!logs || logs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 1.5rem;">No history logged for this agency</td></tr>`;
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

// Archive/unarchive agency
async function handleAgencyArchiveUnarchive(id, action) {
    const confirmMsg = `Are you sure you want to ${action} this agency?`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`/api/agencies/${id}/${action}`, { method: 'POST' });
        if (res.ok) {
            showToast(`Agency successfully ${action}d`, 'success');
            closeModal('detail-agency-modal');
            loadAgencies();
            populateAgencyDropdowns();
        } else {
            const data = await res.json();
            showToast(data.error || `Failed to ${action} agency`, 'error');
        }
    } catch (err) {
        console.error(`Error during agency ${action}:`, err);
        showToast('Error connecting to server', 'error');
    }
}


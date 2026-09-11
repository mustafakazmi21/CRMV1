// public/js/outreach.js

// Global Outreach View State
let outreachPage = 1;
const outreachLimit = 50;
let outreachType = 'all';

// DOM Elements
let outreachTableBody, outreachSearchInput, outreachTypeFilter, outreachEmployeeFilter;
let outreachDatePresetFilter, outreachCustomDateContainer, outreachDateFrom, outreachDateTo;
let outreachStatusFilter, outreachResetFiltersBtn, outreachTabsContainer;
let outreachPaginationInfo, outreachPrevBtn, outreachNextBtn, outreachTotalBadge;

document.addEventListener('DOMContentLoaded', () => {
    initOutreachDOM();
    setupOutreachListeners();
});

function initOutreachDOM() {
    outreachTableBody = document.getElementById('outreach-table-body');
    outreachSearchInput = document.getElementById('outreach-search-input');
    outreachTypeFilter = document.getElementById('outreach-type-filter');
    outreachEmployeeFilter = document.getElementById('outreach-employee-filter');
    outreachDatePresetFilter = document.getElementById('outreach-date-preset-filter');
    outreachCustomDateContainer = document.getElementById('outreach-custom-date-container');
    outreachDateFrom = document.getElementById('outreach-date-from');
    outreachDateTo = document.getElementById('outreach-date-to');
    outreachStatusFilter = document.getElementById('outreach-status-filter');
    outreachResetFiltersBtn = document.getElementById('outreach-reset-filters-btn');
    outreachTabsContainer = document.getElementById('outreach-tabs-container');
    outreachPaginationInfo = document.getElementById('outreach-pagination-info');
    outreachPrevBtn = document.getElementById('outreach-prev-btn');
    outreachNextBtn = document.getElementById('outreach-next-btn');
    outreachTotalBadge = document.getElementById('outreach-total-badge');
}

function setupOutreachListeners() {
    if (!outreachTabsContainer) return;

    // Tab buttons click (All, Brands, Influencers, Agencies)
    outreachTabsContainer.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedType = btn.getAttribute('data-type') || 'all';
            outreachType = selectedType;
            if (outreachTypeFilter) outreachTypeFilter.value = selectedType;

            setOutreachActiveTab(btn);
            outreachPage = 1;
            loadOutreach();
        });
    });

    // Type filter dropdown
    if (outreachTypeFilter) {
        outreachTypeFilter.addEventListener('change', (e) => {
            outreachType = e.target.value;
            syncOutreachTabWithType(outreachType);
            outreachPage = 1;
            loadOutreach();
        });
    }

    // Search input (debounced)
    if (outreachSearchInput) {
        outreachSearchInput.addEventListener('input', debounce(() => {
            outreachPage = 1;
            loadOutreach();
        }, 300));
    }

    // Employee and Status filters
    if (outreachEmployeeFilter) {
        outreachEmployeeFilter.addEventListener('change', () => {
            outreachPage = 1;
            loadOutreach();
        });
    }

    if (outreachStatusFilter) {
        outreachStatusFilter.addEventListener('change', () => {
            outreachPage = 1;
            loadOutreach();
        });
    }

    // Date Preset dropdown (Today, This Week, This Month, Custom Date Range)
    if (outreachDatePresetFilter) {
        outreachDatePresetFilter.addEventListener('change', (e) => {
            const preset = e.target.value;
            if (preset === 'custom') {
                outreachCustomDateContainer.classList.remove('hidden');
                outreachCustomDateContainer.style.display = 'flex';
            } else {
                outreachCustomDateContainer.classList.add('hidden');
                outreachCustomDateContainer.style.display = 'none';
                if (outreachDateFrom) outreachDateFrom.value = '';
                if (outreachDateTo) outreachDateTo.value = '';
            }
            outreachPage = 1;
            loadOutreach();
        });
    }

    // Custom date pickers
    if (outreachDateFrom) {
        outreachDateFrom.addEventListener('change', () => {
            outreachPage = 1;
            loadOutreach();
        });
    }

    if (outreachDateTo) {
        outreachDateTo.addEventListener('change', () => {
            outreachPage = 1;
            loadOutreach();
        });
    }

    // Reset Filters button
    if (outreachResetFiltersBtn) {
        outreachResetFiltersBtn.addEventListener('click', resetOutreachFilters);
    }

    // Pagination buttons
    if (outreachPrevBtn) {
        outreachPrevBtn.addEventListener('click', () => {
            if (outreachPage > 1) {
                outreachPage--;
                loadOutreach();
            }
        });
    }

    if (outreachNextBtn) {
        outreachNextBtn.addEventListener('click', () => {
            outreachPage++;
            loadOutreach();
        });
    }
}

function setOutreachActiveTab(activeBtn) {
    if (!outreachTabsContainer) return;
    outreachTabsContainer.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}

function syncOutreachTabWithType(type) {
    if (!outreachTabsContainer) return;
    const targetTab = outreachTabsContainer.querySelector(`.modal-tab-btn[data-type="${type}"]`) || document.getElementById('tab-outreach-all');
    if (targetTab) {
        setOutreachActiveTab(targetTab);
    }
}

async function populateOutreachEmployeeFilter() {
    if (!outreachEmployeeFilter) return;
    try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const data = await res.json();
        const users = data.users || [];

        outreachEmployeeFilter.innerHTML = '<option value="">All Employees</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.username} (${u.role})`;
            outreachEmployeeFilter.appendChild(opt);
        });
    } catch (err) {
        console.error('Error populating outreach employees filter:', err);
    }
}

function resetOutreachFilters() {
    if (outreachSearchInput) outreachSearchInput.value = '';
    if (outreachTypeFilter) outreachTypeFilter.value = 'all';
    outreachType = 'all';
    syncOutreachTabWithType('all');

    if (outreachEmployeeFilter) outreachEmployeeFilter.value = '';
    if (outreachDatePresetFilter) outreachDatePresetFilter.value = '';
    if (outreachCustomDateContainer) {
        outreachCustomDateContainer.classList.add('hidden');
        outreachCustomDateContainer.style.display = 'none';
    }
    if (outreachDateFrom) outreachDateFrom.value = '';
    if (outreachDateTo) outreachDateTo.value = '';
    if (outreachStatusFilter) outreachStatusFilter.value = '';

    outreachPage = 1;
    loadOutreach();
    showToast('Filters reset to default', 'info');
}

// Main Load Function
async function loadOutreach() {
    if (!outreachTableBody) initOutreachDOM();
    if (!currentUser) return;

    // Populate employee dropdown if empty
    if (outreachEmployeeFilter && outreachEmployeeFilter.options.length <= 1) {
        await populateOutreachEmployeeFilter();
    }

    try {
        const searchVal = outreachSearchInput ? outreachSearchInput.value.trim() : '';
        const employeeVal = outreachEmployeeFilter ? outreachEmployeeFilter.value : '';
        const datePresetVal = outreachDatePresetFilter ? outreachDatePresetFilter.value : '';
        const dateFromVal = outreachDateFrom ? outreachDateFrom.value : '';
        const dateToVal = outreachDateTo ? outreachDateTo.value : '';
        const statusVal = outreachStatusFilter ? outreachStatusFilter.value : '';

        const params = new URLSearchParams({
            page: outreachPage,
            limit: outreachLimit,
            type: outreachType,
            search: searchVal,
            employee: employeeVal,
            datePreset: datePresetVal,
            dateFrom: dateFromVal,
            dateTo: dateToVal,
            status: statusVal
        });

        const res = await fetch(`/api/outreach?${params.toString()}`);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        renderOutreachTable(data.records || []);
        updateOutreachPagination(data.pagination || { page: 1, limit: 50, totalRows: 0, totalPages: 1 });

        // Update total counter badge
        if (outreachTotalBadge && data.pagination) {
            outreachTotalBadge.textContent = `${data.pagination.totalRows} Total Engaged`;
        }

    } catch (err) {
        console.error('Error loading outreach records:', err);
        showToast('Failed to load outreach records', 'error');
    }
}

function renderOutreachTable(records) {
    if (!outreachTableBody) return;
    outreachTableBody.innerHTML = '';

    if (records.length === 0) {
        outreachTableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: #a0aec0; padding: 2.5rem;">
                    <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 0.25rem;">No outreach records found</div>
                    <div style="font-size: 0.85rem;">Try adjusting your filters or search query</div>
                </td>
            </tr>
        `;
        return;
    }

    records.forEach(r => {
        const tr = document.createElement('tr');

        // Color coding based on temperature
        if (r.temperature === 'Hot') tr.style.backgroundColor = 'rgba(254, 215, 215, 0.25)';
        else if (r.temperature === 'Cold') tr.style.backgroundColor = 'rgba(190, 227, 248, 0.25)';
        else if (r.temperature === 'Due') tr.style.backgroundColor = 'rgba(254, 235, 200, 0.25)';

        // Type Badge styling
        let typeBadgeBg = '#e2e8f0';
        let typeBadgeColor = '#4a5568';
        if (r.entity_type === 'Influencer') {
            typeBadgeBg = '#ebf8ff';
            typeBadgeColor = '#2b6cb0';
        } else if (r.entity_type === 'Agency') {
            typeBadgeBg = '#feebc8';
            typeBadgeColor = '#c05621';
        }

        // Profile / Company Name display
        const profileName = r.name || r.username || 'Unnamed Record';
        const subtitleText = r.location_snippet || r.influencer_category || '';
        const subtitleHTML = subtitleText ? `<div style="font-size: 0.8rem; color: #a0aec0; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${subtitleText}</div>` : '';

        // Social / Web link
        let linkHTML = '<span style="color: #a0aec0;">-</span>';
        if (r.instagram_url) {
            const igUrl = r.instagram_url.startsWith('http') ? r.instagram_url : `https://${r.instagram_url}`;
            const handle = r.username ? `@${r.username}` : 'Instagram Profile';
            linkHTML = `<a href="${igUrl}" target="_blank" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">${handle}</a>`;
        } else if (r.website) {
            const webUrl = r.website.startsWith('http') ? r.website : `https://${r.website}`;
            linkHTML = `<a href="${webUrl}" target="_blank" style="color: var(--primary-color); text-decoration: none; font-weight: 500;">Website &rarr;</a>`;
        }

        // Assigned To / Reached Out By display
        let userDisplayHTML = '<span style="color: #a0aec0; font-style: italic;">Unassigned</span>';
        if (r.assigned_username) {
            userDisplayHTML = `<strong>${r.assigned_username}</strong>`;
        }
        if (r.last_outreach_by && r.last_outreach_by !== r.assigned_username) {
            userDisplayHTML += `<div style="font-size: 0.75rem; color: #718096;">Outreach: ${r.last_outreach_by}</div>`;
        }

        // Lead Status Badge
        const statusBadgeHTML = `<span class="user-role-badge ${r.lead_status}">${r.lead_status || 'New'}</span>`;

        // Outreach Status & Notes Preview
        let outreachDetailsHTML = '';
        if (r.last_activity_type) {
            outreachDetailsHTML += `<span class="user-role-badge" style="background-color: #edf2f7; color: var(--text-color); font-size: 0.75rem; margin-right: 0.35rem;">${r.last_activity_type}</span>`;
        }
        const notePreview = r.last_activity_notes || r.last_activity_details || r.lead_notes || '';
        if (notePreview) {
            const truncated = notePreview.length > 45 ? notePreview.substring(0, 45) + '...' : notePreview;
            outreachDetailsHTML += `<span style="font-size: 0.85rem; color: #4a5568;" title="${notePreview}">"${truncated}"</span>`;
        } else {
            outreachDetailsHTML += `<span style="font-size: 0.85rem; color: #a0aec0;">No notes</span>`;
        }

        // Last Outreach Date
        const outreachDateFormatted = r.last_outreach_date ? formatDate(r.last_outreach_date) : '<span style="color: #a0aec0;">-</span>';

        // Follow-up Date
        let followUpHTML = '<span style="color: #a0aec0;">-</span>';
        if (r.next_follow_up_date) {
            const isOverdue = new Date(r.next_follow_up_date) < new Date(new Date().toDateString());
            const followUpColor = isOverdue ? '#e53e3e' : '#2b6cb0';
            followUpHTML = `<span style="color: ${followUpColor}; font-weight: 500;">${formatDateOnly(r.next_follow_up_date)}</span>`;
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight: 600; color: var(--text-color);">${profileName}</div>
                ${subtitleHTML}
            </td>
            <td>
                <span class="user-role-badge" style="background-color: ${typeBadgeBg}; color: ${typeBadgeColor}; font-weight: 600;">
                    ${r.entity_type}
                </span>
            </td>
            <td>${linkHTML}</td>
            <td>${userDisplayHTML}</td>
            <td>${statusBadgeHTML}</td>
            <td style="max-width: 240px;">${outreachDetailsHTML}</td>
            <td style="white-space: nowrap; font-size: 0.85rem;">${outreachDateFormatted}</td>
            <td style="white-space: nowrap; font-size: 0.85rem;">${followUpHTML}</td>
            <td style="text-align: center;">
                <button class="table-action-link" onclick="viewLeadDetail(${r.lead_id})" title="View Lead & Activity History">
                    Open Lead
                </button>
            </td>
        `;

        outreachTableBody.appendChild(tr);
    });
}

function updateOutreachPagination(pagination) {
    if (!outreachPaginationInfo || !outreachPrevBtn || !outreachNextBtn) return;
    const { page, totalRows, totalPages } = pagination;
    outreachPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;

    outreachPrevBtn.disabled = page <= 1;
    outreachNextBtn.disabled = page >= totalPages;
}

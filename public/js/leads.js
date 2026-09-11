// public/js/leads.js

let leadsPage = 1;
const leadsLimit = 50;
let currentLeadFilter = 'all'; // 'all', 'follow-ups-due', 'recent-activity', 'employee-activity'

// DOM Elements
const leadsTable = document.getElementById('leads-table');
const leadsTableBody = document.querySelector('#leads-table tbody');
const leadsEmpActivityTable = document.getElementById('leads-emp-activity-table');
const leadsEmpActivityTableBody = document.querySelector('#leads-emp-activity-table tbody');

const leadsSearchInput = document.getElementById('leads-search-input');
const leadsStatusFilter = document.getElementById('leads-status-filter');
const leadsPaginationInfo = document.getElementById('leads-pagination-info');
const leadsPrevBtn = document.getElementById('leads-prev-btn');
const leadsNextBtn = document.getElementById('leads-next-btn');

const leadsTabsContainer = document.getElementById('leads-tabs-container');
const tabAllLeads = document.getElementById('tab-all-leads');
const tabMyLeads = document.getElementById('tab-my-leads');
const tabFollowUps = document.getElementById('tab-follow-ups');
const tabEmpActivity = document.getElementById('tab-emp-activity');

// New Filter Elements
const leadsDateFrom = document.getElementById('leads-date-from');
const leadsDateTo = document.getElementById('leads-date-to');
const leadsLocationFilter = document.getElementById('leads-location-filter');
const leadsEmployeeFilter = document.getElementById('leads-employee-filter');
const leadsTemperatureFilter = document.getElementById('leads-temperature-filter');

// Bulk Actions Elements
const bulkToolbar = document.getElementById('bulk-actions-toolbar');
const bulkSelectionCount = document.getElementById('bulk-selection-count');
const selectAllCheckbox = document.getElementById('select-all-leads');
const bulkStatusSelect = document.getElementById('bulk-status-select');
const bulkTemperatureSelect = document.getElementById('bulk-temperature-select');
const bulkAssignSelect = document.getElementById('bulk-assign-select');
const bulkArchiveBtn = document.getElementById('bulk-archive-btn');
const bulkApplyBtn = document.getElementById('bulk-apply-btn');

const editLeadForm = document.getElementById('edit-lead-form');
const logLeadActivityForm = document.getElementById('log-lead-activity-form');
const outreachActivityType = document.getElementById('outreach-activity-type');
const outreachFollowUpDate = document.getElementById('outreach-follow-up-date');

// Current viewing lead data
let activeLeadId = null;
let activeLeadTimeline = [];

// Init lead page events
function initLeadsView() {
    setupLeadsTabs();
    setupLeadsListeners();
    populateEmployeeDropdowns();
}

async function populateEmployeeDropdowns() {
    if (!currentUser || currentUser.role !== 'ADMIN') {
        // Only admins can filter by employee or bulk assign to others easily
        if (leadsEmployeeFilter) leadsEmployeeFilter.classList.add('hidden');
        if (bulkAssignSelect) bulkAssignSelect.classList.add('hidden');
        return;
    }
    try {
        const res = await fetch('/api/users');
        if (!res.ok) return;
        const data = await res.json();
        const users = data.users || [];
        
        // Populate filter dropdown
        if (leadsEmployeeFilter) {
            leadsEmployeeFilter.innerHTML = '<option value="">All Employees</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.username;
                leadsEmployeeFilter.appendChild(opt);
            });
            leadsEmployeeFilter.classList.remove('hidden');
        }
        
        // Populate bulk assign dropdown
        if (bulkAssignSelect) {
            bulkAssignSelect.innerHTML = '<option value="">No Change</option>';
            const unassignOpt = document.createElement('option');
            unassignOpt.value = 'unassign';
            unassignOpt.textContent = 'Unassign';
            bulkAssignSelect.appendChild(unassignOpt);
            
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `Assign to ${u.username}`;
                bulkAssignSelect.appendChild(opt);
            });
            bulkAssignSelect.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Error fetching users for dropdowns', e);
    }
}

function setupLeadsTabs() {
    if (!currentUser) return;

    // Reset tab display based on role
    if (currentUser.role === 'ADMIN') {
        tabAllLeads.classList.remove('hidden');
        tabMyLeads.classList.add('hidden'); // Admin doesn't strictly focus on "My Leads" but can
        tabEmpActivity.classList.remove('hidden');
        currentLeadFilter = 'all';
        setActiveTab(tabAllLeads);
    } else {
        tabAllLeads.classList.add('hidden');
        tabMyLeads.classList.remove('hidden');
        tabEmpActivity.classList.add('hidden');
        currentLeadFilter = 'all'; // For employee, 'all' returns only their assigned leads
        setActiveTab(tabMyLeads);
    }
}

function setActiveTab(activeBtn) {
    leadsTabsContainer.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    activeBtn.classList.add('active');
}

function setupLeadsListeners() {
    // Tab Clicks
    leadsTabsContainer.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = btn.getAttribute('data-filter');
            currentLeadFilter = filter;
            setActiveTab(btn);
            leadsPage = 1;
            
            // Show/Hide appropriate tables & search controls
            if (filter === 'employee-activity') {
                leadsTable.classList.add('hidden');
                leadsEmpActivityTable.classList.remove('hidden');
                document.getElementById('leads-controls-bar').classList.add('hidden');
            } else {
                leadsTable.classList.remove('hidden');
                leadsEmpActivityTable.classList.add('hidden');
                document.getElementById('leads-controls-bar').classList.remove('hidden');
            }

            loadLeads();
        });
    });

    // Search and Status filters
    leadsSearchInput.addEventListener('input', debounce(() => { leadsPage = 1; loadLeads(); }, 300));
    leadsLocationFilter.addEventListener('input', debounce(() => { leadsPage = 1; loadLeads(); }, 300));
    
    const filterChangeTrigger = () => { leadsPage = 1; loadLeads(); };
    leadsStatusFilter.addEventListener('change', filterChangeTrigger);
    leadsTemperatureFilter.addEventListener('change', filterChangeTrigger);
    leadsEmployeeFilter.addEventListener('change', filterChangeTrigger);
    leadsDateFrom.addEventListener('change', filterChangeTrigger);
    leadsDateTo.addEventListener('change', filterChangeTrigger);

    // Bulk Actions Selection
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.lead-row-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateBulkToolbar();
        });
    }

    if (bulkApplyBtn) bulkApplyBtn.addEventListener('click', applyBulkActions);
    if (bulkArchiveBtn) bulkArchiveBtn.addEventListener('click', () => applyBulkActionSingle('archive', true));

    // Pagination
    leadsPrevBtn.addEventListener('click', () => {
        if (leadsPage > 1) {
            leadsPage--;
            loadLeads();
        }
    });

    leadsNextBtn.addEventListener('click', () => {
        leadsPage++;
        loadLeads();
    });

    // Outreach type change (show next follow-up date only for 'Follow-up' type)
    outreachActivityType.addEventListener('change', (e) => {
        const followUpGroup = document.querySelector('.id-follow-up-only');
        if (e.target.value === 'Follow-up') {
            followUpGroup.classList.remove('hidden');
        } else {
            followUpGroup.classList.add('hidden');
        }
    });

    // Edit Lead Form Submission (Save notes, status, assignments)
    editLeadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-lead-id').value;
        const status = document.getElementById('edit-lead-status').value;
        const nextFollowUp = document.getElementById('edit-lead-follow-up').value;
        const notes = document.getElementById('edit-lead-notes').value;
        
        let assignedTo = null;
        const assignSelect = document.getElementById('edit-lead-assigned-to');
        if (assignSelect && !assignSelect.parentElement.classList.contains('hidden')) {
            assignedTo = assignSelect.value ? parseInt(assignSelect.value) : null;
        }

        try {
            // Save general status and next follow-up via outreach activity post or status endpoint
            const statusRes = await fetch(`/api/leads/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });

            if (!statusRes.ok) {
                const err = await statusRes.json();
                showToast(err.error || 'Failed to update status', 'error');
                return;
            }

            // Save assignment if user is Admin
            if (currentUser.role === 'ADMIN') {
                const assignRes = await fetch(`/api/leads/${id}/assign`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assigned_to: assignedTo })
                });
                
                if (!assignRes.ok) {
                    const err = await assignRes.json();
                    showToast(err.error || 'Failed to update assignment', 'error');
                    return;
                }
            }

            // Save general notes and update follow-up date by sending a quick 'Note' activity
            await fetch(`/api/leads/${id}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    activity_type: 'Note',
                    details: 'Updated lead overview parameters',
                    notes: notes,
                    next_follow_up_date: nextFollowUp || ''
                })
            });

            showToast('Lead info saved successfully', 'success');
            closeModal('detail-lead-modal');
            loadLeads();
            loadDashboardStats();

        } catch (err) {
            console.error('Error saving lead details:', err);
            showToast('Failed to save lead info', 'error');
        }
    });

    // Log Outreach Activity Submission
    logLeadActivityForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('outreach-lead-id').value;
        const activity_type = document.getElementById('outreach-activity-type').value;
        const details = document.querySelector('input[name="details"]').value;
        const notes = document.querySelector('#log-lead-activity-form textarea[name="notes"]').value;
        const followUpDate = document.getElementById('outreach-follow-up-date').value;

        const body = {
            activity_type,
            details,
            notes
        };

        if (activity_type === 'Follow-up' && followUpDate) {
            body.next_follow_up_date = followUpDate;
        }

        try {
            const res = await fetch(`/api/leads/${id}/activity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showToast('Activity logged successfully', 'success');
                logLeadActivityForm.reset();
                document.querySelector('.id-follow-up-only').classList.add('hidden');
                
                // Refresh modal details/timeline tab
                viewLeadDetail(id);
                loadLeads();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to log activity', 'error');
            }
        } catch (err) {
            console.error('Error logging outreach:', err);
            showToast('Error connecting to server', 'error');
        }
    });

    // Open Add Lead Modal
    const openAddLeadBtn = document.getElementById('open-add-lead-btn');
    if (openAddLeadBtn) {
        openAddLeadBtn.addEventListener('click', () => {
            const form = document.getElementById('add-lead-form');
            form.reset();
            document.getElementById('add-lead-search-results').style.display = 'none';
            document.getElementById('add-lead-selected-badge').style.display = 'none';
            document.getElementById('add-lead-selected-id').value = '';
            openModal('add-lead-modal');
        });
    }

    // Type change resets selection
    const addLeadType = document.getElementById('add-lead-type');
    const searchInput = document.getElementById('add-lead-search-profile');
    if (addLeadType && searchInput) {
        addLeadType.addEventListener('change', () => {
            searchInput.value = '';
            document.getElementById('add-lead-search-results').style.display = 'none';
            document.getElementById('add-lead-selected-badge').style.display = 'none';
            document.getElementById('add-lead-selected-id').value = '';
        });
    }

    // Type name to search and select profile
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async (e) => {
            const query = e.target.value.trim();
            const type = addLeadType.value;
            const resultsDiv = document.getElementById('add-lead-search-results');

            if (!query) {
                resultsDiv.style.display = 'none';
                return;
            }

            try {
                let endpoint = `/api/influencers?search=${encodeURIComponent(query)}&limit=10`;
                if (type === 'Brand') {
                    endpoint = `/api/brands?search=${encodeURIComponent(query)}&limit=10`;
                } else if (type === 'Agency') {
                    endpoint = `/api/agencies?search=${encodeURIComponent(query)}&limit=10`;
                }

                const res = await fetch(endpoint);
                if (res.ok) {
                    const data = await res.json();
                    const items = type === 'Brand' ? (data.brands || []) : (type === 'Agency' ? (data.agencies || []) : (data.influencers || []));
                    
                    resultsDiv.innerHTML = '';
                    if (items.length === 0) {
                        resultsDiv.innerHTML = '<div style="padding: 0.5rem; color: #a0aec0;">No profiles found</div>';
                    } else {
                        items.forEach(item => {
                            let name = '';
                            if (type === 'Brand') {
                                name = item.brand_name || item.display_name || item.username || 'Unnamed Brand';
                            } else if (type === 'Agency') {
                                name = item.company_name || item.companyName || item.website || 'Unnamed Agency';
                            } else {
                                name = item.influencer_name || item.display_name || item.username || 'Unnamed Influencer';
                            }
                            const div = document.createElement('div');
                            div.style.padding = '0.5rem';
                            div.style.cursor = 'pointer';
                            div.style.borderBottom = '1px solid #edf2f7';
                            div.textContent = name;
                            div.addEventListener('click', () => {
                                document.getElementById('add-lead-selected-id').value = item.id;
                                document.getElementById('add-lead-selected-name').textContent = name;
                                document.getElementById('add-lead-selected-badge').style.display = 'block';
                                searchInput.value = name;
                                resultsDiv.style.display = 'none';
                            });
                            resultsDiv.appendChild(div);
                        });
                    }
                    resultsDiv.style.display = 'block';
                }
            } catch (err) {
                console.error('Error searching profiles:', err);
            }
        }, 300));
    }

    // Add Lead Form submission
    const addLeadForm = document.getElementById('add-lead-form');
    if (addLeadForm) {
        addLeadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = addLeadType.value;
            const selectedId = document.getElementById('add-lead-selected-id').value;
            const notes = document.getElementById('add-lead-initial-notes').value;

            if (!selectedId) {
                showToast('Please search and select a profile first', 'error');
                return;
            }

            const body = {
                notes: notes
            };
            if (type === 'Brand') body.brand_id = parseInt(selectedId);
            else if (type === 'Agency') body.agency_id = parseInt(selectedId);
            else body.influencer_id = parseInt(selectedId);

            try {
                const res = await fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (res.ok) {
                    showToast('Lead added successfully', 'success');
                    closeModal('add-lead-modal');
                    loadLeads();
                    loadDashboardStats();
                } else {
                    const data = await res.json();
                    showToast(data.error || 'Failed to add lead', 'error');
                }
            } catch (err) {
                console.error('Error adding lead:', err);
                showToast('Error connecting to server', 'error');
            }
        });
    }
}

// Load leads lists
async function loadLeads() {
    if (!currentUser) return;
    
    if (currentLeadFilter === 'employee-activity') {
        return loadGlobalEmployeeActivities();
    }

    const searchVal = leadsSearchInput.value.trim();
    const statusVal = leadsStatusFilter.value;
    const tempVal = leadsTemperatureFilter.value;
    const locVal = leadsLocationFilter.value.trim();
    const empVal = leadsEmployeeFilter.value;
    const dateFromVal = leadsDateFrom.value;
    const dateToVal = leadsDateTo.value;

    try {
        const queryParams = new URLSearchParams({
            page: leadsPage,
            limit: leadsLimit,
            search: searchVal,
            filter: currentLeadFilter,
            status: statusVal,
            temperature: tempVal,
            location: locVal,
            assignedTo: empVal,
            dateFrom: dateFromVal,
            dateTo: dateToVal
        });

        const res = await fetch(`/api/leads?${queryParams.toString()}`);
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        renderLeadsTable(data.leads);
        updateLeadsPagination(data.pagination);
        updateBulkToolbar(); // Reset bulk selection
    } catch (err) {
        console.error('Error fetching leads:', err);
        showToast('Failed to load leads list', 'error');
    }
}

function renderLeadsTable(leads) {
    leadsTableBody.innerHTML = '';
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    
    if (leads.length === 0) {
        leadsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #a0aec0; padding: 2rem;">No leads found</td></tr>`;
        return;
    }

    leads.forEach(l => {
        const tr = document.createElement('tr');
        const leadName = l.brand_name || l.influencer_name || l.agency_name || 'Unnamed Lead';
        const leadType = l.agency_id ? 'Agency' : (l.brand_id ? 'Brand' : 'Influencer');
        const assignedUser = l.assigned_username || '<span style="color: #a0aec0; font-style: italic;">Unassigned</span>';
        
        let typeBadgeBg = '#ebf8ff';
        let typeBadgeColor = '#2b6cb0';
        if (leadType === 'Brand') {
            typeBadgeBg = '#e2e8f0';
            typeBadgeColor = '#4a5568';
        } else if (leadType === 'Agency') {
            typeBadgeBg = '#feebc8';
            typeBadgeColor = '#c05621';
        }

        // Color coding based on temperature
        let rowColor = '';
        if (l.temperature === 'Hot') rowColor = 'rgba(254, 215, 215, 0.3)'; // red/orange tint
        else if (l.temperature === 'Cold') rowColor = 'rgba(190, 227, 248, 0.3)'; // blue tint
        else if (l.temperature === 'Due') rowColor = 'rgba(254, 235, 200, 0.3)'; // yellow tint
        tr.style.backgroundColor = rowColor;

        const outreachStatuses = ['Not Contacted', 'Reached Out', 'Responded', 'Demo Scheduled', 'Demo Done', 'Follow Up', 'Closed Won', 'Closed Lost'];
        const tempStatuses = ['None', 'Hot', 'Cold', 'Due'];

        // Inline Status Select
        let statusSelectHTML = `<select onchange="updateLeadInline(${l.id}, 'status', this.value)" style="padding: 0.125rem; font-size: 0.85rem; border-radius: 4px; border: 1px solid var(--border-color); background: white;">`;
        outreachStatuses.forEach(s => {
            statusSelectHTML += `<option value="${s}" ${l.status === s ? 'selected' : ''}>${s}</option>`;
        });
        statusSelectHTML += `</select>`;

        // Inline Temp Select
        let tempSelectHTML = `<select onchange="updateLeadInline(${l.id}, 'temperature', this.value)" style="padding: 0.125rem; font-size: 0.85rem; border-radius: 4px; border: 1px solid var(--border-color); background: white;">`;
        tempStatuses.forEach(s => {
            tempSelectHTML += `<option value="${s}" ${l.temperature === s ? 'selected' : ''}>${s}</option>`;
        });
        tempSelectHTML += `</select>`;

        tr.innerHTML = `
            <td style="text-align: center;"><input type="checkbox" class="lead-row-checkbox" value="${l.id}" onchange="updateBulkToolbar()"></td>
            <td><strong>${leadName}</strong></td>
            <td><span class="user-role-badge" style="background-color: ${typeBadgeBg}; color: ${typeBadgeColor};">${leadType}</span></td>
            <td>${assignedUser}</td>
            <td>${tempSelectHTML}</td>
            <td>${statusSelectHTML}</td>
            <td>${formatDate(l.updated_at)}</td>
            <td>
                <button class="table-action-link" onclick="viewLeadDetail(${l.id})">Open</button>
            </td>
        `;
        leadsTableBody.appendChild(tr);
    });
}

// Inline update
async function updateLeadInline(id, field, value) {
    try {
        const body = {};
        body[field] = value;
        const res = await fetch(`/api/leads/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            showToast(`${field} updated`, 'success');
            loadLeads(); // Reload to refresh color coding
        } else {
            showToast('Failed to update', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Server error', 'error');
    }
}

// Bulk Actions Logic
function updateBulkToolbar() {
    const checkboxes = document.querySelectorAll('.lead-row-checkbox:checked');
    if (!bulkToolbar) return;
    
    if (checkboxes.length > 0) {
        bulkSelectionCount.textContent = `${checkboxes.length} lead(s) selected`;
        bulkToolbar.classList.remove('hidden');
    } else {
        bulkToolbar.classList.add('hidden');
    }
}

async function applyBulkActions() {
    const statusVal = bulkStatusSelect.value;
    const tempVal = bulkTemperatureSelect.value;
    const assignVal = bulkAssignSelect.value;
    
    if (statusVal) await applyBulkActionSingle('status', statusVal);
    if (tempVal) await applyBulkActionSingle('temperature', tempVal);
    if (assignVal !== "") await applyBulkActionSingle('assign', assignVal);
    
    bulkStatusSelect.value = '';
    bulkTemperatureSelect.value = '';
    bulkAssignSelect.value = '';
}

async function applyBulkActionSingle(action, value) {
    const checkboxes = document.querySelectorAll('.lead-row-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (ids.length === 0) return;
    
    try {
        const res = await fetch('/api/leads/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadIds: ids, action, value })
        });
        
        if (res.ok) {
            showToast('Bulk update successful', 'success');
            loadLeads();
        } else {
            showToast('Bulk update failed', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Server error during bulk update', 'error');
    }
}

// Render Global Employee Activities for Admin view
async function loadGlobalEmployeeActivities() {
    try {
        const res = await fetch(`/api/leads/activities?page=${leadsPage}&limit=${leadsLimit}`);
        if (res.status === 401) return showLogin();
        if (res.status === 403) return showToast('Access denied', 'error');

        const data = await res.json();
        renderGlobalEmployeeActivitiesTable(data.activities);
        updateLeadsPagination(data.pagination);
    } catch (err) {
        console.error('Error fetching employee activities:', err);
        showToast('Failed to load employee activity log', 'error');
    }
}

function renderGlobalEmployeeActivitiesTable(activities) {
    leadsEmpActivityTableBody.innerHTML = '';
    
    if (activities.length === 0) {
        leadsEmpActivityTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 2rem;">No employee activity recorded yet</td></tr>`;
        return;
    }

    activities.forEach(a => {
        const tr = document.createElement('tr');
        const leadName = a.brand_name || a.influencer_name;
        
        tr.innerHTML = `
            <td>${formatDate(a.timestamp)}</td>
            <td><strong>${a.username}</strong></td>
            <td>${leadName}</td>
            <td><span class="user-role-badge ${a.activity_type}">${a.activity_type}</span></td>
            <td>${a.details || '-'}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${a.notes || ''}">${a.notes || '-'}</td>
        `;
        leadsEmpActivityTableBody.appendChild(tr);
    });
}

function updateLeadsPagination(pagination) {
    const { page, totalRows, totalPages } = pagination;
    leadsPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;

    leadsPrevBtn.disabled = page <= 1;
    leadsNextBtn.disabled = page >= totalPages;
}

// Fetch single lead detail & timeline history
async function viewLeadDetail(id) {
    activeLeadId = id;
    try {
        const res = await fetch(`/api/leads/${id}`);
        if (res.status === 401) return showLogin();

        const data = await res.json();
        const lead = data.lead;
        activeLeadTimeline = data.timeline;

        // Title and badge
        const leadName = lead.brand_name || lead.influencer_name || lead.agency_name || 'Lead Details';
        document.getElementById('detail-lead-title').textContent = leadName;
        
        const badge = document.getElementById('detail-lead-status-badge');
        badge.textContent = lead.status;
        badge.className = `user-role-badge ${lead.status}`;

        // Set hidden inputs
        document.getElementById('edit-lead-id').value = lead.id;
        document.getElementById('outreach-lead-id').value = lead.id;

        // Setup dropdowns/inputs
        document.getElementById('edit-lead-status').value = lead.status;
        document.getElementById('edit-lead-follow-up').value = lead.next_follow_up_date ? formatDateOnly(lead.next_follow_up_date) : '';
        document.getElementById('edit-lead-notes').value = lead.notes || '';

        // Role adjustment for assignment dropdown
        const assignGroupAdmin = document.querySelector('.admin-only');
        const assignGroupEmp = document.querySelector('.employee-only');

        if (currentUser.role === 'ADMIN') {
            assignGroupAdmin.classList.remove('hidden');
            assignGroupEmp.classList.add('hidden');
            
            // Populate Users dropdown
            const assignSelect = document.getElementById('edit-lead-assigned-to');
            assignSelect.innerHTML = '<option value="">Unassigned</option>';
            data.users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = `${u.username} (${u.role})`;
                if (lead.assigned_to === u.id) {
                    opt.selected = true;
                }
                assignSelect.appendChild(opt);
            });
        } else {
            assignGroupAdmin.classList.add('hidden');
            assignGroupEmp.classList.remove('hidden');
            document.getElementById('edit-lead-assigned-username-readonly').value = lead.assigned_username || 'Unassigned';
        }

        // Render Profile Information Card
        renderProfileInfoCard(lead);

        // Timeline tab rendering trigger
        renderTimelineList(activeLeadTimeline);

        openModal('detail-lead-modal');

    } catch (err) {
        console.error('Error fetching lead details:', err);
        showToast('Failed to load lead overview details', 'error');
    }
}

function renderProfileInfoCard(lead) {
    const grid = document.getElementById('lead-linked-details-grid');
    grid.innerHTML = '';

    if (lead.agency_id) {
        const websiteLink = lead.agency_website ? (lead.agency_website.startsWith('http') ? lead.agency_website : `https://${lead.agency_website}`) : null;
        grid.innerHTML = `
            <div><strong>Type:</strong> Agency Profile</div>
            <div><strong>Website:</strong> ${websiteLink ? `<a href="${websiteLink}" target="_blank">${lead.agency_website}</a>` : '-'}</div>
            <div><strong>Phone:</strong> ${lead.agency_phone || '-'}</div>
            <div><strong>Email:</strong> ${lead.agency_email ? `<a href="mailto:${lead.agency_email}">${lead.agency_email}</a>` : '-'}</div>
            <div><strong>Agency Status:</strong> ${lead.agency_status || '-'}</div>
            <div><strong>Follow-up Status:</strong> ${lead.next_follow_up_date ? 'Scheduled' : 'None scheduled'}</div>
        `;
    } else if (lead.brand_id) {
        grid.innerHTML = `
            <div><strong>Type:</strong> Brand Profile</div>
            <div><strong>Category:</strong> ${lead.brand_category || '-'}</div>
            <div><strong>Website:</strong> ${lead.brand_url ? `<a href="${lead.brand_url}" target="_blank">${lead.brand_url}</a>` : '-'}</div>
            <div><strong>Follow-up Status:</strong> ${lead.next_follow_up_date ? 'Scheduled' : 'None scheduled'}</div>
        `;
    } else {
        grid.innerHTML = `
            <div><strong>Type:</strong> Influencer Profile</div>
            <div><strong>Instagram Link:</strong> ${lead.influencer_url ? `<a href="${lead.influencer_url}" target="_blank">View Instagram</a>` : '-'}</div>
            <div><strong>Followers Count:</strong> ${lead.influencer_followers || '-'}</div>
            <div><strong>Follow-up Status:</strong> ${lead.next_follow_up_date ? 'Scheduled' : 'None scheduled'}</div>
        `;
    }
}

// Render Lead Activities Chronological Timeline list
function renderTimelineList(timeline) {
    const timelineContainer = document.getElementById('lead-timeline-container');
    timelineContainer.innerHTML = '';

    if (timeline.length === 0) {
        timelineContainer.innerHTML = `<div style="text-align: center; color: #a0aec0; padding: 2rem;">No timeline actions recorded yet</div>`;
        return;
    }

    timeline.forEach(t => {
        const item = document.createElement('div');
        item.style.borderLeft = '3px solid var(--primary-color)';
        item.style.paddingLeft = '1rem';
        item.style.position = 'relative';
        item.style.marginBottom = '0.5rem';

        // Bullet point dot
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.left = '-7px';
        dot.style.top = '2px';
        dot.style.width = '11px';
        dot.style.height = '11px';
        dot.style.borderRadius = '50%';
        dot.style.backgroundColor = 'var(--primary-color)';
        item.appendChild(dot);

        const dateFormatted = formatDate(t.timestamp);
        
        let notesHTML = '';
        if (t.notes && t.notes.trim() !== '') {
            notesHTML = `<blockquote style="font-style: italic; color: #718096; border-left: 2px solid var(--border-color); padding-left: 0.5rem; margin-top: 0.25rem;">"${t.notes}"</blockquote>`;
        }

        item.innerHTML += `
            <div style="font-size: 0.8rem; color: #a0aec0; margin-bottom: 0.25rem;">
                <strong>${dateFormatted}</strong> &mdash; 
                <span style="color: var(--text-color); font-weight: 600;">${t.username}</span>
            </div>
            <div style="font-size: 0.9rem; font-weight: 600; color: var(--primary-color); margin-bottom: 0.125rem;">
                ${t.activity_type}
            </div>
            <div style="font-size: 0.9rem;">
                ${t.details || ''}
            </div>
            ${notesHTML}
        `;
        timelineContainer.appendChild(item);
    });
}

function loadLeadTimelineData() {
    if (activeLeadId) {
        // Timeline renders automatically inside viewLeadDetail, but this re-triggers if tab is clicked
        renderTimelineList(activeLeadTimeline);
    }
}

// Create lead from Brand / Influencer / Agency detail popup
async function addToLeads(entityType, entityId) {
    const confirmMsg = `Initialize this ${entityType} as a lead in the CRM?`;
    if (!confirm(confirmMsg)) return;

    const body = {};
    if (entityType === 'Brand') body.brand_id = entityId;
    else if (entityType === 'Agency') body.agency_id = entityId;
    else body.influencer_id = entityId;

    try {
        const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const newLead = await res.json();
            showToast('Lead initialized successfully!', 'success');
            
            // Close Brand/Influencer/Agency detail modal
            closeModal('detail-brand-modal');
            closeModal('detail-influencer-modal');
            closeModal('detail-agency-modal');
            
            // Redirect to leads page
            const leadsNavLink = document.querySelector('.nav-link[data-target="leads-view"]');
            if (leadsNavLink) leadsNavLink.click();
            
            // Open lead details directly
            viewLeadDetail(newLead.id);
        } else {
            const data = await res.json();
            if (res.status === 409 && data.lead) {
                showToast('Lead already exists, opening it...', 'info');
                closeModal('detail-brand-modal');
                closeModal('detail-influencer-modal');
                closeModal('detail-agency-modal');
                const leadsNavLink = document.querySelector('.nav-link[data-target="leads-view"]');
                if (leadsNavLink) leadsNavLink.click();
                viewLeadDetail(data.lead.id);
            } else {
                showToast(data.error || 'Failed to initialize lead', 'error');
            }
        }
    } catch (err) {
        console.error('Error creating lead:', err);
        showToast('Error connecting to server', 'error');
    }
}

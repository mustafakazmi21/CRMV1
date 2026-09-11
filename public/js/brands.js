// public/js/brands.js

let brandsPage = 1;
const brandsLimit = 50;

// DOM Elements
const brandsTableBody = document.querySelector('#brands-table tbody');
const brandsSearchInput = document.getElementById('brands-search-input');
const brandsStatusFilter = document.getElementById('brands-status-filter');
const brandsAgencyFilter = document.getElementById('brands-agency-filter');
const brandsArchivedCheckbox = document.getElementById('brands-archived-checkbox');
const brandsPaginationInfo = document.getElementById('brands-pagination-info');
const brandsPrevBtn = document.getElementById('brands-prev-btn');
const brandsNextBtn = document.getElementById('brands-next-btn');

const openAddBrandBtn = document.getElementById('open-add-brand-btn');
const addBrandForm = document.getElementById('add-brand-form');
const editBrandForm = document.getElementById('edit-brand-form');
const detailBrandArchiveBtn = document.getElementById('detail-brand-archive-btn');

// Listeners
if (brandsSearchInput) {
    brandsSearchInput.addEventListener('input', debounce(() => { brandsPage = 1; loadBrands(); }, 300));
}
if (brandsStatusFilter) {
    brandsStatusFilter.addEventListener('change', () => { brandsPage = 1; loadBrands(); });
}
if (brandsAgencyFilter) {
    brandsAgencyFilter.addEventListener('change', () => { brandsPage = 1; loadBrands(); });
}
if (brandsArchivedCheckbox) {
    brandsArchivedCheckbox.addEventListener('change', () => {
        brandsPage = 1;
        loadBrands();
    });
}

if (brandsPrevBtn) {
    brandsPrevBtn.addEventListener('click', () => {
        if (brandsPage > 1) {
            brandsPage--;
            loadBrands();
        }
    });
}

if (brandsNextBtn) {
    brandsNextBtn.addEventListener('click', () => {
        brandsPage++;
        loadBrands();
    });
}

if (openAddBrandBtn) {
    openAddBrandBtn.addEventListener('click', () => {
        addBrandForm.reset();
        openModal('add-brand-modal');
    });
}

// Add brand submission
if (addBrandForm) {
    addBrandForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addBrandForm);
        const body = {};
        formData.forEach((value, key) => {
            body[key] = value;
        });

        try {
            const res = await fetch('/api/brands', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (res.ok) {
                showToast('Brand added successfully', 'success');
                closeModal('add-brand-modal');
                loadBrands();
                loadDashboardStats();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to add brand', 'error');
            }
        } catch (err) {
            console.error('Error adding brand:', err);
            showToast('Error connecting to server', 'error');
        }
    });
}

// Edit brand submission
if (editBrandForm) {
    editBrandForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editBrandForm);
        const body = {};
        formData.forEach((value, key) => {
            body[key] = value;
        });
        
        const id = body.id;

        try {
            const res = await fetch(`/api/brands/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                showToast('Brand updated successfully', 'success');
                closeModal('detail-brand-modal');
                loadBrands();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to update brand', 'error');
            }
        } catch (err) {
            console.error('Error updating brand:', err);
            showToast('Error connecting to server', 'error');
        }
    });
}

// Load Brand List
async function loadBrands() {
    if (!brandsTableBody) return;

    const searchVal = brandsSearchInput ? brandsSearchInput.value.trim() : '';
    const statusVal = brandsStatusFilter ? brandsStatusFilter.value.trim() : '';
    const agencyVal = brandsAgencyFilter ? brandsAgencyFilter.value : '';
    const isArchived = brandsArchivedCheckbox ? brandsArchivedCheckbox.checked : false;

    try {
        let url = `/api/brands?page=${brandsPage}&limit=${brandsLimit}&search=${encodeURIComponent(searchVal)}&archived=${isArchived}`;
        if (statusVal) url += `&status=${encodeURIComponent(statusVal)}`;
        if (agencyVal) url += `&agency_id=${encodeURIComponent(agencyVal)}`;

        const res = await fetch(url);
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        renderBrandsTable(data.brands || []);
        updateBrandsPagination(data.pagination || { page: 1, totalRows: 0, totalPages: 1 });
    } catch (err) {
        console.error('Error loading brands:', err);
        showToast('Failed to load brands list', 'error');
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

function renderBrandsTable(brands) {
    if (!brandsTableBody) return;
    brandsTableBody.innerHTML = '';
    
    if (brands.length === 0) {
        brandsTableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #a0aec0; padding: 2rem;">No brands found</td></tr>`;
        return;
    }

    brands.forEach(b => {
        const tr = document.createElement('tr');
        
        // Instagram URL link
        let instaLink = '-';
        if (b.instagram_url) {
            let href = b.instagram_url.trim();
            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                href = 'https://' + href;
            }
            instaLink = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); font-weight: 500;">Instagram ↗</a>`;
        }

        // Followers display
        const followersDisplay = b.followers_formatted || (b.followers !== null && b.followers !== undefined ? Number(b.followers).toLocaleString() : '-');
        
        // Posts display
        const postsDisplay = b.posts_formatted || (b.posts !== null && b.posts !== undefined ? Number(b.posts).toLocaleString() : '-');

        // Status badge
        const statusText = b.status || 'New';
        const statusBadgeClass = getStatusBadgeClass(statusText);

        // Message snippet
        let msgSnippet = '-';
        if (b.message_received) {
            const rawMsg = b.message_received.trim();
            msgSnippet = rawMsg.length > 40 ? `${escapeHtml(rawMsg.substring(0, 40))}...` : escapeHtml(rawMsg);
        }

        // Status timestamp display
        let timestampDisplay = '-';
        if (b.status_timestamp) {
            try {
                timestampDisplay = formatDate(b.status_timestamp);
            } catch (e) {
                timestampDisplay = String(b.status_timestamp).substring(0, 16);
            }
        }

        tr.innerHTML = `
            <td><strong>${b.username ? '@' + escapeHtml(b.username.replace(/^@/, '')) : '-'}</strong></td>
            <td>${escapeHtml(b.display_name || '-')}</td>
            <td>${instaLink}</td>
            <td>${escapeHtml(followersDisplay)}</td>
            <td>${escapeHtml(postsDisplay)}</td>
            <td><span class="user-role-badge ${statusBadgeClass}">${escapeHtml(statusText)}</span></td>
            <td title="${escapeHtml(b.message_received || '')}">${msgSnippet}</td>
            <td>${timestampDisplay}</td>
            <td>
                <button class="table-action-link" onclick="viewBrandDetail(${b.id})">Open</button>
            </td>
        `;
        brandsTableBody.appendChild(tr);
    });
}

function getStatusBadgeClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('new')) return 'ADMIN';
    if (s.includes('sent') || s.includes('replied')) return 'EMPLOYEE';
    if (s.includes('closed') || s.includes('deal')) return 'ADMIN';
    if (s.includes('not interested')) return 'EMPLOYEE';
    return '';
}

function updateBrandsPagination(pagination) {
    if (!brandsPaginationInfo) return;
    const { page, totalRows, totalPages } = pagination;
    brandsPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;
    
    if (brandsPrevBtn) brandsPrevBtn.disabled = page <= 1;
    if (brandsNextBtn) brandsNextBtn.disabled = page >= totalPages;
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

// View Brand details & history
async function viewBrandDetail(id) {
    try {
        const res = await fetch(`/api/brands/${id}`);
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        const brand = data.brand;
        const logs = data.activityLogs;

        // Set title
        const brandTitle = brand.display_name || brand.username || 'Brand Details';
        document.getElementById('detail-brand-title').textContent = brandTitle;

        // Fill form fields
        const formElements = editBrandForm.elements;
        for (const key in brand) {
            if (formElements[key]) {
                if (['status_timestamp', 'first_seen'].includes(key) && brand[key]) {
                    formElements[key].value = formatForDatetimeLocal(brand[key]);
                } else {
                    formElements[key].value = brand[key] !== null && brand[key] !== undefined ? brand[key] : '';
                }
            }
        }

        // Configure convert to lead button
        const convertBtn = document.getElementById('detail-brand-convert-btn');
        if (convertBtn) {
            convertBtn.onclick = () => addToLeads('Brand', brand.id);
        }

        // Configure archive button
        if (detailBrandArchiveBtn) {
            if (brand.is_archived) {
                detailBrandArchiveBtn.textContent = 'Unarchive Brand';
                detailBrandArchiveBtn.className = 'btn primary-btn';
                detailBrandArchiveBtn.onclick = () => handleArchiveUnarchive(brand.id, 'unarchive');
            } else {
                detailBrandArchiveBtn.textContent = 'Archive Brand';
                detailBrandArchiveBtn.className = 'btn danger-btn';
                detailBrandArchiveBtn.onclick = () => handleArchiveUnarchive(brand.id, 'archive');
            }
        }

        // Render history logs
        renderBrandHistoryTable(logs);

        // Open modal
        openModal('detail-brand-modal');

    } catch (err) {
        console.error('Error fetching brand details:', err);
        showToast('Failed to load brand details', 'error');
    }
}

function renderBrandHistoryTable(logs) {
    const historyBody = document.querySelector('#brand-history-table tbody');
    if (!historyBody) return;
    historyBody.innerHTML = '';

    if (!logs || logs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 1.5rem;">No history logged for this brand</td></tr>`;
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

// Archive or Unarchive brand
async function handleArchiveUnarchive(id, action) {
    const confirmMsg = `Are you sure you want to ${action} this brand?`;
    if (!confirm(confirmMsg)) return;

    try {
        const res = await fetch(`/api/brands/${id}/${action}`, { method: 'POST' });
        if (res.ok) {
            showToast(`Brand successfully ${action}d`, 'success');
            closeModal('detail-brand-modal');
            loadBrands();
            loadDashboardStats();
        } else {
            const data = await res.json();
            showToast(data.error || `Failed to ${action} brand`, 'error');
        }
    } catch (err) {
        console.error(`Error during brand ${action}:`, err);
        showToast('Error connecting to server', 'error');
    }
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// public/js/brands.js

let brandsPage = 1;
const brandsLimit = 50;

// DOM Elements
const brandsTableBody = document.querySelector('#brands-table tbody');
const brandsSearchInput = document.getElementById('brands-search-input');
const brandsCategoryFilter = document.getElementById('brands-category-filter');
const brandsLocationFilter = document.getElementById('brands-location-filter');
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
brandsSearchInput.addEventListener('input', debounce(() => { brandsPage = 1; loadBrands(); }, 300));
brandsCategoryFilter.addEventListener('input', debounce(() => { brandsPage = 1; loadBrands(); }, 300));
brandsLocationFilter.addEventListener('input', debounce(() => { brandsPage = 1; loadBrands(); }, 300));
brandsAgencyFilter.addEventListener('change', () => { brandsPage = 1; loadBrands(); });

brandsArchivedCheckbox.addEventListener('change', () => {
    brandsPage = 1;
    loadBrands();
});

brandsPrevBtn.addEventListener('click', () => {
    if (brandsPage > 1) {
        brandsPage--;
        loadBrands();
    }
});

brandsNextBtn.addEventListener('click', () => {
    brandsPage++;
    loadBrands();
});

openAddBrandBtn.addEventListener('click', () => {
    addBrandForm.reset();
    openModal('add-brand-modal');
});

// Add brand submission
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

// Edit brand submission
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

// Load Brand List
async function loadBrands() {
    const searchVal = brandsSearchInput.value.trim();
    const categoryVal = brandsCategoryFilter.value.trim();
    const locationVal = brandsLocationFilter.value.trim();
    const agencyVal = brandsAgencyFilter.value;
    const isArchived = brandsArchivedCheckbox.checked;

    try {
        let url = `/api/brands?page=${brandsPage}&limit=${brandsLimit}&search=${encodeURIComponent(searchVal)}&archived=${isArchived}`;
        if (categoryVal) url += `&category=${encodeURIComponent(categoryVal)}`;
        if (locationVal) url += `&location=${encodeURIComponent(locationVal)}`;
        if (agencyVal) url += `&agency_id=${encodeURIComponent(agencyVal)}`;

        const res = await fetch(url);
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        renderBrandsTable(data.brands);
        updateBrandsPagination(data.pagination);
    } catch (err) {
        console.error('Error loading brands:', err);
        showToast('Failed to load brands list', 'error');
    }
}

function renderBrandsTable(brands) {
    brandsTableBody.innerHTML = '';
    
    if (brands.length === 0) {
        brandsTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #a0aec0; padding: 2rem;">No brands found</td></tr>`;
        return;
    }

    brands.forEach(b => {
        const tr = document.createElement('tr');
        
        // Clean URL display
        const siteUrl = b.company_url || '';
        const siteDisplay = siteUrl ? `<a href="${siteUrl}" target="_blank">${siteUrl.replace(/https?:\/\/(www\.)?/, '').substring(0, 25)}</a>` : '-';

        tr.innerHTML = `
            <td><strong>${b.brand_name || '-'}</strong></td>
            <td>${b.category || '-'}</td>
            <td>${b.headquarter || '-'}</td>
            <td>${b.revenue || '-'}</td>
            <td>${b.how_many_employees || '-'}</td>
            <td>${b.marketing_head || '-'}</td>
            <td>${siteDisplay}</td>
            <td>
                <button class="table-action-link" onclick="viewBrandDetail(${b.id})">Open</button>
            </td>
        `;
        brandsTableBody.appendChild(tr);
    });
}

function updateBrandsPagination(pagination) {
    const { page, totalRows, totalPages } = pagination;
    brandsPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total records)`;
    
    brandsPrevBtn.disabled = page <= 1;
    brandsNextBtn.disabled = page >= totalPages;
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
        document.getElementById('detail-brand-title').textContent = brand.brand_name;

        // Fill form fields
        const formElements = editBrandForm.elements;
        for (const key in brand) {
            if (formElements[key]) {
                formElements[key].value = brand[key] !== null ? brand[key] : '';
            }
        }

        // Configure convert to lead button
        document.getElementById('detail-brand-convert-btn').onclick = () => addToLeads('Brand', brand.id);

        // Configure archive button
        if (brand.is_archived) {
            detailBrandArchiveBtn.textContent = 'Unarchive Brand';
            detailBrandArchiveBtn.className = 'btn primary-btn';
            detailBrandArchiveBtn.onclick = () => handleArchiveUnarchive(brand.id, 'unarchive');
        } else {
            detailBrandArchiveBtn.textContent = 'Archive Brand';
            detailBrandArchiveBtn.className = 'btn danger-btn';
            detailBrandArchiveBtn.onclick = () => handleArchiveUnarchive(brand.id, 'archive');
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
    historyBody.innerHTML = '';

    if (logs.length === 0) {
        historyBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 1.5rem;">No history logged for this brand</td></tr>`;
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

// public/js/activities.js

let activitiesPage = 1;
const activitiesLimit = 50;

// DOM Elements
const activitiesTableBody = document.querySelector('#activities-table tbody');
const activitiesPaginationInfo = document.getElementById('activities-pagination-info');
const activitiesPrevBtn = document.getElementById('activities-prev-btn');
const activitiesNextBtn = document.getElementById('activities-next-btn');

// Listeners
activitiesPrevBtn.addEventListener('click', () => {
    if (activitiesPage > 1) {
        activitiesPage--;
        loadGlobalActivities();
    }
});

activitiesNextBtn.addEventListener('click', () => {
    activitiesPage++;
    loadGlobalActivities();
});

// Load Global Activity logs
async function loadGlobalActivities() {
    try {
        const res = await fetch(`/api/activities?page=${activitiesPage}&limit=${activitiesLimit}`);
        
        if (res.status === 401) {
            return showLogin();
        }
        
        if (res.status === 403) {
            showToast('Access Denied: Only administrators can view the global Activity Log.', 'error');
            switchView('dashboard-view');
            return;
        }

        const data = await res.json();
        renderActivitiesTable(data.logs);
        updateActivitiesPagination(data.pagination);
    } catch (err) {
        console.error('Error loading activity logs:', err);
        showToast('Failed to load global activity logs', 'error');
    }
}

function renderActivitiesTable(logs) {
    activitiesTableBody.innerHTML = '';

    if (logs.length === 0) {
        activitiesTableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #a0aec0; padding: 2rem;">No activities logged yet</td></tr>`;
        return;
    }

    logs.forEach(l => {
        const tr = document.createElement('tr');
        
        // Setup color formatting for values
        const fieldChangedVal = l.field_changed ? `<code>${l.field_changed}</code>` : '-';
        const oldVal = l.old_value !== null ? `<span style="color: #e53e3e;" title="${l.old_value}">${l.old_value}</span>` : '-';
        const newVal = l.new_value !== null ? `<span style="color: #38a169;" title="${l.new_value}">${l.new_value}</span>` : '-';
        
        tr.innerHTML = `
            <td>${formatDate(l.timestamp)}</td>
            <td><strong>${l.username}</strong></td>
            <td><span class="user-role-badge">${l.action_type}</span></td>
            <td>${l.record_type || '-'}</td>
            <td><strong>${l.record_name || '-'}</strong></td>
            <td>${fieldChangedVal}</td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${oldVal}</td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${newVal}</td>
        `;
        activitiesTableBody.appendChild(tr);
    });
}

function updateActivitiesPagination(pagination) {
    const { page, totalRows, totalPages } = pagination;
    activitiesPaginationInfo.textContent = `Showing page ${page} of ${totalPages || 1} (${totalRows} total logs)`;

    activitiesPrevBtn.disabled = page <= 1;
    activitiesNextBtn.disabled = page >= totalPages;
}

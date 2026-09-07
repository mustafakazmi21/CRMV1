// public/js/instagram.js

const instagramTableBody = document.querySelector('#instagram-table tbody');
const igStatUnread = document.getElementById('ig-stat-unread');
const igStatNeeds = document.getElementById('ig-stat-needs');
const igStatOverdue = document.getElementById('ig-stat-overdue');
const igEmpBreakdownTable = document.querySelector('#ig-emp-breakdown-table tbody');

async function loadInstagramFollowUps() {
    if (!currentUser) return;
    
    try {
        const res = await fetch('/api/instagram/follow-ups');
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        renderInstagramTable(data.followUps);
    } catch (err) {
        console.error('Error fetching instagram follow-ups:', err);
    }

    if (currentUser.role === 'ADMIN') {
        loadInstagramStats();
    }
}

function renderInstagramTable(followUps) {
    if (!instagramTableBody) return;
    
    instagramTableBody.innerHTML = '';
    
    if (followUps.length === 0) {
        instagramTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 2rem;">No pending Instagram follow-ups</td></tr>`;
        return;
    }

    followUps.forEach(f => {
        const tr = document.createElement('tr');
        
        let stateIndicator = '';
        if (f.status === 'Unread') {
            stateIndicator = '<span style="color: #e53e3e; font-weight: bold;">🔴 UNREAD</span>';
            tr.style.backgroundColor = 'rgba(254, 215, 215, 0.3)';
        } else if (f.status === 'Needs Follow-up') {
            stateIndicator = '<span style="color: #d69e2e; font-weight: bold;">🟡 Needs Follow-up</span>';
            tr.style.backgroundColor = 'rgba(254, 235, 200, 0.3)';
        } else {
            stateIndicator = '<span style="color: #38a169; font-weight: bold;">🟢 Handled</span>';
        }

        const snippet = f.message_snippet ? `"${f.message_snippet}"` : '-';
        const received = `Received ${formatDate(f.received_at)}`;
        const assigned = f.assigned_username || '<span style="color: #a0aec0; font-style: italic;">Unassigned</span>';

        tr.innerHTML = `
            <td>${stateIndicator}</td>
            <td>
                <strong>${f.profile_name}</strong><br>
                <span style="color: #718096; font-size: 0.85rem;">@${f.instagram_username}</span>
            </td>
            <td><em style="color: #4a5568;">${snippet}</em></td>
            <td><span style="font-size: 0.85rem; color: #718096;">${received}</span></td>
            <td>${assigned}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <a href="https://instagram.com/${f.instagram_username}" target="_blank" class="btn secondary-btn" style="padding: 0.25rem 0.5rem; text-decoration: none;" onclick="markFollowUpNeeds(${f.id}, '${f.status}')">Open Instagram</a>
                    ${f.status !== 'Handled' ? `<button class="btn primary-btn" style="padding: 0.25rem 0.5rem;" onclick="markFollowUpHandled(${f.id})">Mark Handled</button>` : ''}
                </div>
            </td>
        `;
        instagramTableBody.appendChild(tr);
    });
}

// When user clicks "Open Instagram", we transition it from Unread to Needs Follow-up so it's not lost if they forget to mark handled immediately.
async function markFollowUpNeeds(id, currentStatus) {
    if (currentStatus === 'Unread') {
        try {
            await fetch(`/api/instagram/follow-ups/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Needs Follow-up' })
            });
            // Don't toast to interrupt their IG opening, just reload silently in background
            setTimeout(loadInstagramFollowUps, 1000);
        } catch (e) {
            console.error(e);
        }
    }
}

async function markFollowUpHandled(id) {
    try {
        const res = await fetch(`/api/instagram/follow-ups/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Handled' })
        });
        
        if (res.ok) {
            showToast('Follow-up marked as handled', 'success');
            loadInstagramFollowUps();
        } else {
            showToast('Failed to mark handled', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Server error', 'error');
    }
}

async function loadInstagramStats() {
    try {
        const res = await fetch('/api/instagram/stats');
        if (!res.ok) return;
        
        const data = await res.json();
        
        if (igStatUnread) igStatUnread.textContent = data.overall.unread || 0;
        if (igStatNeeds) igStatNeeds.textContent = data.overall.needs_followup || 0;
        if (igStatOverdue) igStatOverdue.textContent = data.overall.overdue || 0;

        if (igEmpBreakdownTable) {
            igEmpBreakdownTable.innerHTML = '';
            if (data.employeeBreakdown.length === 0) {
                igEmpBreakdownTable.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0aec0;">No pending follow-ups</td></tr>`;
            } else {
                data.employeeBreakdown.forEach(emp => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${emp.employee}</td>
                        <td style="text-align: center;">${emp.unread}</td>
                        <td style="text-align: center;">${emp.needs_followup}</td>
                    `;
                    igEmpBreakdownTable.appendChild(tr);
                });
            }
        }
    } catch (e) {
        console.error('Error fetching instagram stats:', e);
    }
}

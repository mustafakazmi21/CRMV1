// public/js/team.js

const teamTableBody = document.querySelector('#team-table tbody');
const addEmployeeForm = document.getElementById('add-employee-form');
const openAddEmployeeBtn = document.getElementById('open-add-employee-btn');

// Reset password elements
const resetPasswordForm = document.getElementById('reset-password-form');
const generatePasswordBtn = document.getElementById('generate-password-btn');
const resetPasswordInput = document.getElementById('reset-password-input');

document.addEventListener('DOMContentLoaded', () => {
    if (openAddEmployeeBtn) {
        openAddEmployeeBtn.addEventListener('click', () => {
            addEmployeeForm.reset();
            openModal('add-employee-modal');
        });
    }

    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', handleAddEmployee);
    }
    
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
    
    if (generatePasswordBtn) {
        generatePasswordBtn.addEventListener('click', () => {
            const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
            resetPasswordInput.value = randomPassword;
        });
    }
});

async function loadTeamMembers() {
    try {
        const res = await fetch('/api/users');
        if (res.status === 401) return showLogin();
        if (res.status === 403) return;

        const data = await res.json();
        renderTeamTable(data.users);
    } catch (err) {
        console.error('Error loading team:', err);
        showToast('Failed to load team members', 'error');
    }
}

function renderTeamTable(users) {
    teamTableBody.innerHTML = '';

    if (!users || users.length === 0) {
        teamTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #a0aec0; padding: 2rem;">No team members found</td></tr>`;
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : '-';
        const roleBadgeClass = user.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';

        tr.innerHTML = `
            <td><strong>${user.username}</strong></td>
            <td>${user.email || '-'}</td>
            <td><span class="user-role-badge ${roleBadgeClass}">${user.role}</span></td>
            <td>${createdDate}</td>
            <td>
                <button class="btn secondary-btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="openResetPasswordModal(${user.id}, '${user.username}')">Reset Password</button>
            </td>
        `;
        teamTableBody.appendChild(tr);
    });
}

function openResetPasswordModal(userId, username) {
    document.getElementById('reset-password-user-id').value = userId;
    document.getElementById('reset-password-username').textContent = username;
    resetPasswordForm.reset();
    openModal('reset-password-modal');
}

async function handleResetPassword(e) {
    e.preventDefault();
    const userId = document.getElementById('reset-password-user-id').value;
    const newPassword = resetPasswordInput.value;

    if (!newPassword || newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        const data = await res.json();

        if (res.ok) {
            showToast('Password updated successfully', 'success');
            closeModal('reset-password-modal');
        } else {
            showToast(data.error || 'Failed to update password', 'error');
        }
    } catch (err) {
        console.error('Error resetting password:', err);
        showToast('Error connecting to server', 'error');
    }
}

async function handleAddEmployee(e) {
    e.preventDefault();

    const formData = new FormData(addEmployeeForm);
    const body = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
        role: formData.get('role')
    };

    if (!body.username || !body.password || !body.role) {
        showToast('Username, password, and role are required', 'error');
        return;
    }

    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Employee "${data.user.username}" created successfully`, 'success');
            closeModal('add-employee-modal');
            addEmployeeForm.reset();
            loadTeamMembers();
        } else {
            showToast(data.error || 'Failed to create employee', 'error');
        }
    } catch (err) {
        console.error('Error adding employee:', err);
        showToast('Error connecting to server', 'error');
    }
}

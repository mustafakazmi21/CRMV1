// public/js/agencies.js

const agenciesTableBody = document.querySelector('#agencies-table tbody');
const addAgencyForm = document.getElementById('add-agency-form');
const openAddAgencyBtn = document.getElementById('open-add-agency-btn');

document.addEventListener('DOMContentLoaded', () => {
    if (openAddAgencyBtn) {
        openAddAgencyBtn.addEventListener('click', () => {
            document.getElementById('agency-modal-title').textContent = 'Add Agency';
            addAgencyForm.reset();
            document.getElementById('agency_id').value = '';
            openModal('add-agency-modal');
        });
    }

    if (addAgencyForm) {
        addAgencyForm.addEventListener('submit', handleAddAgency);
    }
});

async function loadAgencies() {
    try {
        const res = await fetch('/api/agencies');
        if (res.status === 401) return showLogin();
        
        const data = await res.json();
        renderAgenciesTable(data.agencies || []);
    } catch (err) {
        console.error('Error loading agencies:', err);
        showToast('Failed to load agencies', 'error');
    }
}

function renderAgenciesTable(agencies) {
    if (!agenciesTableBody) return;
    agenciesTableBody.innerHTML = '';

    if (agencies.length === 0) {
        agenciesTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #a0aec0; padding: 2rem;">No agencies found</td></tr>`;
        return;
    }

    agencies.forEach(agency => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${agency.agency_name}</strong></td>
            <td>${agency.contact_person || '-'}</td>
            <td>${agency.email || '-'}</td>
            <td>${agency.phone || '-'}</td>
            <td>${agency.website ? `<a href="${agency.website}" target="_blank">Link</a>` : '-'}</td>
            <td>
                <button class="btn secondary-btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick='editAgency(${JSON.stringify(agency).replace(/'/g, "&#39;")})'>Edit</button>
            </td>
        `;
        agenciesTableBody.appendChild(tr);
    });
}

function editAgency(agency) {
    document.getElementById('agency-modal-title').textContent = 'Edit Agency';
    document.getElementById('agency_id').value = agency.id;
    addAgencyForm.elements['agency_name'].value = agency.agency_name;
    addAgencyForm.elements['contact_person'].value = agency.contact_person || '';
    addAgencyForm.elements['email'].value = agency.email || '';
    addAgencyForm.elements['phone'].value = agency.phone || '';
    addAgencyForm.elements['website'].value = agency.website || '';
    addAgencyForm.elements['notes'].value = agency.notes || '';
    openModal('add-agency-modal');
}

async function handleAddAgency(e) {
    e.preventDefault();

    const formData = new FormData(addAgencyForm);
    const agencyId = formData.get('agency_id');
    const body = {
        agency_name: formData.get('agency_name'),
        contact_person: formData.get('contact_person'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        website: formData.get('website'),
        notes: formData.get('notes')
    };

    if (!body.agency_name) {
        showToast('Agency name is required', 'error');
        return;
    }

    try {
        const url = agencyId ? `/api/agencies/${agencyId}` : '/api/agencies';
        const method = agencyId ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Agency "${data.agency.agency_name}" saved successfully`, 'success');
            closeModal('add-agency-modal');
            addAgencyForm.reset();
            loadAgencies();
        } else {
            showToast(data.error || 'Failed to save agency', 'error');
        }
    } catch (err) {
        console.error('Error saving agency:', err);
        showToast('Error connecting to server', 'error');
    }
}

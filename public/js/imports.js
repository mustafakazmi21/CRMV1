// public/js/imports.js

let importValidRows = [];
let importType = '';
let importFilename = '';
let importSummary = null;

document.addEventListener('DOMContentLoaded', () => {
    setupImportListeners();
});

function setupImportListeners() {
    const importBrandsBtn = document.getElementById('import-brands-btn');
    const importBrandsInput = document.getElementById('import-brands-file-input');
    const importInfluencersBtn = document.getElementById('import-influencers-btn');
    const importInfluencersInput = document.getElementById('import-influencers-file-input');
    const confirmImportBtn = document.getElementById('confirm-import-btn');

    if (importBrandsBtn && importBrandsInput) {
        importBrandsBtn.addEventListener('click', () => {
            importBrandsInput.click();
        });

        importBrandsInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0], 'brands');
                importBrandsInput.value = ''; // reset so same file can trigger change again
            }
        });
    }

    if (importInfluencersBtn && importInfluencersInput) {
        importInfluencersBtn.addEventListener('click', () => {
            importInfluencersInput.click();
        });

        importInfluencersInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0], 'influencers');
                importInfluencersInput.value = ''; // reset
            }
        });
    }

    if (confirmImportBtn) {
        confirmImportBtn.addEventListener('click', handleCommitImport);
    }
}

// Handle file selection and fetch preview data
async function handleFileSelect(file, type) {
    showToast(`Analyzing ${file.name}...`, 'info');
    
    importType = type;
    importFilename = file.name;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
        const res = await fetch('/api/import/preview', {
            method: 'POST',
            body: formData
        });

        if (res.status === 401) return showLogin();
        
        if (!res.ok) {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                showToast(data.error || 'Failed to process Excel file', 'error');
            } else {
                showToast(`Server returned error status: ${res.status}. Please restart your Node server.`, 'error');
            }
            return;
        }

        const data = await res.json();
        
        // Save references
        importValidRows = data.validRowsToImport;
        importSummary = data.summary;

        // Render preview UI
        renderImportPreview(data);

    } catch (err) {
        console.error('Import preview error:', err);
        showToast('Error uploading or processing spreadsheet', 'error');
    }
}

function renderImportPreview(data) {
    const { summary, problems, proposedUpdates } = data;

    // Fill Summary
    document.getElementById('import-stat-total').textContent = summary.total;
    document.getElementById('import-stat-new').textContent = summary.newCount;
    document.getElementById('import-stat-updated').textContent = summary.updatedCount;
    document.getElementById('import-stat-unchanged').textContent = summary.unchangedCount;
    document.getElementById('import-stat-problems').textContent = summary.problemCount;

    // Fill badges
    let updatesCount = 0;
    proposedUpdates.forEach(item => {
        updatesCount += item.changes.length;
    });
    document.getElementById('import-badge-updates').textContent = updatesCount;
    document.getElementById('import-badge-problems').textContent = problems.length;

    // Render updates table
    const updatesBody = document.querySelector('#import-updates-table tbody');
    updatesBody.innerHTML = '';
    if (proposedUpdates.length === 0) {
        updatesBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #a0aec0; padding: 2rem;">No record updates detected</td></tr>`;
    } else {
        proposedUpdates.forEach(item => {
            item.changes.forEach(change => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${item.name}</strong></td>
                    <td><code>${change.field}</code></td>
                    <td style="color: #e53e3e;">${change.oldValue || '-'}</td>
                    <td style="color: #38a169;">${change.newValue || '-'}</td>
                `;
                updatesBody.appendChild(tr);
            });
        });
    }

    // Render problems table
    const problemsBody = document.querySelector('#import-problems-table tbody');
    problemsBody.innerHTML = '';
    if (problems.length === 0) {
        problemsBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #a0aec0; padding: 2rem;">No problems detected in spreadsheet</td></tr>`;
    } else {
        problems.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>Row ${p.rowNumber}</strong></td>
                <td>${p.name || 'Unknown'}</td>
                <td style="color: var(--danger-color); font-weight: 500;">${p.error}</td>
            `;
            problemsBody.appendChild(tr);
        });
    }

    // Reset default active tab inside import modal
    const updatesTabBtn = document.querySelector('[onclick="switchModalTab(\'import-tab-updates\', this)"]');
    if (updatesTabBtn) {
        updatesTabBtn.click();
    }

    // Disable import confirmation button if there are no new or updated rows
    const confirmImportBtn = document.getElementById('confirm-import-btn');
    if (confirmImportBtn) {
        confirmImportBtn.disabled = (summary.newCount === 0 && summary.updatedCount === 0);
    }

    openModal('import-preview-modal');
}

// Post final confirmation to database
async function handleCommitImport() {
    if (importValidRows.length === 0) {
        showToast('No new or updated data available to import', 'info');
        return;
    }

    showToast('Importing spreadsheet rows...', 'info');

    try {
        const res = await fetch('/api/import/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                validRows: importValidRows,
                type: importType,
                filename: importFilename,
                summary: importSummary
            })
        });

        if (res.status === 401) return showLogin();

        if (!res.ok) {
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                showToast(data.error || 'Failed to complete import session', 'error');
            } else {
                showToast(`Server returned error status: ${res.status}. Please restart your Node server.`, 'error');
            }
            return;
        }

        const data = await res.json();
        showToast(data.message || 'Import completed successfully!', 'success');
        closeModal('import-preview-modal');
        
        // Refresh current panel
        if (importType === 'brands') {
            loadBrands();
        } else if (importType === 'influencers') {
            loadInfluencers();
        }
        
        loadDashboardStats();
    } catch (err) {
        console.error('Import commit error:', err);
        showToast('Error sending import request', 'error');
    }
}

// server/controllers/importController.js
const excelImportService = require('../services/excelImportService');
const { logActivity } = require('../services/activityLogService');

async function getPreview(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'Excel file is required' });
    }

    const { type } = req.body;
    const validTypes = ['brands', 'influencers', 'agencies'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Valid import type (brands, influencers, or agencies) is required' });
    }

    try {
        const analysis = await excelImportService.analyzeImport(req.file.buffer, type);
        return res.json(analysis);
    } catch (err) {
        console.error('Error analyzing spreadsheet:', err);
        return res.status(500).json({ error: 'Failed to process Excel file. Verify file format.' });
    }
}

async function commitImport(req, res) {
    const { validRows, type, filename, summary = {} } = req.body;
    const username = req.session && req.session.user ? req.session.user.username : 'system';

    if (!validRows || !Array.isArray(validRows)) {
        return res.status(400).json({ error: 'Valid rows payload is required' });
    }

    const validTypes = ['brands', 'influencers', 'agencies'];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Valid import type is required' });
    }

    try {
        const result = await excelImportService.commitImport(validRows, type, username, filename);

        let message = `Successfully processed import session. ${result.newImported} records added, ${result.updatedImported} records updated.`;
        if (result.failedImported > 0) {
            message += ` (${result.failedImported} records failed)`;
        }

        return res.json({
            success: true,
            newImported: result.newImported,
            updatedImported: result.updatedImported,
            failedImported: result.failedImported || 0,
            message
        });
    } catch (err) {
        console.error('Error committing spreadsheet import:', err);
        return res.status(500).json({ error: 'Database transaction failed during commit: ' + (err.message || 'Unknown error') });
    }
}

module.exports = {
    getPreview,
    commitImport
};

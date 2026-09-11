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
    const { validRows, type, filename, summary } = req.body;
    const username = req.session.user.username;

    if (!validRows || !Array.isArray(validRows)) {
        return res.status(400).json({ error: 'Valid rows payload is required' });
    }

    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Valid import type is required' });
    }

    try {
        const result = await excelImportService.commitImport(validRows, type, username, filename);
        
        // Log global import activity
        const summaryStr = `New: ${summary.newCount}, Updated: ${summary.updatedCount}, Unchanged: ${summary.unchangedCount}, Problems: ${summary.problemCount}`;
        await logActivity(username, 'Excel imported', 'Import', 0, filename || 'import.xlsx', null, null, summaryStr);

        return res.json({
            success: true,
            message: `Successfully processed import session. ${result.newImported} records added, ${result.updatedImported} records updated.`
        });
    } catch (err) {
        console.error('Error committing spreadsheet import:', err);
        return res.status(500).json({ error: 'Database transaction failed during commit' });
    }
}

module.exports = {
    getPreview,
    commitImport
};

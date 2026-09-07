// server/services/activityLogService.js
const pool = require('../config/db');

/**
 * Logs an action performed by an employee.
 * 
 * @param {string} username Username of the logged-in user
 * @param {string} actionType E.g. 'Brand added', 'Brand edited', 'Brand archived', 'Employee login', 'Employee logout'
 * @param {string} recordType E.g. 'Brand', 'Influencer', 'User'
 * @param {number} recordId ID of the affected record (0 or null if none)
 * @param {string} recordName Name or designation of the record
 * @param {string|null} fieldChanged Column name that was edited (null for creation/archival)
 * @param {string|null} oldValue Previous value of the field (null if none)
 * @param {string|null} newValue New value of the field (null if none)
 */
async function logActivity(username, actionType, recordType, recordId, recordName, fieldChanged = null, oldValue = null, newValue = null) {
    try {
        const queryText = `
            INSERT INTO activity_logs (
                username, action_type, record_type, record_id, record_name, field_changed, old_value, new_value, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        `;
        await pool.query(queryText, [
            username,
            actionType,
            recordType,
            recordId || 0,
            recordName || '',
            fieldChanged,
            oldValue !== null ? String(oldValue) : null,
            newValue !== null ? String(newValue) : null
        ]);
    } catch (err) {
        console.error('Failed to write activity log to database:', err);
    }
}

module.exports = {
    logActivity
};

// server/services/excelImportService.js
const pool = require('../config/db');
const { logActivity } = require('./activityLogService');

// Normalize URLs by removing protocols, www, formulas, trailing slashes, and spaces
function normalizeUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    
    // Extract URL from =HYPERLINK formula if present
    const hyperlinkMatch = u.match(/HYPERLINK\("([^"]+)"/i);
    if (hyperlinkMatch) {
        u = hyperlinkMatch[1];
    }
    
    u = u.toLowerCase();
    u = u.replace(/^https?:\/\/(www\.)?/, '');
    u = u.replace(/\/$/, '');
    return u.trim();
}

// Extract handle from Instagram URL or return cleaned handle
function normalizeInstaHandle(val) {
    if (!val) return '';
    let s = String(val).trim();
    
    const hyperlinkMatch = s.match(/HYPERLINK\("([^"]+)"/i);
    if (hyperlinkMatch) {
        s = hyperlinkMatch[1];
    }
    
    s = s.toLowerCase();
    if (s.includes('instagram.com/')) {
        let parts = s.split('instagram.com/');
        let handlePart = parts[1] || '';
        handlePart = handlePart.split('?')[0]; // Remove query params
        handlePart = handlePart.replace(/\/$/, ''); // Remove trailing slash
        return handlePart.trim();
    }
    
    return s.replace(/^@/, '').trim();
}

// Mapping from Spreadsheet headers to DB columns
const brandMapping = {
    'Brand': 'brand_name',
    'Founded Year': 'founded_year',
    'Category': 'category',
    'Brand Focus': 'brand_focus',
    'Founder names': 'founder_names',
    'Revenue': 'revenue',
    'Revenue Year': 'revenue_year',
    'Last funding amount (cr) & (M)': 'last_funding_amount',
    'Last funding data': 'last_funding_data',
    'Last funding date': 'last_funding_date',
    'Headquarter': 'headquarter',
    'Main geography outreach': 'main_geography_outreach',
    'LinkedIn': 'linkedin',
    'How many employees?': 'how_many_employees',
    'Marketing Head': 'marketing_head',
    'Marketing Mail Id': 'marketing_mail_id',
    'Sales Head': 'sales_head',
    'Sales Head mail': 'sales_head_mail',
    'Content Marketing Head': 'content_marketing_head',
    'Content Marketing Head mail id': 'content_marketing_head_mail_id',
    'Company Phone': 'company_phone',
    'Company URL': 'company_url',
    'Facebook': 'facebook',
    'Instagram': 'instagram',
    'YouTube': 'youtube',
    'Twitter': 'twitter',
    'Main influencer marketing platform (Facebook / YouTube / Instagram / X)': 'main_influencer_platform',
    'Web Traffic ': 'web_traffic'
};

const influencerMapping = {
    'Influencer Name': 'influencer_name',
    'Lead by': 'lead_by',
    'Content & Why this person': 'content_why_this_person',
    'Instagram URL': 'instagram_url',
    'Followers': 'followers',
    'Script': 'script',
    'Comment Average': 'comment_average',
    'Send Date': 'send_date'
};

// Process Excel buffer and return preview analysis
async function analyzeImport(buffer, type) {
    const xlsx = require('xlsx'); // Lazy loaded to improve server startup time
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const summary = { total: rows.length, newCount: 0, updatedCount: 0, unchangedCount: 0, problemCount: 0 };
    const problems = [];
    const proposedUpdates = [];
    const validRowsToImport = [];

    if (type === 'brands') {
        // Load all active brands for duplicate checking
        const dbRes = await pool.query('SELECT * FROM brands WHERE is_archived = false ORDER BY id ASC');
        const dbBrands = dbRes.rows;

        // Build lookups
        const nameLookup = {};
        const urlLookup = {};
        const linkedinLookup = {};
        dbBrands.forEach(b => {
            if (b.brand_name) nameLookup[b.brand_name.toLowerCase().trim()] = b;
            if (b.company_url) urlLookup[normalizeUrl(b.company_url)] = b;
            if (b.linkedin) linkedinLookup[normalizeUrl(b.linkedin)] = b;
        });

        rows.forEach((row, idx) => {
            const rowNum = idx + 2; // header is row 1
            const name = row['Brand'] ? String(row['Brand']).trim() : '';

            if (!name) {
                summary.problemCount++;
                problems.push({ rowNumber: rowNum, name: 'Unknown', error: 'Missing Brand name' });
                return;
            }

            // Find match
            let matchedRecord = null;
            const companyUrl = row['Company URL'] ? String(row['Company URL']).trim() : '';
            const linkedinUrl = row['LinkedIn'] ? String(row['LinkedIn']).trim() : '';

            // Match by name first since company URLs can be generic forms
            if (name) {
                matchedRecord = nameLookup[name.toLowerCase()];
            }
            if (!matchedRecord && companyUrl) {
                matchedRecord = urlLookup[normalizeUrl(companyUrl)];
            }
            if (!matchedRecord && linkedinUrl) {
                matchedRecord = linkedinLookup[normalizeUrl(linkedinUrl)];
            }

            if (matchedRecord) {
                // Record matches, compare fields
                const changes = [];
                const updatedRowData = { ...matchedRecord };

                for (const [sheetKey, dbCol] of Object.entries(brandMapping)) {
                    if (row[sheetKey] !== undefined) {
                        let excelVal = cleanExcelVal(row[sheetKey]);
                        let crmVal = matchedRecord[dbCol] !== null ? String(matchedRecord[dbCol]).trim() : '';

                        // If Excel value is blank, do NOT overwrite CRM value
                        if (excelVal === '') continue;

                        if (excelVal !== crmVal) {
                            changes.push({
                                field: sheetKey,
                                dbField: dbCol,
                                oldValue: crmVal,
                                newValue: excelVal
                            });
                            updatedRowData[dbCol] = excelVal;
                        }
                    }
                }

                if (changes.length > 0) {
                    summary.updatedCount++;
                    proposedUpdates.push({
                        id: matchedRecord.id,
                        name: matchedRecord.brand_name,
                        changes
                    });
                    validRowsToImport.push({
                        action: 'UPDATE',
                        id: matchedRecord.id,
                        name: matchedRecord.brand_name,
                        data: updatedRowData,
                        changes
                    });
                } else {
                    summary.unchangedCount++;
                }
            } else {
                // New record
                summary.newCount++;
                const newRowData = {};
                for (const [sheetKey, dbCol] of Object.entries(brandMapping)) {
                    newRowData[dbCol] = cleanExcelVal(row[sheetKey]);
                }
                validRowsToImport.push({
                    action: 'INSERT',
                    name: newRowData.brand_name,
                    data: newRowData
                });
            }
        });
    } else if (type === 'influencers') {
        // Load active influencers
        const dbRes = await pool.query('SELECT * FROM influencers WHERE is_archived = false ORDER BY id ASC');
        const dbInfluencers = dbRes.rows;

        const nameLookup = {};
        const instaLookup = {};
        dbInfluencers.forEach(i => {
            if (i.influencer_name) nameLookup[i.influencer_name.toLowerCase().trim()] = i;
            if (i.instagram_url) instaLookup[normalizeInstaHandle(i.instagram_url)] = i;
        });

        rows.forEach((row, idx) => {
            const rowNum = idx + 2;
            const name = row['Influencer Name'] ? String(row['Influencer Name']).trim() : '';

            if (!name) {
                summary.problemCount++;
                problems.push({ rowNumber: rowNum, name: 'Unknown', error: 'Missing Influencer Name' });
                return;
            }

            let matchedRecord = null;
            const instaUrl = row['Instagram URL'] ? String(row['Instagram URL']).trim() : '';

            if (name) {
                matchedRecord = nameLookup[name.toLowerCase()];
            }
            if (!matchedRecord && instaUrl) {
                matchedRecord = instaLookup[normalizeInstaHandle(instaUrl)];
            }

            if (matchedRecord) {
                const changes = [];
                const updatedRowData = { ...matchedRecord };

                for (const [sheetKey, dbCol] of Object.entries(influencerMapping)) {
                    if (row[sheetKey] !== undefined) {
                        let excelVal = cleanExcelVal(row[sheetKey]);
                        let crmVal = matchedRecord[dbCol];

                        if (dbCol === 'send_date' && crmVal) {
                            crmVal = new Date(crmVal).toISOString().split('T')[0];
                        }
                        crmVal = crmVal !== null ? String(crmVal).trim() : '';

                        if (excelVal === '') continue;

                        if (excelVal !== crmVal) {
                            changes.push({
                                field: sheetKey,
                                dbField: dbCol,
                                oldValue: crmVal,
                                newValue: excelVal
                            });
                            updatedRowData[dbCol] = excelVal;
                        }
                    }
                }

                if (changes.length > 0) {
                    summary.updatedCount++;
                    proposedUpdates.push({
                        id: matchedRecord.id,
                        name: matchedRecord.influencer_name,
                        changes
                    });
                    validRowsToImport.push({
                        action: 'UPDATE',
                        id: matchedRecord.id,
                        name: matchedRecord.influencer_name,
                        data: updatedRowData,
                        changes
                    });
                } else {
                    summary.unchangedCount++;
                }
            } else {
                summary.newCount++;
                const newRowData = {};
                for (const [sheetKey, dbCol] of Object.entries(influencerMapping)) {
                    let val = cleanExcelVal(row[sheetKey]);
                    if (dbCol === 'send_date' && val === '') {
                        newRowData[dbCol] = null;
                    } else {
                        newRowData[dbCol] = val;
                    }
                }
                validRowsToImport.push({
                    action: 'INSERT',
                    name: newRowData.influencer_name,
                    data: newRowData
                });
            }
        });
    }

    return {
        summary,
        problems,
        proposedUpdates,
        validRowsToImport
    };
}

function cleanExcelVal(val) {
    if (val === undefined || val === null) return '';
    let s = String(val).trim();
    const hyperlinkMatch = s.match(/HYPERLINK\("([^"]+)"/i);
    if (hyperlinkMatch) {
        s = hyperlinkMatch[1];
    }
    return s;
}

// Commit the validated rows to database
async function commitImport(validRows, type, username, filename) {
    const client = await pool.connect();
    let newImported = 0;
    let updatedImported = 0;

    try {
        await client.query('BEGIN');

        if (type === 'brands') {
            for (const item of validRows) {
                if (item.action === 'INSERT') {
                    const columns = Object.keys(item.data);
                    const values = Object.values(item.data);
                    const placeholders = columns.map((_, i) => `$${i + 1}`);

                    const q = `
                        INSERT INTO brands (${columns.join(', ')})
                        VALUES (${placeholders.join(', ')})
                        RETURNING id
                    `;
                    const res = await client.query(q, values);
                    newImported++;

                    // Log brand creation
                    await logActivity(username, 'Brand added', 'Brand', res.rows[0].id, item.name);
                } else if (item.action === 'UPDATE') {
                    const id = item.id;
                    const updates = [];
                    const values = [];
                    let idx = 1;

                    item.changes.forEach(c => {
                        updates.push(`${c.dbField} = $${idx}`);
                        values.push(c.newValue);
                        idx++;
                    });

                    values.push(id);
                    const q = `
                        UPDATE brands
                        SET ${updates.join(', ')}, updated_at = NOW()
                        WHERE id = $${idx}
                    `;
                    await client.query(q, values);
                    updatedImported++;

                    // Log each field change
                    for (const c of item.changes) {
                        await logActivity(username, 'Brand edited', 'Brand', id, item.name, c.dbField, c.oldValue, c.newValue);
                    }
                }
            }
        } else if (type === 'influencers') {
            for (const item of validRows) {
                if (item.action === 'INSERT') {
                    const columns = Object.keys(item.data);
                    const values = Object.values(item.data);
                    const placeholders = columns.map((_, i) => `$${i + 1}`);

                    const q = `
                        INSERT INTO influencers (${columns.join(', ')})
                        VALUES (${placeholders.join(', ')})
                        RETURNING id
                    `;
                    const res = await client.query(q, values);
                    newImported++;

                    // Log influencer creation
                    await logActivity(username, 'Influencer added', 'Influencer', res.rows[0].id, item.name);
                } else if (item.action === 'UPDATE') {
                    const id = item.id;
                    const updates = [];
                    const values = [];
                    let idx = 1;

                    item.changes.forEach(c => {
                        updates.push(`${c.dbField} = $${idx}`);
                        values.push(c.newValue === '' ? null : c.newValue);
                        idx++;
                    });

                    values.push(id);
                    const q = `
                        UPDATE influencers
                        SET ${updates.join(', ')}, updated_at = NOW()
                        WHERE id = $${idx}
                    `;
                    await client.query(q, values);
                    updatedImported++;

                    // Log each field change
                    for (const c of item.changes) {
                        await logActivity(username, 'Influencer edited', 'Influencer', id, item.name, c.dbField, c.oldValue, c.newValue);
                    }
                }
            }
        }

        await client.query('COMMIT');
        return { success: true, newImported, updatedImported };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Rollback import transaction due to error:', err);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    analyzeImport,
    commitImport
};

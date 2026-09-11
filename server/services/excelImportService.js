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

// Normalize Instagram URLs for canonical matching
function normalizeInstagramUrl(url) {
    if (!url) return '';
    let u = String(url).trim();
    const hyperlinkMatch = u.match(/HYPERLINK\("([^"]+)"/i);
    if (hyperlinkMatch) {
        u = hyperlinkMatch[1];
    }
    u = u.toLowerCase().trim();
    u = u.replace(/^https?:\/\//, '').replace(/^www\./, '');
    u = u.split('?')[0].split('#')[0];
    u = u.replace(/\/+$/, '');
    
    if (u.includes('instagram.com/')) {
        let handle = u.split('instagram.com/')[1] || '';
        handle = handle.replace(/\/+$/, '').trim();
        return `instagram.com/${handle}`;
    }
    const handle = u.replace(/^@/, '').trim();
    if (handle && !handle.includes('/')) {
        return `instagram.com/${handle}`;
    }
    return u;
}

function extractInstagramHandle(url) {
    const norm = normalizeInstagramUrl(url);
    if (norm.startsWith('instagram.com/')) {
        return norm.replace('instagram.com/', '').trim();
    }
    return '';
}

// Normalize website or domain for agency deduplication
function normalizeWebsiteDomain(url) {
    if (!url) return '';
    let u = String(url).trim();
    const hyperlinkMatch = u.match(/HYPERLINK\("([^"]+)"/i);
    if (hyperlinkMatch) {
        u = hyperlinkMatch[1];
    }
    u = u.toLowerCase().trim();
    if (['n/a', 'na', 'none', 'null', '-', '--'].includes(u)) return '';
    u = u.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '');
    u = u.split('?')[0].split('#')[0];
    u = u.replace(/\/+$/, '');
    const domain = u.split('/')[0].split(':')[0].trim();
    if (['n/a', 'na', 'none', 'null', '-', '--'].includes(domain)) return '';
    return domain;
}

// Normalize company name for fallback matching
function normalizeCompanyName(name) {
    if (!name) return '';
    let n = String(name).toLowerCase().trim();
    if (['n/a', 'na', 'none', 'null', '-', '--'].includes(n)) return '';
    return n.replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
}

function formatDbValue(col, val) {
    if (val === undefined || val === null || val === '') {
        return null;
    }
    if (['followers', 'following', 'posts'].includes(col)) {
        if (typeof val === 'number') return Math.round(val);
        const cleaned = String(val).replace(/,/g, '').trim();
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? null : num;
    }
    if (['first_seen', 'status_timestamp'].includes(col)) {
        if (typeof val === 'number') {
            const date = new Date((val - (25567 + 2)) * 86400 * 1000);
            return isNaN(date.getTime()) ? null : date.toISOString();
        }
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d.toISOString();
    }
    return String(val).trim();
}

// Mapping from Spreadsheet headers to DB columns
const brandMapping = {
    'username': 'username',
    'Username': 'username',
    
    'instagramUrl': 'instagram_url',
    'instagram_url': 'instagram_url',
    'Instagram URL': 'instagram_url',
    'Instagram': 'instagram_url',
    'Instagram link': 'instagram_url',
    
    'displayName': 'display_name',
    'display_name': 'display_name',
    'Display Name': 'display_name',
    'Name': 'display_name',
    
    'followers': 'followers',
    'Followers': 'followers',
    
    'followersFormatted': 'followers_formatted',
    'followers_formatted': 'followers_formatted',
    'Followers Formatted': 'followers_formatted',
    
    'following': 'following',
    'Following': 'following',
    
    'followingFormatted': 'following_formatted',
    'following_formatted': 'following_formatted',
    'Following Formatted': 'following_formatted',
    
    'posts': 'posts',
    'Posts': 'posts',
    
    'postsFormatted': 'posts_formatted',
    'posts_formatted': 'posts_formatted',
    'Posts Formatted': 'posts_formatted',
    
    'snippet': 'snippet',
    'Snippet': 'snippet',
    
    'sourceQuery': 'source_query',
    'source_query': 'source_query',
    'Source Query': 'source_query',
    
    'sourceUrl': 'source_url',
    'source_url': 'source_url',
    'Source URL': 'source_url',
    
    'firstSeen': 'first_seen',
    'first_seen': 'first_seen',
    'First Seen': 'first_seen',
    
    'Script': 'script',
    'script': 'script',
    
    'status': 'status',
    'Status': 'status',
    
    'Message Recived from barnd': 'message_received',
    'Message Received from brand': 'message_received',
    'Message Received': 'message_received',
    'message_received': 'message_received',
    
    'status-timetamp': 'status_timestamp',
    'status-timestamp': 'status_timestamp',
    'status_timestamp': 'status_timestamp',
    'Status Timestamp': 'status_timestamp'
};

const influencerMapping = {
    'username': 'username',
    'Username': 'username',
    
    'Remarks': 'remarks',
    'remarks': 'remarks',
    'Remark': 'remarks',
    
    'instagramUrl': 'instagram_url',
    'instagram_url': 'instagram_url',
    'Instagram URL': 'instagram_url',
    'Instagram': 'instagram_url',
    'Instagram Link': 'instagram_url',
    
    'followers': 'followers',
    'Followers': 'followers',
    
    'followersFormatted': 'followers_formatted',
    'followers_formatted': 'followers_formatted',
    'Followers Formatted': 'followers_formatted',
    
    'following': 'following',
    'Following': 'following',
    
    'snippet': 'snippet',
    'Snippet': 'snippet',
    
    'sourceQuery': 'source_query',
    'source_query': 'source_query',
    'Source Query': 'source_query',
    
    'sourceUrl': 'source_url',
    'source_url': 'source_url',
    'Source URL': 'source_url',
    
    'firstSeen': 'first_seen',
    'first_seen': 'first_seen',
    'First Seen': 'first_seen',
    
    'displayName': 'display_name',
    'display_name': 'display_name',
    'Display Name': 'display_name',
    'Name': 'display_name',
    'Influencer Name': 'display_name',
    
    'posts': 'posts',
    'Posts': 'posts',
    
    'Script': 'script',
    'script': 'script',
    
    'Status': 'status',
    'status': 'status',
    
    'status-timestamp': 'status_timestamp',
    'status_timestamp': 'status_timestamp',
    'Status Timestamp': 'status_timestamp',
    
    'Category': 'category',
    'category': 'category'
};

const agencyMapping = {
    'companyName': 'company_name',
    'company_name': 'company_name',
    'Company Name': 'company_name',
    'CompanyName': 'company_name',
    'Company': 'company_name',
    'Agency': 'company_name',
    'Agency Name': 'company_name',

    'website': 'website',
    'Website': 'website',
    'web': 'website',
    'Web': 'website',
    'URL': 'website',
    'Url': 'website',

    'linkedin': 'linkedin',
    'LinkedIn': 'linkedin',
    'Linkedin': 'linkedin',
    'LinkedIn URL': 'linkedin',

    'instagram': 'instagram',
    'Instagram': 'instagram',
    'IG': 'instagram',
    'Instagram URL': 'instagram',

    'facebook': 'facebook',
    'Facebook': 'facebook',
    'FB': 'facebook',
    'Facebook URL': 'facebook',

    'twitterX': 'twitter_x',
    'twitter_x': 'twitter_x',
    'TwitterX': 'twitter_x',
    'Twitter/X': 'twitter_x',
    'Twitter': 'twitter_x',
    'X': 'twitter_x',

    'youtube': 'youtube',
    'YouTube': 'youtube',
    'Youtube': 'youtube',
    'YouTube URL': 'youtube',

    'phone': 'phone',
    'Phone': 'phone',
    'Telephone': 'phone',
    'Tel': 'phone',

    'email': 'email',
    'Email': 'email',
    'E-mail': 'email',

    'address': 'address',
    'Address': 'address',
    'Location': 'address',

    'status': 'status',
    'Status': 'status'
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

        // Build lookups: primary by normalized instagram_url, secondary by username
        const instaLookup = {};
        const usernameLookup = {};
        dbBrands.forEach(b => {
            if (b.instagram_url) {
                const norm = normalizeInstagramUrl(b.instagram_url);
                if (norm) instaLookup[norm] = b;
            }
            if (b.username) {
                const u = String(b.username).replace(/^@/, '').toLowerCase().trim();
                if (u) usernameLookup[u] = b;
            }
        });

        rows.forEach((row, idx) => {
            const rowNum = idx + 2; // header is row 1
            
            // Extract row values based on brandMapping
            let rawInsta = '';
            let rawUsername = '';
            let rawDisplayName = '';

            for (const [key, val] of Object.entries(row)) {
                const cleanKey = key.trim();
                const col = brandMapping[cleanKey];
                if (col === 'instagram_url' && val) rawInsta = cleanExcelVal(val);
                if (col === 'username' && val) rawUsername = cleanExcelVal(val);
                if (col === 'display_name' && val) rawDisplayName = cleanExcelVal(val);
            }

            // Derive username from Instagram URL if missing
            if (!rawUsername && rawInsta) {
                rawUsername = extractInstagramHandle(rawInsta);
            }
            // Construct Instagram URL from username if missing
            if (!rawInsta && rawUsername) {
                rawInsta = `https://instagram.com/${rawUsername.replace(/^@/, '').trim()}`;
            }

            const normInsta = normalizeInstagramUrl(rawInsta);
            const cleanUsername = rawUsername ? rawUsername.replace(/^@/, '').toLowerCase().trim() : '';

            if (!normInsta && !cleanUsername) {
                summary.problemCount++;
                problems.push({ rowNumber: rowNum, name: 'Unknown', error: 'Missing both Instagram URL and Username' });
                return;
            }

            // Find match: Primary by normalized Instagram URL, fallback to username
            let matchedRecord = null;
            if (normInsta && instaLookup[normInsta]) {
                matchedRecord = instaLookup[normInsta];
            } else if (cleanUsername && usernameLookup[cleanUsername]) {
                matchedRecord = usernameLookup[cleanUsername];
            }

            const recordDisplayName = rawDisplayName || rawUsername || normInsta;

            if (matchedRecord) {
                // Record matches, compare fields
                const changes = [];
                const updatedRowData = { ...matchedRecord };

                for (const [sheetKey, dbCol] of Object.entries(brandMapping)) {
                    if (row[sheetKey] !== undefined) {
                        let excelVal = cleanExcelVal(row[sheetKey]);
                        if (excelVal === '') continue;

                        let crmVal = matchedRecord[dbCol];
                        if (['first_seen', 'status_timestamp'].includes(dbCol) && crmVal) {
                            try {
                                crmVal = new Date(crmVal).toISOString();
                            } catch (e) {}
                        }
                        crmVal = crmVal !== null && crmVal !== undefined ? String(crmVal).trim() : '';

                        // Format excel value for comparison
                        const formattedExcelVal = formatDbValue(dbCol, excelVal);
                        const compareExcelStr = formattedExcelVal !== null ? String(formattedExcelVal).trim() : '';

                        if (compareExcelStr !== '' && compareExcelStr !== crmVal) {
                            changes.push({
                                field: sheetKey,
                                dbField: dbCol,
                                oldValue: crmVal,
                                newValue: formattedExcelVal
                            });
                            updatedRowData[dbCol] = formattedExcelVal;
                        }
                    }
                }

                if (changes.length > 0) {
                    summary.updatedCount++;
                    proposedUpdates.push({
                        id: matchedRecord.id,
                        name: matchedRecord.display_name || matchedRecord.username || recordDisplayName,
                        changes
                    });
                    validRowsToImport.push({
                        action: 'UPDATE',
                        id: matchedRecord.id,
                        name: matchedRecord.display_name || matchedRecord.username || recordDisplayName,
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
                    if (row[sheetKey] !== undefined) {
                        const rawVal = cleanExcelVal(row[sheetKey]);
                        newRowData[dbCol] = formatDbValue(dbCol, rawVal);
                    }
                }

                // Ensure username and instagram_url are set
                if (!newRowData.username && cleanUsername) {
                    newRowData.username = cleanUsername;
                }
                if (!newRowData.instagram_url && rawInsta) {
                    newRowData.instagram_url = rawInsta;
                }
                if (!newRowData.status) {
                    newRowData.status = 'New';
                }

                validRowsToImport.push({
                    action: 'INSERT',
                    name: newRowData.display_name || newRowData.username || recordDisplayName,
                    data: newRowData
                });
            }
        });
    } else if (type === 'influencers') {
        // Load active influencers
        const dbRes = await pool.query('SELECT * FROM influencers WHERE is_archived = false ORDER BY id ASC');
        const dbInfluencers = dbRes.rows;

        // Build lookups: primary by normalized instagram_url, secondary by username
        const instaLookup = {};
        const usernameLookup = {};
        dbInfluencers.forEach(i => {
            if (i.instagram_url) {
                const norm = normalizeInstagramUrl(i.instagram_url);
                if (norm) instaLookup[norm] = i;
            }
            if (i.username) {
                const u = String(i.username).replace(/^@/, '').toLowerCase().trim();
                if (u) usernameLookup[u] = i;
            }
        });

        rows.forEach((row, idx) => {
            const rowNum = idx + 2;

            let rawInsta = '';
            let rawUsername = '';
            let rawDisplayName = '';

            for (const [key, val] of Object.entries(row)) {
                // Ignore unnamed or empty spreadsheet columns
                if (!key || key.startsWith('__EMPTY') || key.trim() === '') continue;

                const cleanKey = key.trim();
                const col = influencerMapping[cleanKey];
                if (col === 'instagram_url' && val) rawInsta = cleanExcelVal(val);
                if (col === 'username' && val) rawUsername = cleanExcelVal(val);
                if (col === 'display_name' && val) rawDisplayName = cleanExcelVal(val);
            }

            // Derive username from Instagram URL if missing
            if (!rawUsername && rawInsta) {
                rawUsername = extractInstagramHandle(rawInsta);
            }
            // Construct Instagram URL from username if missing
            if (!rawInsta && rawUsername) {
                rawInsta = `https://instagram.com/${rawUsername.replace(/^@/, '').trim()}`;
            }

            const normInsta = normalizeInstagramUrl(rawInsta);
            const cleanUsername = rawUsername ? rawUsername.replace(/^@/, '').toLowerCase().trim() : '';

            if (!normInsta && !cleanUsername) {
                summary.problemCount++;
                problems.push({ rowNumber: rowNum, name: 'Unknown', error: 'Missing both Instagram URL and Username' });
                return;
            }

            // Find match: Primary by normalized Instagram URL, fallback to username
            let matchedRecord = null;
            if (normInsta && instaLookup[normInsta]) {
                matchedRecord = instaLookup[normInsta];
            } else if (cleanUsername && usernameLookup[cleanUsername]) {
                matchedRecord = usernameLookup[cleanUsername];
            }

            const recordDisplayName = rawDisplayName || rawUsername || normInsta;

            if (matchedRecord) {
                // Record matches, compare fields
                const changes = [];
                const updatedRowData = { ...matchedRecord };

                for (const [sheetKey, dbCol] of Object.entries(influencerMapping)) {
                    if (row[sheetKey] !== undefined) {
                        let excelVal = cleanExcelVal(row[sheetKey]);
                        if (excelVal === '') continue;

                        let crmVal = matchedRecord[dbCol];
                        if (['first_seen', 'status_timestamp'].includes(dbCol) && crmVal) {
                            try {
                                crmVal = new Date(crmVal).toISOString();
                            } catch (e) {}
                        }
                        crmVal = crmVal !== null && crmVal !== undefined ? String(crmVal).trim() : '';

                        const formattedExcelVal = formatDbValue(dbCol, excelVal);
                        const compareExcelStr = formattedExcelVal !== null ? String(formattedExcelVal).trim() : '';

                        if (compareExcelStr !== '' && compareExcelStr !== crmVal) {
                            changes.push({
                                field: sheetKey,
                                dbField: dbCol,
                                oldValue: crmVal,
                                newValue: formattedExcelVal
                            });
                            updatedRowData[dbCol] = formattedExcelVal;
                        }
                    }
                }

                if (changes.length > 0) {
                    summary.updatedCount++;
                    proposedUpdates.push({
                        id: matchedRecord.id,
                        name: matchedRecord.display_name || matchedRecord.username || recordDisplayName,
                        changes
                    });
                    validRowsToImport.push({
                        action: 'UPDATE',
                        id: matchedRecord.id,
                        name: matchedRecord.display_name || matchedRecord.username || recordDisplayName,
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
                for (const [sheetKey, dbCol] of Object.entries(influencerMapping)) {
                    if (row[sheetKey] !== undefined) {
                        const rawVal = cleanExcelVal(row[sheetKey]);
                        newRowData[dbCol] = formatDbValue(dbCol, rawVal);
                    }
                }

                // Ensure username and instagram_url are set
                if (!newRowData.username && cleanUsername) {
                    newRowData.username = cleanUsername;
                }
                if (!newRowData.instagram_url && rawInsta) {
                    newRowData.instagram_url = rawInsta;
                }
                if (!newRowData.status) {
                    newRowData.status = 'New';
                }

                validRowsToImport.push({
                    action: 'INSERT',
                    name: newRowData.display_name || newRowData.username || recordDisplayName,
                    data: newRowData
                });
            }
        });
    } else if (type === 'agencies') {
        // Load active agencies
        const dbRes = await pool.query('SELECT * FROM agencies WHERE is_archived = false ORDER BY id ASC');
        const dbAgencies = dbRes.rows;

        // Build lookups: primary by normalized website, secondary by normalized company_name
        const websiteLookup = {};
        const companyLookup = {};
        dbAgencies.forEach(a => {
            if (a.website) {
                const normW = normalizeWebsiteDomain(a.website);
                if (normW) websiteLookup[normW] = a;
            }
            if (a.company_name) {
                const normC = normalizeCompanyName(a.company_name);
                if (normC) companyLookup[normC] = a;
            }
        });

        rows.forEach((row, idx) => {
            const rowNum = idx + 2;

            let rawWebsite = '';
            let rawCompanyName = '';

            for (const [key, val] of Object.entries(row)) {
                // Ignore unnamed or empty spreadsheet columns
                if (!key || key.startsWith('__EMPTY') || key.trim() === '') continue;

                const cleanKey = key.trim();
                const col = agencyMapping[cleanKey];
                if (col === 'website' && val) rawWebsite = cleanExcelVal(val);
                if (col === 'company_name' && val) rawCompanyName = cleanExcelVal(val);
            }

            const normWebsite = normalizeWebsiteDomain(rawWebsite);
            const normCompanyName = normalizeCompanyName(rawCompanyName);

            if (!normWebsite && !normCompanyName) {
                summary.problemCount++;
                problems.push({ rowNumber: rowNum, name: 'Unknown', error: 'Missing both Website and Company Name' });
                return;
            }

            // Find match: Primary by normalized website/domain, fallback to company name
            let matchedRecord = null;
            if (normWebsite && websiteLookup[normWebsite]) {
                matchedRecord = websiteLookup[normWebsite];
            } else if (normCompanyName && companyLookup[normCompanyName]) {
                matchedRecord = companyLookup[normCompanyName];
            }

            const recordDisplayName = rawCompanyName || rawWebsite || 'Agency';

            if (matchedRecord) {
                // Record matches, compare fields
                const changes = [];
                const updatedRowData = { ...matchedRecord };

                for (const [sheetKey, dbCol] of Object.entries(agencyMapping)) {
                    if (row[sheetKey] !== undefined) {
                        let excelVal = cleanExcelVal(row[sheetKey]);
                        if (excelVal === '') continue;

                        let crmVal = matchedRecord[dbCol];
                        crmVal = crmVal !== null && crmVal !== undefined ? String(crmVal).trim() : '';

                        if (excelVal !== '' && excelVal !== crmVal) {
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
                        name: matchedRecord.company_name || recordDisplayName,
                        changes
                    });
                    validRowsToImport.push({
                        action: 'UPDATE',
                        id: matchedRecord.id,
                        name: matchedRecord.company_name || recordDisplayName,
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
                for (const [sheetKey, dbCol] of Object.entries(agencyMapping)) {
                    if (row[sheetKey] !== undefined) {
                        const rawVal = cleanExcelVal(row[sheetKey]);
                        newRowData[dbCol] = rawVal === '' ? null : rawVal;
                    }
                }

                if (!newRowData.company_name && rawCompanyName) {
                    newRowData.company_name = rawCompanyName;
                }
                if (!newRowData.website && rawWebsite) {
                    newRowData.website = rawWebsite;
                }
                if (!newRowData.status) {
                    newRowData.status = 'NO_DATA';
                }

                validRowsToImport.push({
                    action: 'INSERT',
                    name: newRowData.company_name || recordDisplayName,
                    data: newRowData
                });

                // Add to lookups to prevent duplicate rows within the same sheet
                if (normWebsite) websiteLookup[normWebsite] = newRowData;
                if (normCompanyName) companyLookup[normCompanyName] = newRowData;
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
        } else if (type === 'agencies') {
            for (const item of validRows) {
                if (item.action === 'INSERT') {
                    const columns = Object.keys(item.data);
                    const values = Object.values(item.data);
                    const placeholders = columns.map((_, i) => `$${i + 1}`);

                    const q = `
                        INSERT INTO agencies (${columns.join(', ')})
                        VALUES (${placeholders.join(', ')})
                        RETURNING id
                    `;
                    const res = await client.query(q, values);
                    newImported++;

                    // Log agency creation
                    await logActivity(username, 'Agency added', 'Agency', res.rows[0].id, item.name);
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
                        UPDATE agencies
                        SET ${updates.join(', ')}, updated_at = NOW()
                        WHERE id = $${idx}
                    `;
                    await client.query(q, values);
                    updatedImported++;

                    // Log each field change
                    for (const c of item.changes) {
                        await logActivity(username, 'Agency edited', 'Agency', id, item.name, c.dbField, c.oldValue, c.newValue);
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

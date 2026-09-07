const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'crm_db',
    password: 'password123',
    port: 5432,
});

async function runMigration() {
    try {
        await client.connect();
        
        console.log('Creating instagram_follow_ups table...');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS instagram_follow_ups (
                id SERIAL PRIMARY KEY,
                lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
                assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
                instagram_username VARCHAR(255) NOT NULL,
                message_snippet TEXT,
                status VARCHAR(50) NOT NULL DEFAULT 'Unread',
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                handled_at TIMESTAMP
            );
        `);
        
        console.log('Migration completed successfully!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();

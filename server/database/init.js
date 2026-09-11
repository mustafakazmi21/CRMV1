// server/database/init.js
const { Client, Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const employees = require('../config/employees');

async function checkAndCreateDatabase() {
    // Connect to postgres default DB first
    const client = new Client({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: 'postgres'
    });

    try {
        await client.connect();
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [process.env.DB_NAME]);
        if (res.rowCount === 0) {
            console.log(`Database '${process.env.DB_NAME}' does not exist. Creating...`);
            // CREATE DATABASE cannot run in a transaction, use client directly
            await client.query(`CREATE DATABASE ${process.env.DB_NAME}`);
            console.log(`Database '${process.env.DB_NAME}' created successfully.`);
        } else {
            console.log(`Database '${process.env.DB_NAME}' already exists.`);
        }
    } catch (err) {
        console.error('Error checking/creating database:', err);
        throw err;
    } finally {
        await client.end();
    }
}

async function initializeSchemaAndData() {
    console.log(`Connecting to database to run migrations...`);
    const poolConfig = process.env.DATABASE_URL
        ? { 
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
          }
        : {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        };
        
    const pool = new Pool(poolConfig);

    try {
        // Read and execute schema.sql
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        console.log('Executing schema.sql...');
        await pool.query(schemaSql);
        console.log('Schema tables created successfully.');

        // Seed users
        console.log('Seeding central employee accounts...');
        for (const emp of employees) {
            const passwordHash = await bcrypt.hash(emp.passwordPlain, 10);
            await pool.query(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
                [emp.username, passwordHash, emp.role]
            );
            console.log(`  Seeded user: ${emp.username} (${emp.role})`);
        }

        // Seed brands
        const brandsPath = path.join(__dirname, 'brands.json');
        if (fs.existsSync(brandsPath)) {
            const brands = JSON.parse(fs.readFileSync(brandsPath, 'utf8'));
            if (Array.isArray(brands) && brands.length > 0) {
                console.log('Reading and seeding brands...');
                const queryText = `
                    INSERT INTO brands (
                        username, instagram_url, display_name, followers, followers_formatted,
                        following, following_formatted, posts, posts_formatted, snippet,
                        source_query, source_url, first_seen, script, status,
                        message_received, status_timestamp
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                `;

                let count = 0;
                for (const b of brands) {
                    await pool.query(queryText, [
                        b.username || null, b.instagram_url || null, b.display_name || null,
                        b.followers || null, b.followers_formatted || null,
                        b.following || null, b.following_formatted || null,
                        b.posts || null, b.posts_formatted || null, b.snippet || null,
                        b.source_query || null, b.source_url || null, b.first_seen || null,
                        b.script || null, b.status || 'New', b.message_received || null,
                        b.status_timestamp || null
                    ]);
                    count++;
                }
                console.log(`Successfully seeded ${count} brands.`);
            }
        }

        // Seed influencers
        const influencersPath = path.join(__dirname, 'influencers.json');
        if (fs.existsSync(influencersPath)) {
            const influencers = JSON.parse(fs.readFileSync(influencersPath, 'utf8'));
            if (Array.isArray(influencers) && influencers.length > 0) {
                console.log('Reading and seeding influencers...');
                const queryText = `
                    INSERT INTO influencers (
                        username, remarks, instagram_url, followers, followers_formatted,
                        following, snippet, source_query, source_url, first_seen,
                        display_name, posts, script, status, status_timestamp, category
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                `;

                let count = 0;
                for (const inf of influencers) {
                    await pool.query(queryText, [
                        inf.username || null, inf.remarks || null, inf.instagram_url || null,
                        inf.followers || null, inf.followers_formatted || null,
                        inf.following || null, inf.snippet || null,
                        inf.source_query || null, inf.source_url || null, inf.first_seen || null,
                        inf.display_name || null, inf.posts || null, inf.script || null,
                        inf.status || 'New', inf.status_timestamp || null, inf.category || null
                    ]);
                    count++;
                }
                console.log(`Successfully seeded ${count} influencers.`);
            }
        }

        console.log('Database initialization completed successfully.');

    } catch (err) {
        console.error('Error initializing schema and data:', err);
        throw err;
    } finally {
        await pool.end();
    }
}

async function run() {
    try {
        if (!process.env.DATABASE_URL) {
            await checkAndCreateDatabase();
        } else {
            console.log('Using remote DATABASE_URL, skipping database creation step...');
        }
        await initializeSchemaAndData();
        process.exit(0);
    } catch (err) {
        console.error('Initialization failed:', err);
        process.exit(1);
    }
}

run();

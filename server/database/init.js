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
            console.log('Reading and seeding brands...');
            const brands = JSON.parse(fs.readFileSync(brandsPath, 'utf8'));
            
            // Insert in batch or loop
            const queryText = `
                INSERT INTO brands (
                    brand_name, founded_year, category, brand_focus, founder_names,
                    revenue, revenue_year, last_funding_amount, last_funding_data, last_funding_date,
                    headquarter, main_geography_outreach, linkedin, how_many_employees,
                    marketing_head, marketing_mail_id, sales_head, sales_head_mail,
                    content_marketing_head, content_marketing_head_mail_id, company_phone, company_url,
                    facebook, instagram, youtube, twitter, main_influencer_platform, web_traffic
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28
                )
            `;

            let count = 0;
            for (const b of brands) {
                await pool.query(queryText, [
                    b.brand_name, b.founded_year, b.category, b.brand_focus, b.founder_names,
                    b.revenue, b.revenue_year, b.last_funding_amount, b.last_funding_data, b.last_funding_date,
                    b.headquarter, b.main_geography_outreach, b.linkedin, b.how_many_employees,
                    b.marketing_head, b.marketing_mail_id, b.sales_head, b.sales_head_mail,
                    b.content_marketing_head, b.content_marketing_head_mail_id, b.company_phone, b.company_url,
                    b.facebook, b.instagram, b.youtube, b.twitter, b.main_influencer_platform, b.web_traffic
                ]);
                count++;
            }
            console.log(`Successfully seeded ${count} brands.`);
        }

        // Seed influencers
        const influencersPath = path.join(__dirname, 'influencers.json');
        if (fs.existsSync(influencersPath)) {
            console.log('Reading and seeding influencers...');
            const influencers = JSON.parse(fs.readFileSync(influencersPath, 'utf8'));

            const queryText = `
                INSERT INTO influencers (
                    influencer_name, lead_by, content_why_this_person, instagram_url,
                    followers, script, comment_average, send_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;

            let count = 0;
            for (const inf of influencers) {
                const sendDate = inf.send_date || null;
                await pool.query(queryText, [
                    inf.influencer_name, inf.lead_by, inf.content_why_this_person, inf.instagram_url,
                    inf.followers, inf.script, inf.comment_average, sendDate
                ]);
                count++;
            }
            console.log(`Successfully seeded ${count} influencers.`);
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

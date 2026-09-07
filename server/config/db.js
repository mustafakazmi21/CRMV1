// server/config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const isRenderExternal = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com');

const poolConfig = process.env.DATABASE_URL
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: isRenderExternal ? { rejectUnauthorized: false } : false
      }
    : {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME
    };

const pool = new Pool(poolConfig);

module.exports = pool;

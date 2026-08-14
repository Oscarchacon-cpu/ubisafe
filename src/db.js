require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

const pool = new Pool({
  connectionString: connectionString + (connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require'),
});

module.exports = pool;
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing!');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: (isProduction || connectionString.includes('supabase') || connectionString.includes('amazonaws')) ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('PostgreSQL database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

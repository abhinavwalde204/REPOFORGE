const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

const migrate = async () => {
  const client = await pool.connect();
  try {
    console.log('Starting database migrations...');

    // 1. Create migrations log table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Read all migrations from migrations directory
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sequential execution by filename sorting (001, 002, 003...)

    console.log(`Found ${files.length} migration files in directory.`);

    // 3. Run each migration in sequence
    for (const file of files) {
      // Check if migration has already been applied
      const checkRes = await client.query(
        'SELECT 1 FROM migrations_log WHERE migration_name = $1',
        [file]
      );

      if (checkRes.rows.length > 0) {
        console.log(`Migration ${file} is already applied. Skipping.`);
        continue;
      }

      console.log(`Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Run migration SQL queries
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations_log (migration_name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`Migration ${file} applied successfully.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error applying migration ${file}:`, err);
        throw err; // Stop executing further migrations on error
      }
    }

    console.log('All migrations completed successfully.');
  } catch (error) {
    console.error('Database migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = migrate;

// Support running directly from command line
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration execution script finished.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration execution script encountered an error:', err);
      process.exit(1);
    });
}

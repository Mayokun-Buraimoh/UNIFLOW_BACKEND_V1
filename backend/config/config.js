// Sequelize CLI configuration.
// Reads from environment variables (loaded from backend/.env).
// Used by `npm run migrate` / `npm run seed`.
require('dotenv').config();

const useSsl =
  process.env.DB_SSL === 'true' ||
  process.env.DB_SSL === '1' ||
  (process.env.DATABASE_URL && /sslmode=require/i.test(process.env.DATABASE_URL)) ||
  (process.env.DB_HOST && /render\.com$/i.test(process.env.DB_HOST));

const dialectOptions = useSsl
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : undefined;

const base = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'uniflow',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: process.env.DB_DIALECT || 'postgres',
  dialectOptions,
  logging: false,
  // sequelize-cli also accepts a connection URL via `use_env_variable`
  use_env_variable: process.env.DATABASE_URL ? 'DATABASE_URL' : undefined,
};

module.exports = {
  development: { ...base, logging: console.log },
  test: { ...base, database: process.env.DB_NAME_TEST || `${base.database}_test` },
  production: base,
};

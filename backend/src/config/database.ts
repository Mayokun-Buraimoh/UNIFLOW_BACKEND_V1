import { Sequelize } from 'sequelize';
import path from 'path';

// Try to import config, fallback to environment variables
let config: any = {};
try {
  config = require('../../config/config.json');
} catch (error) {
  console.log('Config file not found, using environment variables');
}

const env = process.env.NODE_ENV || 'development';
// Prioritize environment variables over config file
const dbConfig = {
  username: process.env.DB_USER || config[env]?.username || 'root',
  password: process.env.DB_PASSWORD || config[env]?.password || 'password',
  database: process.env.DB_NAME || config[env]?.database || 'uniflow',
  host: process.env.DB_HOST || config[env]?.host || 'localhost',
  port: parseInt(process.env.DB_PORT || config[env]?.port?.toString() || '5432'),
  dialect: process.env.DB_HOST?.includes('render.com') ? 'postgres' : (config[env]?.dialect || 'postgres'),
  logging: env === 'development'
};

console.log('Database configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  username: dbConfig.username,
  dialect: dbConfig.dialect
});

export const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect as any,
    logging: dbConfig.logging,
    // SSL support for cloud databases (Render, Railway, AWS RDS, etc.)
    dialectOptions: {
      ssl: process.env.DB_HOST?.includes('render.com') || process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : undefined
    },
  }
);

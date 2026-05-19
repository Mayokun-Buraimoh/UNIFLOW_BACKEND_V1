import { Sequelize, Options } from 'sequelize';

let config: any = {};
try {
  config = require('../../config/config.json');
} catch {
  try {
    config = require('../../config/config.js');
  } catch {
    console.log('No Sequelize config file found, using environment variables.');
  }
}

const env = process.env.NODE_ENV || 'development';
const envConfig = (config && config[env]) || {};

const isRenderHost = (host?: string) => !!host && /render\.com$/i.test(host);
const sslRequested = (): boolean => {
  if (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1') return true;
  if (process.env.DATABASE_URL && /sslmode=require/i.test(process.env.DATABASE_URL)) return true;
  if (isRenderHost(process.env.DB_HOST)) return true;
  return false;
};

const dialectOptions = sslRequested()
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : undefined;

const commonOptions: Options = {
  dialect: 'postgres',
  logging: env === 'development' ? console.log : false,
  dialectOptions,
};

let sequelize: Sequelize;

if (process.env.DATABASE_URL) {
  console.log('Database configuration: using DATABASE_URL', {
    sslEnabled: !!dialectOptions,
  });
  sequelize = new Sequelize(process.env.DATABASE_URL, commonOptions);
} else {
  const dbConfig = {
    username: process.env.DB_USER || envConfig.username || 'postgres',
    password: process.env.DB_PASSWORD || envConfig.password || 'postgres',
    database: process.env.DB_NAME || envConfig.database || 'uniflow',
    host: process.env.DB_HOST || envConfig.host || 'localhost',
    port: parseInt(
      process.env.DB_PORT || envConfig.port?.toString() || '5432',
      10
    ),
    dialect: (process.env.DB_DIALECT || envConfig.dialect || 'postgres') as Options['dialect'],
  };

  console.log('Database configuration:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    username: dbConfig.username,
    dialect: dbConfig.dialect,
    sslEnabled: !!dialectOptions,
  });

  sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: dbConfig.dialect,
      logging: commonOptions.logging,
      dialectOptions,
    }
  );
}

export { sequelize };

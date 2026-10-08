const mysql = require('mysql2/promise');

function legacyMysqlConfig() {
  const { LEGACY_DB_HOST, LEGACY_DB_PORT, LEGACY_DB_USER, LEGACY_DB_PASSWORD, LEGACY_DB_NAME } =
    process.env;

  if (!LEGACY_DB_USER || !LEGACY_DB_NAME) {
    throw new Error(
      'Set LEGACY_DB_USER and LEGACY_DB_NAME to connect to the restored legacy database.',
    );
  }

  const port = Number(LEGACY_DB_PORT ?? 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('LEGACY_DB_PORT must be a valid TCP port.');
  }

  return {
    host: LEGACY_DB_HOST || '127.0.0.1',
    port,
    user: LEGACY_DB_USER,
    password: LEGACY_DB_PASSWORD ?? '',
    database: LEGACY_DB_NAME,
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
}

function connectLegacyDatabase() {
  return mysql.createConnection(legacyMysqlConfig());
}

module.exports = { connectLegacyDatabase };

const { Pool } = require("pg");
const config = require("./config");

const POOL_CONFIG = {
  user: config.PGUSER,
  password: config.PGPASSWORD,
  database: config.PGDATABASE,
  host: config.PGHOST,
  port: config.PGPORT || 5432,
  max: 10, // Max clients in the pool
  idleTimeoutMillis: 30000,
};

const pool = new Pool(POOL_CONFIG);

function logQuery(statement, parameters) {
  let timeStamp = new Date();
  let formattedTimeStamp = timeStamp.toString().substring(4, 24);
  console.log(formattedTimeStamp, statement, parameters);
}

module.exports = async function pgQuery(statement, ...parameters) {
  logQuery(statement, parameters);
  return await pool.query(statement, parameters);
};

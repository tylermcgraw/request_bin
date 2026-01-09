const { Client } = require("pg");

exports.handler = async (event) => {
  console.log("Starting DB Initialization...");

  const client = new Client({
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    host: process.env.PGHOST,
    port: process.env.PGPORT || 5432,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    const schema = process.env.DB_SCHEMA;
    if (!schema) {
      throw new Error("DB_SCHEMA environment variable is missing.");
    }

    console.log("Executing schema...");
    await client.query(schema);
    console.log("Schema executed successfully.");

    return {
      statusCode: 200,
      body: "Database initialized successfully"
    };
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err; // Re-throw to fail the CloudFormation stack/trigger
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
};

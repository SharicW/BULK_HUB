const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/yourdb';

const client = new Client({
  connectionString,
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Connection error', err.stack));

module.exports = client;
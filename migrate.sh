#!/bin/sh
set -e

echo "🔄 Running database migrations..."

node -e "
var Pool = require('pg').Pool;
var drizzle = require('drizzle-orm/node-postgres').drizzle;
var migrate = require('drizzle-orm/node-postgres/migrator').migrate;
var path = require('path');

var pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'hackflow'
});

var db = drizzle(pool);

migrate(db, { migrationsFolder: path.join('/app/drizzle/migrations') })
  .then(function() {
    console.log('Migrations applied successfully');
    return pool.end();
  })
  .catch(function(e) {
    console.error('Migration failed:', e);
    process.exit(1);
  });
"

echo "✅ Migrations done"

echo "🔍 Checking if database already has data..."

USERS_COUNT=$(node -e "
var Pool = require('pg').Pool;
var pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'hackflow'
});
pool.query('SELECT COUNT(*) as cnt FROM users')
  .then(function(res) {
    process.stdout.write(String(res.rows[0].cnt));
    return pool.end();
  })
  .catch(function() {
    process.stdout.write('0');
    return pool.end();
  });
")

echo "   Users in DB: $USERS_COUNT"

if [ "$USERS_COUNT" -gt "0" ]; then
  echo "⏩ Database already seeded ($USERS_COUNT users) — skipping seed"
  echo "✅ Done"
  exit 0
fi

echo "🌱 Running seed (first time)..."
node dist/database/seed.js
echo "✅ Seed done"

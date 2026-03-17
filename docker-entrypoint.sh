#!/bin/sh
set -e

echo "🗄️ Running database migrations..."

# Attempt migrate deploy; if it fails (non-empty schema, no migration history),
# use db push to sync missing tables, then baseline all migrations.
if ! pnpm exec prisma migrate deploy 2>&1; then
  echo "⚠️ Migration failed — syncing schema and baselining..."

  # First, push any missing tables/columns to the database
  echo "📐 Syncing database schema (creating missing tables)..."
  pnpm exec prisma db push --skip-generate

  # Then mark all existing migrations as already applied
  for migration in $(ls prisma/migrations/ | grep -v migration_lock); do
    echo "  Marking $migration as applied..."
    pnpm exec prisma migrate resolve --applied "$migration"
  done

  echo "🔄 Retrying migrate deploy..."
  pnpm exec prisma migrate deploy
fi

echo "✅ Migrations complete. Starting application..."
exec node dist/src/server.js

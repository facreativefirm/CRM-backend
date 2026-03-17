#!/bin/sh
set -e

echo "🗄️ Running database migrations..."

# Attempt migrate deploy; if it fails (non-empty schema, no migration history),
# use db push to sync missing tables, then baseline all migrations.
if ! pnpm exec prisma migrate deploy 2>&1; then
  echo "⚠️ Migration failed — syncing schema and baselining..."

  # Push any missing tables/columns to the database
  echo "📐 Syncing database schema (creating missing tables)..."
  pnpm exec prisma db push

  # Roll back any failed migrations, then mark all as applied
  for migration in $(ls prisma/migrations/ | grep -v migration_lock); do
    echo "  Resolving $migration..."
    pnpm exec prisma migrate resolve --rolled-back "$migration" 2>/dev/null || true
    pnpm exec prisma migrate resolve --applied "$migration"
  done

  echo "🔄 Retrying migrate deploy..."
  pnpm exec prisma migrate deploy
fi

echo "✅ Migrations complete. Starting application..."
exec node dist/src/server.js

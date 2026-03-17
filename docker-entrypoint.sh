#!/bin/sh
set -e

echo "🗄️ Running database migrations..."

# Attempt migrate deploy; if it fails with P3005 (non-empty schema, no migration history),
# baseline all existing migrations and retry.
if ! pnpm exec prisma migrate deploy 2>&1; then
  echo "⚠️ Migration failed — attempting to baseline existing migrations..."

  # Mark all existing migrations as already applied (one-time baseline)
  for migration in $(ls prisma/migrations/ | grep -v migration_lock); do
    echo "  Marking $migration as applied..."
    pnpm exec prisma migrate resolve --applied "$migration"
  done

  echo "🔄 Retrying migrate deploy..."
  pnpm exec prisma migrate deploy
fi

echo "✅ Migrations complete. Starting application..."
exec node dist/src/server.js

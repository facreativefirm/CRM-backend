#!/bin/sh
set -e

echo "🗄️ Running database migrations..."
pnpm exec prisma migrate deploy

echo "✅ Migrations complete. Starting application..."
exec node dist/src/server.js

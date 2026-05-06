#!/bin/sh
set -e

echo "Running database migrations..."
node /app/scripts/run-migrations.js

echo "Starting server..."
exec node server.js

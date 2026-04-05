#!/bin/bash
# =============================================================================
# Sync Production Database → Development Database
# =============================================================================
#
# This script copies production MongoDB data to the dev database.
# ONE-WAY ONLY: prod → dev. NEVER run this in reverse.
#
# Prerequisites:
#   - MongoDB Database Tools installed (mongodump, mongorestore, mongosh)
#     Windows: winget install MongoDB.DatabaseTools
#     macOS:   brew install mongodb-database-tools
#     Linux:   sudo apt install mongodb-database-tools
#
# Usage:
#   ./scripts/sync-prod-to-dev.sh              # Sync CRM DB only
#   ./scripts/sync-prod-to-dev.sh --products   # Also sync website products DB
#
# After sync, all user passwords are reset to: DevPass123!@#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — UPDATE THESE VALUES
# ---------------------------------------------------------------------------

# Production (SOURCE) — read-only access is sufficient
PROD_URI="mongodb+srv://PROD_USER:PROD_PASSWORD@cluster0.e9wenoo.mongodb.net"
PROD_CRM_DB="vip-pharmacy-crm"
PROD_WEBSITE_DB="vip-pharmacy"

# Development (TARGET) — needs read/write access
DEV_URI="mongodb+srv://DEV_USER:DEV_PASSWORD@cluster0.e9wenoo.mongodb.net"
DEV_CRM_DB="vip-pharmacy-crm-dev"
DEV_WEBSITE_DB="vip-pharmacy-dev"

# Temp directory for dump files
DUMP_DIR="/tmp/vip-crm-prod-dump"

# Sanitized password hash (bcrypt hash of "DevPass123!@#")
# Generate a new one if needed: node -e "require('bcryptjs').hash('DevPass123!@#', 10).then(console.log)"
DEV_PASSWORD_HASH='$2a$10$YourGeneratedHashHere'

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

echo "============================================="
echo "  VIP CRM: Prod → Dev Database Sync"
echo "============================================="
echo ""

# Check for required tools
for cmd in mongodump mongorestore mongosh; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found. Install MongoDB Database Tools first."
    echo "  Windows: winget install MongoDB.DatabaseTools"
    echo "  macOS:   brew install mongodb-database-tools"
    echo "  Linux:   sudo apt install mongodb-database-tools"
    exit 1
  fi
done

# Check if URIs have been configured
if [[ "$PROD_URI" == *"PROD_USER"* ]] || [[ "$DEV_URI" == *"DEV_USER"* ]]; then
  echo "ERROR: Update PROD_URI and DEV_URI in this script with real credentials."
  echo "       Look for the Configuration section at the top of the script."
  exit 1
fi

if [[ "$DEV_PASSWORD_HASH" == *"YourGeneratedHash"* ]]; then
  echo "ERROR: Generate a real bcrypt hash for the dev password."
  echo "       Run: node -e \"require('bcryptjs').hash('DevPass123!@#', 10).then(console.log)\""
  echo "       Then update DEV_PASSWORD_HASH in this script."
  exit 1
fi

# Safety confirmation
echo "This will:"
echo "  1. Dump production DB: $PROD_CRM_DB"
echo "  2. DROP and replace dev DB: $DEV_CRM_DB"
echo "  3. Sanitize all user passwords to 'DevPass123!@#'"
if [[ "${1:-}" == "--products" ]]; then
  echo "  4. Also sync website products: $PROD_WEBSITE_DB → $DEV_WEBSITE_DB"
fi
echo ""
read -p "Continue? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Clean up any previous dump
rm -rf "$DUMP_DIR"
mkdir -p "$DUMP_DIR"

# ---------------------------------------------------------------------------
# Step 1: Dump production CRM database
# ---------------------------------------------------------------------------

echo ""
echo "[1/4] Dumping production CRM database ($PROD_CRM_DB)..."
mongodump \
  --uri="$PROD_URI/$PROD_CRM_DB?retryWrites=true&w=majority" \
  --out="$DUMP_DIR" \
  --quiet

echo "  ✓ Dump complete"

# ---------------------------------------------------------------------------
# Step 2: Restore to dev CRM database (drops existing data)
# ---------------------------------------------------------------------------

echo ""
echo "[2/4] Restoring to dev CRM database ($DEV_CRM_DB)..."
mongorestore \
  --uri="$DEV_URI" \
  --nsFrom="$PROD_CRM_DB.*" \
  --nsTo="$DEV_CRM_DB.*" \
  --drop \
  --quiet \
  "$DUMP_DIR"

echo "  ✓ Restore complete"

# ---------------------------------------------------------------------------
# Step 3: Sanitize dev data
# ---------------------------------------------------------------------------

echo ""
echo "[3/4] Sanitizing dev data..."

mongosh "$DEV_URI/$DEV_CRM_DB?retryWrites=true&w=majority" --quiet --eval "
  // Reset all user passwords to the dev password
  const result = db.users.updateMany(
    {},
    { \$set: { password: '$DEV_PASSWORD_HASH' } }
  );
  print('  Sanitized ' + result.modifiedCount + ' user passwords');

  // Reset account lockout fields
  db.users.updateMany(
    {},
    { \$set: { loginAttempts: 0, lockUntil: null } }
  );
  print('  Reset account lockout fields');

  // Clear audit logs (sensitive data)
  const auditResult = db.auditlogs.deleteMany({});
  print('  Cleared ' + auditResult.deletedCount + ' audit log entries');
"

echo "  ✓ Sanitization complete"

# ---------------------------------------------------------------------------
# Step 4: Optionally sync website products database
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--products" ]]; then
  echo ""
  echo "[4/4] Syncing website products database ($PROD_WEBSITE_DB → $DEV_WEBSITE_DB)..."

  mongodump \
    --uri="$PROD_URI/$PROD_WEBSITE_DB?retryWrites=true&w=majority" \
    --out="$DUMP_DIR" \
    --quiet

  mongorestore \
    --uri="$DEV_URI" \
    --nsFrom="$PROD_WEBSITE_DB.*" \
    --nsTo="$DEV_WEBSITE_DB.*" \
    --drop \
    --quiet \
    "$DUMP_DIR"

  echo "  ✓ Website products synced"
else
  echo ""
  echo "[4/4] Skipping website products sync (use --products flag to include)"
fi

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

rm -rf "$DUMP_DIR"

echo ""
echo "============================================="
echo "  Sync complete!"
echo "============================================="
echo ""
echo "  Dev CRM DB:      $DEV_CRM_DB"
echo "  Dev password:     DevPass123!@#  (all users)"
echo ""
echo "  Start the backend:"
echo "    cd backend && npm run dev"
echo "============================================="

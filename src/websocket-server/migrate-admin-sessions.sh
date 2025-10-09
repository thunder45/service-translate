#!/bin/bash

# Admin Session Migration Script
# Migrates existing session files from old adminSocketId format to new adminId format

set -e

echo "=========================================="
echo "Service Translate - Session Migration"
echo "=========================================="
echo ""

# Configuration
SESSIONS_DIR="./sessions"
BACKUP_DIR="./sessions-backup-$(date +%Y%m%d-%H%M%S)"
ADMIN_IDENTITIES_DIR="./admin-identities"
SYSTEM_ADMIN_ID="system"
MIGRATION_LOG="./migration-log-$(date +%Y%m%d-%H%M%S).txt"

# Check if sessions directory exists
if [ ! -d "$SESSIONS_DIR" ]; then
    echo "No sessions directory found at: $SESSIONS_DIR"
    echo "Nothing to migrate."
    exit 0
fi

# Count session files
SESSION_COUNT=$(find "$SESSIONS_DIR" -name "*.json" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$SESSION_COUNT" -eq 0 ]; then
    echo "No session files found in: $SESSIONS_DIR"
    echo "Nothing to migrate."
    exit 0
fi

echo "Found $SESSION_COUNT session file(s) to check for migration"
echo ""

# Create backup directory
echo "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Backup all session files
echo "Backing up session files..."
cp -r "$SESSIONS_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backup completed: $BACKUP_DIR"
echo ""

# Create admin identities directory if it doesn't exist
if [ ! -d "$ADMIN_IDENTITIES_DIR" ]; then
    echo "Creating admin identities directory: $ADMIN_IDENTITIES_DIR"
    mkdir -p "$ADMIN_IDENTITIES_DIR"
fi

# Create system admin identity if it doesn't exist
SYSTEM_ADMIN_FILE="$ADMIN_IDENTITIES_DIR/$SYSTEM_ADMIN_ID.json"
if [ ! -f "$SYSTEM_ADMIN_FILE" ]; then
    echo "Creating system admin identity..."
    cat > "$SYSTEM_ADMIN_FILE" << EOF
{
  "adminId": "$SYSTEM_ADMIN_ID",
  "username": "system",
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "lastSeen": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "ownedSessions": [],
  "tokenVersion": 0,
  "refreshTokens": []
}
EOF
    echo "✅ System admin identity created"
fi

# Update admin index
ADMIN_INDEX_FILE="$ADMIN_IDENTITIES_DIR/admin-index.json"
if [ ! -f "$ADMIN_INDEX_FILE" ]; then
    echo "Creating admin index..."
    cat > "$ADMIN_INDEX_FILE" << EOF
{
  "system": "$SYSTEM_ADMIN_ID"
}
EOF
    echo "✅ Admin index created"
fi

# Initialize migration log
echo "Migration started at: $(date)" > "$MIGRATION_LOG"
echo "Backup directory: $BACKUP_DIR" >> "$MIGRATION_LOG"
echo "" >> "$MIGRATION_LOG"

# Migration counters
MIGRATED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

echo "Starting migration..."
echo ""

# Process each session file
for session_file in "$SESSIONS_DIR"/*.json; do
    if [ ! -f "$session_file" ]; then
        continue
    fi
    
    filename=$(basename "$session_file")
    echo "Processing: $filename"
    
    # Check if file has old format (adminSocketId but not adminId)
    if grep -q '"adminSocketId"' "$session_file" && ! grep -q '"adminId"' "$session_file"; then
        echo "  → Migrating old format..."
        
        # Use Node.js to properly parse and update JSON
        node -e "
        const fs = require('fs');
        const filePath = '$session_file';
        
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Migrate to new format
            data.adminId = '$SYSTEM_ADMIN_ID';
            data.currentAdminSocketId = null;
            data.createdBy = 'system';
            
            // Remove old field
            delete data.adminSocketId;
            
            // Write back
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log('  ✅ Migrated successfully');
            process.exit(0);
        } catch (error) {
            console.error('  ❌ Migration failed:', error.message);
            process.exit(1);
        }
        " && {
            MIGRATED_COUNT=$((MIGRATED_COUNT + 1))
            echo "  Migrated: $filename" >> "$MIGRATION_LOG"
            
            # Add session to system admin's owned sessions
            SESSION_ID=$(node -e "
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync('$session_file', 'utf8'));
            console.log(data.sessionId);
            ")
            
            # Update system admin identity
            node -e "
            const fs = require('fs');
            const adminFile = '$SYSTEM_ADMIN_FILE';
            const admin = JSON.parse(fs.readFileSync(adminFile, 'utf8'));
            if (!admin.ownedSessions.includes('$SESSION_ID')) {
                admin.ownedSessions.push('$SESSION_ID');
                admin.lastSeen = new Date().toISOString();
                fs.writeFileSync(adminFile, JSON.stringify(admin, null, 2));
            }
            "
        } || {
            ERROR_COUNT=$((ERROR_COUNT + 1))
            echo "  Error: $filename" >> "$MIGRATION_LOG"
        }
    elif grep -q '"adminId"' "$session_file"; then
        echo "  → Already in new format, skipping"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        echo "  Skipped (already migrated): $filename" >> "$MIGRATION_LOG"
    else
        echo "  → Unknown format, skipping"
        SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
        echo "  Skipped (unknown format): $filename" >> "$MIGRATION_LOG"
    fi
    
    echo ""
done

# Write summary to log
echo "" >> "$MIGRATION_LOG"
echo "Migration Summary:" >> "$MIGRATION_LOG"
echo "  Total files: $SESSION_COUNT" >> "$MIGRATION_LOG"
echo "  Migrated: $MIGRATED_COUNT" >> "$MIGRATION_LOG"
echo "  Skipped: $SKIPPED_COUNT" >> "$MIGRATION_LOG"
echo "  Errors: $ERROR_COUNT" >> "$MIGRATION_LOG"
echo "" >> "$MIGRATION_LOG"
echo "Migration completed at: $(date)" >> "$MIGRATION_LOG"

# Display summary
echo "=========================================="
echo "Migration Summary"
echo "=========================================="
echo "Total files: $SESSION_COUNT"
echo "Migrated: $MIGRATED_COUNT"
echo "Skipped: $SKIPPED_COUNT"
echo "Errors: $ERROR_COUNT"
echo ""
echo "Backup location: $BACKUP_DIR"
echo "Migration log: $MIGRATION_LOG"
echo ""

if [ $ERROR_COUNT -gt 0 ]; then
    echo "⚠️  Migration completed with errors!"
    echo "Check the migration log for details."
    echo ""
    echo "To rollback, run:"
    echo "  rm -rf $SESSIONS_DIR"
    echo "  mv $BACKUP_DIR $SESSIONS_DIR"
    exit 1
else
    echo "✅ Migration completed successfully!"
    echo ""
    echo "To rollback (if needed), run:"
    echo "  rm -rf $SESSIONS_DIR"
    echo "  mv $BACKUP_DIR $SESSIONS_DIR"
    echo ""
    echo "To remove backup (after verification), run:"
    echo "  rm -rf $BACKUP_DIR"
fi

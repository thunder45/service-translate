#!/bin/bash

# Service Translate - Cleanup Script
# Removes generated files, build artifacts, and temporary data

echo "Service Translate - Cleanup"
echo "==========================="
echo ""

# Parse options
CLEAN_ALL=false
CLEAN_DEPS=false
CLEAN_DATA=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            CLEAN_ALL=true
            shift
            ;;
        --deps)
            CLEAN_DEPS=true
            shift
            ;;
        --data)
            CLEAN_DATA=true
            shift
            ;;
        *)
            echo "Usage: ./cleanup.sh [--all] [--deps] [--data]"
            echo ""
            echo "Options:"
            echo "  --all   Clean everything (build artifacts, dependencies, data)"
            echo "  --deps  Clean node_modules only"
            echo "  --data  Clean sessions and admin identities only"
            exit 1
            ;;
    esac
done

# Default to cleaning build artifacts only
if [ "$CLEAN_ALL" = false ] && [ "$CLEAN_DEPS" = false ] && [ "$CLEAN_DATA" = false ]; then
    echo "Cleaning build artifacts..."
    
    # Clean TypeScript build outputs
    find . -name "dist" -type d ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    find . -name "*.js.map" ! -path "*/node_modules/*" -delete 2>/dev/null || true
    find . -name "*.d.ts" ! -path "*/node_modules/*" ! -path "*/shared/*" -delete 2>/dev/null || true
    
    # Clean logs
    find . -name "logs" -type d ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    
    # Clean audio cache
    rm -rf src/websocket-server/audio-cache 2>/dev/null || true
    
    echo "✅ Build artifacts cleaned"
    exit 0
fi

# Clean dependencies
if [ "$CLEAN_ALL" = true ] || [ "$CLEAN_DEPS" = true ]; then
    echo "Cleaning dependencies..."
    find . -name "node_modules" -type d ! -path "*/node_modules/*" -exec rm -rf {} + 2>/dev/null || true
    find . -name "package-lock.json" ! -path "*/node_modules/*" -delete 2>/dev/null || true
    echo "✅ Dependencies cleaned"
fi

# Clean data
if [ "$CLEAN_ALL" = true ] || [ "$CLEAN_DATA" = true ]; then
    echo ""
    echo "⚠️  WARNING: This will delete all sessions and admin identities!"
    read -p "Are you sure? (yes/NO): " -r
    echo
    if [ "$REPLY" = "yes" ]; then
        rm -rf src/websocket-server/sessions 2>/dev/null || true
        rm -rf src/websocket-server/admin-identities 2>/dev/null || true
        echo "✅ Data cleaned"
    else
        echo "Data cleanup cancelled"
    fi
fi

echo ""
echo "Cleanup complete!"

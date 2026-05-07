#!/bin/bash

# Import Database to Cloud MySQL
# Usage: ./import-to-cloud.sh <backup_file.sql> <cloud_host> <cloud_user> <cloud_database>

if [ $# -lt 4 ]; then
    echo "Usage: $0 <backup_file.sql> <cloud_host> <cloud_user> <cloud_database>"
    echo "Example: $0 uniflow_backup.sql db.example.com myuser uniflow"
    exit 1
fi

BACKUP_FILE=$1
CLOUD_HOST=$2
CLOUD_USER=$3
CLOUD_DATABASE=$4

echo "Importing database to cloud..."
echo "Host: $CLOUD_HOST"
echo "User: $CLOUD_USER"
echo "Database: $CLOUD_DATABASE"
echo "File: $BACKUP_FILE"
echo ""

# Prompt for password
read -sp "Enter cloud database password: " CLOUD_PASSWORD
echo ""

# Import database
mysql -h "$CLOUD_HOST" -u "$CLOUD_USER" -p"$CLOUD_PASSWORD" "$CLOUD_DATABASE" < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Database imported successfully!"
else
    echo "❌ Import failed!"
    exit 1
fi












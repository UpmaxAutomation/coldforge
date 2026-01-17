#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DEPLOY_DIR="/opt/coldforge"
REPO_URL="https://github.com/UpmaxAutomation/coldforge.git"
BRANCH="main"

echo -e "${YELLOW}🚀 Starting deployment...${NC}"
echo "Commit: $1"
echo "Message: $2"

cd $DEPLOY_DIR

# Pull latest changes
echo -e "${YELLOW}📥 Pulling latest changes from GitHub...${NC}"
git fetch origin $BRANCH
git reset --hard origin/$BRANCH

# Install dependencies and build
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd deployment
docker-compose build --no-cache app

# Restart services with zero downtime
echo -e "${YELLOW}🔄 Restarting services...${NC}"
docker-compose up -d --force-recreate app

# Wait for health check
echo -e "${YELLOW}⏳ Waiting for health check...${NC}"
sleep 10

# Check if app is healthy
if curl -s -f http://localhost:3000/api/health > /dev/null; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo "Deployed commit: $1"
else
    echo -e "${RED}❌ Health check failed! Rolling back...${NC}"
    docker-compose logs app --tail=50
    exit 1
fi

# Clean up old images
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
docker image prune -f

echo -e "${GREEN}🎉 Deployment complete!${NC}"

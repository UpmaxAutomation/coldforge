#!/bin/bash
set -e

# InstantScale Server Setup Script
# Run this on your local server PC (Ubuntu/Debian)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚀 InstantScale Server Setup${NC}"
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo)${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}📦 Updating system...${NC}"
apt-get update && apt-get upgrade -y

# Install Docker
echo -e "${YELLOW}🐳 Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    usermod -aG docker $SUDO_USER
fi

# Install Docker Compose
echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    apt-get install -y docker-compose-plugin
    ln -sf /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
fi

# Install Git
echo -e "${YELLOW}📝 Installing Git...${NC}"
apt-get install -y git curl

# Create deployment directory
echo -e "${YELLOW}📁 Creating deployment directory...${NC}"
mkdir -p /opt/coldforge
cd /opt/coldforge

# Clone repository (replace with your repo)
echo -e "${YELLOW}📥 Cloning repository...${NC}"
if [ ! -d ".git" ]; then
    read -p "Enter your GitHub repo URL (e.g., https://github.com/user/instantly-clone.git): " REPO_URL
    git clone $REPO_URL .
else
    git pull origin main
fi

# Create SSL directory
mkdir -p deployment/nginx/ssl

# Generate self-signed cert for initial setup (replace with real cert later)
echo -e "${YELLOW}🔐 Generating temporary SSL certificate...${NC}"
if [ ! -f "deployment/nginx/ssl/fullchain.pem" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout deployment/nginx/ssl/privkey.pem \
        -out deployment/nginx/ssl/fullchain.pem \
        -subj "/C=US/ST=State/L=City/O=InstantScale/CN=localhost"
fi

# Create .env.production from template
echo -e "${YELLOW}⚙️ Setting up environment...${NC}"
if [ ! -f ".env.production" ]; then
    cp .env.production.template .env.production
    echo -e "${YELLOW}📝 Please edit /opt/coldforge/.env.production with your actual values${NC}"
fi

# Set permissions
chown -R $SUDO_USER:$SUDO_USER /opt/coldforge
chmod +x deployment/scripts/*.sh

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
cd deployment
docker-compose up -d

# Show status
echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit /opt/coldforge/.env.production with your values"
echo "2. Set up Cloudflare Tunnel or configure port forwarding"
echo "3. Add GitHub webhook pointing to https://yourdomain.com/hooks/github-deploy"
echo "4. Push to main branch to trigger deployment"
echo ""
echo "Useful commands:"
echo "  cd /opt/coldforge/deployment"
echo "  docker-compose logs -f        # View logs"
echo "  docker-compose restart app    # Restart app"
echo "  docker-compose down           # Stop all"
echo ""

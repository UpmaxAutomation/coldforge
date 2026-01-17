#!/bin/bash
set -e

# Cloudflare Tunnel Setup for InstantScale
# This creates a secure tunnel without port forwarding

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}☁️ Cloudflare Tunnel Setup${NC}"
echo "==========================="

# Install cloudflared
echo -e "${YELLOW}📦 Installing cloudflared...${NC}"
if ! command -v cloudflared &> /dev/null; then
    # For Debian/Ubuntu
    curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared.deb
    rm cloudflared.deb
fi

echo ""
echo -e "${YELLOW}🔑 Authenticating with Cloudflare...${NC}"
echo "A browser window will open. Log in to Cloudflare and authorize the tunnel."
echo ""
cloudflared tunnel login

echo ""
read -p "Enter tunnel name (e.g., instantscale): " TUNNEL_NAME
read -p "Enter your domain (e.g., app.yourdomain.com): " DOMAIN

# Create tunnel
echo -e "${YELLOW}🚇 Creating tunnel...${NC}"
cloudflared tunnel create $TUNNEL_NAME

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')

# Create config file
echo -e "${YELLOW}⚙️ Creating tunnel config...${NC}"
mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  # Main app
  - hostname: $DOMAIN
    service: http://localhost:80
  # GitHub webhook
  - hostname: $DOMAIN
    path: /hooks/*
    service: http://localhost:9000
  # Catch-all
  - service: http_status:404
EOF

# Create DNS record
echo -e "${YELLOW}🌐 Creating DNS record...${NC}"
cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN

# Install as service
echo -e "${YELLOW}🔧 Installing tunnel as system service...${NC}"
sudo cloudflared service install

echo ""
echo -e "${GREEN}✅ Cloudflare Tunnel setup complete!${NC}"
echo ""
echo "Your app will be available at: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status cloudflared    # Check tunnel status"
echo "  sudo systemctl restart cloudflared   # Restart tunnel"
echo "  cloudflared tunnel list              # List tunnels"
echo "  cloudflared tunnel info $TUNNEL_NAME # Tunnel info"
echo ""
echo "The tunnel will start automatically on boot."

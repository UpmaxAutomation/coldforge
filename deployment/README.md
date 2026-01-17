# ColdForge Deployment Guide

## Architecture

```
┌─────────────────┐      ┌─────────────┐      ┌─────────────────┐
│  Your Mac       │      │   GitHub    │      │  Local Server   │
│  (Development)  │─push─│   (Central) │─pull─│  (24/7 PC)      │
└─────────────────┘      └─────────────┘      └────────┬────────┘
                                                       │
                                              ┌────────┴────────┐
                                              │  Cloudflare     │
                                              │  Tunnel         │
                                              └────────┬────────┘
                                                       │
                                              app.yourdomain.com
```

## Quick Start

### 1. Server Setup (Run once on your local server PC)

```bash
# SSH into your server
ssh user@your-server-ip

# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/instantly-clone/main/deployment/scripts/setup-server.sh | sudo bash
```

### 2. Configure Environment

```bash
# Edit production environment
nano /opt/instantscale/.env.production

# Fill in all required values (see .env.production.template)
```

### 3. Set Up Cloudflare Tunnel (Recommended)

```bash
cd /opt/instantscale/deployment/scripts
chmod +x setup-cloudflare-tunnel.sh
./setup-cloudflare-tunnel.sh
```

### 4. Configure GitHub Webhook

1. Go to your GitHub repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://your-domain.com/hooks/github-deploy`
3. Content type: `application/json`
4. Secret: Same as `GITHUB_WEBHOOK_SECRET` in .env.production
5. Events: Just the `push` event
6. Active: ✓

### 5. Deploy

```bash
# From your development machine
git push origin main
# Deployment happens automatically!
```

## Files Overview

```
deployment/
├── docker-compose.yml       # Container orchestration
├── Dockerfile               # Next.js production build
├── nginx/
│   └── nginx.conf           # Reverse proxy + SSL
├── hooks/
│   └── hooks.json           # GitHub webhook config
├── scripts/
│   ├── setup-server.sh      # Initial server setup
│   ├── setup-cloudflare-tunnel.sh  # Tunnel setup
│   └── deploy.sh            # Auto-deploy script
└── README.md                # This file
```

## Commands

### On Server

```bash
cd /opt/instantscale/deployment

# View logs
docker-compose logs -f app

# Restart app
docker-compose restart app

# Full restart
docker-compose down && docker-compose up -d

# Manual deploy
./scripts/deploy.sh

# Check tunnel status
sudo systemctl status cloudflared
```

### From Dev Machine

```bash
# Deploy to production
git push origin main

# Check deployment status
ssh user@server "cd /opt/instantscale/deployment && docker-compose logs --tail=20 app"
```

## Troubleshooting

### App not starting
```bash
docker-compose logs app
# Check for missing env vars or build errors
```

### Webhook not triggering
```bash
# Check webhook logs
docker-compose logs webhook

# Verify secret matches
cat /opt/instantscale/.env.production | grep GITHUB_WEBHOOK_SECRET
```

### SSL issues
```bash
# Check nginx logs
docker-compose logs nginx

# Verify certificates exist
ls -la /opt/instantscale/deployment/nginx/ssl/
```

### Tunnel not working
```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

## Migration to Cloud VPS

When ready to move to a cloud server:

1. Spin up VPS (DigitalOcean, Hetzner, etc.)
2. Run `setup-server.sh` on new server
3. Update Cloudflare Tunnel or DNS to point to new IP
4. Update GitHub webhook URL if needed
5. Done - same deployment process works!

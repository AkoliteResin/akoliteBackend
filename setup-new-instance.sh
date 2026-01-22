#!/bin/bash

# Automated setup script for new EC2 instance with HTTPS support
# Deploys Akolite Backend with proper HTTPS configuration

set -e

echo "=========================================="
echo "Setting up Akolite Backend on EC2"
echo "with HTTPS Support"
echo "=========================================="
echo ""

# Update system
echo "Step 1: Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
echo "Step 2: Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
rm get-docker.sh

# Install Git
echo "Step 3: Installing Git..."
sudo apt-get install -y git

# Check if repository already exists, if not clone it
echo "Step 4: Setting up repository..."
if [ ! -d "/home/ubuntu/akoliteBackend" ]; then
    cd /home/ubuntu
    git clone https://github.com/Praneethaacharya/Draftakolite.git akoliteBackend
fi

cd /home/ubuntu/akoliteBackend
git pull

# Verify backend directory exists
if [ ! -d "backend" ]; then
    echo "ERROR: backend directory not found in repository!"
    echo "Current directory contents:"
    ls -la
    exit 1
fi

cd backend

# Create .env file with production settings
echo "Step 5: Setting up environment configuration..."
cat > .env << EOF
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=5000
MONGO_URI="mongodb+srv://softwareakolite_db_user:ziC1W3x1n9tKIBpg@cluster0.unqau87.mongodb.net/"
SSL_KEY_PATH=/etc/ssl/private/server.key
SSL_CERT_PATH=/etc/ssl/certs/server.crt
EOF

# Build Docker image with production settings
echo "Step 6: Building Docker image for production..."
sudo docker build -t akolite-backend:latest .

# Run Docker container with production configuration
echo "Step 7: Starting Docker container with HTTPS support..."
sudo docker run -d \
  --name akolite-backend \
  -p 5000:5000 \
  --env-file .env \
  --restart unless-stopped \
  akolite-backend:latest

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Backend Configuration:"
echo "  Environment: Production"
echo "  Protocol: HTTP (CloudFront handles HTTPS)"
echo "  Port: 5000"
echo "  Container: akolite-backend"
echo ""
echo "CloudFront Configuration:"
echo "  Domain: https://dj4haaiis0la7.cloudfront.net"
echo "  Origin: EC2 Instance"
echo ""
echo "Useful Commands:"
echo "  Check status:    sudo docker ps"
echo "  View logs:       sudo docker logs akolite-backend"
echo "  Follow logs:     sudo docker logs -f akolite-backend"
echo "  Stop container:  sudo docker stop akolite-backend"
echo "  Start container: sudo docker start akolite-backend"
echo "  Remove container: sudo docker rm akolite-backend"
echo ""
echo "CORS is configured for:"
echo "  - https://akoliteresin.github.io (GitHub Pages)"
echo "  - https://dj4haaiis0la7.cloudfront.net (CloudFront)"
echo "  - http://localhost:3000 (Local development)"
echo ""


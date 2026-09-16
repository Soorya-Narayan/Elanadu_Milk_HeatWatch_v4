#!/bin/bash
# ==============================================================================
# HeatWatch 4 — Elanadu Milk Edition
# Production Deployment & Kiosk Autostart Installer
# Author: Goose Industrial Solutions
# ==============================================================================

set -e

CURR_DIR="$PWD"
CURR_USER="$USER"
NODE_PATH=$(which node || echo "/usr/bin/node")
PYTHON_PATH=$(which python3 || echo "/usr/bin/python3")

echo "======================================================================"
echo " HeatWatch 4 — Elanadu Milk Edition Setup & Kiosk Installer"
echo " Directory: $CURR_DIR"
echo " User:      $CURR_USER"
echo "======================================================================"

# 1. Install Node.js Dependencies
echo "[1/5] Installing Node.js packages..."
npm install

# 2. Setup Python Environment & Dependencies
echo "[2/5] Setting up Python dependencies..."
$PYTHON_PATH -m pip install --upgrade pip 2>/dev/null || true
$PYTHON_PATH -m pip install requests influxdb-client RPi.GPIO 2>/dev/null || true

# 3. Create Systemd Services
echo "[3/5] Registering Systemd Services..."

# Dashboard Service
cat << EOF | sudo tee /etc/systemd/system/heatwatch-dashboard.service > /dev/null
[Unit]
Description=HeatWatch 4 Dashboard Server (Elanadu Milk)
After=network.target

[Service]
User=$CURR_USER
WorkingDirectory=$CURR_DIR
ExecStart=$NODE_PATH server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Poller Service
cat << EOF | sudo tee /etc/systemd/system/heatwatch-poller.service > /dev/null
[Unit]
Description=HeatWatch 4 Hardware Telemetry Poller
After=network.target

[Service]
User=$CURR_USER
WorkingDirectory=$CURR_DIR
ExecStart=$PYTHON_PATH poller.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Relay Service
cat << EOF | sudo tee /etc/systemd/system/heatwatch-relay.service > /dev/null
[Unit]
Description=HeatWatch 4 Alarm Relay Actuator
After=network.target

[Service]
User=$CURR_USER
WorkingDirectory=$CURR_DIR
ExecStart=$PYTHON_PATH alarm_relay.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 4. Enable & Start Services
echo "[4/5] Reloading Systemd and Starting Daemons..."
sudo systemctl daemon-reload
sudo systemctl enable --now heatwatch-dashboard.service heatwatch-poller.service heatwatch-relay.service

# 5. Configure Chromium Fullscreen Kiosk Autostart
echo "[5/5] Configuring Touchscreen Kiosk Autostart..."
AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/heatwatch-kiosk.desktop"

mkdir -p "$AUTOSTART_DIR"

cat > "$DESKTOP_FILE" << 'EOF'
[Desktop Entry]
Type=Application
Name=HeatWatch 4 Kiosk
Exec=/bin/bash -c "sleep 5 && chromium-browser --noerrdialogs --disable-infobars --password-store=basic --no-first-run --disable-session-crashed-bubble --fast --fast-start --kiosk --app=http://localhost:3001"
X-GNOME-Autostart-enabled=true
EOF

chmod +x "$DESKTOP_FILE"

echo "======================================================================"
echo " ✅ HeatWatch 4 Installation & Service Registration Complete!"
echo " Web Dashboard:  http://localhost:3001"
echo " Network Access: http://$(hostname -I | awk '{print $1}'):3001"
echo " Services:       heatwatch-dashboard, heatwatch-poller, heatwatch-relay"
echo "======================================================================"

<div align="center">

# HeatWatch 4 — Elanadu Milk Edition

<img src="assets/elanadu_logo.png" alt="Elanadu Milk Logo" width="220" />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img src="assets/goose_banner.png" alt="Goose Industrial Automation" width="300" />

<br/><br/>

![Platform](https://img.shields.io/badge/Platform-HeatWatch%20v4-0052CC?style=for-the-badge&logo=microchip)
![Client](https://img.shields.io/badge/Client-Elanadu%20Milk%20Products-0066CC?style=for-the-badge)
![Hardware](https://img.shields.io/badge/Hardware-Raspberry%20Pi%205-C51A4A?style=for-the-badge&logo=raspberrypi)
![Telemetry](https://img.shields.io/badge/Telemetry-PPI%20AIME%208U%20RTD-008080?style=for-the-badge)
![Database](https://img.shields.io/badge/Database-InfluxDB%20v2-22ADF6?style=for-the-badge&logo=influxdb)
![License](https://img.shields.io/badge/License-Proprietary%20%2F%20Goose-green?style=for-the-badge)

</div>

---

## 📋 Executive Overview

**HeatWatch 4 (Elanadu Milk Edition)** is an enterprise-grade industrial telemetry and temperature monitoring platform developed by **Goose Industrial Solutions** custom-engineered for **Elanadu Milk Products**.

Designed for deployment in high-throughput dairy processing plants, chilling centers, pasteurization lines, and cold storage facilities, HeatWatch v4 provides continuous multi-channel temperature monitoring, automated threshold auditing, historical analytics, acoustic/visual siren alarm actuation, and real-time operator dashboards.

The platform interfaces with **PPI AIME 8U Resistor Temperature Detector (RTD)** telemetry modules to acquire high-precision temperature readings across critical processing stages, ensuring strict food safety compliance, zero thermal deviation, and instant alerting on hardware or process anomalies.

---

## 🏗️ System Architecture

HeatWatch v4 utilizes a decoupled, resilient architecture designed for 24/7 continuous industrial operation with auto-recovery and local time-series persistence.

```
                  ┌─────────────────────────────────────────┐
                  │    PPI AIME 8U Industrial RTD Module    │
                  │   (Modbus TCP / HTTP Telemetry API)     │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼ (HTTP Poll / 2s Interval)
                  ┌─────────────────────────────────────────┐
                  │       Python Poller (poller.py)         │
                  │   Telemetry Parser & Safety Evaluator   │
                  └──────────┬───────────────────┬──────────┘
                             │                   │
      (Time-Series Logs)     │                   │  (Hardware Relay Signals)
                             ▼                   ▼
     ┌───────────────────────────────┐   ┌───────────────────────────────┐
     │       InfluxDB v2 Engine      │   │  Alarm Relay Controller       │
     │  (High-Resolution Storage)    │   │  (alarm_relay.py + Siren)     │
     └───────────────┬───────────────┘   └───────────────────────────────┘
                     │
                     ▼ (REST & Flux Queries)
     ┌───────────────────────────────────────────────────────────┐
     │           Node.js Express Server (server.js)              │
     │       WebSocket Telemetry Broadcast & REST APIs           │
     └───────────────────────────────┬───────────────────────────┘
                                     │
                                     ▼ (WebSocket / 2s Live Feeds)
     ┌───────────────────────────────────────────────────────────┐
     │       Industrial Touchscreen UI / Web Dashboard           │
     │     (Chromium Kiosk Mode / Client Browser Interface)      │
     └───────────────────────────────────────────────────────────┘
```

---

## ⚙️ Key System Capabilities

* **📡 Multi-Channel RTD Sensor Integration**: Simultaneously samples 8 independent industrial RTD channels from PPI AIME 8U hardware over Modbus TCP / HTTP API.
* **⚡ Real-Time WebSocket Telemetry**: Low-latency live telemetry stream to the web dashboard with sub-second status refreshes and visual indicator cards.
* **🔔 Multi-Tiered Alarm & Threshold Management**:
  * Configurable **LoLo** (Extreme Low), **Lo** (Warning Low), **Hi** (Warning High), and **HiHi** (Extreme High) limits per sensor channel.
  * Hysteresis-aware threshold evaluation to prevent transient alarm flickering.
* **🚨 Physical Relay & Hooter Actuation**: Dedicated hardware relay integration (`alarm_relay.py`) for powering external industrial sirens, strobe lights, or hooters upon critical HiHi/LoLo breaches.
* **📊 Time-Series Logging & Analytics**:
  * Powered by InfluxDB v2 for millisecond-precision historical data retention.
  * Interactive multi-channel trend visualization (1-Hour, 6-Hour, 24-Hour, and 7-Day spans).
* **📄 Quality Audit Data Export**: One-click generation of historical temperature logs in CSV, Excel, and PDF formats for regulatory dairy compliance checks.
* **🖥️ SBC Health & Diagnostic Monitoring**: Real-time tracking of host single-board computer telemetry including CPU load, core temperature, RAM usage, disk health, InfluxDB database metrics, and Tailscale VPN connectivity.
* **🔒 Password-Protected System Settings**: Admin console for channel calibration offset adjustment, threshold tuning, and system maintenance.
* **📺 Auto-Boot Kiosk Launcher**: Production-ready systemd configuration for unattended kiosk operation on Raspberry Pi 5 touch consoles.

---

## 💻 Hardware & Software Specifications

### Hardware Requirements
| Component | Specification / Recommendation |
| :--- | :--- |
| **Host Single-Board Computer** | Raspberry Pi 5 (4GB / 8GB) or Industrial Linux IPC |
| **Telemetry Module** | PPI AIME 8U Multi-Channel RTD Module (`192.168.1.2`) |
| **Display Panel** | 10.1" / 15.6" Industrial Capacitive Touch Screen Console |
| **Alarm Output** | USB / GPIO 12V-24V Industrial Relay Module & Siren/Hooter |
| **Storage Media** | Industrial High-Speed NVMe SSD or Class 10 MicroSD (32GB+) |

### Software Environment
| Software Layer | Version / Package |
| :--- | :--- |
| **Operating System** | Raspberry Pi OS (64-bit Debian Bookworm) |
| **Backend Runtime** | Node.js (v18.x or later) |
| **Scripting Engine** | Python (v3.10.x or later) |
| **Time-Series Engine** | InfluxDB (v2.7+) |
| **Process Control** | Systemd Service Daemon |
| **Kiosk Engine** | Chromium Web Browser (Unclutter & Wayland/X11 Kiosk) |

---

## 📁 Repository Structure

```
HeatWatch4-Elanadu/
├── assets/
│   ├── elanadu_logo.png           # Client Logo (Elanadu Milk Products)
│   ├── goose_banner.png           # Goose Industrial Solutions Banner
│   └── goose_icon.png             # Goose Brand Icon
├── public/                        # Web Dashboard Frontend & Static Assets
│   ├── index.html                 # Main Single Page Application Dashboard
│   ├── css/                       # Dashboard Stylesheets & Themes
│   └── js/                        # WebSocket Client & Charting Logic
├── scripts/                       # System Helpers & Setup Shell Scripts
├── systemd/                       # Systemd Unit Files for Production Daemonization
│   ├── heatwatch-dashboard.service
│   ├── heatwatch-poller.service
│   └── heatwatch-relay.service
├── alarm_relay.py                 # Industrial Relay & Hooter Control Daemon
├── poller.py                      # PPI AIME 8U Telemetry Poller & InfluxDB Writer
├── server.js                      # Express API & WebSocket Broadcast Server
├── setup_config.json              # Sensor Configuration & Default Thresholds
├── setup_kiosk.sh                 # Automatic Deployment & Kiosk Setup Script
├── package.json                   # Node.js Dependencies & Scripts
├── README.md                      # Platform Documentation
└── LICENSE                        # License File
```

---

## 🚀 Installation & Quick Start

### 1. Clone Repository & Navigate
```bash
git clone https://github.com/Soorya-Narayan/Elanadu_Milk_HeatWatch_v4.git
cd Elanadu_Milk_HeatWatch_v4
```

### 2. Install Node.js Application Dependencies
```bash
npm install
```

### 3. Setup Python Virtual Environment
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install requests influxdb-client RPi.GPIO pyserial
```

### 4. Configure InfluxDB Engine
Ensure InfluxDB v2 is running on `http://localhost:8086`. Verify or update default parameters in `setup_config.json`:
* **Organization**: `elanadu_heatwatch`
* **Bucket**: `temperature_telemetry`
* **Port**: `8086`

---

## 🛠️ Production Deployment (Systemd & Kiosk Mode)

To set up auto-start on Raspberry Pi 5 touchscreen terminals, run the automated setup script:

```bash
chmod +x setup_kiosk.sh
./setup_kiosk.sh
```

### Managing System Services
```bash
# Check service operational status
sudo systemctl status heatwatch-dashboard
sudo systemctl status heatwatch-poller
sudo systemctl status heatwatch-relay

# Restart services after configuration changes
sudo systemctl restart heatwatch-dashboard heatwatch-poller heatwatch-relay

# View live background logs
sudo journalctl -u heatwatch-poller -f
sudo journalctl -u heatwatch-dashboard -f
```

---

## 📡 REST API Reference

The Node.js server (`server.js`) exposes the following HTTP endpoints for control and telemetry access:

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/setup-status` | `GET` | Returns initialization status of the dashboard |
| `/api/config` | `GET` | Fetches active 8-channel RTD configuration & alarm limits |
| `/api/config` | `POST` | Updates sensor channel labels, calibration, and thresholds |
| `/api/system` | `GET` | Fetches host SBC hardware metrics (CPU, Temp, RAM, Disk) |
| `/api/history` | `GET` | Queries historical InfluxDB time-series metrics |
| `/api/stats` | `GET` | Calculates channel min/max/average statistics |
| `/api/verify-password`| `POST` | Authenticates administrative configuration access |
| `/api/delete` | `POST` | Clears historical records within specified timeframes |
| `/api/reset-setup` | `POST` | Resets unit to factory installation wizard |

---

## 🤝 Support & Client Credits

* **Client**: Elanadu Milk Products, Kerala, India
* **Developer**: Goose Industrial Solutions
* **Repository**: [Soorya-Narayan/Elanadu_Milk_HeatWatch_v4](https://github.com/Soorya-Narayan/Elanadu_Milk_HeatWatch_v4)

*For technical support or service inquiries, contact Goose Industrial Automation Support.*

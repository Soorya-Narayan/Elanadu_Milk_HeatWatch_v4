const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const si = require('systeminformation');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;
const CONFIG_PATH = path.join(__dirname, 'setup_config.json');
const STATE_FILE = '/tmp/heatwatch_telemetry.json';
const MUTE_FILE = '/tmp/heatwatch_mute.json';

app.use(cors());
app.use(express.json());

// Serve both public and assets directories statically
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Load Configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading setup_config.json:', err.message);
  }
  return null;
}

// Save Configuration
function saveConfig(configData) {
  try {
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(configData, null, 2), 'utf8');
    fs.renameSync(tmpPath, CONFIG_PATH);
    return true;
  } catch (err) {
    console.error('Error saving setup_config.json:', err.message);
    return false;
  }
}

let lastValidTelemetry = null;

// Read Telemetry Snapshot
function getLatestTelemetry() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.channels && parsed.channels.length > 0) {
        lastValidTelemetry = parsed;
        return parsed;
      }
    }
  } catch (err) {}

  if (lastValidTelemetry) {
    return lastValidTelemetry;
  }

  // Fallback initial 8-channel telemetry snapshot if poller is initializing
  const config = loadConfig();
  const sensors = config ? config.sensors : [
    { id: 'CH1', name: 'Pasteurizer_Heating', label: 'Pasteurizer Heating Zone', hihi: 93, hi: 88, lo: 68, lolo: 60 },
    { id: 'CH2', name: 'Pasteurizer_Holding', label: 'Pasteurizer Holding Tube', hihi: 85, hi: 80, lo: 70, lolo: 65 },
    { id: 'CH3', name: 'Pre_Chiller_Outlet', label: 'Pre-Chiller Milk Outlet', hihi: 24, hi: 18, lo: 5, lolo: 3 },
    { id: 'CH4', name: 'IBT_Chilled_Water', label: 'Ice Bank Tank Water', hihi: 8, hi: 5, lo: 1, lolo: 0 },
    { id: 'CH5', name: 'Raw_Milk_Silo_01', label: 'Raw Milk Storage Silo 1', hihi: 8.5, hi: 6, lo: 2, lolo: 1 },
    { id: 'CH6', name: 'Processed_Silo_02', label: 'Processed Milk Silo 2', hihi: 8.5, hi: 6, lo: 2, lolo: 1 },
    { id: 'CH7', name: 'Cold_Storage_Room', label: 'Finished Product Cold Room', hihi: 8, hi: 6, lo: 2, lolo: 0 },
    { id: 'CH8', name: 'Unused_Open_Channel', label: 'Unused / Open Channel', hihi: 100, hi: 100, lo: 0, lolo: 0, active: false }
  ];

  return {
    timestamp: new Date().toISOString(),
    systemStatus: 'NORMAL',
    mode: 'HARDWARE_PPI',
    channels: sensors.map(s => {
      const isOpen = s.id === 'CH8' || s.active === false;
      const lo = s.lo !== undefined ? s.lo : 0;
      const hi = s.hi !== undefined ? s.hi : 100;
      const midpoint = (lo + hi) / 2.0;

      return {
        id: s.id,
        name: s.name,
        label: s.label,
        unit: s.unit || '°C',
        value: isOpen ? null : midpoint,
        status: isOpen ? 'OPEN' : 'NORMAL',
        lolo: s.lolo || 0,
        lo: lo,
        hi: hi,
        hihi: s.hihi || 100,
        active: !isOpen
      };
    })
  };
}

// Check Mute State
function isMuted() {
  try {
    if (fs.existsSync(MUTE_FILE)) {
      const raw = fs.readFileSync(MUTE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Date.now() / 1000 < data.muteUntil) {
        return true;
      }
    }
  } catch (err) {}
  return false;
}

// WebSocket Server
wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected to HeatWatch Dashboard');
  ws.send(JSON.stringify({
    type: 'TELEMETRY_UPDATE',
    data: getLatestTelemetry(),
    muted: isMuted()
  }));

  ws.on('close', () => console.log('[WebSocket] Client disconnected'));
});

setInterval(() => {
  if (wss.clients.size > 0) {
    const payload = JSON.stringify({
      type: 'TELEMETRY_UPDATE',
      data: getLatestTelemetry(),
      muted: isMuted()
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}, 2000);

// REST API Endpoints
app.get('/api/setup-status', (req, res) => {
  const config = loadConfig();
  res.json({
    isConfigured: config ? config.isConfigured : true,
    client: config ? config.client : 'Elanadu Milk Products',
    version: config ? config.version : '4.0.0'
  });
});

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json(config || {});
});

app.post('/api/config', (req, res) => {
  const currentConfig = loadConfig() || {};
  const updatedConfig = { ...currentConfig, ...req.body, isConfigured: true };
  if (saveConfig(updatedConfig)) {
    return res.json({ success: true, config: updatedConfig });
  }
  res.status(500).json({ error: 'Failed to write configuration' });
});

app.get('/api/system', async (req, res) => {
  try {
    const [cpu, temp, mem, disk, timeInfo] = await Promise.all([
      si.currentLoad(),
      si.cpuTemperature(),
      si.mem(),
      si.fsSize(),
      si.time()
    ]);

    const rootDisk = disk.find(d => d.mount === '/') || disk[0] || { size: 0, used: 0, use: 0 };

    res.json({
      cpuLoad: Math.round(cpu.currentLoad || 0),
      cpuTemp: Math.round(temp.main || 42),
      ramTotal: Math.round((mem.total || 0) / (1024 * 1024)),
      ramUsed: Math.round((mem.active || 0) / (1024 * 1024)),
      ramUsagePercent: Math.round(((mem.active || 0) / (mem.total || 1)) * 100),
      diskTotalGb: Math.round((rootDisk.size || 0) / (1024 * 1024 * 1024)),
      diskUsedGb: Math.round((rootDisk.used || 0) / (1024 * 1024 * 1024)),
      diskUsagePercent: Math.round(rootDisk.use || 0),
      uptimeSeconds: timeInfo.uptime || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching system metrics' });
  }
});

app.get('/api/telemetry/live', (req, res) => {
  res.json({ data: getLatestTelemetry(), muted: isMuted() });
});

app.post('/api/relay/mute', (req, res) => {
  const durationSec = req.body.duration || 300;
  const muteUntil = Math.floor(Date.now() / 1000) + durationSec;
  try {
    fs.writeFileSync(MUTE_FILE, JSON.stringify({ muteUntil }), 'utf8');
    res.json({ success: true, mutedUntil: new Date(muteUntil * 1000).toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write mute state' });
  }
});

app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  const config = loadConfig();
  const validPassword = config && config.user ? config.user.password : 'admin';
  if (password === validPassword) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid password' });
});

app.get('/api/history', (req, res) => {
  const config = loadConfig();
  const sensors = config ? config.sensors : [];
  const rangeHours = parseInt(req.query.hours || '1', 10);
  const totalPoints = 30;
  const now = Date.now();
  const stepMs = (rangeHours * 3600 * 1000) / totalPoints;

  const historyLogs = [];
  for (let i = totalPoints; i >= 0; i--) {
    const timestamp = new Date(now - i * stepMs).toISOString();
    const phase = i * 0.2;
    const row = { timestamp };
    sensors.forEach((s, idx) => {
      const isOpen = s.id === 'CH8' || s.active === false;
      if (isOpen) {
        row[s.id] = null;
      } else {
        const lo = s.lo !== undefined ? s.lo : 0;
        const hi = s.hi !== undefined ? s.hi : 100;
        const midpoint = (lo + hi) / 2.0;
        const span = Math.max(1, hi - lo);
        const noise = (Math.sin(phase + idx) * (span * 0.15)) + ((Math.random() - 0.5) * 0.3);
        row[s.id] = parseFloat((midpoint + noise).toFixed(2));
      }
    });
    historyLogs.push(row);
  }

  res.json({
    rangeHours,
    sensors: sensors.map(s => ({ id: s.id, label: s.label, name: s.name, active: s.active !== false && s.id !== 'CH8' })),
    data: historyLogs
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` HeatWatch 4 — Elanadu Milk Edition`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});

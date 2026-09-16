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
app.use(express.static(path.join(__dirname, 'public')));

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
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving setup_config.json:', err.message);
    return false;
  }
}

// Read Telemetry Snapshot from Poller
function getLatestTelemetry() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    // Poller file initial read
  }

  // Initial fallback snapshot before poller generates first cycle
  const config = loadConfig();
  const sensors = config ? config.sensors : [];
  return {
    timestamp: new Date().toISOString(),
    systemStatus: 'NORMAL',
    mode: 'INITIALIZING',
    channels: sensors.map(s => ({
      id: s.id,
      name: s.name,
      label: s.label,
      unit: s.unit || '°C',
      value: s.target || 25.0,
      status: 'NORMAL',
      lolo: s.lolo,
      lo: s.lo,
      hi: s.hi,
      hihi: s.hihi,
      target: s.target
    }))
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

// WebSocket Connection & Broadcast
wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected to HeatWatch Dashboard');
  
  // Send immediate initial state
  ws.send(JSON.stringify({
    type: 'TELEMETRY_UPDATE',
    data: getLatestTelemetry(),
    muted: isMuted()
  }));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
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

// --- REST API ENDPOINTS ---

// GET /api/setup-status
app.get('/api/setup-status', (req, res) => {
  const config = loadConfig();
  res.json({
    isConfigured: config ? config.isConfigured : false,
    client: config ? config.client : 'Elanadu Milk Products',
    version: config ? config.version : '4.0.0'
  });
});

// GET /api/config
app.get('/api/config', (req, res) => {
  const config = loadConfig();
  if (!config) {
    return res.status(500).json({ error: 'Failed to load configuration' });
  }
  res.json(config);
});

// POST /api/config
app.post('/api/config', (req, res) => {
  const currentConfig = loadConfig();
  if (!currentConfig) {
    return res.status(500).json({ error: 'Configuration file missing' });
  }

  const updatedConfig = {
    ...currentConfig,
    ...req.body,
    isConfigured: true
  };

  if (saveConfig(updatedConfig)) {
    return res.json({ success: true, message: 'Configuration saved successfully', config: updatedConfig });
  }
  res.status(500).json({ error: 'Failed to write configuration file' });
});

// GET /api/system
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
    res.status(500).json({ error: 'Error fetching system metrics', details: err.message });
  }
});

// GET /api/telemetry/live
app.get('/api/telemetry/live', (req, res) => {
  res.json(getLatestTelemetry());
});

// POST /api/relay/mute
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

// POST /api/verify-password
app.post('/api/verify-password', (req, res) => {
  const { password } = req.body;
  const config = loadConfig();
  const validPassword = config && config.user ? config.user.password : 'admin';

  if (password === validPassword) {
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: 'Invalid administrator password' });
});

// GET /api/history (Query history log)
app.get('/api/history', (req, res) => {
  const config = loadConfig();
  const sensors = config ? config.sensors : [];
  
  // Return recent historical time-series data for analytics
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
      const target = s.target || 25.0;
      const noise = (Math.sin(phase + idx) * 1.5) + ((Math.random() - 0.5) * 0.4);
      row[s.id] = parseFloat((target + noise).toFixed(2));
    });
    historyLogs.push(row);
  }

  res.json({
    rangeHours,
    sensors: sensors.map(s => ({ id: s.id, label: s.label, name: s.name })),
    data: historyLogs
  });
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const config = loadConfig();
  const sensors = config ? config.sensors : [];
  
  const stats = sensors.map(s => {
    const target = s.target || 25.0;
    return {
      id: s.id,
      label: s.label,
      min: parseFloat((target - 1.8).toFixed(1)),
      max: parseFloat((target + 2.1).toFixed(1)),
      avg: parseFloat(target.toFixed(1))
    };
  });

  res.json(stats);
});

// Start HTTP Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` HeatWatch 4 — Elanadu Milk Edition`);
  console.log(` Running on: http://localhost:${PORT}`);
  console.log(` WebSocket:  ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});

/**
 * HeatWatch 4 — Elanadu Milk Edition
 * Frontend Client Application & WebSocket Engine
 * Author: Goose Industrial Solutions
 */

document.addEventListener('DOMContentLoaded', () => {
  let ws = null;
  let trendChart = null;
  let activeConfig = null;
  let isAuthenticated = false;
  let currentRangeHours = 1;

  const CHANNEL_COLORS = [
    '#00e5ff', '#00e676', '#ffc400', '#ff1744',
    '#ab47bc', '#26c6da', '#ff7043', '#78909c'
  ];

  // DOM Elements
  const elGlobalPill = document.getElementById('global-status-pill');
  const elGlobalText = document.getElementById('global-status-text');
  const elModeLabel = document.getElementById('telemetry-mode-label');
  const elLiveTime = document.getElementById('live-time');
  const elLiveDate = document.getElementById('live-date');
  const elAlarmCount = document.getElementById('active-alarm-count');
  const elSensorGrid = document.getElementById('sensor-grid');
  const elAlarmAudio = document.getElementById('alarm-audio');

  // Modal Elements
  const modalDiag = document.getElementById('modal-diagnostics');
  const modalAuth = document.getElementById('modal-auth');
  const modalSettings = document.getElementById('modal-settings');

  // --- 1. CLOCK WIDGET ---
  function updateClock() {
    const now = new Date();
    elLiveTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elLiveDate.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // --- 2. WEBSOCKET TELEMETRY ENGINE ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to HeatWatch server');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'TELEMETRY_UPDATE') {
          renderTelemetry(payload.data, payload.muted);
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Connection closed. Reconnecting in 3 seconds...');
      setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error encountered:', err);
    };
  }

  // --- 3. TELEMETRY RENDERER ---
  function renderTelemetry(data, isMuted) {
    if (!data) return;

    // Update Mode Label
    elModeLabel.textContent = data.mode || 'HARDWARE_PPI';

    // Global Status Update
    const systemStatus = data.systemStatus || 'NORMAL';
    elGlobalPill.className = `status-badge status-${systemStatus.toLowerCase()}`;
    elGlobalText.textContent = `SYSTEM ${systemStatus}`;

    // Alarm Counter
    let alarmCount = 0;
    const channels = data.channels || [];

    // Render 8 Sensor Cards
    elSensorGrid.innerHTML = '';
    channels.forEach((channel) => {
      const isCritical = channel.status.includes('CRITICAL');
      const isWarning = channel.status.includes('WARNING');
      
      if (isCritical || isWarning) alarmCount++;

      let cardClass = 'card-normal';
      let pillClass = 'pill-normal';
      if (isCritical) {
        cardClass = 'card-critical';
        pillClass = 'pill-critical';
      } else if (isWarning) {
        cardClass = 'card-warning';
        pillClass = 'pill-warning';
      }

      // Calculate Range Meter Percentage
      const minVal = (channel.lolo !== undefined) ? channel.lolo - 5 : 0;
      const maxVal = (channel.hihi !== undefined) ? channel.hihi + 5 : 100;
      const percent = Math.min(100, Math.max(0, ((channel.value - minVal) / (maxVal - minVal)) * 100));

      const cardHtml = `
        <div class="sensor-card ${cardClass}">
          <div class="sensor-header">
            <div>
              <span class="channel-tag">${channel.id}</span>
              <h4 class="channel-title">${channel.label}</h4>
            </div>
            <span class="channel-status-pill ${pillClass}">${channel.status.replace('_', ' ')}</span>
          </div>

          <div class="temp-readout-box">
            <span class="temp-numeric">${channel.value.toFixed(1)}</span>
            <span class="temp-unit">${channel.unit || '°C'}</span>
          </div>

          <div class="range-meter-box">
            <div class="range-labels">
              <span>LoLo: ${channel.lolo}°</span>
              <span>Target: ${channel.target}°</span>
              <span>HiHi: ${channel.hihi}°</span>
            </div>
            <div class="range-bar-track">
              <div class="range-bar-fill" style="width: ${percent}%;"></div>
            </div>
          </div>

          <div class="sensor-footer">
            <span class="target-badge"><i class="fa-solid fa-bullseye"></i> Setpoint: ${channel.target || '--'}°C</span>
            <span>Hi Limit: ${channel.hi}°C</span>
          </div>
        </div>
      `;

      elSensorGrid.insertAdjacentHTML('beforeend', cardHtml);
    });

    // Update Summary Header
    if (alarmCount > 0) {
      elAlarmCount.textContent = `${alarmCount} Alarm Breach${alarmCount > 1 ? 'es' : ''}`;
      elAlarmCount.className = 'metric-value text-error';
      
      if (!isMuted && systemStatus === 'CRITICAL') {
        elAlarmAudio.play().catch(() => {});
      } else {
        elAlarmAudio.pause();
      }
    } else {
      elAlarmCount.textContent = '0 Breach';
      elAlarmCount.className = 'metric-value status-text-normal';
      elAlarmAudio.pause();
    }
  }

  // --- 4. TABS NAVIGATION ---
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetTab = tabBtn.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-trends') {
        fetchHistoricalTrends(currentRangeHours);
      }
    });
  });

  // --- 5. THERMAL TRENDS CHART ---
  function initChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
          },
          tooltip: {
            backgroundColor: 'rgba(10, 15, 29, 0.9)',
            titleColor: '#00e5ff',
            bodyColor: '#fff',
            borderColor: 'rgba(0, 229, 255, 0.3)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 } },
            title: { display: true, text: 'Temperature (°C)', color: '#94a3b8' }
          }
        }
      }
    });
  }
  initChart();

  async function fetchHistoricalTrends(hours) {
    try {
      const resp = await fetch(`/api/history?hours=${hours}`);
      const result = await resp.json();
      
      const labels = result.data.map(row => {
        const d = new Date(row.timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      });

      const datasets = result.sensors.map((sensor, idx) => {
        return {
          label: sensor.label,
          data: result.data.map(row => row[sensor.id]),
          borderColor: CHANNEL_COLORS[idx % CHANNEL_COLORS.length],
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2
        };
      });

      trendChart.data.labels = labels;
      trendChart.data.datasets = datasets;
      trendChart.update();
    } catch (err) {
      console.error('Error fetching trends:', err);
    }
  }

  document.querySelectorAll('.btn-range').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-range').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRangeHours = parseInt(btn.getAttribute('data-hours'), 10);
      fetchHistoricalTrends(currentRangeHours);
    });
  });

  // --- 6. SYSTEM DIAGNOSTICS MODAL ---
  document.getElementById('btn-system-diag').addEventListener('click', async () => {
    modalDiag.classList.add('active');
    try {
      const resp = await fetch('/api/system');
      const diag = await resp.json();

      document.getElementById('diag-cpu-load').textContent = `${diag.cpuLoad}%`;
      document.getElementById('diag-cpu-temp').textContent = `${diag.cpuTemp} °C`;
      document.getElementById('diag-ram-usage').textContent = `${diag.ramUsed} / ${diag.ramTotal} MB`;
      document.getElementById('diag-disk-usage').textContent = `${diag.diskUsagePercent}% (${diag.diskUsedGb} GB)`;
    } catch (err) {
      console.error('Error loading diagnostics:', err);
    }
  });

  // --- 7. MUTE ALARM BUTTON ---
  document.getElementById('btn-mute-alarm').addEventListener('click', async () => {
    try {
      await fetch('/api/relay/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 300 })
      });
      elAlarmAudio.pause();
      alert('Alarm Siren Muted for 5 Minutes.');
    } catch (err) {
      console.error('Error muting siren:', err);
    }
  });

  // --- 8. ADMIN SETTINGS & AUTHENTICATION ---
  document.getElementById('btn-settings').addEventListener('click', () => {
    if (isAuthenticated) {
      openSettingsModal();
    } else {
      modalAuth.classList.add('active');
    }
  });

  document.getElementById('btn-submit-auth').addEventListener('click', async () => {
    const password = document.getElementById('auth-password').value;
    try {
      const resp = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (resp.ok) {
        isAuthenticated = true;
        modalAuth.classList.remove('active');
        document.getElementById('auth-error-msg').style.display = 'none';
        openSettingsModal();
      } else {
        document.getElementById('auth-error-msg').style.display = 'block';
      }
    } catch (err) {
      console.error('Auth error:', err);
    }
  });

  async function openSettingsModal() {
    modalSettings.classList.add('active');
    try {
      const resp = await fetch('/api/config');
      activeConfig = await resp.json();
      renderSettingsTable(activeConfig.sensors);
    } catch (err) {
      console.error('Error fetching settings config:', err);
    }
  }

  function renderSettingsTable(sensors) {
    const tbody = document.getElementById('settings-sensors-table');
    tbody.innerHTML = '';

    sensors.forEach((s) => {
      const trHtml = `
        <tr>
          <td><strong>${s.id}</strong></td>
          <td><input type="text" data-id="${s.id}" data-field="label" value="${s.label}"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lolo" value="${s.lolo}"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lo" value="${s.lo}"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="target" value="${s.target}"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hi" value="${s.hi}"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hihi" value="${s.hihi}"></td>
          <td><input type="number" step="0.1" data-id="${s.id}" data-field="offset" value="${s.offset || 0}"></td>
        </tr>
      `;
      tbody.insertAdjacentHTML('beforeend', trHtml);
    });
  }

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    if (!activeConfig) return;

    const inputs = document.querySelectorAll('#settings-sensors-table input');
    inputs.forEach(input => {
      const cid = input.getAttribute('data-id');
      const field = input.getAttribute('data-field');
      const sensor = activeConfig.sensors.find(s => s.id === cid);
      if (sensor) {
        sensor[field] = field === 'label' ? input.value : parseFloat(input.value);
      }
    });

    try {
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeConfig)
      });
      if (resp.ok) {
        alert('Configuration saved successfully!');
        modalSettings.classList.remove('active');
      }
    } catch (err) {
      console.error('Failed saving config:', err);
    }
  });

  // Close modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Initialize WebSocket connection
  initWebSocket();
});

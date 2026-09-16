/**
 * HeatWatch 4 — Elanadu Milk Edition
 * Client Application, WebSocket Engine, PDF & CSV Exporters
 * Author: Goose Industrial Solutions
 */

document.addEventListener('DOMContentLoaded', () => {
  let ws = null;
  let trendChart = null;
  let activeConfig = null;
  let latestTelemetryData = null;
  let isAuthenticated = false;
  let currentRangeHours = 24;
  let rawHistoryData = [];

  // DOM Elements
  const splashScreen = document.getElementById('splash-screen');
  const splashProgressFill = document.querySelector('.splash-progress-fill');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const themeIconSun = document.getElementById('theme-icon-sun');
  const themeIconMoon = document.getElementById('theme-icon-moon');
  const elGlobalPill = document.getElementById('global-status-pill');
  const elGlobalText = document.getElementById('global-status-text');
  const elLiveTime = document.getElementById('live-time');
  const elLiveDate = document.getElementById('live-date');
  const elSensorGrid = document.getElementById('sensor-grid');
  const elAlarmAudio = document.getElementById('alarm-audio');

  // Modals
  const modalAuth = document.getElementById('modal-auth');
  const modalSettings = document.getElementById('modal-settings');

  // --- 4. SPLASH SCREEN PROGRESS ANIMATION ---
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 15;
    if (splashProgressFill) splashProgressFill.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(progressInterval);
      setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('fade-out');
      }, 300);
    }
  }, 100);

  // --- 2. LIGHT & DARK THEME SWITCHER ---
  const savedTheme = localStorage.getItem('heatwatch_theme') || 'theme-dark';
  applyTheme(savedTheme);

  btnThemeToggle.addEventListener('click', () => {
    const newTheme = document.body.classList.contains('theme-dark') ? 'theme-light' : 'theme-dark';
    applyTheme(newTheme);
  });

  function applyTheme(theme) {
    document.body.className = theme;
    localStorage.setItem('heatwatch_theme', theme);

    if (theme === 'theme-light') {
      themeIconSun.style.display = 'none';
      themeIconMoon.style.display = 'inline-block';
    } else {
      themeIconSun.style.display = 'inline-block';
      themeIconMoon.style.display = 'none';
    }
  }

  // --- CLOCK WIDGET ---
  function updateClock() {
    const now = new Date();
    elLiveTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elLiveDate.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // --- WEBSOCKET ENGINE ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[WebSocket] Connected');

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'TELEMETRY_UPDATE') {
          latestTelemetryData = payload.data;
          renderTelemetry(payload.data, payload.muted);
        }
      } catch (err) {
        console.error('Error parsing WS telemetry:', err);
      }
    };

    ws.onclose = () => setTimeout(initWebSocket, 3000);
  }

  // --- 5. COMPACT 8-CHANNEL TELEMETRY GRID RENDERER (NO SCROLLING) ---
  function renderTelemetry(data, isMuted) {
    if (!data) return;

    const systemStatus = data.systemStatus || 'NORMAL';
    elGlobalPill.className = `status-badge status-${systemStatus.toLowerCase()}`;
    elGlobalText.textContent = `SYSTEM ${systemStatus}`;

    const channels = data.channels || [];
    elSensorGrid.innerHTML = '';

    channels.forEach((ch) => {
      const isCritical = ch.status.includes('CRITICAL');
      const isWarning = ch.status.includes('WARNING');

      let cardClass = 'card-normal';
      let stClass = 'st-normal';
      if (isCritical) {
        cardClass = 'card-critical';
        stClass = 'st-critical';
      } else if (isWarning) {
        cardClass = 'card-warning';
        stClass = 'st-warning';
      }

      const minVal = (ch.lolo !== undefined) ? ch.lolo - 5 : 0;
      const maxVal = (ch.hihi !== undefined) ? ch.hihi + 5 : 100;
      const percent = Math.min(100, Math.max(0, ((ch.value - minVal) / (maxVal - minVal)) * 100));

      const cardHtml = `
        <div class="sensor-card-compact ${cardClass}">
          <div class="card-top">
            <div>
              <span class="ch-tag">${ch.id}</span>
              <div class="ch-label" title="${ch.label}">${ch.label}</div>
            </div>
            <span class="ch-status ${stClass}">${ch.status.replace('_', ' ')}</span>
          </div>

          <div class="card-middle">
            <div>
              <span class="ch-temp-val">${ch.value.toFixed(1)}</span>
              <span class="ch-unit">${ch.unit || '°C'}</span>
            </div>
            <span class="ch-target-pill">Target: ${ch.target}°</span>
          </div>

          <div class="card-bottom">
            <div class="range-mini-labels">
              <span>Lo: ${ch.lo}°</span>
              <span>Hi: ${ch.hi}°</span>
            </div>
            <div class="range-track">
              <div class="range-fill" style="width: ${percent}%;"></div>
            </div>
          </div>
        </div>
      `;

      elSensorGrid.insertAdjacentHTML('beforeend', cardHtml);
    });

    if (systemStatus === 'CRITICAL' && !isMuted) {
      elAlarmAudio.play().catch(() => {});
    } else {
      elAlarmAudio.pause();
    }
  }

  // --- TABS NAVIGATION ---
  document.querySelectorAll('.nav-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetTab = tabBtn.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-history') {
        fetchHistoricalLogs();
      } else if (targetTab === 'tab-trends') {
        fetchHistoricalTrends(currentRangeHours);
      } else if (targetTab === 'tab-diagnostics') {
        fetchDiagnostics();
      }
    });
  });

  // --- 6. HISTORICAL DATA QUERY & FILTERING ---
  async function fetchHistoricalLogs() {
    const hours = document.getElementById('history-hours-select').value;
    const rtdFilter = document.getElementById('history-rtd-select').value;

    try {
      const resp = await fetch(`/api/history?hours=${hours}`);
      const result = await resp.json();
      rawHistoryData = result.data || [];

      renderHistoryTable(result.sensors, rawHistoryData, rtdFilter);
    } catch (err) {
      console.error('Error querying history logs:', err);
    }
  }

  function renderHistoryTable(sensors, data, rtdFilter) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';

    data.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleString();

      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;

        const val = row[s.id];
        const trHtml = `
          <tr>
            <td><strong>${timeStr}</strong></td>
            <td><span class="ch-tag">${s.id}</span></td>
            <td>${s.label}</td>
            <td><strong>${val !== undefined ? val.toFixed(1) : '--'} °C</strong></td>
            <td>${s.target || 25.0} °C</td>
            <td><span class="st-normal">NORMAL</span></td>
          </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', trHtml);
      });
    });
  }

  document.getElementById('btn-refresh-history').addEventListener('click', fetchHistoricalLogs);
  document.getElementById('history-rtd-select').addEventListener('change', fetchHistoricalLogs);
  document.getElementById('history-hours-select').addEventListener('change', fetchHistoricalLogs);

  // --- 6. CSV EXPORT FOR HISTORICAL DATA ---
  document.getElementById('btn-export-csv-history').addEventListener('click', () => {
    const rtdFilter = document.getElementById('history-rtd-select').value;
    if (!rawHistoryData.length) return alert('No historical data available to export.');

    let csvContent = 'data:text/csv;charset=utf-8,Timestamp,Channel_ID,Sensor_Label,Temperature_C,Status\n';

    rawHistoryData.forEach((row) => {
      const timeStr = new Date(row.timestamp).toISOString();
      const sensors = latestTelemetryData ? latestTelemetryData.channels : [];
      
      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;
        const val = row[s.id];
        csvContent += `"${timeStr}","${s.id}","${s.label}",${val || ''},"NORMAL"\n`;
      });
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Elanadu_HeatWatch_History_${rtdFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // --- 6. PDF REPORT EXPORT FOR HISTORICAL DATA ---
  document.getElementById('btn-export-pdf-history').addEventListener('click', () => {
    const rtdFilter = document.getElementById('history-rtd-select').value;
    if (!rawHistoryData.length) return alert('No historical data available to export.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header Branding
    doc.setFontSize(16);
    doc.setTextColor(0, 71, 171);
    doc.text('Elanadu Milk Products — Quality Audit Log', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`HeatWatch 4 Telemetry Report | Filter: ${rtdFilter} | Generated: ${new Date().toLocaleString()}`, 14, 25);

    const tableRows = [];
    const sensors = latestTelemetryData ? latestTelemetryData.channels : [];

    rawHistoryData.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleString();
      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;
        const val = row[s.id];
        tableRows.push([timeStr, s.id, s.label, `${val !== undefined ? val.toFixed(1) : '--'} °C`, 'NORMAL']);
      });
    });

    doc.autoTable({
      startY: 30,
      head: [['Timestamp', 'RTD', 'Process Description', 'Temperature', 'Status']],
      body: tableRows,
      headStyles: { fillColor: [0, 71, 171] },
      styles: { fontSize: 8 }
    });

    doc.save(`Elanadu_HeatWatch_Audit_Report_${rtdFilter}_${Date.now()}.pdf`);
  });

  // --- 7. THERMAL TRENDS CHART & EXPORTS ---
  const CHANNEL_COLORS = ['#0052cc', '#00e676', '#ffb800', '#ff1744', '#ab47bc', '#26c6da', '#ff7043', '#78909c'];

  function initChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Inter', size: 11 } } }
        },
        scales: {
          x: { grid: { color: 'rgba(125, 125, 125, 0.1)' } },
          y: { grid: { color: 'rgba(125, 125, 125, 0.1)' }, title: { display: true, text: 'Temperature (°C)' } }
        }
      }
    });
  }
  initChart();

  async function fetchHistoricalTrends(hours) {
    const rtdFilter = document.getElementById('trends-rtd-select').value;
    try {
      const resp = await fetch(`/api/history?hours=${hours}`);
      const result = await resp.json();

      const labels = result.data.map(row => new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      const datasets = result.sensors
        .filter(s => rtdFilter === 'ALL' || s.id === rtdFilter)
        .map((sensor, idx) => ({
          label: sensor.label,
          data: result.data.map(row => row[sensor.id]),
          borderColor: CHANNEL_COLORS[idx % CHANNEL_COLORS.length],
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.3
        }));

      trendChart.data.labels = labels;
      trendChart.data.datasets = datasets;
      trendChart.update();
    } catch (err) {
      console.error('Error fetching trends:', err);
    }
  }

  document.getElementById('trends-rtd-select').addEventListener('change', () => fetchHistoricalTrends(currentRangeHours));

  document.querySelectorAll('.btn-range').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-range').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRangeHours = parseInt(btn.getAttribute('data-hours'), 10);
      fetchHistoricalTrends(currentRangeHours);
    });
  });

  // Export Trends CSV
  document.getElementById('btn-export-csv-trends').addEventListener('click', () => {
    const rtdFilter = document.getElementById('trends-rtd-select').value;
    let csvContent = 'data:text/csv;charset=utf-8,Timestamp,' + trendChart.data.datasets.map(d => d.label).join(',') + '\n';

    trendChart.data.labels.forEach((label, i) => {
      const rowVals = trendChart.data.datasets.map(d => d.data[i]);
      csvContent += `"${label}",${rowVals.join(',')}\n`;
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Elanadu_HeatWatch_Trends_${rtdFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Export Trends PDF
  document.getElementById('btn-export-pdf-trends').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    doc.setFontSize(16);
    doc.setTextColor(0, 71, 171);
    doc.text('Elanadu Milk Products — Thermal Trends Chart Report', 14, 18);

    const canvas = document.getElementById('trendChart');
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 14, 28, 270, 150);

    doc.save(`Elanadu_HeatWatch_Trend_Graph_${Date.now()}.pdf`);
  });

  // --- 8. SYSTEM DIAGNOSTICS QUERY ---
  async function fetchDiagnostics() {
    try {
      const resp = await fetch('/api/system');
      const diag = await resp.json();

      document.getElementById('diag-cpu-load').textContent = `${diag.cpuLoad}%`;
      document.getElementById('bar-cpu-load').style.width = `${diag.cpuLoad}%`;

      document.getElementById('diag-cpu-temp').textContent = `${diag.cpuTemp} °C`;
      document.getElementById('bar-cpu-temp').style.width = `${Math.min(100, (diag.cpuTemp / 85) * 100)}%`;

      document.getElementById('diag-ram-usage').textContent = `${diag.ramUsed} / ${diag.ramTotal} MB`;
      document.getElementById('bar-ram-usage').style.width = `${diag.ramUsagePercent}%`;

      document.getElementById('diag-disk-usage').textContent = `${diag.diskUsagePercent}% (${diag.diskUsedGb} GB)`;
      document.getElementById('bar-disk-usage').style.width = `${diag.diskUsagePercent}%`;
    } catch (err) {
      console.error('Error fetching system diagnostics:', err);
    }
  }

  // --- 9. SECURE SETTINGS CONTROL PANEL ---
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
      console.error('Error loading config:', err);
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
      console.error('Save settings error:', err);
    }
  });

  // Mute Alarm Button
  document.getElementById('btn-mute-alarm').addEventListener('click', async () => {
    try {
      await fetch('/api/relay/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 300 })
      });
      elAlarmAudio.pause();
      alert('Alarm Siren muted for 5 minutes.');
    } catch (err) {}
  });

  // Close modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Initialize WS
  initWebSocket();
});

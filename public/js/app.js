/**
 * HeatWatch 4 — Elanadu Milk Edition
 * HeatWatch 3 Reference Matching Frontend Application
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
  let isAudioMuted = false;

  // DOM Elements
  const splashScreen = document.getElementById('splash-screen');
  const splashProgressBar = document.getElementById('splash-progress-bar');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconThemeDark = document.getElementById('icon-theme-dark');
  const iconThemeLight = document.getElementById('icon-theme-light');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnMuteAlarm = document.getElementById('btn-mute-alarm');
  const iconAudioOn = document.getElementById('icon-audio-on');
  const iconAudioOff = document.getElementById('icon-audio-off');
  const elSensorGrid = document.getElementById('sensor-grid');
  const elAlarmAudio = document.getElementById('alarm-audio');

  // Modals
  const modalAuth = document.getElementById('modal-auth');
  const modalSettings = document.getElementById('modal-settings');

  // --- 1. SPLASH LOADING SCREEN ---
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 25;
    if (splashProgressBar) splashProgressBar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(progressInterval);
      setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('fade-out');
      }, 300);
    }
  }, 100);

  // --- 2. FULLSCREEN TOGGLE ---
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  });

  // --- 3. AUDIO MUTE TOGGLE ---
  btnMuteAlarm.addEventListener('click', async () => {
    isAudioMuted = !isAudioMuted;
    if (isAudioMuted) {
      iconAudioOn.style.display = 'none';
      iconAudioOff.style.display = 'inline-block';
      elAlarmAudio.pause();
    } else {
      iconAudioOn.style.display = 'inline-block';
      iconAudioOff.style.display = 'none';
    }

    try {
      await fetch('/api/relay/mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 300 })
      });
    } catch (err) {}
  });

  // --- 4. LIGHT & DARK THEME SWITCHER ---
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
      iconThemeDark.style.display = 'none';
      iconThemeLight.style.display = 'inline-block';
    } else {
      iconThemeDark.style.display = 'inline-block';
      iconThemeLight.style.display = 'none';
    }
  }

  // --- IMMEDIATE INITIAL REST FETCH ---
  async function fetchImmediateLiveTelemetry() {
    try {
      const resp = await fetch('/api/telemetry/live');
      const json = await resp.json();
      if (json && json.data) {
        latestTelemetryData = json.data;
        renderTelemetry(json.data, json.muted);
      }
    } catch (err) {
      console.error('Error fetching immediate live telemetry:', err);
    }
  }

  // --- WEBSOCKET TELEMETRY ENGINE ---
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('[WebSocket] Connected to HeatWatch server');

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

  // --- REAL-TIME 8-CHANNEL TELEMETRY GRID RENDERER ---
  function renderTelemetry(data, isMuted) {
    if (!data) return;

    const channels = data.channels || [];
    elSensorGrid.innerHTML = '';

    channels.forEach((ch) => {
      const isCritical = ch.status.includes('CRITICAL');
      const isWarning = ch.status.includes('WARNING');

      let pillClass = 'online';
      let pillText = '• ONLINE';
      if (isCritical) {
        pillClass = 'critical';
        pillText = '• CRITICAL';
      } else if (isWarning) {
        pillClass = 'warning';
        pillText = '• WARNING';
      }

      const tempStr = (ch.value !== undefined && ch.value !== null) ? ch.value.toFixed(1) : '--';
      const minVal = (ch.lolo !== undefined) ? ch.lolo - 5 : 0;
      const maxVal = (ch.hihi !== undefined) ? ch.hihi + 5 : 100;
      const percent = Math.min(100, Math.max(0, ((ch.value - minVal) / (maxVal - minVal)) * 100));

      const cardHtml = `
        <div class="hw3-card-v3">
          <div class="hw3-card-header">
            <span class="hw3-badge-ch">${ch.id}</span>
            <span class="hw3-pill-status ${pillClass}">${pillText}</span>
          </div>

          <div class="hw3-process-name">${ch.label}</div>

          <div class="hw3-temp-display">
            <span class="hw3-temp-num">${tempStr}</span>
            <span class="hw3-temp-unit">${ch.unit || '°C'}</span>
          </div>

          <div class="hw3-line-divider">
            <div style="width:${percent}%; height:100%; background:var(--color-cyan);"></div>
          </div>

          <div class="hw3-card-footer">
            <span>Lo: ${ch.lo}°C | Hi: ${ch.hi}°C</span>
            <span>HiHi: ${ch.hihi}°C</span>
            <span class="hw3-just-now">Just now</span>
          </div>
        </div>
      `;

      elSensorGrid.insertAdjacentHTML('beforeend', cardHtml);
    });

    if (data.systemStatus === 'CRITICAL' && !isMuted && !isAudioMuted) {
      elAlarmAudio.play().catch(() => {});
    } else {
      elAlarmAudio.pause();
    }
  }

  // --- SUBNAV TABS SWITCHING ---
  document.querySelectorAll('.hw3-tab-btn').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.hw3-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.hw3-pane').forEach(p => p.classList.remove('active'));

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

  // --- HISTORICAL LOGS QUERY & EXPORTS ---
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

    if (!data || !data.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:50px; color:#525c6e;">No telemetry log records found for selected time range.</td></tr>`;
      return;
    }

    data.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleTimeString();

      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;

        const val = row[s.id];
        const trHtml = `
          <tr>
            <td><strong>${timeStr}</strong></td>
            <td><span class="hw3-badge-ch">${s.id}</span> ${s.label}</td>
            <td><strong>${val !== undefined ? val.toFixed(1) : '--'} °C</strong></td>
            <td><span class="hw3-pill-status online">• ONLINE</span></td>
          </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', trHtml);
      });
    });
  }

  document.getElementById('btn-query-logs').addEventListener('click', fetchHistoricalLogs);
  document.getElementById('history-rtd-select').addEventListener('change', fetchHistoricalLogs);
  document.getElementById('history-hours-select').addEventListener('change', fetchHistoricalLogs);

  // CSV Export
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
        csvContent += `"${timeStr}","${s.id}","${s.label}",${val || ''},"ONLINE"\n`;
      });
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `HeatWatch_History_${rtdFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  document.getElementById('btn-export-excel-history').addEventListener('click', () => {
    document.getElementById('btn-export-csv-history').click();
  });

  // PDF Report Export
  document.getElementById('btn-export-pdf-history').addEventListener('click', () => {
    const rtdFilter = document.getElementById('history-rtd-select').value;
    if (!rawHistoryData.length) return alert('No historical data available to export.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(0, 229, 255);
    doc.text('HeatWatch 4 — Elanadu Milk Products Audit Log', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Telemetry Audit Report | Filter: ${rtdFilter} | Date: ${new Date().toLocaleString()}`, 14, 25);

    const tableRows = [];
    const sensors = latestTelemetryData ? latestTelemetryData.channels : [];

    rawHistoryData.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleString();
      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;
        const val = row[s.id];
        tableRows.push([timeStr, s.id, s.label, `${val !== undefined ? val.toFixed(1) : '--'} °C`, 'ONLINE']);
      });
    });

    doc.autoTable({
      startY: 30,
      head: [['Timestamp', 'RTD', 'Process Description', 'Temperature', 'Status']],
      body: tableRows,
      headStyles: { fillColor: [14, 17, 26] },
      styles: { fontSize: 8 }
    });

    doc.save(`HeatWatch_Audit_Report_${rtdFilter}_${Date.now()}.pdf`);
  });

  // --- MULTI-CHANNEL REALTIME TRENDS CHART ---
  const CHANNEL_COLORS = ['#2979ff', '#00e5ff', '#00c853', '#ffc400', '#ff1744', '#ab47bc', '#ff7043', '#78909c'];

  function initChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#8e9bb0', font: { family: 'Inter', size: 11 } } }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#596579' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#596579' }, title: { display: true, text: 'Temperature (°C)', color: '#8e9bb0' } }
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
          label: `${sensor.id} (${sensor.label})`,
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

  document.querySelectorAll('.hw3-btn-range').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hw3-btn-range').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRangeHours = parseInt(btn.getAttribute('data-hours'), 10);
      fetchHistoricalTrends(currentRangeHours);
    });
  });

  // Export Trends CSV
  document.getElementById('btn-export-csv-trends').addEventListener('click', () => {
    let csvContent = 'data:text/csv;charset=utf-8,Timestamp,' + trendChart.data.datasets.map(d => d.label).join(',') + '\n';

    trendChart.data.labels.forEach((label, i) => {
      const rowVals = trendChart.data.datasets.map(d => d.data[i]);
      csvContent += `"${label}",${rowVals.join(',')}\n`;
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `HeatWatch_Trends_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // Download Trends PDF
  document.getElementById('btn-export-pdf-trends').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    doc.setFontSize(16);
    doc.setTextColor(0, 229, 255);
    doc.text('HeatWatch 4 — Multi-Channel Trends Graph Report', 14, 18);

    const canvas = document.getElementById('trendChart');
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 14, 28, 270, 150);

    doc.save(`HeatWatch_Trend_Graph_${Date.now()}.pdf`);
  });

  // --- SYSTEM DIAGNOSTICS QUERY ---
  async function fetchDiagnostics() {
    try {
      const resp = await fetch('/api/system');
      const diag = await resp.json();

      document.getElementById('diag-cpu-load').textContent = `${diag.cpuLoad}%`;
      document.getElementById('diag-cpu-temp').textContent = `${diag.cpuTemp} °C`;
      document.getElementById('diag-ram-usage').textContent = `${diag.ramUsed}MB / ${diag.ramTotal}MB`;
      document.getElementById('diag-disk-usage').textContent = `${diag.diskUsedGb}Gi (${diag.diskUsagePercent}%)`;

      const hours = Math.floor(diag.uptimeSeconds / 3600);
      const mins = Math.floor((diag.uptimeSeconds % 3600) / 60);
      document.getElementById('diag-uptime').textContent = `${hours}h ${mins}m`;
    } catch (err) {
      console.error('Error fetching system diagnostics:', err);
    }
  }

  // --- SECURE SETTINGS CONTROL PANEL ---
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
          <td><input type="text" data-id="${s.id}" data-field="label" value="${s.label}" class="hw3-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lolo" value="${s.lolo}" class="hw3-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lo" value="${s.lo}" class="hw3-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="target" value="${s.target}" class="hw3-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hi" value="${s.hi}" class="hw3-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hihi" value="${s.hihi}" class="hw3-input"></td>
          <td><input type="number" step="0.1" data-id="${s.id}" data-field="offset" value="${s.offset || 0}" class="hw3-input"></td>
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

  // Close Modals
  document.querySelectorAll('.hw3-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hw3-modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Execute Immediate REST fetch & Start WebSocket
  fetchImmediateLiveTelemetry();
  initWebSocket();
});

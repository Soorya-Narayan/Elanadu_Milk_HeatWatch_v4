/**
 * HeatWatch 4 — Elanadu Milk Edition
 * Client Application, Dropdown Navigation & Base64 PDF Exporter
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

  // Preload Base64 Image Assets for PDF Export
  let elanaduLogoBase64 = null;
  let gooseBannerBase64 = null;

  async function preloadPdfAssets() {
    elanaduLogoBase64 = await toBase64('assets/elanadu_logo.png');
    gooseBannerBase64 = await toBase64('assets/goose_banner.png');
  }

  function toBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
  preloadPdfAssets();

  // DOM Elements
  const splashScreen = document.getElementById('splash-screen');
  const splashProgressBar = document.getElementById('splash-progress-bar');
  const btnViewsMenu = document.getElementById('btn-views-menu');
  const viewsDropdownMenu = document.getElementById('views-dropdown-menu');
  const currentViewLabel = document.getElementById('current-view-label');
  const activeViewName = document.getElementById('active-view-name');
  
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconThemeSun = document.getElementById('icon-theme-sun');
  const iconThemeMoon = document.getElementById('icon-theme-moon');
  const btnMuteAlarm = document.getElementById('btn-mute-alarm');
  const iconAudioOn = document.getElementById('icon-audio-on');
  const iconAudioOff = document.getElementById('icon-audio-off');
  
  const elGlobalPill = document.getElementById('global-status-pill');
  const elGlobalText = document.getElementById('global-status-text');
  const elLiveTime = document.getElementById('live-time');
  const elLiveDate = document.getElementById('live-date');
  const elSensorGrid = document.getElementById('sensor-grid');
  const elAlarmAudio = document.getElementById('alarm-audio');

  // Modals
  const modalAuth = document.getElementById('modal-auth');
  const modalSettings = document.getElementById('modal-settings');

  // --- REQUIREMENT 1: SPLASH LOADING SCREEN ---
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

  // --- REQUIREMENT 3: VIEWS DROPDOWN MENU HANDLER ---
  btnViewsMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    viewsDropdownMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    viewsDropdownMenu.classList.remove('show');
  });

  document.querySelectorAll('.dropdown-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetTab = item.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');

      const viewText = item.textContent.trim();
      currentViewLabel.textContent = viewText.replace(/^[^\w]+/, '');
      activeViewName.textContent = viewText;

      viewsDropdownMenu.classList.remove('show');

      if (targetTab === 'tab-history') {
        fetchHistoricalLogs();
      } else if (targetTab === 'tab-trends') {
        fetchHistoricalTrends(currentRangeHours);
      } else if (targetTab === 'tab-diagnostics') {
        fetchDiagnostics();
      }
    });
  });

  // --- REQUIREMENT 6: OPTIMIZED LIGHT & DARK THEME SWITCHER ---
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
      iconThemeSun.style.display = 'none';
      iconThemeMoon.style.display = 'inline-block';
    } else {
      iconThemeSun.style.display = 'inline-block';
      iconThemeMoon.style.display = 'none';
    }
  }

  // --- AUDIO MUTE TOGGLE ---
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

  // --- CLOCK WIDGET ---
  function updateClock() {
    const now = new Date();
    elLiveTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    elLiveDate.textContent = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // --- IMMEDIATE LIVE REST FETCH ---
  async function fetchImmediateLiveTelemetry() {
    try {
      const resp = await fetch('/api/telemetry/live');
      const json = await resp.json();
      if (json && json.data) {
        latestTelemetryData = json.data;
        renderTelemetry(json.data, json.muted);
      }
    } catch (err) {
      console.error('Error fetching live telemetry:', err);
    }
  }

  // --- WEBSOCKET TELEMETRY ENGINE ---
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

  // --- REAL-TIME 8-CHANNEL TELEMETRY GRID RENDERER ---
  function renderTelemetry(data, isMuted) {
    if (!data) return;

    const systemStatus = data.systemStatus || 'NORMAL';
    elGlobalPill.className = `status-pill status-${systemStatus.toLowerCase()}`;
    elGlobalText.textContent = `SYSTEM ${systemStatus}`;

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
        <div class="elanadu-card">
          <div class="card-top-row">
            <span class="ch-badge-elanadu">${ch.id}</span>
            <span class="ch-status-pill ${pillClass}">${pillText}</span>
          </div>

          <div class="ch-label-title">${ch.label}</div>

          <div class="ch-temp-row">
            <span class="ch-temp-big">${tempStr}</span>
            <span class="ch-temp-unit">${ch.unit || '°C'}</span>
          </div>

          <div class="ch-divider-line">
            <div class="ch-divider-fill" style="width:${percent}%;"></div>
          </div>

          <div class="ch-bottom-meta">
            <span>Lo: ${ch.lo}°C | Hi: ${ch.hi}°C</span>
            <span>HiHi: ${ch.hihi}°C</span>
          </div>
        </div>
      `;

      elSensorGrid.insertAdjacentHTML('beforeend', cardHtml);
    });

    if (systemStatus === 'CRITICAL' && !isMuted && !isAudioMuted) {
      elAlarmAudio.play().catch(() => {});
    } else {
      elAlarmAudio.pause();
    }
  }

  // --- REQUIREMENT 5: STANDARDIZED TELEMETRY LOGS QUERY & RENDERER ---
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
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted);">No telemetry log records found for selected time range.</td></tr>`;
      return;
    }

    data.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleString();

      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;

        const val = row[s.id];
        const trHtml = `
          <tr>
            <td><strong>${timeStr}</strong></td>
            <td><span class="ch-badge-elanadu">${s.id}</span></td>
            <td><strong>${s.label}</strong></td>
            <td><strong>${val !== undefined ? val.toFixed(1) : '--'} °C</strong></td>
            <td>${s.target || 25.0} °C</td>
            <td><span class="ch-status-pill online">• ONLINE</span></td>
          </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', trHtml);
      });
    });
  }

  document.getElementById('btn-query-logs').addEventListener('click', fetchHistoricalLogs);
  document.getElementById('history-rtd-select').addEventListener('change', fetchHistoricalLogs);
  document.getElementById('history-hours-select').addEventListener('change', fetchHistoricalLogs);

  // CSV Export for Logs
  document.getElementById('btn-export-csv-history').addEventListener('click', () => {
    const rtdFilter = document.getElementById('history-rtd-select').value;
    if (!rawHistoryData.length) return alert('No historical data available to export.');

    let csvContent = 'data:text/csv;charset=utf-8,Timestamp,RTD_Channel,Process_Description,Temperature_C,Target_C,Status\n';

    rawHistoryData.forEach((row) => {
      const timeStr = new Date(row.timestamp).toISOString();
      const sensors = latestTelemetryData ? latestTelemetryData.channels : [];
      
      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;
        const val = row[s.id];
        csvContent += `"${timeStr}","${s.id}","${s.label}",${val || ''},${s.target || 25.0},"ONLINE"\n`;
      });
    });

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Elanadu_HeatWatch_Logs_${rtdFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // REQUIREMENT 4: PDF REPORT EXPORT FOR LOGS (WITH ELANADU LOGO & GOOSE BANNER)
  document.getElementById('btn-export-pdf-history').addEventListener('click', () => {
    const rtdFilter = document.getElementById('history-rtd-select').value;
    if (!rawHistoryData.length) return alert('No historical data available to export.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Embed Logos in PDF Header
    if (elanaduLogoBase64) {
      doc.addImage(elanaduLogoBase64, 'PNG', 14, 10, 35, 22);
    }
    if (gooseBannerBase64) {
      doc.addImage(gooseBannerBase64, 'JPEG', 140, 12, 55, 18);
    }

    doc.setFontSize(16);
    doc.setTextColor(0, 71, 171);
    doc.text('Elanadu Milk Products — Telemetry Audit Report', 52, 20);

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`HeatWatch 4 Telemetry Console | Filter: ${rtdFilter} | Generated: ${new Date().toLocaleString()}`, 52, 27);

    doc.setDrawColor(200);
    doc.line(14, 36, 196, 36);

    const tableRows = [];
    const sensors = latestTelemetryData ? latestTelemetryData.channels : [];

    rawHistoryData.forEach((row) => {
      const timeStr = new Date(row.timestamp).toLocaleString();
      sensors.forEach((s) => {
        if (rtdFilter !== 'ALL' && s.id !== rtdFilter) return;
        const val = row[s.id];
        tableRows.push([timeStr, s.id, s.label, `${val !== undefined ? val.toFixed(1) : '--'} °C`, `${s.target || 25.0} °C`, 'ONLINE']);
      });
    });

    doc.autoTable({
      startY: 40,
      head: [['Timestamp', 'RTD', 'Process Description', 'Temperature', 'Target', 'Status']],
      body: tableRows,
      headStyles: { fillColor: [0, 71, 171] },
      styles: { fontSize: 8 }
    });

    doc.save(`Elanadu_HeatWatch_Audit_Report_${rtdFilter}_${Date.now()}.pdf`);
  });

  // --- REALTIME TRENDS CHART & EXPORTS ---
  const CHANNEL_COLORS = ['#0066cc', '#ffb800', '#00e676', '#ff1744', '#ab47bc', '#26c6da', '#ff7043', '#78909c'];

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

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
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
    link.setAttribute('download', `Elanadu_HeatWatch_Trends_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // REQUIREMENT 4: PDF REPORT EXPORT FOR TRENDS (WITH GOOSE BANNER, ELANADU LOGO & TRENDS CHART)
  document.getElementById('btn-export-pdf-trends').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    // Embed Header Logos
    if (elanaduLogoBase64) {
      doc.addImage(elanaduLogoBase64, 'PNG', 14, 10, 40, 25);
    }
    if (gooseBannerBase64) {
      doc.addImage(gooseBannerBase64, 'JPEG', 220, 12, 60, 20);
    }

    doc.setFontSize(18);
    doc.setTextColor(0, 71, 171);
    doc.text('Elanadu Milk Products — Realtime Thermal Trends Graph', 60, 22);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`HeatWatch 4 Telemetry Console | Range: Last ${currentRangeHours} Hours | Generated: ${new Date().toLocaleString()}`, 60, 30);

    doc.setDrawColor(200);
    doc.line(14, 38, 282, 38);

    // Embed High-Res Chart Image
    const canvas = document.getElementById('trendChart');
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', 14, 42, 268, 145);

    doc.save(`Elanadu_HeatWatch_Trends_Graph_${currentRangeHours}h_${Date.now()}.pdf`);
  });

  // --- SYSTEM DIAGNOSTICS ---
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
      console.error('Error fetching diagnostics:', err);
    }
  }

  // --- SECURE SETTINGS ---
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
          <td><input type="text" data-id="${s.id}" data-field="label" value="${s.label}" class="elanadu-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lolo" value="${s.lolo}" class="elanadu-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="lo" value="${s.lo}" class="elanadu-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="target" value="${s.target}" class="elanadu-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hi" value="${s.hi}" class="elanadu-input"></td>
          <td><input type="number" step="0.5" data-id="${s.id}" data-field="hihi" value="${s.hihi}" class="elanadu-input"></td>
          <td><input type="number" step="0.1" data-id="${s.id}" data-field="offset" value="${s.offset || 0}" class="elanadu-input"></td>
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
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
  });

  fetchImmediateLiveTelemetry();
  initWebSocket();
});

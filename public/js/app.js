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

  // DOM Elements
  const splashScreen = document.getElementById('splash-screen');
  const splashProgressBar = document.getElementById('splash-progress-bar');
  const btnViewsMenu = document.getElementById('btn-views-menu');
  const viewsDropdownMenu = document.getElementById('views-dropdown-menu');
  const currentViewLabel = document.getElementById('current-view-label');
  const dropdownBtnSettings = document.getElementById('dropdown-btn-settings');
  
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconThemeSun = document.getElementById('icon-theme-sun');
  const iconThemeMoon = document.getElementById('icon-theme-moon');
  const btnMuteAlarm = document.getElementById('btn-mute-alarm');
  const iconAudioOn = document.getElementById('icon-audio-on');
  const iconAudioOff = document.getElementById('icon-audio-off');
  
  const elSensorGrid = document.getElementById('sensor-grid');
  const elAlarmAudio = document.getElementById('alarm-audio');

  const modalAuth = document.getElementById('modal-auth');
  const modalSettings = document.getElementById('modal-settings');

  // Hardcoded Initial Fallback Telemetry Data
  const fallbackTelemetry = {
    systemStatus: 'NORMAL',
    mode: 'HARDWARE_PPI',
    channels: [
      { id: 'CH1', name: 'Pasteurizer_Heating', label: 'Pasteurizer Heating Zone', unit: '°C', value: 75.0, status: 'NORMAL', lolo: 60, lo: 68, hi: 88, hihi: 93, target: 75 },
      { id: 'CH2', name: 'Pasteurizer_Holding', label: 'Pasteurizer Holding Tube', unit: '°C', value: 72.5, status: 'NORMAL', lolo: 65, lo: 70, hi: 80, hihi: 85, target: 72.5 },
      { id: 'CH3', name: 'Pre_Chiller_Outlet', label: 'Pre-Chiller Milk Outlet', unit: '°C', value: 8.0, status: 'NORMAL', lolo: 3, lo: 5, hi: 18, hihi: 24, target: 8 },
      { id: 'CH4', name: 'IBT_Chilled_Water', label: 'Ice Bank Tank Water', unit: '°C', value: 2.0, status: 'NORMAL', lolo: 0, lo: 1, hi: 5, hihi: 8, target: 2 },
      { id: 'CH5', name: 'Raw_Milk_Silo_01', label: 'Raw Milk Storage Silo 1', unit: '°C', value: 3.5, status: 'NORMAL', lolo: 1, lo: 2, hi: 6, hihi: 8.5, target: 3.5 },
      { id: 'CH6', name: 'Processed_Silo_02', label: 'Processed Milk Silo 2', unit: '°C', value: 3.5, status: 'NORMAL', lolo: 1, lo: 2, hi: 6, hihi: 8.5, target: 3.5 },
      { id: 'CH7', name: 'Cold_Storage_Room', label: 'Finished Product Cold Room', unit: '°C', value: 4.0, status: 'NORMAL', lolo: 0, lo: 2, hi: 6, hihi: 8, target: 4 },
      { id: 'CH8', name: 'CIP_Rinse_Line', label: 'CIP Clean-In-Place Rinse', unit: '°C', value: 70.0, status: 'NORMAL', lolo: 25, lo: 50, hi: 82, hihi: 90, target: 70 }
    ]
  };

  // Helper Function: Convert Image URL to Base64 for PDF Export
  function loadImageAsBase64(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // Render Instant Initial Telemetry Grid
  latestTelemetryData = fallbackTelemetry;
  renderTelemetry(fallbackTelemetry, false);

  // Splash Loading Progress
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 25;
    if (splashProgressBar) splashProgressBar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(progressInterval);
      setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('fade-out');
      }, 250);
    }
  }, 80);

  // Requirement 2: Views Dropdown Menu Handler & Dropdown Settings Button
  if (btnViewsMenu) {
    btnViewsMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      viewsDropdownMenu.classList.toggle('show');
    });
  }

  document.addEventListener('click', () => {
    if (viewsDropdownMenu) viewsDropdownMenu.classList.remove('show');
  });

  document.querySelectorAll('.dropdown-item:not(#dropdown-btn-settings)').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.view-pane').forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetTab = item.getAttribute('data-tab');
      document.getElementById(targetTab).classList.add('active');

      const viewText = item.textContent.trim();
      if (currentViewLabel) currentViewLabel.textContent = viewText.replace(/^[^\w]+/, '');

      if (viewsDropdownMenu) viewsDropdownMenu.classList.remove('show');

      if (targetTab === 'tab-history') {
        fetchHistoricalLogs();
      } else if (targetTab === 'tab-trends') {
        fetchHistoricalTrends(currentRangeHours);
      } else if (targetTab === 'tab-diagnostics') {
        fetchDiagnostics();
      }
    });
  });

  // Requirement 2: Settings Trigger from Dropdown Menu
  if (dropdownBtnSettings) {
    dropdownBtnSettings.addEventListener('click', () => {
      if (viewsDropdownMenu) viewsDropdownMenu.classList.remove('show');
      if (isAuthenticated) {
        openSettingsModal();
      } else {
        if (modalAuth) modalAuth.classList.add('active');
      }
    });
  }

  // Light/Dark Theme Switcher
  const savedTheme = localStorage.getItem('heatwatch_theme') || 'theme-dark';
  applyTheme(savedTheme);

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const newTheme = document.body.classList.contains('theme-dark') ? 'theme-light' : 'theme-dark';
      applyTheme(newTheme);
    });
  }

  function applyTheme(theme) {
    document.body.className = theme;
    localStorage.setItem('heatwatch_theme', theme);

    if (theme === 'theme-light') {
      if (iconThemeSun) iconThemeSun.style.display = 'none';
      if (iconThemeMoon) iconThemeMoon.style.display = 'inline-block';
    } else {
      if (iconThemeSun) iconThemeSun.style.display = 'inline-block';
      if (iconThemeMoon) iconThemeMoon.style.display = 'none';
    }
  }

  // Audio Mute Toggle
  if (btnMuteAlarm) {
    btnMuteAlarm.addEventListener('click', async () => {
      isAudioMuted = !isAudioMuted;
      if (isAudioMuted) {
        if (iconAudioOn) iconAudioOn.style.display = 'none';
        if (iconAudioOff) iconAudioOff.style.display = 'inline-block';
        if (elAlarmAudio) elAlarmAudio.pause();
      } else {
        if (iconAudioOn) iconAudioOn.style.display = 'inline-block';
        if (iconAudioOff) iconAudioOff.style.display = 'none';
      }

      try {
        await fetch('/api/relay/mute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 300 })
        });
      } catch (err) {}
    });
  }

  // Render Telemetry Grid Cards
  function renderTelemetry(data, isMuted) {
    if (!data || !elSensorGrid) return;

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

    if (data.systemStatus === 'CRITICAL' && !isMuted && !isAudioMuted && elAlarmAudio) {
      elAlarmAudio.play().catch(() => {});
    } else if (elAlarmAudio) {
      elAlarmAudio.pause();
    }
  }

  async function fetchImmediateLiveTelemetry() {
    try {
      const resp = await fetch('/api/telemetry/live');
      const json = await resp.json();
      if (json && json.data) {
        latestTelemetryData = json.data;
        renderTelemetry(json.data, json.muted);
      }
    } catch (err) {}
  }

  function initWebSocket() {
    try {
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
        } catch (err) {}
      };
      ws.onclose = () => setTimeout(initWebSocket, 3000);
    } catch (e) {}
  }

  // Telemetry Logs Query
  async function fetchHistoricalLogs() {
    const hoursSelect = document.getElementById('history-hours-select');
    const rtdSelect = document.getElementById('history-rtd-select');
    const hours = hoursSelect ? hoursSelect.value : '24';
    const rtdFilter = rtdSelect ? rtdSelect.value : 'ALL';

    try {
      const resp = await fetch(`/api/history?hours=${hours}`);
      const result = await resp.json();
      rawHistoryData = result.data || [];
      renderHistoryTable(result.sensors, rawHistoryData, rtdFilter);
    } catch (err) {}
  }

  function renderHistoryTable(sensors, data, rtdFilter) {
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
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

  const btnQueryLogs = document.getElementById('btn-query-logs');
  if (btnQueryLogs) btnQueryLogs.addEventListener('click', fetchHistoricalLogs);

  // CSV Export
  const btnExportCsvHistory = document.getElementById('btn-export-csv-history');
  if (btnExportCsvHistory) {
    btnExportCsvHistory.addEventListener('click', () => {
      const rtdSelect = document.getElementById('history-rtd-select');
      const rtdFilter = rtdSelect ? rtdSelect.value : 'ALL';
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
  }

  // REQUIREMENT 1: OPTIMIZED NO-OVERLAP DUAL-LOGO PDF EXPORT FOR TELEMETRY LOGS
  const btnExportPdfHistory = document.getElementById('btn-export-pdf-history');
  if (btnExportPdfHistory) {
    btnExportPdfHistory.addEventListener('click', async () => {
      const rtdSelect = document.getElementById('history-rtd-select');
      const rtdFilter = rtdSelect ? rtdSelect.value : 'ALL';
      if (!rawHistoryData.length) return alert('No historical data available to export.');

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      // Load Both Logos
      const elanaduImg = await loadImageAsBase64('assets/elanadu_logo.png');
      const gooseImg = await loadImageAsBase64('assets/goose_banner.png');

      // Precise Portrait Positioning (No Overlap)
      if (elanaduImg) doc.addImage(elanaduImg, 'PNG', 12, 6, 28, 18);
      if (gooseImg) doc.addImage(gooseImg, 'PNG', 152, 8, 44, 14);

      doc.setFontSize(14);
      doc.setTextColor(0, 71, 171);
      doc.text('Elanadu Milk Products — Telemetry Audit Log', 45, 18);

      doc.setFontSize(8.5);
      doc.setTextColor(110);
      doc.text(`HeatWatch 4 Telemetry Console | Filter: ${rtdFilter} | Date: ${new Date().toLocaleString()}`, 45, 24);

      doc.setDrawColor(200);
      doc.line(12, 28, 198, 28);

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
        startY: 32,
        head: [['Timestamp', 'RTD', 'Process Description', 'Temperature', 'Target', 'Status']],
        body: tableRows,
        headStyles: { fillColor: [0, 71, 171] },
        styles: { fontSize: 8 }
      });

      doc.save(`Elanadu_HeatWatch_Audit_Report_${rtdFilter}_${Date.now()}.pdf`);
    });
  }

  // Realtime Trends Chart
  const CHANNEL_COLORS = ['#0066cc', '#ffb800', '#00e676', '#ff1744', '#ab47bc', '#26c6da', '#ff7043', '#78909c'];

  function initChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
    const trendsRtdSelect = document.getElementById('trends-rtd-select');
    const rtdFilter = trendsRtdSelect ? trendsRtdSelect.value : 'ALL';
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

      if (trendChart) {
        trendChart.data.labels = labels;
        trendChart.data.datasets = datasets;
        trendChart.update();
      }
    } catch (err) {}
  }

  const trendsRtdSelect = document.getElementById('trends-rtd-select');
  if (trendsRtdSelect) trendsRtdSelect.addEventListener('change', () => fetchHistoricalTrends(currentRangeHours));

  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRangeHours = parseInt(btn.getAttribute('data-hours'), 10);
      fetchHistoricalTrends(currentRangeHours);
    });
  });

  // Export Trends CSV
  const btnExportCsvTrends = document.getElementById('btn-export-csv-trends');
  if (btnExportCsvTrends) {
    btnExportCsvTrends.addEventListener('click', () => {
      if (!trendChart) return;
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
  }

  // REQUIREMENT 1: OPTIMIZED NO-OVERLAP DUAL-LOGO PDF EXPORT FOR TRENDS GRAPH
  const btnExportPdfTrends = document.getElementById('btn-export-pdf-trends');
  if (btnExportPdfTrends) {
    btnExportPdfTrends.addEventListener('click', async () => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('landscape');

      const elanaduImg = await loadImageAsBase64('assets/elanadu_logo.png');
      const gooseImg = await loadImageAsBase64('assets/goose_banner.png');

      // Precise Landscape Positioning (No Overlap)
      if (elanaduImg) doc.addImage(elanaduImg, 'PNG', 12, 6, 32, 22);
      if (gooseImg) doc.addImage(gooseImg, 'PNG', 225, 8, 56, 18);

      doc.setFontSize(16);
      doc.setTextColor(0, 71, 171);
      doc.text('Elanadu Milk Products — Realtime Thermal Trends Graph', 50, 20);

      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(`HeatWatch 4 Telemetry Console | Range: Last ${currentRangeHours} Hours | Date: ${new Date().toLocaleString()}`, 50, 26);

      doc.setDrawColor(200);
      doc.line(12, 32, 285, 32);

      const canvas = document.getElementById('trendChart');
      if (canvas) {
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 12, 36, 272, 150);
      }

      doc.save(`Elanadu_HeatWatch_Trends_Graph_${currentRangeHours}h_${Date.now()}.pdf`);
    });
  }

  // System Diagnostics
  async function fetchDiagnostics() {
    try {
      const resp = await fetch('/api/system');
      const diag = await resp.json();

      const elCpuLoad = document.getElementById('diag-cpu-load');
      const elCpuTemp = document.getElementById('diag-cpu-temp');
      const elRamUsage = document.getElementById('diag-ram-usage');
      const elDiskUsage = document.getElementById('diag-disk-usage');
      const elUptime = document.getElementById('diag-uptime');

      if (elCpuLoad) elCpuLoad.textContent = `${diag.cpuLoad}%`;
      if (elCpuTemp) elCpuTemp.textContent = `${diag.cpuTemp} °C`;
      if (elRamUsage) elRamUsage.textContent = `${diag.ramUsed}MB / ${diag.ramTotal}MB`;
      if (elDiskUsage) elDiskUsage.textContent = `${diag.diskUsedGb}Gi (${diag.diskUsagePercent}%)`;

      if (elUptime) {
        const hours = Math.floor(diag.uptimeSeconds / 3600);
        const mins = Math.floor((diag.uptimeSeconds % 3600) / 60);
        elUptime.textContent = `${hours}h ${mins}m`;
      }
    } catch (err) {}
  }

  // REQUIREMENT 3: MULTI-TAB EXPANDED SETTINGS CONTROL PANEL
  document.querySelectorAll('.set-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.set-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));

      tabBtn.classList.add('active');
      const targetPane = tabBtn.getAttribute('data-stab');
      const paneEl = document.getElementById(targetPane);
      if (paneEl) paneEl.classList.add('active');
    });
  });

  const btnSubmitAuth = document.getElementById('btn-submit-auth');
  if (btnSubmitAuth) {
    btnSubmitAuth.addEventListener('click', async () => {
      const passwordInput = document.getElementById('auth-password');
      const password = passwordInput ? passwordInput.value : '';
      try {
        const resp = await fetch('/api/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        if (resp.ok) {
          isAuthenticated = true;
          if (modalAuth) modalAuth.classList.remove('active');
          const authError = document.getElementById('auth-error-msg');
          if (authError) authError.style.display = 'none';
          openSettingsModal();
        } else {
          const authError = document.getElementById('auth-error-msg');
          if (authError) authError.style.display = 'block';
        }
      } catch (err) {}
    });
  }

  async function openSettingsModal() {
    if (modalSettings) modalSettings.classList.add('active');
    try {
      const resp = await fetch('/api/config');
      activeConfig = await resp.json();
      populateSettingsForm(activeConfig);
    } catch (err) {}
  }

  function populateSettingsForm(cfg) {
    // Populate RTD Table
    const sensors = cfg.sensors || [];
    renderSettingsTable(sensors);

    // Populate Hardware Form
    const poller = cfg.poller || {};
    if (document.getElementById('cfg-rtd-ip')) document.getElementById('cfg-rtd-ip').value = poller.rtdIp || '192.168.1.2';
    if (document.getElementById('cfg-rtd-port')) document.getElementById('cfg-rtd-port').value = poller.rtdPort || 80;
    if (document.getElementById('cfg-poll-interval')) document.getElementById('cfg-poll-interval').value = cfg.server ? cfg.server.pollIntervalMs : 2000;
    if (document.getElementById('cfg-timeout')) document.getElementById('cfg-timeout').value = poller.timeoutMs || 1500;
    if (document.getElementById('cfg-mock-mode')) document.getElementById('cfg-mock-mode').value = poller.mockMode !== undefined ? String(poller.mockMode) : 'true';

    // Populate Relay Form
    const relay = cfg.relay || {};
    const gpio = relay.gpioPins || {};
    if (document.getElementById('cfg-mute-duration')) document.getElementById('cfg-mute-duration').value = relay.muteDurationSec || 300;
    if (document.getElementById('cfg-gpio-hooter')) document.getElementById('cfg-gpio-hooter').value = gpio.hooter || 18;
    if (document.getElementById('cfg-gpio-warning')) document.getElementById('cfg-gpio-warning').value = gpio.warning || 23;
    if (document.getElementById('cfg-gpio-critical')) document.getElementById('cfg-gpio-critical').value = gpio.critical || 24;

    // Populate InfluxDB Form
    const influx = cfg.influx || {};
    if (document.getElementById('cfg-influx-url')) document.getElementById('cfg-influx-url').value = influx.url || 'http://localhost:8086';
    if (document.getElementById('cfg-influx-org')) document.getElementById('cfg-influx-org').value = influx.org || 'elanadu_heatwatch';
    if (document.getElementById('cfg-influx-bucket')) document.getElementById('cfg-influx-bucket').value = influx.bucket || 'temperature_telemetry';

    // Populate Security Form
    const user = cfg.user || {};
    if (document.getElementById('cfg-user-name')) document.getElementById('cfg-user-name').value = user.username || 'admin';
  }

  function renderSettingsTable(sensors) {
    const tbody = document.getElementById('settings-sensors-table');
    if (!tbody) return;
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

  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      if (!activeConfig) activeConfig = {};

      // Collect Sensors Table Data
      const inputs = document.querySelectorAll('#settings-sensors-table input');
      inputs.forEach(input => {
        const cid = input.getAttribute('data-id');
        const field = input.getAttribute('data-field');
        const sensor = activeConfig.sensors.find(s => s.id === cid);
        if (sensor) {
          sensor[field] = field === 'label' ? input.value : parseFloat(input.value);
        }
      });

      // Collect Hardware Data
      activeConfig.poller = activeConfig.poller || {};
      activeConfig.poller.rtdIp = document.getElementById('cfg-rtd-ip').value;
      activeConfig.poller.rtdPort = parseInt(document.getElementById('cfg-rtd-port').value, 10);
      activeConfig.poller.timeoutMs = parseInt(document.getElementById('cfg-timeout').value, 10);
      activeConfig.poller.mockMode = document.getElementById('cfg-mock-mode').value === 'true';

      activeConfig.server = activeConfig.server || {};
      activeConfig.server.pollIntervalMs = parseInt(document.getElementById('cfg-poll-interval').value, 10);

      // Collect Relay Data
      activeConfig.relay = activeConfig.relay || { gpioPins: {} };
      activeConfig.relay.muteDurationSec = parseInt(document.getElementById('cfg-mute-duration').value, 10);
      activeConfig.relay.gpioPins.hooter = parseInt(document.getElementById('cfg-gpio-hooter').value, 10);
      activeConfig.relay.gpioPins.warning = parseInt(document.getElementById('cfg-gpio-warning').value, 10);
      activeConfig.relay.gpioPins.critical = parseInt(document.getElementById('cfg-gpio-critical').value, 10);

      // Collect InfluxDB Data
      activeConfig.influx = activeConfig.influx || {};
      activeConfig.influx.url = document.getElementById('cfg-influx-url').value;
      activeConfig.influx.org = document.getElementById('cfg-influx-org').value;
      activeConfig.influx.bucket = document.getElementById('cfg-influx-bucket').value;

      // Collect Security Data
      activeConfig.user = activeConfig.user || {};
      activeConfig.user.username = document.getElementById('cfg-user-name').value;
      const newPass = document.getElementById('cfg-user-pass').value;
      if (newPass && newPass.trim().length > 0) {
        activeConfig.user.password = newPass.trim();
      }

      try {
        const resp = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activeConfig)
        });
        if (resp.ok) {
          alert('Configuration saved successfully!');
          if (modalSettings) modalSettings.classList.remove('active');
        }
      } catch (err) {
        console.error('Save settings error:', err);
      }
    });
  }

  // Close Modals
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
  });

  fetchImmediateLiveTelemetry();
  fetchHistoricalLogs();
  fetchHistoricalTrends(24);
  fetchDiagnostics();
  initWebSocket();
});

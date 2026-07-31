/**
 * app.js - Lógica principal Client-Side
 * Procesa 100% en la memoria RAM del navegador. Cero peticiones a servidores.
 */

'use strict';

const STATE = {
  file: null,
  workbook: null,
  preview: null,
  validation: null,
  stats: null,
  result: null,
  activeTab: null,
};

const SHEET_ORDER = [
  '1 - Control',
  '2 - ID gestantes',
  '3 - Atenciones',
  '4 - Seguimientos',
  '5 - Urgencias',
];

const SHEET_LABELS = {
  '1 - Control': '1 · Control',
  '2 - ID gestantes': '2 · Gestantes',
  '3 - Atenciones': '3 · Atenciones',
  '4 - Seguimientos': '4 · Seguimientos',
  '5 - Urgencias': '5 · Urgencias',
};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

document.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initStepActions();
  loadHistory();
});

function initUpload() {
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const btnBrowse = $('btn-browse');

  dropZone.addEventListener('click', e => {
    if (e.target !== btnBrowse) fileInput.click();
  });
  btnBrowse.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith('.xlsx')) {
      setFile(f);
    } else {
      showToast('Solo se aceptan archivos .xlsx', 'error');
    }
  });

  $('btn-clear').addEventListener('click', clearFile);
  $('btn-upload').addEventListener('click', processFileInMemory);
}

function setFile(file) {
  STATE.file = file;
  $('fi-name').textContent = file.name;
  $('fi-size').textContent = formatBytes(file.size);
  $('file-info-bar').style.display = 'flex';
  $('drop-zone').style.display = 'none';
  $('btn-upload').disabled = false;
}

function clearFile() {
  STATE.file = null;
  STATE.workbook = null;
  $('file-info-bar').style.display = 'none';
  $('drop-zone').style.display = 'block';
  $('btn-upload').disabled = true;
  $('file-input').value = '';
}

function processFileInMemory() {
  if (!STATE.file) return;
  showLoading('Leyendo y validando el archivo en tu navegador...');

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      STATE.workbook = wb;

      // Extract raw preview for tables
      const preview = {};
      SHEET_ORDER.forEach(name => {
        if (wb.SheetNames.includes(name)) {
          const sheet = wb.Sheets[name];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
          preview[name] = raw || [];
        } else {
          preview[name] = [];
        }
      });

      STATE.preview = preview;
      STATE.validation = validateWorkbook(wb);

      function countRows(sheetName, expectedFirstCol) {
        const rows = preview[sheetName] || [];
        if (rows.length < 2) return 0;
        return rows.slice(1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== '') && parseInt(r[0], 10) === expectedFirstCol).length;
      }

      STATE.stats = {
        gestantes: countRows('2 - ID gestantes', 2),
        atenciones: countRows('3 - Atenciones', 3),
        seguimientos: countRows('4 - Seguimientos', 4),
        urgencias: countRows('5 - Urgencias', 5),
      };

      hideLoading();
      renderPreviewSection();
      showSection('preview');
      setStep(2);

      if (STATE.validation.summary.totalErrors > 0) {
        showToast(`Se encontraron ${STATE.validation.summary.totalErrors} error(es) en los datos`, 'warning');
      } else {
        showToast('Archivo leído y validado localmente con éxito', 'success');
      }
    } catch (err) {
      hideLoading();
      showToast('Error al leer el archivo Excel: ' + err.message, 'error');
      console.error(err);
    }
  };
  reader.onerror = function () {
    hideLoading();
    showToast('Error al cargar el archivo en el navegador', 'error');
  };
  reader.readAsArrayBuffer(STATE.file);
}

function renderPreviewSection() {
  const val = STATE.validation;
  const stats = STATE.stats;

  const badge = $('val-badge');
  badge.className = 'validation-summary-badge';
  if (val.summary.totalErrors > 0) {
    badge.classList.add('vsb-error');
    badge.innerHTML = `⚠ ${val.summary.totalErrors} error(es)`;
  } else if (val.summary.totalWarnings > 0) {
    badge.classList.add('vsb-warning');
    badge.innerHTML = `⚡ ${val.summary.totalWarnings} advertencia(s)`;
  } else {
    badge.classList.add('vsb-ok');
    badge.innerHTML = `✔ Sin errores`;
  }

  const statsRow = $('stats-row');
  statsRow.innerHTML = '';
  const statsDef = [
    { label: 'Gestantes', val: stats.gestantes, cls: 'primary' },
    { label: 'Atenciones', val: stats.atenciones, cls: 'blue' },
    { label: 'Seguimientos', val: stats.seguimientos, cls: 'purple' },
    { label: 'Urgencias', val: stats.urgencias, cls: 'warn' },
  ];
  statsDef.forEach(s => {
    const card = el('div', `stat-card ${s.cls}`);
    card.innerHTML = `<div class="stat-value">${s.val}</div><div class="stat-label">${s.label}</div>`;
    statsRow.appendChild(card);
  });

  const panel = $('val-panel');
  if (val.summary.totalErrors === 0 && val.summary.totalWarnings === 0) {
    panel.innerHTML = '<span style="color:var(--primary)">✔</span> Todos los datos pasaron la validación local. Podés generar el archivo.';
  } else {
    panel.innerHTML =
      `<span style="color:var(--error)">✖ ${val.summary.totalErrors} error(es)</span> &nbsp;|&nbsp; ` +
      `<span style="color:var(--warning)">⚡ ${val.summary.totalWarnings} advertencia(s)</span> &nbsp;— ` +
      `Revisá el detalle abajo. Podés generar el archivo plano de todas formas.`;
  }

  const pills = $('sheet-pills');
  pills.innerHTML = '';
  SHEET_ORDER.forEach(name => {
    const status = (val.sheetStatus || {})[name] || 'missing';
    const pill = el('div', `sheet-pill ${status}`);
    pill.innerHTML = `<span class="pill-dot ${status}"></span>${SHEET_LABELS[name]}`;
    pills.appendChild(pill);
  });

  const tabsBar = $('tabs-bar');
  tabsBar.innerHTML = '';
  SHEET_ORDER.forEach(name => {
    const status = (val.sheetStatus || {})[name] || '';
    const btn = el('button', `tab-btn tab-${status}`, SHEET_LABELS[name]);
    btn.dataset.sheet = name;
    btn.addEventListener('click', () => switchTab(name));
    tabsBar.appendChild(btn);
  });

  const issDetails = $('issues-details');
  const allIssues = [...(val.errors || []), ...(val.warnings || [])];
  if (allIssues.length > 0) {
    issDetails.style.display = '';
    const sum = $('issues-summary');
    const errCount = val.summary.totalErrors;
    const warnCount = val.summary.totalWarnings;
    sum.innerHTML =
      (errCount ? `<span style="color:var(--error)">✖ ${errCount} error(es)</span>` : '') +
      (warnCount ? `&nbsp;<span style="color:var(--warning)">⚡ ${warnCount} advertencia(s)</span>` : '') +
      `&nbsp;<span style="color:var(--text-muted);font-weight:400">— Ver detalle</span>`;

    const list = $('issues-list');
    list.innerHTML = '';
    allIssues.forEach(issue => {
      const item = el('div', `issue-item ${issue.severity}`);
      const icon = issue.severity === 'error' ? '✖' : '⚡';
      const loc = [issue.sheet, issue.row ? `Fila ${issue.row}` : '', issue.col].filter(Boolean).join(' · ');
      item.innerHTML =
        `<span class="issue-icon">${icon}</span>` +
        `<div class="issue-body"><div>${escHtml(issue.message)}</div><div class="issue-loc">${escHtml(loc)}</div></div>`;
      list.appendChild(item);
    });
  } else {
    issDetails.style.display = 'none';
  }

  switchTab(SHEET_ORDER[0]);
}

function switchTab(sheetName) {
  STATE.activeTab = sheetName;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sheet === sheetName);
  });

  const rows = (STATE.preview || {})[sheetName] || [];
  const wrapper = $('table-wrapper');

  if (rows.length === 0) {
    wrapper.innerHTML = '<p class="no-data">Esta hoja no existe o no tiene datos en el archivo.</p>';
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter(r => r && r.some(v => v !== null && v !== undefined && String(v).trim() !== ''));

  if (dataRows.length === 0) {
    wrapper.innerHTML = '<p class="no-data">La hoja existe pero no contiene filas de datos.</p>';
    return;
  }

  const table = el('table', 'preview-table');
  const thead = el('thead');
  const hRow = el('tr');
  hRow.appendChild(el('th', '', '#'));
  headers.forEach((h, i) => {
    if (h !== null && h !== undefined) {
      hRow.appendChild(el('th', '', escHtml(String(h))));
    } else if (i < 3) {
      hRow.appendChild(el('th', '', `Col ${i + 1}`));
    }
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  dataRows.slice(0, 150).forEach((row, ri) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'cell-null', String(ri + 1)));
    headers.forEach((h, ci) => {
      if (h !== null && h !== undefined || ci < 3) {
        const v = row[ci];
        if (v === null || v === undefined || v === '') {
          tr.appendChild(el('td', '', '<span class="cell-null">—</span>'));
        } else {
          const td = el('td', '', '');
          td.title = String(v);
          td.textContent = String(v);
          tr.appendChild(td);
        }
      }
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrapper.innerHTML = '';
  wrapper.appendChild(table);
}

function initStepActions() {
  $('btn-back-upload').addEventListener('click', () => {
    showSection('upload');
    setStep(1);
  });

  $('btn-generate').addEventListener('click', generateSigiresInMemory);
  $('btn-new').addEventListener('click', resetAll);
}

function generateSigiresInMemory() {
  if (!STATE.workbook) return;
  showLoading('Generando archivo SIGIRES en tu navegador...');

  setTimeout(() => {
    try {
      const res = convertWorkbookToSigires(STATE.workbook);
      STATE.result = res;
      hideLoading();
      renderDownloadSection(res);
      showSection('download');
      setStep(3);

      saveLocalHistory({
        filename: res.filename,
        ipsCode: res.stats.ipsCode,
        endDateStr: res.stats.endDateStr,
        totalDetail: res.stats.totalDetail,
        generatedAt: new Date().toISOString()
      });

      showToast('Archivo plano generado exitosamente', 'success');
    } catch (err) {
      hideLoading();
      showToast('Error al generar el archivo: ' + err.message, 'error');
      console.error(err);
    }
  }, 100);
}

function renderDownloadSection(res) {
  $('result-box').textContent = res.filename;

  // Blob download 100% in browser
  const blob = new Blob([res.content], { type: 'text/plain;charset=iso-8859-1' });
  const downloadUrl = URL.createObjectURL(blob);

  const btnDl = $('btn-download');
  btnDl.href = downloadUrl;
  btnDl.download = res.filename;

  const s = res.stats || {};
  $('result-stats').innerHTML = `
    <div class="result-stat"><span>📋</span> Total detalle: <strong>${s.totalDetail}</strong> registros</div>
    <div class="result-stat"><span>🏥</span> Código IPS: <strong>${s.ipsCode}</strong></div>
    <div class="result-stat"><span>📅</span> Fecha corte: <strong>${formatDateStr(s.endDateStr)}</strong></div>
  `;
}

function resetAll() {
  STATE.file = null;
  STATE.workbook = null;
  STATE.preview = null;
  STATE.validation = null;
  STATE.result = null;
  clearFile();
  showSection('upload');
  setStep(1);
}

// History using localStorage (Privacy-preserving)
function saveLocalHistory(item) {
  try {
    let history = JSON.parse(localStorage.getItem('sigires_history') || '[]');
    history.unshift(item);
    if (history.length > 30) history = history.slice(0, 30);
    localStorage.setItem('sigires_history', JSON.stringify(history));
    loadHistory();
  } catch (e) {
    console.error('Error al guardar en localStorage', e);
  }
}

function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('sigires_history') || '[]');
    renderHistory(history);
  } catch (e) {
    console.error('Error al cargar historial', e);
  }
}

function renderHistory(items) {
  const body = $('history-body');
  if (!items || items.length === 0) {
    body.innerHTML = '<div class="empty-state"><p>Sin historial local aún en este navegador.</p></div>';
    return;
  }

  const table = el('table', 'history-table');
  table.innerHTML = `
    <thead><tr>
      <th>Archivo</th>
      <th>Código IPS</th>
      <th>Registros</th>
      <th>Generado</th>
    </tr></thead>
  `;

  const tbody = el('tbody');
  items.forEach(item => {
    const tr = el('tr');
    const dStr = item.generatedAt ? new Date(item.generatedAt).toLocaleString('es-CO') : '—';
    tr.innerHTML = `
      <td><div class="history-filename">${escHtml(item.filename)}</div></td>
      <td style="color:var(--text-sub)">${escHtml(item.ipsCode || '—')}</td>
      <td style="color:var(--text-sub)">${item.totalDetail ?? '—'}</td>
      <td class="history-date">${dStr}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  body.innerHTML = '';
  body.appendChild(table);
}

// UI Helpers
function showSection(name) {
  const map = { upload: 'sec-upload', preview: 'sec-preview', download: 'sec-download' };
  ['sec-upload', 'sec-preview', 'sec-download'].forEach(id => {
    const sec = $(id);
    if (!sec) return;
    if (id === map[name]) {
      sec.style.display = '';
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      sec.style.display = 'none';
    }
  });
}

function setStep(n) {
  for (let i = 1; i <= 3; i++) {
    const s = $(`step-${i}`);
    if (!s) continue;
    s.classList.remove('active', 'done');
    if (i < n) s.classList.add('done');
    if (i === n) s.classList.add('active');
  }
}

function showLoading(msg = 'Procesando…') {
  $('loading-text').textContent = msg;
  $('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  $('loading-overlay').style.display = 'none';
}

function showToast(msg, type = 'info', duration = 4000) {
  const container = $('toast-container');
  const icons = { success: '✔', error: '✖', warning: '⚡', info: 'ℹ' };

  const toast = el('div', `toast ${type}`);
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDateStr(dateStr) {
  if (!dateStr || dateStr.length < 8) return dateStr || '—';
  return `${dateStr.slice(0, 2)}/${dateStr.slice(2, 4)}/${dateStr.slice(4, 8)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

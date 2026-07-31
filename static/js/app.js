/* ═══════════════════════════════════════════════
   Gestantes SIGIRES — app.js
   Lógica del frontend completa
═══════════════════════════════════════════════ */

'use strict';

// ── Estado global ──────────────────────────────
const STATE = {
  file:       null,
  sessionId:  null,
  preview:    null,
  validation: null,
  stats:      null,
  activeTab:  null,
};

// ── Constantes ────────────────────────────────
const SHEET_ORDER = [
  '1 - Control',
  '2 - ID gestantes',
  '3 - Atenciones',
  '4 - Seguimientos',
  '5 - Urgencias',
];

const SHEET_LABELS = {
  '1 - Control':        '1 · Control',
  '2 - ID gestantes':   '2 · Gestantes',
  '3 - Atenciones':     '3 · Atenciones',
  '4 - Seguimientos':   '4 · Seguimientos',
  '5 - Urgencias':      '5 · Urgencias',
};

// ── DOM Helpers ───────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initStepActions();
  loadHistory();
});

// ═══════════════════════════════════════════════
//  UPLOAD SECTION
// ═══════════════════════════════════════════════
function initUpload() {
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const btnBrowse = $('btn-browse');

  // Click to browse
  dropZone.addEventListener('click', e => {
    if (e.target !== btnBrowse) fileInput.click();
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });
  btnBrowse.addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  // File selection
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  // Drag & drop
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

  // Clear file
  $('btn-clear').addEventListener('click', clearFile);

  // Upload
  $('btn-upload').addEventListener('click', doUpload);
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
  $('file-info-bar').style.display = 'none';
  $('drop-zone').style.display = 'block';
  $('btn-upload').disabled = true;
  $('file-input').value = '';
}

async function doUpload() {
  if (!STATE.file) return;
  showLoading('Cargando y validando el archivo…');

  const form = new FormData();
  form.append('file', STATE.file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    hideLoading();

    if (!data.success) {
      showToast(data.error || 'Error al cargar el archivo', 'error');
      return;
    }

    STATE.sessionId  = data.session_id;
    STATE.preview    = data.preview;
    STATE.validation = data.validation;
    STATE.stats      = data.stats;

    renderPreviewSection();
    showSection('preview');
    setStep(2);

    if (data.validation.summary.total_errors > 0) {
      showToast(`Se encontraron ${data.validation.summary.total_errors} error(es) en los datos`, 'warning');
    } else {
      showToast('Archivo cargado y validado correctamente', 'success');
    }
  } catch (err) {
    hideLoading();
    showToast('Error de conexión al servidor', 'error');
    console.error(err);
  }
}

// ═══════════════════════════════════════════════
//  PREVIEW SECTION
// ═══════════════════════════════════════════════
function renderPreviewSection() {
  const val = STATE.validation;
  const stats = STATE.stats;

  // ── Validation badge ──
  const badge = $('val-badge');
  badge.className = 'validation-summary-badge';
  if (val.summary.total_errors > 0) {
    badge.classList.add('vsb-error');
    badge.innerHTML = `⚠ ${val.summary.total_errors} error(es)`;
  } else if (val.summary.total_warnings > 0) {
    badge.classList.add('vsb-warning');
    badge.innerHTML = `⚡ ${val.summary.total_warnings} advertencia(s)`;
  } else {
    badge.classList.add('vsb-ok');
    badge.innerHTML = `✔ Sin errores`;
  }

  // ── Stats cards ──
  const statsRow = $('stats-row');
  statsRow.innerHTML = '';
  const statsDef = [
    { label: 'Gestantes',    val: stats.gestantes,    cls: 'primary' },
    { label: 'Atenciones',   val: stats.atenciones,   cls: 'blue'    },
    { label: 'Seguimientos', val: stats.seguimientos, cls: 'purple'  },
    { label: 'Urgencias',    val: stats.urgencias,    cls: 'warn'    },
  ];
  statsDef.forEach(s => {
    const card = el('div', `stat-card ${s.cls}`);
    card.innerHTML = `<div class="stat-value">${s.val}</div><div class="stat-label">${s.label}</div>`;
    statsRow.appendChild(card);
  });

  // ── Validation panel ──
  const panel = $('val-panel');
  if (val.summary.total_errors === 0 && val.summary.total_warnings === 0) {
    panel.innerHTML = '<span style="color:var(--primary)">✔</span> Todos los datos pasaron la validación. Puedes generar el archivo.';
  } else {
    panel.innerHTML =
      `<span style="color:var(--error)">✖ ${val.summary.total_errors} error(es)</span> &nbsp;|&nbsp; ` +
      `<span style="color:var(--warning)">⚡ ${val.summary.total_warnings} advertencia(s)</span> &nbsp;— ` +
      `Revisa el detalle abajo. Puedes generar el archivo aunque haya advertencias.`;
  }

  // ── Sheet pills ──
  const pills = $('sheet-pills');
  pills.innerHTML = '';
  SHEET_ORDER.forEach(name => {
    const status = (val.sheet_status || {})[name] || 'missing';
    const pill = el('div', `sheet-pill ${status}`);
    pill.innerHTML = `<span class="pill-dot ${status}"></span>${SHEET_LABELS[name]}`;
    pills.appendChild(pill);
  });

  // ── Tabs ──
  const tabsBar = $('tabs-bar');
  tabsBar.innerHTML = '';
  SHEET_ORDER.forEach((name, i) => {
    const status = (val.sheet_status || {})[name] || '';
    const btn = el('button', `tab-btn tab-${status}`, SHEET_LABELS[name]);
    btn.setAttribute('role', 'tab');
    btn.dataset.sheet = name;
    btn.addEventListener('click', () => switchTab(name));
    tabsBar.appendChild(btn);
  });

  // ── Issues detail ──
  const issDetails = $('issues-details');
  const allIssues = [...(val.errors || []), ...(val.warnings || [])];
  if (allIssues.length > 0) {
    issDetails.style.display = '';
    const sum = $('issues-summary');
    const errCount  = val.summary.total_errors;
    const warnCount = val.summary.total_warnings;
    sum.innerHTML =
      (errCount  ? `<span style="color:var(--error)">✖ ${errCount} error(es)</span>` : '') +
      (warnCount ? `&nbsp;<span style="color:var(--warning)">⚡ ${warnCount} advertencia(s)</span>` : '') +
      `&nbsp;<span style="color:var(--text-muted);font-weight:400">— Ver detalle</span>`;

    const list = $('issues-list');
    list.innerHTML = '';
    allIssues.forEach(issue => {
      const item = el('div', `issue-item ${issue.severity}`);
      const icon = issue.severity === 'error' ? '✖' : '⚡';
      const loc  = [issue.sheet, issue.row ? `Fila ${issue.row}` : '', issue.col].filter(Boolean).join(' · ');
      item.innerHTML =
        `<span class="issue-icon">${icon}</span>` +
        `<div class="issue-body"><div>${escHtml(issue.message)}</div><div class="issue-loc">${escHtml(loc)}</div></div>`;
      list.appendChild(item);
    });
  } else {
    issDetails.style.display = 'none';
  }

  // Render first tab
  switchTab(SHEET_ORDER[0]);
}

function switchTab(sheetName) {
  STATE.activeTab = sheetName;

  // Update tab active state
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sheet === sheetName);
  });

  // Render table
  const rows = (STATE.preview || {})[sheetName] || [];
  const wrapper = $('table-wrapper');

  if (rows.length === 0) {
    wrapper.innerHTML = '<p class="no-data">Esta hoja no tiene datos o no existe en el archivo.</p>';
    return;
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter(r => r.some(v => v !== null));

  if (dataRows.length === 0) {
    wrapper.innerHTML = '<p class="no-data">La hoja existe pero no tiene filas de datos.</p>';
    return;
  }

  const table = el('table', 'preview-table');
  table.setAttribute('role', 'grid');

  // Header
  const thead = el('thead');
  const hRow = el('tr');
  hRow.appendChild(el('th', '', '#'));
  headers.forEach((h, i) => {
    if (h !== null || i < 3) {
      hRow.appendChild(el('th', '', h !== null ? escHtml(String(h)) : `Col ${i+1}`));
    }
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');
  dataRows.slice(0, 150).forEach((row, ri) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'cell-null', String(ri + 1)));
    headers.forEach((h, ci) => {
      if (h !== null || ci < 3) {
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
  if (dataRows.length > 150) {
    const note = el('p', 'no-data', `Mostrando 150 de ${dataRows.length} filas.`);
    note.style.borderTop = '1px solid var(--glass-border)';
    wrapper.appendChild(note);
  }
}

// ═══════════════════════════════════════════════
//  GENERATE
// ═══════════════════════════════════════════════
function initStepActions() {
  $('btn-back-upload').addEventListener('click', () => {
    showSection('upload');
    setStep(1);
  });

  $('btn-generate').addEventListener('click', doGenerate);
  $('btn-new').addEventListener('click', resetAll);
  $('btn-refresh-history').addEventListener('click', loadHistory);
}

async function doGenerate() {
  if (!STATE.sessionId) return;
  showLoading('Generando archivo SIGIRES…');

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: STATE.sessionId }),
    });
    const data = await res.json();
    hideLoading();

    if (!data.success) {
      showToast(data.error || 'Error al generar el archivo', 'error');
      return;
    }

    renderDownloadSection(data);
    showSection('download');
    setStep(3);
    loadHistory();
    showToast('Archivo generado exitosamente', 'success');
  } catch (err) {
    hideLoading();
    showToast('Error de conexión al servidor', 'error');
    console.error(err);
  }
}

function renderDownloadSection(data) {
  $('result-box').textContent = data.filename;
  $('btn-download').href = data.download_url;
  $('btn-download').download = data.filename;

  const s = data.stats || {};
  $('result-stats').innerHTML = `
    <div class="result-stat"><span>📋</span><strong>${s.total_detail || 0}</strong> registros de detalle</div>
    <div class="result-stat"><span>🏥</span> Código IPS: <strong>${s.ips_code || '—'}</strong></div>
    <div class="result-stat"><span>📅</span> Período hasta: <strong>${formatDate(s.end_date)}</strong></div>
  `;
}

function resetAll() {
  STATE.file = null;
  STATE.sessionId = null;
  STATE.preview = null;
  STATE.validation = null;
  STATE.stats = null;
  clearFile();
  showSection('upload');
  setStep(1);
}

// ═══════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (!data.success) return;
    renderHistory(data.history);
  } catch (err) {
    console.error('Error al cargar historial:', err);
  }
}

function renderHistory(items) {
  const body = $('history-body');
  if (!items || items.length === 0) {
    body.innerHTML = '<div class="empty-state"><p>Sin historial aún. Genera tu primer archivo.</p></div>';
    return;
  }

  const table = el('table', 'history-table');
  table.innerHTML = `
    <thead><tr>
      <th>Archivo</th>
      <th>Código IPS</th>
      <th>Registros</th>
      <th>Generado</th>
      <th>Estado</th>
      <th></th>
    </tr></thead>
  `;

  const tbody = el('tbody');
  items.forEach(item => {
    const tr = el('tr');
    const dateStr = item.generated_at ? new Date(item.generated_at).toLocaleString('es-CO') : '—';

    tr.innerHTML = `
      <td><div class="history-filename">${escHtml(item.filename)}</div></td>
      <td style="color:var(--text-sub)">${escHtml(item.ips_code || '—')}</td>
      <td style="color:var(--text-sub)">${item.total_records ?? '—'}</td>
      <td class="history-date">${dateStr}</td>
      <td>
        <span class="history-badge ${item.file_exists ? 'hb-ok' : 'hb-missing'}">
          ${item.file_exists ? '✔ Disponible' : '✕ Eliminado'}
        </span>
      </td>
      <td style="display:flex;gap:6px;align-items:center">
        ${item.file_exists
          ? `<a class="btn btn-ghost btn-sm" href="${escHtml(item.download_url)}" download title="Descargar">↓ Descargar</a>`
          : '<span style="font-size:0.75rem;color:var(--text-muted)">No disponible</span>'
        }
        <button class="btn btn-danger btn-sm" data-id="${item.id}" title="Eliminar del historial">✕</button>
      </td>
    `;

    tr.querySelector('[data-id]')?.addEventListener('click', async (e) => {
      const hid = e.currentTarget.dataset.id;
      await deleteHistoryItem(hid);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  body.innerHTML = '';
  body.appendChild(table);
}

async function deleteHistoryItem(id) {
  try {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadHistory();
      showToast('Entrada eliminada del historial', 'info');
    }
  } catch (err) {
    showToast('Error al eliminar', 'error');
  }
}

// ═══════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════
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
    if (i < n)  s.classList.add('done');
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
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

// ═══════════════════════════════════════════════
//  UTIL
// ═══════════════════════════════════════════════
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length < 8) return dateStr || '—';
  // ddmmyyyy → dd/mm/yyyy
  const d = dateStr.slice(0, 2);
  const m = dateStr.slice(2, 4);
  const y = dateStr.slice(4, 8);
  return `${d}/${m}/${y}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

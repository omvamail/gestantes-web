/**
 * validator.js - Validación 100% Client-Side
 * Replica exactamente la lógica de validator.py
 */

const VALID_DOC_TYPES = new Set([
  'CC', 'TI', 'CE', 'PA', 'RC', 'MS', 'AS', 'CD', 'SC', 'PE', 'PT', 'SI', 'NI'
]);

const VALID_ZONES = new Set(['U', 'R']);

const CUPS_HEMOGLOBINA = new Set([
  '903830', // Hemoglobina
  '903831', // Hemoglobina glucosilada (HbA1c)
  '903832', // Hemoglobina en orina
  '904388', // Hemoglobina fetal
  '903833'  // Hemoglobina glicosilada A1
]);

function isNumeric(val) {
  if (val === null || val === undefined || String(val).trim() === '') return false;
  return !isNaN(Number(val));
}

function parseDateObj(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const str = String(val).trim();
  const matchIso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (matchIso) {
    return new Date(Date.UTC(parseInt(matchIso[1], 10), parseInt(matchIso[2], 10) - 1, parseInt(matchIso[3], 10)));
  }
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return null;
    if (p3 < 100) p3 += 2000;

    let year = p3;
    let month, day;
    if (p1 > 12) {
      day = p1; month = p2;
    } else if (p2 > 12) {
      month = p1; day = p2;
    } else {
      month = p1; day = p2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }
  return null;
}

function validateWorkbook(wb) {
  const issues = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function createErr(sheet, row, col, message) {
    return { sheet, row, col, message, severity: 'error' };
  }
  function createWarn(sheet, row, col, message) {
    return { sheet, row, col, message, severity: 'warning' };
  }

  function getSheetRows(sheetName, expectedFirstCol) {
    if (!wb.SheetNames.includes(sheetName)) return [];
    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
    if (!rawRows || rawRows.length < 2) return [];
    return rawRows.slice(1).filter(r => {
      if (!r || !r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) return false;
      const firstVal = parseInt(r[0], 10);
      return !isNaN(firstVal) && firstVal === expectedFirstCol;
    });
  }

  const gestanteDocs = new Set();

  // 1 - Control
  const sheet1Name = '1 - Control';
  if (!wb.SheetNames.includes(sheet1Name)) {
    issues.push(createErr(sheet1Name, null, null, "La hoja '1 - Control' no existe en el archivo"));
  } else {
    const dr1 = getSheetRows(sheet1Name, 1);
    if (dr1.length === 0) {
      issues.push(createErr(sheet1Name, 2, 'General', "La hoja de Control no tiene datos válidos"));
    } else {
      const r = dr1[0];
      if (!r[3] || String(r[3]).trim() === '') {
        issues.push(createErr(sheet1Name, 2, 'Código EPS', "El código EPS está vacío"));
      }
      const fechaIni = parseDateObj(r[4]);
      if (!r[4] || !fechaIni) {
        issues.push(createErr(sheet1Name, 2, 'Fecha inicio', `Fecha de inicio inválida: '${r[4] || ''}'`));
      }
      const fechaFin = parseDateObj(r[5]);
      if (!r[5] || !fechaFin) {
        issues.push(createErr(sheet1Name, 2, 'Fecha fin', `Fecha de fin inválida: '${r[5] || ''}'`));
      } else if (fechaIni && fechaFin < fechaIni) {
        issues.push(createErr(sheet1Name, 2, 'Fechas', "La fecha de fin es anterior a la fecha de inicio"));
      }
    }
  }

  // 2 - ID gestantes
  const sheet2Name = '2 - ID gestantes';
  const dr2 = getSheetRows(sheet2Name, 2);
  if (dr2.length === 0) {
    issues.push(createWarn(sheet2Name, null, null, "No hay gestantes registradas en la hoja 2"));
  }
  dr2.forEach((r, i) => {
    const rn = i + 2;
    if (r[4]) {
      const z = String(r[4]).toUpperCase().trim();
      if (z && !VALID_ZONES.has(z)) {
        issues.push(createErr(sheet2Name, rn, 'Zona', `Zona inválida: '${r[4]}'. Debe ser U o R`));
      }
    }
    if (r[6]) {
      const dt = String(r[6]).toUpperCase().trim();
      if (dt && !VALID_DOC_TYPES.has(dt)) {
        issues.push(createErr(sheet2Name, rn, 'Tipo Documento', `Tipo de documento inválido: '${r[6]}'`));
      }
    }
    if (r[7]) {
      const doc = String(r[7]).trim();
      if (!doc) {
        issues.push(createErr(sheet2Name, rn, 'Número Documento', "Número de documento vacío"));
      } else {
        gestanteDocs.add(doc);
      }
    } else {
      issues.push(createErr(sheet2Name, rn, 'Número Documento', "Número de documento vacío"));
    }
    if (!r[8] || String(r[8]).trim() === '') {
      issues.push(createErr(sheet2Name, rn, 'Primer apellido', "El primer apellido está vacío"));
    }
    if (!r[10] || String(r[10]).trim() === '') {
      issues.push(createErr(sheet2Name, rn, 'Primer nombre', "El primer nombre está vacío"));
    }
    if (r[12]) {
      const fn = parseDateObj(r[12]);
      if (!fn) {
        issues.push(createErr(sheet2Name, rn, 'Fecha nacimiento', `Fecha de nacimiento inválida: '${r[12]}'`));
      } else if (fn > today) {
        issues.push(createErr(sheet2Name, rn, 'Fecha nacimiento', "La fecha de nacimiento es futura"));
      }
    }
    if (r[13] !== undefined && r[13] !== null && String(r[13]).trim() !== '') {
      if (!isNumeric(r[13])) {
        issues.push(createErr(sheet2Name, rn, 'Semanas', `Semanas de gestación no es un número: '${r[13]}'`));
      } else {
        const w = Number(r[13]);
        if (w < 1 || w > 45) {
          issues.push(createWarn(sheet2Name, rn, 'Semanas', `Semanas de gestación inusuales: ${w}`));
        }
      }
    }
  });

  // 3 - Atenciones
  const sheet3Name = '3 - Atenciones';
  const dr3 = getSheetRows(sheet3Name, 3);
  if (dr3.length === 0) {
    issues.push(createWarn(sheet3Name, null, null, "No hay atenciones registradas en la hoja 3"));
  }
  dr3.forEach((r, i) => {
    const rn = i + 2;
    if (r[2]) {
      const dt = String(r[2]).toUpperCase().trim();
      if (dt && !VALID_DOC_TYPES.has(dt)) {
        issues.push(createErr(sheet3Name, rn, 'Tipo Documento', `Tipo de documento inválido: '${r[2]}'`));
      }
    }
    if (r[3]) {
      const doc = String(r[3]).trim();
      if (doc && gestanteDocs.size > 0 && !gestanteDocs.has(doc)) {
        issues.push(createWarn(sheet3Name, rn, 'Número Documento', `La gestante con doc '${doc}' no está registrada en la hoja 2`));
      }
    }
    if (r[4]) {
      const fa = parseDateObj(r[4]);
      if (!fa) {
        issues.push(createErr(sheet3Name, rn, 'Fecha atención', `Fecha de atención inválida: '${r[4]}'`));
      }
    }
    const cups = r[5] ? String(r[5]).trim() : '';
    if (!cups) {
      issues.push(createErr(sheet3Name, rn, 'Código CUPS', "Código CUPS vacío"));
    }

    if (cups && CUPS_HEMOGLOBINA.has(cups)) {
      const hgbVal = r[21];
      if (hgbVal === undefined || hgbVal === null || String(hgbVal).trim() === '') {
        issues.push(createErr(sheet3Name, rn, 'Hemoglobina (campo 21)', `El CUPS ${cups} corresponde a hemoglobina pero el campo 21 (Resultado) está vacío`));
      } else if (!isNumeric(hgbVal)) {
        issues.push(createErr(sheet3Name, rn, 'Hemoglobina (campo 21)', `El resultado de hemoglobina no es un número válido: '${hgbVal}'`));
      } else {
        const num = Number(hgbVal);
        if (num <= 0) {
          issues.push(createErr(sheet3Name, rn, 'Hemoglobina (campo 21)', `El resultado de hemoglobina debe ser mayor que cero: ${hgbVal}`));
        } else if (num > 20) {
          issues.push(createWarn(sheet3Name, rn, 'Hemoglobina (campo 21)', `Valor de hemoglobina inusualmente alto: ${hgbVal} gr/dl`));
        } else if (num < 5) {
          issues.push(createWarn(sheet3Name, rn, 'Hemoglobina (campo 21)', `Valor de hemoglobina inusualmente bajo: ${hgbVal} gr/dl`));
        }
      }
    }
  });

  // 4 - Seguimientos
  const sheet4Name = '4 - Seguimientos';
  const dr4 = getSheetRows(sheet4Name, 4);
  dr4.forEach((r, i) => {
    const rn = i + 2;
    if (r[2]) {
      const dt = String(r[2]).toUpperCase().trim();
      if (dt && !VALID_DOC_TYPES.has(dt)) {
        issues.push(createErr(sheet4Name, rn, 'Tipo Documento', `Tipo de documento inválido: '${r[2]}'`));
      }
    }
    if (r[3]) {
      const doc = String(r[3]).trim();
      if (doc && gestanteDocs.size > 0 && !gestanteDocs.has(doc)) {
        issues.push(createWarn(sheet4Name, rn, 'Número Documento', `La gestante con doc '${doc}' no está registrada en la hoja 2`));
      }
    }
    if (r[5]) {
      const fs = parseDateObj(r[5]);
      if (!fs) {
        issues.push(createErr(sheet4Name, rn, 'Fecha seguimiento', `Fecha de seguimiento inválida: '${r[5]}'`));
      }
    }
  });

  // 5 - Urgencias
  const sheet5Name = '5 - Urgencias';
  const dr5 = getSheetRows(sheet5Name, 5);
  dr5.forEach((r, i) => {
    const rn = i + 2;
    if (r[2]) {
      const dt = String(r[2]).toUpperCase().trim();
      if (dt && !VALID_DOC_TYPES.has(dt)) {
        issues.push(createErr(sheet5Name, rn, 'Tipo Documento', `Tipo de documento inválido: '${r[2]}'`));
      }
    }
    if (r[3]) {
      const doc = String(r[3]).trim();
      if (doc && gestanteDocs.size > 0 && !gestanteDocs.has(doc)) {
        issues.push(createWarn(sheet5Name, rn, 'Número Documento', `La gestante con doc '${doc}' no está registrada en la hoja 2`));
      }
    }
  });

  const errors = issues.filter(x => x.severity === 'error');
  const warnings = issues.filter(x => x.severity === 'warning');

  const sheetStatus = {};
  [sheet1Name, sheet2Name, sheet3Name, sheet4Name, sheet5Name].forEach(s => {
    const hasData = wb.SheetNames.includes(s);
    const hasErr = errors.some(x => x.sheet === s);
    const hasWarn = warnings.some(x => x.sheet === s);
    if (!hasData) sheetStatus[s] = 'missing';
    else if (hasErr) sheetStatus[s] = 'error';
    else if (hasWarn) sheetStatus[s] = 'warning';
    else sheetStatus[s] = 'ok';
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sheetStatus,
    summary: {
      totalErrors: errors.length,
      totalWarnings: warnings.length
    }
  };
}

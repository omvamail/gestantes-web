/**
 * converter.js - Conversión 100% en el navegador (Client-Side)
 * Replica exactamente la lógica de convert.py / converter.py
 */

const SHEET_NAMES = [
  '1 - Control',
  '2 - ID gestantes',
  '3 - Atenciones',
  '4 - Seguimientos',
  '5 - Urgencias'
];

function cleanString(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).toUpperCase().trim();
  const replacements = {
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ü': 'U',
    'Ñ': 'N'
  };
  for (const [oldChar, newChar] of Object.entries(replacements)) {
    str = str.replaceAll(oldChar, newChar);
  }
  return str;
}

function cleanAddress(val) {
  if (val === null || val === undefined) return '';
  let str = cleanString(val);
  // Eliminar espacios inmediatamente después y antes de ;
  str = str.replace(/;\s+/g, ';');
  str = str.replace(/\s+;/g, ';');
  return str;
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Manejar strings con formato de fecha M/D/YY, D/M/YYYY, etc.
  const parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);
    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return cleanString(str);
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
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }
  return cleanString(str);
}

function formatCell(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return formatDate(val);
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : String(val);
  }
  const str = String(val).trim();
  // Si parece una fecha (ISO o slashes)
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(str) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(str)) {
    return formatDate(str);
  }
  return cleanString(val);
}

function parseEndDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const d = String(val.getUTCDate()).padStart(2, '0');
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const y = val.getUTCFullYear();
    return `${d}${m}${y}`;
  }
  const formattedDate = formatDate(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(formattedDate)) {
    const parts = formattedDate.split('-');
    return `${parts[2]}${parts[1]}${parts[0]}`;
  }
  return '';
}

function convertWorkbookToSigires(wb) {
  const detailLines = [];
  let ipsCode = null;
  let endDateStr = null;
  let controlVals = [];

  SHEET_NAMES.forEach((name, idx) => {
    if (!wb.SheetNames.includes(name)) return;

    const sheet = wb.Sheets[name];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, dateNF: 'yyyy-mm-dd' });
    if (!rawRows || rawRows.length === 0) return;

    const headers = rawRows[0];
    let numCols = 0;
    for (let h of headers) {
      if (h !== null && h !== undefined && String(h).trim() !== '') {
        numCols++;
      } else {
        break;
      }
    }

    const dataRows = rawRows.slice(1);
    dataRows.forEach(r => {
      if (!r || !r.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) {
        return;
      }
      const firstVal = parseInt(r[0], 10);
      if (isNaN(firstVal) || firstVal !== idx + 1) return;

      if (idx > 0) {
        let hasData = false;
        for (let c = 1; c < numCols; c++) {
          if (r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '') {
            hasData = true;
            break;
          }
        }
        if (!hasData) return;
      }

      const formattedRow = [];
      const ADDRESS_COL = 17;

      for (let c = 0; c < numCols; c++) {
        const cell = r[c];
        if (c === 0) {
          // Asegurar que el primer elemento no lleve espacios al inicio
          formattedRow.push(String(firstVal));
        } else if (cell === null || cell === undefined) {
          formattedRow.push('');
        } else if (idx === 1 && c === ADDRESS_COL) {
          formattedRow.push(cleanAddress(cell));
        } else {
          formattedRow.push(formatCell(cell));
        }
      }

      if (idx === 0) {
        controlVals = formattedRow;
        if (controlVals.length > 0) {
          controlVals[0] = controlVals[0].trim();
        }
        if (r.length > 5 && r[5]) {
          const parsedDate = parseEndDateStr(r[5]);
          if (parsedDate) endDateStr = parsedDate;
        }
      } else {
        if (idx === 1 && !ipsCode && formattedRow.length > 5) {
          ipsCode = formattedRow[5];
        }
        detailLines.push(formattedRow.join('|'));
      }
    });
  });

  if (controlVals.length > 0) {
    if (controlVals.length > 6) {
      controlVals[6] = String(detailLines.length);
    }
    var controlLine = controlVals.join('|');
  } else {
    var controlLine = '';
  }

  const outputLines = [];
  if (controlLine) outputLines.push(controlLine);
  outputLines.push(...detailLines);

  ipsCode = ipsCode || '688720075801';
  if (!endDateStr) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    endDateStr = `${d}${m}${y}`;
  }

  const filename = `GESTANTE_MSPS_${ipsCode}_${endDateStr}.txt`;
  const content = outputLines.join('\n') + '\n';

  return {
    filename,
    content,
    stats: {
      filename,
      ipsCode,
      endDateStr,
      totalDetail: detailLines.length
    }
  };
}

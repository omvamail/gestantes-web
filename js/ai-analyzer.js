/**
 * ai-analyzer.js - Análisis de anomalías con DeepSeek (100% Enmascarado en RAM)
 * Enmascara datos sensibles (nombres, apellidos, direcciones, cédulas, NITs)
 * antes de enviar la tabla estructurada a la API de DeepSeek.
 */

class DeepSeekAnalyzer {
  constructor() {
    this.docMap = new Map();
    this.nameMap = new Map();
    this.dirMap = new Map();
    this.ipsMap = new Map();
  }

  /**
   * Enmascara un valor de forma consistente (mismo valor original -> mismo token enmascarado)
   */
  maskValue(map, originalVal, prefix) {
    if (originalVal === null || originalVal === undefined || String(originalVal).trim() === '') {
      return originalVal;
    }
    const key = String(originalVal).trim();
    if (!map.has(key)) {
      const id = String(map.size + 1).padStart(3, '0');
      map.set(key, `${prefix}_${id}`);
    }
    return map.get(key);
  }

  /**
   * Genera una copia completamente enmascarada del preview de las 5 hojas
   */
  maskPreviewData(preview) {
    this.docMap.clear();
    this.nameMap.clear();
    this.dirMap.clear();
    this.ipsMap.clear();

    const masked = {};

    for (const [sheetName, rows] of Object.entries(preview)) {
      if (!rows || rows.length === 0) {
        masked[sheetName] = [];
        continue;
      }

      const headers = rows[0];
      const maskedRows = [headers];

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        if (!row || !row.some(c => c !== null && c !== undefined && String(c).trim() !== '')) {
          continue;
        }

        // 1. Normalizar todas las celdas primero (fechas YYYY-MM-DD, mayúsculas, etc.)
        const newRow = row.map((c, cIdx) => {
          if (sheetName === '2 - ID gestantes' && cIdx === 17) {
            return cleanAddress(c);
          }
          return formatCell(c);
        });

        // 2. Enmascarar campos sensibles sobre la fila ya normalizada
        if (sheetName === '1 - Control') {
          // Col 2: NIT (índice 2)
          if (newRow[2]) newRow[2] = this.maskValue(this.ipsMap, newRow[2], 'NIT');
          // Col 3: Código de la entidad reportadora (índice 3)
          if (newRow[3]) newRow[3] = this.maskValue(this.ipsMap, newRow[3], 'EPS');
        } else if (sheetName === '2 - ID gestantes') {
          // Col 3: Municipio DIVIPOLA (índice 3)
          if (newRow[3]) newRow[3] = this.maskValue(this.ipsMap, newRow[3], 'MUNICIPIO');
          // Col 5: Código IPS (índice 5)
          if (newRow[5]) newRow[5] = this.maskValue(this.ipsMap, newRow[5], 'IPS');
          // Col 7: Número documento (índice 7)
          if (newRow[7]) newRow[7] = this.maskValue(this.docMap, newRow[7], 'DOC');
          // Col 8: Primer apellido (índice 8)
          if (newRow[8]) newRow[8] = this.maskValue(this.nameMap, newRow[8], 'APELLIDO1');
          // Col 9: Segundo apellido (índice 9)
          if (newRow[9]) newRow[9] = this.maskValue(this.nameMap, newRow[9], 'APELLIDO2');
          // Col 10: Primer nombre (índice 10)
          if (newRow[10]) newRow[10] = this.maskValue(this.nameMap, newRow[10], 'NOMBRE1');
          // Col 11: Segundo nombre (índice 11)
          if (newRow[11]) newRow[11] = this.maskValue(this.nameMap, newRow[11], 'NOMBRE2');
          // Col 17: Dirección (índice 17)
          if (newRow[17]) newRow[17] = this.maskValue(this.dirMap, newRow[17], 'DIRECCION');
        } else if (sheetName === '3 - Atenciones' || sheetName === '4 - Seguimientos' || sheetName === '5 - Urgencias') {
          // Col 3: Número documento (índice 3)
          if (newRow[3]) newRow[3] = this.maskValue(this.docMap, newRow[3], 'DOC');
        }

        maskedRows.push(newRow);
      }

      masked[sheetName] = maskedRows;
    }

    return masked;
  }

  /**
   * Consulta a la API de DeepSeek pasando los datos normalizados y enmascarados + errores locales
   */
  async analyzeWithDeepSeek(apiKey, preview, validation) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Debes ingresar tu API Key de DeepSeek.');
    }

    const maskedData = this.maskPreviewData(preview);

    // Enmascarar las alertas locales ya detectadas para dar contexto completo a la IA
    const maskedLocalIssues = [];
    if (validation && (validation.errors || validation.warnings)) {
      const issues = [...(validation.errors || []), ...(validation.warnings || [])];
      issues.forEach(iss => {
        let msg = iss.message;
        this.docMap.forEach((maskedToken, realVal) => {
          msg = msg.replaceAll(realVal, maskedToken);
        });
        maskedLocalIssues.push({
          sheet: iss.sheet,
          row: iss.row,
          col: iss.col,
          alert: msg
        });
      });
    }

    const systemPrompt = `
Eres un auditor experto de la Cohorte de Gestantes según el ANEXO TÉCNICO OFICIAL DEL MINISTERIO DE SALUD Y PROTECCIÓN SOCIAL (MSPS / SIGIRES Colombia).

GUÍA Y MARCO NORMATIVO MSPS (INSUMO TÉCNICO):
1. ESTRUCTURA Y VINCULACIÓN:
   - Registro 1 (Control): Define la entidad reportadora, fechas inicio/fin del periodo y total de detalles.
   - Registro 2 (ID Gestantes): Caracterización e ingreso a la cohorte. Los registros 3, 4 y 5 se vinculan por Tipo + Número de Documento.
   - Registro 3 (Atenciones): Atenciones prenatales, parto y puerperio.
   - Registro 4 (Seguimientos): Casos de alto riesgo y morbilidad materna.
   - Registro 5 (Urgencias): Gestantes en internación u observación de urgencias.

2. REGLAS TEMPORALES Y CLÍNICAS NORMATIVAS:
   - Todas las fechas de atención/seguimiento/urgencias deben coincidir con el periodo reportado.
   - Las semanas de gestación, fecha de nacimiento de la madre y fecha probable de parto deben guardar estricta coherencia temporal.
   - Procedimientos o CUPS específicos exigen sus campos de resultado clínicos obligatorios.

INSTRUCCIONES DE AUDITORÍA:
- Analizarás el reporte que YA FUE NORMALIZADO Y VALIDADO LOCALMENTE con reglas básicas.
- Tu objetivo es detectar INCONSISTENCIAS O ANOMALÍAS IMPREVISTAS según la norma MSPS que no hayan sido capturadas por el validador local.
- NO repitas alertas que ya fueron capturadas localmente (ver lista adjunta).
- Si NO detectas anomalías adicionales, responde ÚNICAMENTE:
"✔ Sin anomalías ni inconsistencias lógicas adicionales detectadas según norma MSPS."
- Si detectas anomalías imprevistas nuevas, sé directo (máximo 1 línea por hallazgo):
• [Hoja · Fila/Doc]: Descripción de la inconsistencia según norma MSPS.
`.trim();

    const userMessage = `
DATOS DEL REPORTE 100% NORMALIZADOS Y ENMASCARADOS:
${JSON.stringify(maskedData, null, 2)}

ALERTAS YA CAPTURADAS POR LA VALIDACIÓN LOCAL (NO REPETIR):
${JSON.stringify(maskedLocalIssues, null, 2)}
`.trim();

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `Error ${response.status} de DeepSeek API`;
      try {
        const jsonErr = JSON.parse(errText);
        if (jsonErr.error && jsonErr.error.message) msg = jsonErr.error.message;
      } catch (e) {}
      throw new Error(msg);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
      throw new Error('No se recibió respuesta válida de DeepSeek.');
    }

    let resultText = data.choices[0].message.content || '✔ Sin anomalías detectadas en el reporte.';

    // Des-enmascarar tokens en la respuesta visual si aplican
    this.docMap.forEach((maskedToken, realVal) => {
      resultText = resultText.replaceAll(maskedToken, `${maskedToken} (Doc: ${realVal})`);
    });

    return resultText;
  }
}

const deepSeekAnalyzer = new DeepSeekAnalyzer();
if (typeof window !== 'undefined') window.deepSeekAnalyzer = deepSeekAnalyzer;
if (typeof globalThis !== 'undefined') globalThis.deepSeekAnalyzer = deepSeekAnalyzer;

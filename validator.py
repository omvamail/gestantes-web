"""
validator.py
Reglas de validación para los datos del Excel de gestantes SIGIRES.
"""
import datetime

VALID_DOC_TYPES = {
    'CC', 'TI', 'CE', 'PA', 'RC', 'MS', 'AS', 'CD', 'SC', 'PE', 'PT', 'SI', 'NI'
}
VALID_ZONES = {'U', 'R'}

# CUPS que exigen registro de hemoglobina en el campo 21 (Hoja 3)
# Fuente: Anexo Técnico MSPS pág. 9 —
# "Siempre que se registre un CUPS de hemoglobina debe estar registrado este dato."
CUPS_HEMOGLOBINA = {
    '903830',  # Hemoglobina
    '903831',  # Hemoglobina glucosilada (HbA1c)
    '903832',  # Hemoglobina en orina
    '904388',  # Hemoglobina fetal
    '903833',  # Hemoglobina glicosilada A1
}


def _parse_date(val):
    if val is None:
        return None
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _is_numeric(val):
    if val is None:
        return False
    if isinstance(val, (int, float)):
        return True
    try:
        float(str(val).strip())
        return True
    except ValueError:
        return False


def _err(sheet, row, col, msg):
    return {"sheet": sheet, "row": row, "col": col, "message": msg, "severity": "error"}


def _warn(sheet, row, col, msg):
    return {"sheet": sheet, "row": row, "col": col, "message": msg, "severity": "warning"}


def validate_excel(preview: dict) -> dict:
    """
    Valida los datos del Excel.
    preview: dict devuelto por read_excel_preview()
    Retorna: { valid, errors, warnings, sheet_status, summary }
    """
    issues = []   # mezcla de errores y advertencias
    today = datetime.date.today()

    def data_rows(sheet_key, expected_first_col):
        rows = preview.get(sheet_key, [])
        if not rows:
            return []
        return [
            r for r in rows[1:]
            if any(v is not None for v in r) and len(r) > 0 and r[0] == expected_first_col
        ]

    gestante_docs = set()

    # ──────────────────────────────────────────────────────────────
    # HOJA 1 - Control
    # ──────────────────────────────────────────────────────────────
    sheet = '1 - Control'
    s1 = preview.get(sheet, [])
    if not s1:
        issues.append(_err(sheet, None, None, "La hoja '1 - Control' no existe o está vacía"))
    else:
        dr = [r for r in s1[1:] if any(v is not None for v in r)]
        if not dr:
            issues.append(_err(sheet, 2, 'General', "La hoja de Control no tiene datos"))
        else:
            r = dr[0]
            # EPS code (col 3)
            if len(r) > 3 and (r[3] is None or str(r[3]).strip() == ""):
                issues.append(_err(sheet, 2, 'Código EPS', "El código EPS está vacío"))
            # Start date (col 4)
            fecha_ini = _parse_date(r[4]) if len(r) > 4 else None
            if len(r) > 4 and fecha_ini is None:
                issues.append(_err(sheet, 2, 'Fecha inicio', f"Fecha de inicio inválida: '{r[4]}'"))
            # End date (col 5)
            fecha_fin = _parse_date(r[5]) if len(r) > 5 else None
            if len(r) > 5 and fecha_fin is None:
                issues.append(_err(sheet, 2, 'Fecha fin', f"Fecha de fin inválida: '{r[5]}'"))
            elif fecha_ini and fecha_fin and fecha_fin < fecha_ini:
                issues.append(_err(sheet, 2, 'Fechas', "La fecha de fin es anterior a la de inicio"))

    # ──────────────────────────────────────────────────────────────
    # HOJA 2 - ID Gestantes
    # ──────────────────────────────────────────────────────────────
    sheet = '2 - ID gestantes'
    dr2 = data_rows(sheet, 2)
    if not dr2:
        issues.append(_warn(sheet, None, None, "No hay gestantes registradas en la hoja 2"))
    for i, r in enumerate(dr2):
        rn = i + 2
        # Zona (col 4)
        if len(r) > 4:
            zona = str(r[4]).upper().strip() if r[4] is not None else ""
            if zona and zona not in VALID_ZONES:
                issues.append(_err(sheet, rn, 'Zona', f"Zona inválida: '{r[4]}'. Debe ser U o R"))
        # Tipo doc (col 6)
        if len(r) > 6:
            dt = str(r[6]).upper().strip() if r[6] is not None else ""
            if dt and dt not in VALID_DOC_TYPES:
                issues.append(_err(sheet, rn, 'Tipo Documento', f"Tipo de documento inválido: '{r[6]}'"))
        # Número doc (col 7)
        if len(r) > 7:
            doc = str(r[7]).strip() if r[7] is not None else ""
            if not doc:
                issues.append(_err(sheet, rn, 'Número Documento', "Número de documento vacío"))
            else:
                gestante_docs.add(doc)
        # Primer apellido (col 8) y primer nombre (col 10) — obligatorios
        for col_idx, col_name in [(8, 'Primer apellido'), (10, 'Primer nombre')]:
            if len(r) > col_idx and (r[col_idx] is None or str(r[col_idx]).strip() == ""):
                issues.append(_err(sheet, rn, col_name, f"El campo '{col_name}' está vacío"))
        # Fecha nacimiento (col 12)
        if len(r) > 12 and r[12] is not None:
            fn = _parse_date(r[12])
            if fn is None:
                issues.append(_err(sheet, rn, 'Fecha nacimiento', f"Fecha de nacimiento inválida: '{r[12]}'"))
            elif fn > today:
                issues.append(_err(sheet, rn, 'Fecha nacimiento', "La fecha de nacimiento es futura"))
            elif (today - fn).days / 365.25 < 10:
                issues.append(_warn(sheet, rn, 'Fecha nacimiento', "Edad calculada menor a 10 años"))
        # Semanas gestación (col 13)
        if len(r) > 13 and r[13] is not None:
            if not _is_numeric(r[13]):
                issues.append(_err(sheet, rn, 'Semanas', f"Semanas de gestación no es número: '{r[13]}'"))
            else:
                wks = int(float(str(r[13])))
                if wks < 1 or wks > 45:
                    issues.append(_warn(sheet, rn, 'Semanas', f"Semanas de gestación inusuales: {wks}"))
        # FPP (col 16)
        if len(r) > 16 and r[16] is not None:
            fpp = _parse_date(r[16])
            if fpp is None:
                issues.append(_err(sheet, rn, 'FPP', f"Fecha probable de parto inválida: '{r[16]}'"))

    # ──────────────────────────────────────────────────────────────
    # HOJA 3 - Atenciones
    # ──────────────────────────────────────────────────────────────
    sheet = '3 - Atenciones'
    dr3 = data_rows(sheet, 3)
    if not dr3:
        issues.append(_warn(sheet, None, None, "No hay atenciones registradas en la hoja 3"))
    for i, r in enumerate(dr3):
        rn = i + 2
        # Tipo doc (col 2)
        if len(r) > 2:
            dt = str(r[2]).upper().strip() if r[2] is not None else ""
            if dt and dt not in VALID_DOC_TYPES:
                issues.append(_err(sheet, rn, 'Tipo Documento', f"Tipo de documento inválido: '{r[2]}'"))
        # Número doc (col 3) — validar contra hoja 2
        if len(r) > 3:
            doc = str(r[3]).strip() if r[3] is not None else ""
            if doc and gestante_docs and doc not in gestante_docs:
                issues.append(_warn(sheet, rn, 'Número Documento',
                    f"La gestante con doc '{doc}' no está en la hoja 2"))
        # Fecha atención (col 4)
        if len(r) > 4 and r[4] is not None:
            fa = _parse_date(r[4])
            if fa is None:
                issues.append(_err(sheet, rn, 'Fecha atención', f"Fecha de atención inválida: '{r[4]}'"))
        # CUPS (col 5)
        cups = str(r[5]).strip() if len(r) > 5 and r[5] is not None else ""
        if not cups:
            issues.append(_err(sheet, rn, 'Código CUPS', "Código CUPS vacío"))

        # Campo 21 - Resultado hemoglobina
        # Ligado al CUPS: si el CUPS es de hemoglobina → campo 21 obligatorio
        if cups in CUPS_HEMOGLOBINA:
            hgb_val = r[21] if len(r) > 21 else None
            if hgb_val is None or str(hgb_val).strip() == "":
                issues.append(_err(sheet, rn, 'Hemoglobina (campo 21)',
                    f"El CUPS {cups} corresponde a hemoglobina pero el campo 21 "
                    f"(Resultado de la hemoglobina) está vacío"))
            elif not _is_numeric(hgb_val):
                issues.append(_err(sheet, rn, 'Hemoglobina (campo 21)',
                    f"El resultado de hemoglobina no es un número válido: '{hgb_val}'"))
            else:
                try:
                    hgb_num = float(str(hgb_val))
                    if hgb_num <= 0:
                        issues.append(_err(sheet, rn, 'Hemoglobina (campo 21)',
                            f"El resultado de hemoglobina debe ser mayor que cero: {hgb_val}"))
                    elif hgb_num > 20:
                        issues.append(_warn(sheet, rn, 'Hemoglobina (campo 21)',
                            f"Valor de hemoglobina inusualmente alto: {hgb_val} gr/dl"))
                    elif hgb_num < 5:
                        issues.append(_warn(sheet, rn, 'Hemoglobina (campo 21)',
                            f"Valor de hemoglobina inusualmente bajo: {hgb_val} gr/dl"))
                except ValueError:
                    pass

    # ──────────────────────────────────────────────────────────────
    # HOJA 4 - Seguimientos
    # ──────────────────────────────────────────────────────────────
    sheet = '4 - Seguimientos'
    dr4 = data_rows(sheet, 4)
    for i, r in enumerate(dr4):
        rn = i + 2
        if len(r) > 2:
            dt = str(r[2]).upper().strip() if r[2] is not None else ""
            if dt and dt not in VALID_DOC_TYPES:
                issues.append(_err(sheet, rn, 'Tipo Documento', f"Tipo de documento inválido: '{r[2]}'"))
        if len(r) > 3:
            doc = str(r[3]).strip() if r[3] is not None else ""
            if doc and gestante_docs and doc not in gestante_docs:
                issues.append(_warn(sheet, rn, 'Número Documento',
                    f"La gestante con doc '{doc}' no está en la hoja 2"))
        if len(r) > 5 and r[5] is not None:
            fs = _parse_date(r[5])
            if fs is None:
                issues.append(_err(sheet, rn, 'Fecha seguimiento', f"Fecha inválida: '{r[5]}'"))

    # ──────────────────────────────────────────────────────────────
    # HOJA 5 - Urgencias
    # ──────────────────────────────────────────────────────────────
    sheet = '5 - Urgencias'
    dr5 = data_rows(sheet, 5)
    for i, r in enumerate(dr5):
        rn = i + 2
        if len(r) > 2:
            dt = str(r[2]).upper().strip() if r[2] is not None else ""
            if dt and dt not in VALID_DOC_TYPES:
                issues.append(_err(sheet, rn, 'Tipo Documento', f"Tipo de documento inválido: '{r[2]}'"))
        if len(r) > 3:
            doc = str(r[3]).strip() if r[3] is not None else ""
            if doc and gestante_docs and doc not in gestante_docs:
                issues.append(_warn(sheet, rn, 'Número Documento',
                    f"La gestante con doc '{doc}' no está en la hoja 2"))

    # ──────────────────────────────────────────────────────────────
    # Resumen por hoja
    # ──────────────────────────────────────────────────────────────
    errors   = [x for x in issues if x['severity'] == 'error']
    warnings = [x for x in issues if x['severity'] == 'warning']

    all_sheets = [
        '1 - Control', '2 - ID gestantes',
        '3 - Atenciones', '4 - Seguimientos', '5 - Urgencias'
    ]
    sheet_status = {}
    for s in all_sheets:
        has_err  = any(x['sheet'] == s for x in errors)
        has_warn = any(x['sheet'] == s for x in warnings)
        has_data = bool(preview.get(s))
        if not has_data:
            sheet_status[s] = 'missing'
        elif has_err:
            sheet_status[s] = 'error'
        elif has_warn:
            sheet_status[s] = 'warning'
        else:
            sheet_status[s] = 'ok'

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "sheet_status": sheet_status,
        "summary": {
            "total_errors": len(errors),
            "total_warnings": len(warnings),
        },
    }

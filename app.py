"""
app.py
Servidor Flask principal para la app web de gestantes SIGIRES.
"""
import os
import uuid
from flask import Flask, render_template, request, jsonify, send_file, abort

from converter import read_excel_preview, convert_to_sigires, SHEET_NAMES
from validator import validate_excel
from models import init_db, save_history, get_history, delete_history

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB

BASE_DIR      = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
GEN_FOLDER    = os.path.join(BASE_DIR, 'generated')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(GEN_FOLDER,    exist_ok=True)

init_db()


# ──────────────────────────────────────────────────────────────────
# Rutas HTML
# ──────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ──────────────────────────────────────────────────────────────────
# API – Subir y previsualizar
# ──────────────────────────────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
def api_upload():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No se envió ningún archivo"}), 400

    f = request.files['file']
    if not f.filename or not f.filename.lower().endswith('.xlsx'):
        return jsonify({"success": False, "error": "Solo se aceptan archivos .xlsx"}), 400

    session_id = str(uuid.uuid4())
    file_path  = os.path.join(UPLOAD_FOLDER, f"{session_id}.xlsx")
    f.save(file_path)

    try:
        preview    = read_excel_preview(file_path)
        validation = validate_excel(preview)

        def count_rows(key, first_col):
            rows = preview.get(key, [])
            return len([r for r in rows[1:] if any(v is not None for v in r) and r and r[0] == first_col])

        stats = {
            "gestantes":    count_rows('2 - ID gestantes', 2),
            "atenciones":   count_rows('3 - Atenciones',   3),
            "seguimientos": count_rows('4 - Seguimientos', 4),
            "urgencias":    count_rows('5 - Urgencias',    5),
        }

        return jsonify({
            "success":    True,
            "session_id": session_id,
            "preview":    preview,
            "validation": validation,
            "stats":      stats,
        })

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"success": False, "error": str(e)}), 500


# ──────────────────────────────────────────────────────────────────
# API – Generar archivo .txt
# ──────────────────────────────────────────────────────────────────

@app.route('/api/generate', methods=['POST'])
def api_generate():
    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id', '')
    if not session_id:
        return jsonify({"success": False, "error": "session_id requerido"}), 400

    file_path = os.path.join(UPLOAD_FOLDER, f"{session_id}.xlsx")
    if not os.path.exists(file_path):
        return jsonify({
            "success": False,
            "error": "Archivo no encontrado. Vuelva a cargar el Excel."
        }), 404

    try:
        result  = convert_to_sigires(file_path)
        out_path = os.path.join(GEN_FOLDER, result['filename'])

        with open(out_path, 'w', encoding='latin-1') as fh:
            fh.write(result['content'])

        history_id = save_history({
            "filename":      result['filename'],
            "ips_code":      result['stats']['ips_code'],
            "end_date":      result['stats']['end_date'],
            "total_records": result['stats']['total_detail'],
            "file_path":     out_path,
        })

        # Limpiar archivo temporal
        os.remove(file_path)

        return jsonify({
            "success":      True,
            "filename":     result['filename'],
            "download_url": f"/api/download/{result['filename']}",
            "history_id":   history_id,
            "stats":        result['stats'],
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ──────────────────────────────────────────────────────────────────
# API – Descargar archivo
# ──────────────────────────────────────────────────────────────────

@app.route('/api/download/<filename>')
def api_download(filename):
    filename = os.path.basename(filename)   # evitar path traversal
    path = os.path.join(GEN_FOLDER, filename)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=filename, mimetype='text/plain')


# ──────────────────────────────────────────────────────────────────
# API – Historial
# ──────────────────────────────────────────────────────────────────

@app.route('/api/history', methods=['GET'])
def api_history():
    return jsonify({"success": True, "history": get_history()})


@app.route('/api/history/<int:hid>', methods=['DELETE'])
def api_delete_history(hid):
    try:
        delete_history(hid)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ──────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("\n" + "="*55)
    print("  🤰  Gestantes SIGIRES - Servidor iniciado")
    print("  Abre tu navegador en: http://localhost:5000")
    print("="*55 + "\n")
    app.run(debug=False, host='0.0.0.0', port=5000)

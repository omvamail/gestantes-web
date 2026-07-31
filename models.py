"""
models.py
Historial de archivos generados usando SQLite (sin dependencias extra).
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'history.db')


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            filename      TEXT NOT NULL,
            ips_code      TEXT,
            end_date      TEXT,
            total_records INTEGER,
            file_path     TEXT,
            generated_at  TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()


def save_history(data: dict) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute('''
        INSERT INTO history (filename, ips_code, end_date, total_records, file_path, generated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (
        data.get('filename', ''),
        data.get('ips_code', ''),
        data.get('end_date', ''),
        data.get('total_records', 0),
        data.get('file_path', ''),
        datetime.now().isoformat(timespec='seconds'),
    ))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def get_history(limit: int = 50) -> list:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute('''
        SELECT id, filename, ips_code, end_date, total_records, generated_at, file_path
        FROM history
        ORDER BY generated_at DESC
        LIMIT ?
    ''', (limit,)).fetchall()
    conn.close()

    result = []
    for row in rows:
        item = dict(row)
        file_path = item.pop('file_path', '')
        item['file_exists'] = os.path.exists(file_path) if file_path else False
        item['download_url'] = f"/api/download/{item['filename']}"
        result.append(item)
    return result


def delete_history(history_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('DELETE FROM history WHERE id = ?', (history_id,))
    conn.commit()
    conn.close()

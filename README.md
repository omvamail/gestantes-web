# Gestantes SIGIRES - Aplicación Web

Aplicación web para la validación y conversión de reportes semanales de atención a gestantes desde archivos Excel (`.xlsx`) al formato de texto plano (`.txt`) requerido por el sistema **SIGIRES del Ministerio de Salud y Protección Social (MSPS) / Nueva EPS**.

## 🚀 Características

- 📤 **Carga sencilla:** Interfaz Drag & Drop para archivos Excel.
- 📊 **Vista previa interactiva:** Visualización de las 5 hojas del reporte (`Control`, `ID gestantes`, `Atenciones`, `Seguimientos`, `Urgencias`).
- ✅ **Validación automática:** Verificación de tipos de documento, formato de fechas, zonas territoriales y relación condicional entre exámenes CUPS (ej. hemoglobina) y sus resultados.
- 🧹 **Normalización de datos:** Limpieza automática de tildes, caracteres especiales y formato estandarizado de direcciones (separadores `;`).
- 📥 **Descarga inmediata:** Generación del plano `.txt` codificado en `latin-1`.
- 🕒 **Historial:** Registro local con SQLite de los archivos procesados.

## 🛠️ Tecnologías

- **Backend:** Python 3, Flask, openpyxl, SQLite.
- **Frontend:** HTML5, CSS3 (Vanilla / Glassmorphism), JavaScript (Vanilla ES6).

## 💻 Instalación y Uso Local

1. Clonar el repositorio:
   ```bash
   git clone <URL_DE_TU_REPOSITORIO>
   cd gestantes-web
   ```

2. Crear un entorno virtual e instalar dependencias:
   ```bash
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Iniciar la aplicación:
   - **En Windows:** Hacer doble clic en `iniciar.bat` o ejecutar:
     ```cmd
     python app.py
     ```
   - Abrir en el navegador: `http://localhost:5000`

## 🔒 Privacidad y Protección de Datos
Los datos sensibles de salud no son enviados a servicios o APIs de IA externos. El procesamiento se realiza localmente en el servidor.

/**
 * Formulario de justificación de inasistencias.
 * Envía los datos al webhook de n8n, que evalúa la solicitud con IA,
 * la registra en Google Sheets y notifica al estudiante por Telegram.
 */

// ==========================================
// Configuración
// ==========================================
// URL de producción: solo responde con el workflow ACTIVO en n8n.
// Para probar desde el editor de n8n ("Listen for test event") usa:
// http://localhost:5678/webhook-test/justificacion-inasistencia
const WEBHOOK_URL = 'http://localhost:5678/webhook/justificacion-inasistencia';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const TELEGRAM_ID_PATTERN = /^\d{5,15}$/;

// ==========================================
// Referencias del DOM
// ==========================================
const form = document.getElementById('inasistencia-form');
const submitButton = form.querySelector('.btn-submit');
const fileInput = form.querySelector('#adjunto');
const dateInput = form.querySelector('#fecha');
const statusBox = document.getElementById('form-status');

// No se puede justificar una falta en una fecha futura (fecha local, no UTC)
function todayLocalISO() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString().split('T')[0];
}
dateInput.max = todayLocalISO();

// ==========================================
// Utilidades de interfaz
// ==========================================
function showStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = `form-status form-status--${type}`;
    statusBox.hidden = false;
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'Enviando...' : 'Enviar formulario';
}

// ==========================================
// Validaciones
// ==========================================
/**
 * Devuelve un mensaje de error o null si los datos son válidos.
 * Complementa la validación nativa de HTML5 (required, type="email", pattern).
 */
function validate(data, file) {
    if (!TELEGRAM_ID_PATTERN.test(data.telegramId)) {
        return 'El ID de Telegram debe ser numérico (entre 5 y 15 dígitos).';
    }
    if (data.fecha > dateInput.max) {
        return 'La fecha de la inasistencia no puede ser futura.';
    }
    if (!file) {
        return 'Debe adjuntar un documento de respaldo.';
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        return 'Formato no permitido. Use JPG, PNG o PDF.';
    }
    if (file.size > MAX_FILE_BYTES) {
        return 'El archivo supera el límite permitido de 5MB. Reduzca su tamaño antes de enviarlo.';
    }
    return null;
}

// ==========================================
// Construcción del payload
// ==========================================
/**
 * Crea el FormData con los nombres exactos que espera el workflow de n8n
 * (el prompt de Gemini y las columnas de Google Sheets dependen de ellos).
 */
function buildPayload(data, file) {
    const payload = new FormData();
    payload.append('Nombre completo', data.nombre);
    payload.append('Motivo de inasistencia', data.motivo);
    payload.append('Descripción del motivo', data.descripcion);
    payload.append('estudiante_id', data.estudianteId);
    payload.append('telegram_id', data.telegramId);
    payload.append('correo', data.correo);
    payload.append('fecha', data.fecha);
    payload.append('adjunto', file);
    return payload;
}

// ==========================================
// Envío
// ==========================================
form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = {
        nombre: form.nombre.value.trim(),
        estudianteId: form.estudiante_id.value.trim(),
        telegramId: form.telegram_id.value.trim(),
        correo: form.correo.value.trim(),
        motivo: form.motivo.value,
        fecha: form.fecha.value,
        descripcion: form.descripcion.value.trim()
    };
    const file = fileInput.files[0];

    const error = validate(data, file);
    if (error) {
        showStatus(error, 'error');
        return;
    }

    setLoading(true);
    showStatus('Enviando su solicitud...', 'info');

    try {
        // No se define 'Content-Type': el navegador agrega el boundary de multipart
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            body: buildPayload(data, file)
        });

        if (!response.ok) {
            throw new Error(`n8n respondió con estado ${response.status} ${response.statusText}`);
        }

        showStatus('Formulario enviado correctamente. Recibirá el resultado por Telegram.', 'success');
        form.reset();
    } catch (err) {
        console.error('[Formulario n8n] Error al enviar la solicitud:', err);
        showStatus('No se pudo enviar la solicitud. Verifique su conexión e intente de nuevo.', 'error');
    } finally {
        setLoading(false);
    }
});

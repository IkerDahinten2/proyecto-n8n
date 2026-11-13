# Sistema Automatizado de Justificación de Inasistencias

![n8n](https://img.shields.io/badge/n8n-EA4B71?style=flat&logo=n8n&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=flat&logo=googlegemini&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=flat&logo=telegram&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=flat&logo=googlesheets&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

Automatización que **recibe solicitudes de justificación de inasistencia** de estudiantes, las evalúa con inteligencia artificial, las registra en Google Sheets y **notifica el resultado al estudiante por Telegram**. Solo los casos dudosos llegan a revisión humana.

![Flujo n8n](screenshot.png)

---

## Arquitectura

```
┌──────────────┐  POST multipart  ┌──────────────────────────── n8n ─────────────────────────────┐
│  Formulario  │ ───────────────► │ Webhook → Gemini → Normalizar → Enrutar por veredicto        │
│  web (HTML)  │                  │                                   │          │          │     │
└──────────────┘                  │                               Aprobado  Revisión  Rechazado  │
                                  │                                   ▼          ▼          ▼     │
                                  │              Google Sheets (una hoja, columna "estado")      │
                                  │                                   ▼          ▼          ▼     │
                                  │         Telegram al estudiante  (+ alerta al coordinador)    │
                                  └───────────────────────────────────────────────────────────────┘
```

| Capa | Rama | Contenido |
|------|------|-----------|
| Frontend | `frontend` | Formulario web (`index.html`, `style.css`, `app.js`) |
| Backend | `backend` | Workflow de n8n (`Proyecto_n8n.json`) y evidencia del flujo |

## Flujo principal

1. **Webhook Formulario** — recibe el formulario (`POST`) con nombre, motivo, descripción, ID de estudiante, ID de Telegram, correo, fecha y archivo adjunto.
2. **Evaluar con IA** (Basic LLM Chain + Google Gemini) — analiza el caso y el documento adjunto, y devuelve un JSON con:
   - `veredicto`: `Aprobado`, `Rechazado` o `Dudoso`
   - `nivel_confianza`: número de 0 a 100
   - `razon`: explicación breve
3. **Normalizar respuesta IA** (Code) — limpia la respuesta (bloques Markdown, texto extra), valida que el veredicto sea uno de los tres permitidos y limita la confianza a 0–100. Si la respuesta no se puede interpretar, devuelve un estado seguro (`Dudoso`, 0) que termina en revisión manual.
4. **Enrutar por veredicto** (Switch) — tres salidas mutuamente excluyentes:

   | Condición | Salida |
   |-----------|--------|
   | Confianza ≥ 80 y veredicto `Aprobado` | **Aprobado** |
   | Confianza ≥ 80 y veredicto `Rechazado` | **Rechazado** |
   | Cualquier otro caso (confianza < 80 o `Dudoso`) | **Revisión manual** |

5. **Registrar** (Google Sheets) — agrega una fila con los datos del estudiante, el `estado` (`Aprobado`, `En revisión` o `Rechazado`), la razón de la IA y la `fecha_registro`.
6. **Notificar** (Telegram) — envía el resultado al `telegram_id` del estudiante. En los casos de revisión manual, además se alerta al coordinador con el detalle del caso.

## Bot de consulta

Los estudiantes consultan el estado de su solicitud escribiéndole al bot de Telegram:

| Nodo | Función |
|------|---------|
| `Telegram Trigger` | Escucha los mensajes del bot |
| `Clasificar mensaje` | Distingue un saludo (`hola`, `/start`, `buenas…`) de un ID de estudiante (`EST-2026`, `123456`). Cualquier otro mensaje recibe las instrucciones |
| `Buscar solicitud` | Busca el registro por ID de estudiante |
| `¿Solicitud encontrada?` | Si existe, responde con el estado y las observaciones; si no, avisa que no hay registro |

Las respuestas siempre se envían al chat de quien escribió.

## Reporte semanal

Cada **viernes a las 17:00**, el flujo lee la hoja, resume las solicitudes registradas en los últimos 7 días agrupadas por estado y envía el reporte al coordinador por Telegram.

## Formulario web

- Envío con `fetch` y `FormData` (incluye el archivo).
- Validaciones: ID de Telegram numérico, tipo de archivo (JPG, PNG o PDF), tamaño máximo de 5 MB y fecha no futura.
- Mensajes de estado en pantalla accesibles (`aria-live`), en lugar de `alert()`.
- Bloqueo del botón durante el envío y conservación de los datos si el envío falla.

## Estructura del proyecto

```
proyecto-n8n/
├── index.html          # Formulario de justificación
├── style.css           # Estilos del formulario
├── app.js              # Validaciones y envío al webhook de n8n
├── Proyecto_n8n.json   # Workflow exportado de n8n
└── screenshot.png      # Evidencia del flujo
```

## Instalación y uso

### 1. Preparar Google Sheets

Crea una hoja con estas columnas en la primera fila:

```
nombre | estudiante_ID | telegram_ID | correo | motivo | fecha | descripcion | estado | observaciones | fecha_registro
```

### 2. Importar el workflow (backend)

1. Tener n8n instalado (n8n Cloud o Docker):
   ```bash
   docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
   ```
2. En n8n: **New Workflow → Import from File** y selecciona `Proyecto_n8n.json`.
3. Configura las credenciales:
   - **Google Sheets API** — selecciona tu hoja en los nodos *Registrar…*, *Buscar solicitud* y *Obtener solicitudes*.
   - **Telegram Bot Token** — generado con `@BotFather`.
   - **Google Gemini API Key** — desde Google AI Studio.
4. Cambia el chat del coordinador (`6878861034`) en los nodos **Alertar revisión manual (admin)** y **Enviar reporte (admin)** por el tuyo.
5. Activa el flujo.

### 3. Ejecutar el formulario (frontend)

```bash
git clone https://github.com/IkerDahinten2/proyecto-n8n.git
cd proyecto-n8n
npx serve .
```

El formulario envía los datos a la URL definida en `WEBHOOK_URL` (`app.js`):

| Uso | URL |
|-----|-----|
| Workflow activo (producción) | `http://localhost:5678/webhook/justificacion-inasistencia` |
| Prueba desde el editor de n8n | `http://localhost:5678/webhook-test/justificacion-inasistencia` |

> El estudiante debe escribirle `/start` al bot antes de enviar el formulario: Telegram no permite que un bot inicie una conversación. Su ID numérico se puede obtener con `@userinfobot`.

## Pruebas realizadas

- **Formulario**: probado en el navegador contra un webhook simulado. Valida el tipo de archivo, el tamaño, el ID de Telegram, que la fecha no sea futura y los errores de red; también se comprobó que se envían los campos que espera n8n.
- **Workflow**: 31 pruebas automatizadas que verifican:
  - que todas las referencias y conexiones apunten a nodos existentes;
  - la normalización de la respuesta de la IA;
  - que cada caso del Switch salga por una sola rama;
  - la clasificación de mensajes del bot;
  - el conteo del reporte semanal.
- **n8n real (v2.47)**: el workflow se importa sin errores, y los nodos de normalización y enrutamiento se ejecutaron con respuestas simuladas de la IA; cada caso salió por la rama esperada.

## Flujo de ramas

| Rama | Propósito |
|------|-----------|
| `main` | Versión estable |
| `dev` | Integración de frontend y backend |
| `frontend` | Formulario web |
| `backend` | Workflow de n8n |

## Autor

**Iker Dahinten** — [@IkerDahinten2](https://github.com/IkerDahinten2)

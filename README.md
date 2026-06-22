# Chat Agenda Bot — Bot de WhatsApp para agendar citas en cualquier negocio

Bot de WhatsApp Business (Meta Cloud API) reutilizable: cambia la información en `src/config/business.js` y sirve para una agencia de marketing, una barbería, un consultorio, un spa, etc. — la lógica no cambia.

1. Responde preguntas de clientes (ubicación, precios, horario, servicios) usando IA con la información de tu negocio.
2. Hace un mini cuestionario para agendar citas (servicio, nombre, fecha, hora).
3. Verifica disponibilidad en Google Calendar antes de confirmar y crea el evento.
4. Manda un recordatorio 1 hora antes de la cita pidiendo confirmación; si el cliente dice que no, cancela automáticamente.
5. Si el negocio cancela la cita (desde Google Calendar o con el comando `cancelar <id>` por WhatsApp), avisa al cliente automáticamente y lo invita a reagendar.

## 1. Requisitos previos

- Node.js 18+
- Una cuenta de **Meta Business** con WhatsApp Business API (Cloud API) configurada.
- Un proyecto de **Google Cloud** con la API de Google Calendar habilitada.
- Una API key de **Anthropic** (para las respuestas con IA).

## 2. Configurar WhatsApp Cloud API

1. Crea una app en [developers.facebook.com](https://developers.facebook.com/apps) tipo "Business".
2. Agrega el producto **WhatsApp**.
3. En "API Setup" obtén:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - Un token temporal (para pruebas) o genera un **token permanente** con un System User en Business Settings → `WHATSAPP_TOKEN`.
   - El `App Secret` de la app (Settings → Basic) → `WHATSAPP_APP_SECRET`.
4. Define un `WHATSAPP_VERIFY_TOKEN` (cualquier palabra secreta que tú elijas).
5. Despliega este proyecto (ver sección 5) para tener una URL pública, por ejemplo `https://tu-app.onrender.com`.
6. En el panel de WhatsApp → Configuration → Webhook, configura:
   - Callback URL: `https://tu-app.onrender.com/webhook`
   - Verify token: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete al campo `messages`.

## 3. Configurar Google Calendar

1. En Google Cloud Console crea un proyecto y habilita la **Google Calendar API**.
2. Crea una **cuenta de servicio** (Service Account) y descarga su archivo JSON de credenciales. Guárdalo como `google-service-account.json` en la raíz del proyecto (no se sube a git).
3. En Google Calendar, comparte el calendario del negocio con el correo de la cuenta de servicio (algo como `nombre@proyecto.iam.gserviceaccount.com`) dándole permiso de "Hacer cambios en eventos".
4. Copia el ID del calendario (Configuración del calendario → "Integrar calendario" → Calendar ID) → `GOOGLE_CALENDAR_ID`.

## 4. Configurar variables de entorno

Copia `.env.example` a `.env` y completa todos los valores:

```bash
cp .env.example .env
```

Edita también `src/config/business.js` con el nombre real, ubicación, servicios, precios y horario de tu negocio.

## 5. Instalar y correr

```bash
npm install
npm start
```

Para desarrollo local puedes usar [ngrok](https://ngrok.com/) para exponer tu servidor mientras pruebas el webhook:

```bash
ngrok http 3000
```

### Despliegue recomendado

Para producción, sube este repo a [Render](https://render.com/) o [Railway](https://railway.app/):

- Tipo de servicio: Web Service (Node).
- Comando de build: `npm install`
- Comando de start: `npm start`
- Configura las variables de entorno del `.env` en el panel del proveedor.
- Sube el archivo `google-service-account.json` como **Secret File** (Render lo soporta) o como variable de entorno codificada en base64 y decodifícala en el arranque si prefieres no subir el archivo.

## 6. Cómo cancelar una cita como negocio/admin

Tienes dos formas:

- **Desde Google Calendar**: borra el evento directamente. Un job revisa cada 5 minutos y, si detecta que el evento ya no existe, avisa al cliente por WhatsApp automáticamente y lo invita a reagendar.
- **Desde WhatsApp** (más inmediato): desde el número configurado en `ADMIN_WHATSAPP_NUMBER`, escribe `cancelar <id>` (el id de la cita se manda al admin cuando se agenda). Esto cancela el evento en Calendar y notifica al cliente al instante.

## 7. Flujo del cliente

1. El cliente escribe cualquier pregunta ("¿dónde están?", "¿cuánto cuesta X servicio?") → el bot responde usando la IA con la info de `business.js`.
2. El cliente escribe "agendar" → el bot pregunta servicio, nombre, fecha y muestra horarios disponibles según Google Calendar.
3. El cliente elige horario y confirma → se crea el evento en Calendar y se guarda la cita en SQLite (`data/negocio.sqlite`).
4. 1 hora antes de la cita, el bot pregunta si sigue en pie. Si el cliente dice "no", se cancela automáticamente.
5. Si el negocio cancela la cita, el cliente recibe un aviso automático y puede reagendar escribiendo "agendar".

## Cómo replicarlo para otro negocio

Este proyecto está pensado para reutilizarse sin tocar la lógica:

1. Copia el repo (o crea una nueva rama/instancia de despliegue).
2. Edita solo `src/config/business.js` con los datos del nuevo negocio (nombre, ubicación, horario, servicios y precios).
3. Crea credenciales nuevas de WhatsApp y Google Calendar para ese negocio (cada negocio necesita su propio número de WhatsApp Business y su propio calendario/cuenta de servicio).
4. Despliega una instancia independiente con su propio `.env`.

## Estructura del proyecto

```
src/
  config/business.js          # Información editable del negocio (lo único que cambia entre negocios)
  services/
    whatsapp.js                # Envío de mensajes (texto y botones)
    calendar.js                # Disponibilidad, crear/cancelar eventos
    ai.js                      # Respuestas con IA (Claude) usando info del negocio
    conversation.js            # Máquina de estados de la conversación
    db.js                      # SQLite: conversaciones y citas
  jobs/
    reminders.js               # Recordatorio 1h antes + cancelación si no confirma
    syncCancellations.js        # Detecta cancelaciones hechas por el negocio en Calendar
  routes/webhook.js            # Webhook de WhatsApp (Meta)
  index.js                     # Servidor Express
```

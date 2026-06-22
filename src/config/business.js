// Edita aquí la información del negocio. El bot usa estos datos tanto para
// respuestas directas (ubicación, horario) como contexto para la IA.
// Esta misma estructura sirve para cualquier tipo de negocio: solo cambia
// los valores (nombre, servicios, precios, horario, etc.) y el bot se
// adapta automáticamente, sin tocar el código.
module.exports = {
  nombre: "[NOMBRE DE LA AGENCIA]",
  ubicacion: "Calle Ejemplo #123, Colonia Centro, Ciudad (u oficina/online)",
  mapaUrl: "https://maps.app.goo.gl/ejemplo",
  horario: "Lunes a viernes de 9:00 am a 6:00 pm.",
  telefonoContacto: "+52 1 55 1234 5678",
  servicios: [
    { nombre: "Consultoría inicial / diagnóstico de marca", precio: 0 },
    { nombre: "Gestión de redes sociales (mensual)", precio: 6000 },
    { nombre: "Campañas de pauta digital (mensual)", precio: 8000 },
    { nombre: "Diseño de identidad de marca", precio: 5000 },
    { nombre: "Sitio web / landing page", precio: 10000 },
  ],
  formasPago: "Transferencia y tarjeta",
  politicaCancelacion:
    "Puedes cancelar o reagendar hasta 1 hora antes de tu cita sin costo.",
};

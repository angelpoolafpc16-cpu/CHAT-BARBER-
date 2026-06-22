// Edita aquí la información del negocio. El bot usa estos datos tanto para
// respuestas directas (ubicación, horario) como contexto para la IA.
module.exports = {
  nombre: "Barbería [NOMBRE]",
  ubicacion: "Calle Ejemplo #123, Colonia Centro, Ciudad",
  mapaUrl: "https://maps.app.goo.gl/ejemplo",
  horario: "Lunes a sábado de 9:00 am a 8:00 pm. Domingos cerrado.",
  telefonoContacto: "+52 1 55 1234 5678",
  servicios: [
    { nombre: "Corte de cabello", precio: 150 },
    { nombre: "Corte + barba", precio: 220 },
    { nombre: "Arreglo de barba", precio: 100 },
    { nombre: "Corte niño", precio: 120 },
    { nombre: "Tinte", precio: 300 },
  ],
  formasPago: "Efectivo y tarjeta",
  politicaCancelacion:
    "Puedes cancelar o reagendar hasta 1 hora antes de tu cita sin costo.",
};

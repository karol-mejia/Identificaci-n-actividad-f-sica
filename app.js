// Función principal que se ejecuta al seleccionar un paciente en el menú desplegable
function cargarPacienteSeleccionado(nombreArchivo) {
    if (!nombreArchivo) return;

    // Ruta donde se encuentran los JSON generados por Python
    const rutaJson = `json_convertidos/${nombreArchivo}`;

    fetch(rutaJson)
        .then(response => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar el archivo: ${nombreArchivo}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Datos del paciente cargados con éxito:", data);
            actualizarInterfaz(data);
        })
        .catch(error => {
            console.error("Error:", error);
            alert("Asegúrate de ejecutar tu proyecto desde un servidor local (como Live Server en VS Code) para que el navegador permita leer los archivos JSON.");
        });
}

// Función encargada de pintar los datos en el HTML
function actualizarInterfaz(data) {
    // 1. Actualizar tarjetas principales
    document.getElementById('txtId').textContent = data.id || "N/D";
    document.getElementById('txtGenero').textContent = data.gender || "N/D";
    document.getElementById('txtScore').textContent = (data.score || 0) + " pts";
    document.getElementById('txtBadge').textContent = data.badge || "Sin insignia";

    // 2. Actualizar mensaje de motivación
    document.getElementById('txtMensaje').textContent = data.motivationMessage || "Sin mensajes disponibles.";

    // 3. Generar la tabla de desglose de actividades
    const contenedorTabla = document.getElementById('tablaDesglose');
    
    if (!data.activityBreakdown || data.activityBreakdown.length === 0) {
        contenedorTabla.innerHTML = "<p>No hay desglose de actividades registrado para este paciente.</p>";
        return;
    }

    let htmlTabla = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
                <tr style="background-color: #f2f2f2; text-align: left;">
                    <th style="padding: 10px; border: 1px solid #ddd;">Actividad</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Registros</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Tiempo Est.</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Porcentaje</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Puntos</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.activityBreakdown.forEach(act => {
        htmlTabla += `
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;">${act.activity}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${act.records}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${act.time}</td>
                <td style="padding: 10px; border: 1px solid #ddd;">${act.percentage}</td>
                <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: #2e7d32;">${act.points}</td>
            </tr>
        `;
    });

    htmlTabla += `
            </tbody>
        </table>
    `;

    contenedorTabla.innerHTML = htmlTabla;
}

// Opcional: Cargar automáticamente el primer paciente al abrir la página para la demo
window.addEventListener('DOMContentLoaded', () => {
    // Carga por defecto el primer paciente disponible para que la pantalla no luzca vacía al iniciar
    cargarPacienteSeleccionado('d1p01M.json');
});
// Función para cargar los datos del paciente seleccionado desde la carpeta json_convertidos/
function cargarPacienteSeleccionado(nombreArchivo) {
    if (!nombreArchivo) return;

    // Ruta relativa limpia ideal para GitHub Pages
    const rutaJson = `json_convertidos/${nombreArchivo}`;

    fetch(rutaJson)
        .then(response => {
            if (!response.ok) {
                throw new Error(`No se pudo encontrar el archivo del paciente: ${nombreArchivo}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Datos cargados correctamente:", data);
            actualizarInterfaz(data);
        })
        .catch(error => {
            console.error("Error al cargar el JSON:", error);
            alert("Verifica que el archivo JSON exista dentro de la carpeta 'json_convertidos' en tu repositorio.");
        });
}

// Función encargada de actualizar los elementos visuales de la interfaz web
function actualizarInterfaz(data) {
    // 1. Tarjetas principales
    document.getElementById('txtId').textContent = data.id || "N/D";
    document.getElementById('txtGenero').textContent = data.gender || "N/D";
    document.getElementById('txtScore').textContent = (data.score || 0) + " pts";
    document.getElementById('txtBadge').textContent = data.badge || "Sin insignia";

    // 2. Mensaje motivacional
    document.getElementById('txtMensaje').textContent = data.motivationMessage || "Sin mensajes disponibles.";

    // 3. Renderizar tabla con los parámetros de actividad definidos
    const contenedorTabla = document.getElementById('tablaDesglose');
    
    if (!data.activityBreakdown || data.activityBreakdown.length === 0) {
        contenedorTabla.innerHTML = "<p style='color: #666;'>No hay registros de actividad para este paciente.</p>";
        return;
    }

    let htmlTabla = `
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
                <tr style="background-color: #f1f3f5; text-align: left; color: #495057;">
                    <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Parámetro de Actividad</th>
                    <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Registros</th>
                    <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Tiempo Estimado</th>
                    <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Porcentaje</th>
                    <th style="padding: 12px; border-bottom: 2px solid #dee2e6;">Puntuación</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.activityBreakdown.forEach(act => {
        htmlTabla += `
            <tr style="border-bottom: 1px solid #f1f3f5;">
                <td style="padding: 12px; font-weight: 500; color: #212529;">${act.activity}</td>
                <td style="padding: 12px; color: #495057;">${act.records}</td>
                <td style="padding: 12px; color: #495057;">${act.time}</td>
                <td style="padding: 12px; color: #495057;">${act.percentage}</td>
                <td style="padding: 12px; font-weight: bold; color: #27ae60;">${act.points}</td>
            </tr>
        `;
    });

    htmlTabla += `
            </tbody>
        </table>
    `;

    contenedorTabla.innerHTML = htmlTabla;
}

// Cargar automáticamente el primer paciente por defecto al abrir la página en la web
window.addEventListener('DOMContentLoaded', () => {
    cargarPacienteSeleccionado('d1p01M.json');
});
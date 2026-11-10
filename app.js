// Base de datos local de respaldo para la exposición en GitHub Pages
const pacientesDemo = {
    "d1p01M.json": {
        "id": "d1p01M",
        "gender": "Masculino",
        "totalRecords": 1500,
        "totalTime": "300 s",
        "score": 850,
        "badge": "Plata (Nivel Intermedio)",
        "motivationMessage": "Buen equilibrio de actividad física. Continúa manteniendo una rutina constante.",
        "activityBreakdown": [
            { "activity": "Sentado en la cama", "records": 400, "time": "80 s", "percentage": "26.7%", "points": "+40 pts" },
            { "activity": "Sentado en la silla", "records": 500, "time": "100 s", "percentage": "33.3%", "points": "+50 pts" },
            { "activity": "Acostado en la cama", "records": 200, "time": "40 s", "percentage": "13.3%", "points": "+8 pts" },
            { "activity": "Deambulando (incluye estar de pie y caminar)", "records": 400, "time": "80 s", "percentage": "26.7%", "points": "+240 pts" }
        ]
    },
    "d1p02F.json": {
        "id": "d1p02F",
        "gender": "Femenino",
        "totalRecords": 1400,
        "totalTime": "280 s",
        "score": 1120,
        "badge": "Oro (Nivel Avanzado)",
        "motivationMessage": "¡Excelente nivel de movimiento! Tus registros reflejan un gran desempeño dinámico.",
        "activityBreakdown": [
            { "activity": "Sentado en la cama", "records": 300, "time": "60 s", "percentage": "21.4%", "points": "+30 pts" },
            { "activity": "Sentado en la silla", "records": 300, "time": "60 s", "percentage": "21.4%", "points": "+30 pts" },
            { "activity": "Acostado en la cama", "records": 100, "time": "20 s", "percentage": "7.1%", "points": "+4 pts" },
            { "activity": "Deambulando (incluye estar de pie y caminar)", "records": 700, "time": "140 s", "percentage": "50.0%", "points": "+420 pts" }
        ]
    }
};

// 1. Cargar mediante el menú desplegable (Usa la base integrada o busca el archivo)
function cargarPacienteSeleccionado(nombreArchivo) {
    if (!nombreArchivo) return;

    // Si el paciente está en nuestra demo interna, lo carga al instante sin errores de red
    if (pacientesDemo[nombreArchivo]) {
        console.log("Cargando datos de demostración para:", nombreArchivo);
        actualizarInterfaz(pacientesDemo[nombreArchivo]);
        return;
    }

    // Si intenta buscar el archivo externo por fetch
    const rutaJson = `json_convertidos/${nombreArchivo}`;
    fetch(rutaJson)
        .then(response => {
            if (!response.ok) throw new Error("No encontrado");
            return response.json();
        })
        .then(data => actualizarInterfaz(data))
        .catch(error => {
            console.error("Error:", error);
            alert("Verifica que el archivo JSON exista en tu repositorio de GitHub.");
        });
}

// 2. Cargar mediante el botón de subir archivo manual
function cargarArchivoManual(event) {
    const archivo = event.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();
    lector.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            actualizarInterfaz(data);
        } catch (error) {
            alert("El archivo seleccionado no tiene un formato JSON válido.");
        }
    };
    lector.readAsText(archivo);
}

// 3. Función unificada para actualizar los elementos visuales de la interfaz
function actualizarInterfaz(data) {
    document.getElementById('txtId').textContent = data.id || "N/D";
    document.getElementById('txtGenero').textContent = data.gender || "N/D";
    document.getElementById('txtScore').textContent = (data.score || 0) + " pts";
    document.getElementById('txtBadge').textContent = data.badge || "Sin insignia";

    document.getElementById('txtMensaje').textContent = data.motivationMessage || "Sin mensajes disponibles.";

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

// Cargar por defecto el primer paciente al abrir la página
window.addEventListener('DOMContentLoaded', () => {
    cargarPacienteSeleccionado('d1p01M.json');
});
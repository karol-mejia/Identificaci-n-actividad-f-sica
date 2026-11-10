// Base de datos de demostración interna y dinámica
let pacientesDemo = {
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

// 1. CARGA MÚLTIPLE DE ARCHIVOS JSON MANUALES
function cargarArchivoManual(event) {
    const archivos = event.target.files;
    if (!archivos || archivos.length === 0) return;

    const selectPaciente = document.getElementById('selectPaciente');
    let primerDatos = null;

    // Recorrer cada archivo seleccionado en lote
    Array.from(archivos).forEach((archivo, index) => {
        const lector = new FileReader();
        lector.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                const keyName = `${data.id || 'paciente_' + index}.json`;
                
                // Guardarlo en la memoria temporal de pacientes
                pacientesDemo[keyName] = data;

                // Verificar si ya existe en el menú desplegable para no repetirlo
                let existeEnSelect = false;
                for (let i = 0; i < selectPaciente.options.length; i++) {
                    if (selectPaciente.options[i].value === keyName) {
                        existeEnSelect = true;
                        break;
                    }
                }

                // Si no está en el menú, agregarlo dinámicamente
                if (!existeEnSelect) {
                    const nuevaOpcion = document.createElement('option');
                    nuevaOpcion.value = keyName;
                    nuevaOpcion.textContent = `Paciente ${data.id} (${data.gender || 'N/D'})`;
                    selectPaciente.appendChild(nuevaOpcion);
                }

                // Guardar el primero para mostrarlo en pantalla de inmediato
                if (index === 0) {
                    primerDatos = data;
                    actualizarInterfaz(primerDatos);
                    selectPaciente.value = keyName; // Seleccionarlo en el menú
                }
            } catch (error) {
                console.error("Error al procesar el archivo JSON:", error);
            }
        };
        lector.readAsText(archivo);
    });

    console.log(`Se procesaron ${archivos.length} archivos correctamente.`);
}

// 2. CARGA DESDE EL SELECTOR DE DEMO
function cargarPacienteSeleccionado(nombreArchivo) {
    if (!nombreArchivo) return;

    if (pacientesDemo[nombreArchivo]) {
        actualizarInterfaz(pacientesDemo[nombreArchivo]);
    } else {
        fetch(`json_convertidos/${nombreArchivo}`)
            .then(res => {
                if (!res.ok) throw new Error("No encontrado");
                return res.json();
            })
            .then(data => actualizarInterfaz(data))
            .catch(err => alert("No se pudo encontrar el archivo."));
    }
}

// 3. ACTUALIZACIÓN VISUAL DE LA INTERFAZ
function actualizarInterfaz(data) {
    document.getElementById('txtId').textContent = data.id || "N/D";
    document.getElementById('txtGenero').textContent = data.gender || "N/D";
    document.getElementById('txtScore').textContent = (data.score || 0) + " pts";
    document.getElementById('txtBadge').textContent = data.badge || "Sin insignia";
    document.getElementById('txtMensaje').textContent = data.motivationMessage || "Sin mensaje.";

    const contenedorTabla = document.getElementById('tablaDesglose');
    
    if (!data.activityBreakdown || data.activityBreakdown.length === 0) {
        contenedorTabla.innerHTML = "<p style='color: #64748b; padding: 10px 0;'>No se encontraron parámetros de actividad en este archivo.</p>";
        return;
    }

    let htmlTabla = `
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px;">
            <thead>
                <tr style="background-color: #f8fafc; text-align: left; color: #475569;">
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Parámetro de Actividad</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Registros</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Tiempo Est.</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Porcentaje</th>
                    <th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">Puntuación</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.activityBreakdown.forEach(act => {
        htmlTabla += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-weight: 500; color: #1e293b;">${act.activity}</td>
                <td style="padding: 12px; color: #475569;">${act.records}</td>
                <td style="padding: 12px; color: #475569;">${act.time}</td>
                <td style="padding: 12px; color: #475569;">${act.percentage}</td>
                <td style="padding: 12px; font-weight: bold; color: #16a34a;">${act.points}</td>
            </tr>
        `;
    });

    htmlTabla += `</tbody></table>`;
    contenedorTabla.innerHTML = htmlTabla;
}

// Cargar primer paciente por defecto al iniciar la página
window.addEventListener('DOMContentLoaded', () => {
    cargarPacienteSeleccionado('d1p01M.json');
});
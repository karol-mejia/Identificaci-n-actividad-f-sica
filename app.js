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

// MANEJADOR DE CARGA DE ARCHIVOS (.JSON, .ZIP O CARPETAS)
function cargarArchivoManual(event) {
    const archivos = event.target.files;
    if (!archivos || archivos.length === 0) return;

    // Si el usuario subió un archivo .ZIP
    if (archivos.length === 1 && archivos[0].name.endsWith('.zip')) {
        procesarArchivoZip(archivos[0]);
    } else {
        // Procesar carpeta o selección múltiple de JSONs
        procesarListaArchivos(Array.from(archivos));
    }
}

// Descomprimir y leer el .ZIP automáticamente
// Descomprimir y leer el .ZIP automáticamente (Compatible con cualquier estructura interna)
function procesarArchivoZip(archivoZip) {
    JSZip.loadAsync(archivoZip).then(function(zip) {
        let promesas = [];
        let listaDatos = [];

        zip.forEach(function (relativePath, zipEntry) {
            // Ignorar carpetas y archivos que no sean .json (o archivos ocultos del sistema como __MACOSX)
            if (!zipEntry.dir && relativePath.endsWith('.json') && !relativePath.includes('__MACOSX')) {
                promesas.push(
                    zipEntry.async("string").then(function(content) {
                        try {
                            const data = JSON.parse(content);
                            listaDatos.push(data);
                        } catch (e) {
                            console.error("Error al parsear JSON interno:", relativePath);
                        }
                    })
                );
            }
        });

        Promise.all(promesas).then(() => {
            if (listaDatos.length > 0) {
                agregarPacientesAlMenu(listaDatos);
            } else {
                alert("No se encontraron archivos .json válidos dentro del archivo ZIP.");
            }
        }).catch(err => {
            console.error("Error en promesas del ZIP:", err);
            alert("Error al procesar los archivos dentro del .ZIP");
        });
    });
}
// Procesar lista de archivos seleccionados
function procesarListaArchivos(listaArchivos) {
    let promesas = [];

    listaArchivos.forEach(archivo => {
        if (archivo.name.endsWith('.json')) {
            promesas.push(new Promise((resolve) => {
                const lector = new FileReader();
                lector.onload = e => {
                    try {
                        resolve(JSON.parse(e.target.result));
                    } catch (err) {
                        resolve(null);
                    }
                };
                lector.readAsText(archivo);
            }));
        }
    });

    Promise.all(promesas).then(listaDatos => {
        const filtrados = listaDatos.filter(d => d !== null);
        agregarPacientesAlMenu(filtrados);
    });
}

// Registrar todos los pacientes procesados en la interfaz
function agregarPacientesAlMenu(listaDatos) {
    if (listaDatos.length === 0) return;

    const selectPaciente = document.getElementById('selectPaciente');

    listaDatos.forEach((data, index) => {
        const keyName = `${data.id || 'paciente_' + index}.json`;
        pacientesDemo[keyName] = data;

        let existe = false;
        for (let i = 0; i < selectPaciente.options.length; i++) {
            if (selectPaciente.options[i].value === keyName) {
                existe = true;
                break;
            }
        }

        if (!existe) {
            const op = document.createElement('option');
            op.value = keyName;
            op.textContent = `Paciente ${data.id} (${data.gender || 'N/D'})`;
            selectPaciente.appendChild(op);
        }
    });

    // Cargar y mostrar el primer paciente de la lista procesada
    actualizarInterfaz(listaDatos[0]);
    selectPaciente.value = `${listaDatos[0].id}.json`;
    alert(`¡Éxito! Se cargaron ${listaDatos.length} pacientes al menú desplegable.`);
}

function cargarPacienteSeleccionado(nombreArchivo) {
    if (!nombreArchivo) return;
    if (pacientesDemo[nombreArchivo]) {
        actualizarInterfaz(pacientesDemo[nombreArchivo]);
    }
}

// ACTUALIZACIÓN VISUAL FLEXIBLE (Compatible con cualquier estructura de JSON)
function actualizarInterfaz(data) {
    if (!data) return;
    console.log("Datos recibidos en la interfaz:", data);

    // Extraer valores buscando múltiples nombres posibles para las llaves del JSON
    const id = data.id || data.paciente_id || data.patientId || "N/D";
    const genero = data.gender || data.genero || "N/D";
    const score = data.score || data.puntuacion || data.totalScore || data.puntos || 0;
    const badge = data.badge || data.insignia || "Nivel Evaluado";
    const mensaje = data.motivationMessage || data.mensaje || data.message || "Análisis completado con éxito.";

    // Pintar tarjetas superiores
    document.getElementById('txtId').textContent = id;
    document.getElementById('txtGenero').textContent = genero;
    document.getElementById('txtScore').textContent = score + " pts";
    document.getElementById('txtBadge').textContent = badge;
    document.getElementById('txtMensaje').textContent = mensaje;

    const contenedorTabla = document.getElementById('tablaDesglose');
    
    // Buscar el desglose de actividades sin importar cómo se llame la propiedad en el JSON
    const desglose = data.activityBreakdown || data.desglose || data.actividades || data.breakdown || [];
    
    if (!Array.isArray(desglose) || desglose.length === 0) {
        contenedorTabla.innerHTML = "<p style='color: #64748b; padding: 10px 0;'>El archivo JSON no contiene una lista de actividades válida.</p>";
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

    desglose.forEach(act => {
        // Mapear campos flexibles para cada actividad
        const nombreAct = act.activity || act.nombre || act.actividad || "Parámetro";
        const recs = act.records || act.registros || act.count || 0;
        const tiempo = act.time || act.tiempo || "0 s";
        const porc = act.percentage || act.porcentaje || "0%";
        const pts = act.points || act.puntos || "+0 pts";

        htmlTabla += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-weight: 500; color: #1e293b;">${nombreAct}</td>
                <td style="padding: 12px; color: #475569;">${recs}</td>
                <td style="padding: 12px; color: #475569;">${tiempo}</td>
                <td style="padding: 12px; color: #475569;">${porc}</td>
                <td style="padding: 12px; font-weight: bold; color: #16a34a;">${pts}</td>
            </tr>
        `;
    });

    htmlTabla += `</tbody></table>`;
    contenedorTabla.innerHTML = htmlTabla;
}

window.addEventListener('DOMContentLoaded', () => {
    cargarPacienteSeleccionado('d1p01M.json');
});
// Variables globales
let globalPatients = {};
let currentChart = null;

const activityMap = {
    '1': 'Sentado en una silla',
    '2': 'Acostado',
    '3': 'Deambulando'
};

// Esperar a que todo el HTML esté cargado
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const activityFilter = document.getElementById('activityFilter');

    if (!fileInput) {
        console.error("No se encontró el elemento fileInput en el HTML.");
        return;
    }

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadStatus.textContent = `Procesando: ${file.name}...`;
        hideError();
        globalPatients = {}; 
        document.getElementById('patientList').innerHTML = '';

        try {
            if (file.name.toLowerCase().endsWith('.zip')) {
                await processZip(file);
            } else {
                await processCSV(file.name, file);
            }
        } catch (err) {
            showError(`Error al procesar el archivo: ${err.message}`);
            uploadStatus.textContent = "Error en la carga";
        }
    });

    activityFilter.addEventListener('change', (e) => {
        if (activePatientId && globalPatients[activePatientId]) {
            drawChart(globalPatients[activePatientId].data, e.target.value);
        }
    });
});

// Extraer género
function extractGender(filename) {
    const cleanName = filename.replace(/\.[^/.]+$/, "").trim();
    const lastChar = cleanName.slice(-1).toUpperCase();
    
    if (lastChar === 'F') return 'Femenino';
    if (lastChar === 'M') return 'Masculino';
    return 'Desconocido';
}

// Procesar ZIP
async function processZip(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error("La librería JSZip no se ha cargado correctamente.");
    }

    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    let count = 0;

    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('__MACOSX') || relativePath.startsWith('.')) {
            continue;
        }

        const filename = relativePath.split('/').pop();
        if (filename && !filename.startsWith('.')) {
            const fileData = await zipEntry.async("string");
            if (fileData && fileData.trim().length > 0) {
                parsePatientData(filename, fileData);
                count++;
            }
        }
    }

    const loadedCount = Object.keys(globalPatients).length;
    if (loadedCount === 0) {
        showError("No se pudieron extraer datos válidos del archivo ZIP.");
        document.getElementById('uploadStatus').textContent = "Sin datos válidos";
    } else {
        document.getElementById('uploadStatus').textContent = `${loadedCount} pacientes cargados exitosamente.`;
        renderPatientList();
    }
}

// Procesar CSV individual
function processCSV(filename, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            parsePatientData(filename, e.target.result);
            const loadedCount = Object.keys(globalPatients).length;
            if (loadedCount > 0) {
                document.getElementById('uploadStatus').textContent = `1 paciente cargado exitosamente.`;
                renderPatientList();
            } else {
                showError("El archivo no contiene un formato de columnas válido.");
            }
            resolve();
        };
        reader.onerror = () => reject(new Error("Error de lectura en el archivo."));
        reader.readAsText(file);
    });
}

// Analizador flexible (soporta comas, espacios y tabulaciones)
function parsePatientData(filename, csvString) {
    if (!csvString || !csvString.trim()) return;

    const lines = csvString.trim().split(/\r?\n/);
    let processedData = [];
    let activityCounts = {};

    lines.forEach((line) => {
        // Separa por comas, espacios o tabulaciones
        const row = line.trim().split(/[\s,]+/);
        
        if (row.length < 4) return;

        const time = parseFloat(row[0]);
        const accFrontal = parseFloat(row[1]);
        const accVertical = parseFloat(row[2]);
        const accLateral = parseFloat(row[3]);
        
        // Obtiene la actividad (columna 9 o índice 8 si existe, si no la última)
        const rawAct = row[8] !== undefined ? row[8] : (row[4] !== undefined ? row[4] : '1');
        const activityCode = String(rawAct);

        if (isNaN(time) || isNaN(accFrontal)) return;

        processedData.push({ time, accFrontal, accVertical, accLateral, activityCode });
        activityCounts[activityCode] = (activityCounts[activityCode] || 0) + 1;
    });

    if (processedData.length > 0) {
        const patientId = filename.replace(/\.[^/.]+$/, "");
        const gender = extractGender(patientId);

        globalPatients[patientId] = {
            id: patientId,
            gender: gender,
            data: processedData,
            activityCounts: activityCounts,
            totalRecords: processedData.length,
            totalTime: processedData[processedData.length - 1].time
        };
    }
}

// Renderizar lista
function renderPatientList() {
    const list = document.getElementById('patientList');
    list.innerHTML = '';
    const patients = Object.keys(globalPatients);
    
    patients.forEach(id => {
        const li = document.createElement('li');
        li.textContent = `👤 ${id}`;
        li.onclick = () => {
            document.querySelectorAll('#patientList li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            displayPatientData(id);
        };
        list.appendChild(li);
    });

    // Seleccionar automáticamente el primero
    if (patients.length > 0) {
        list.children[0].click();
    }
}

let activePatientId = null;

// Mostrar detalles
function displayPatientData(id) {
    activePatientId = id;
    const patient = globalPatients[id];
    
    document.getElementById('patientInfo').classList.remove('hidden');
    document.getElementById('chartContainer').classList.remove('hidden');

    document.getElementById('lblId').textContent = patient.id;
    document.getElementById('lblGender').textContent = patient.gender;
    document.getElementById('lblRecords').textContent = patient.totalRecords;
    document.getElementById('lblTime').textContent = patient.totalTime;

    const tbody = document.querySelector('#activityTable tbody');
    tbody.innerHTML = '';
    for (const [code, count] of Object.entries(patient.activityCounts)) {
        const tr = document.createElement('tr');
        const activityName = activityMap[code] || `Actividad (${code})`;
        tr.innerHTML = `<td>${activityName}</td><td>${count}</td>`;
        tbody.appendChild(tr);
    }

    drawChart(patient.data, 'all');
}

// Dibujar gráfica
function drawChart(data, filterCode) {
    const canvas = document.getElementById('accelerationChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }

    const filteredData = filterCode === 'all' 
        ? data 
        : data.filter(d => d.activityCode === filterCode);

    // Muestreo para no saturar la pantalla
    const downsampled = filteredData.filter((_, i) => i % 5 === 0);
    const labels = downsampled.map(d => d.time);
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Frontal (G)', data: downsampled.map(d => d.accFrontal), borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 },
                { label: 'Vertical (G)', data: downsampled.map(d => d.accVertical), borderColor: '#3498db', borderWidth: 1, pointRadius: 0 },
                { label: 'Lateral (G)', data: downsampled.map(d => d.accLateral), borderColor: '#2ecc71', borderWidth: 1, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Tiempo (s)' } },
                y: { title: { display: true, text: 'Aceleración (G)' } }
            }
        }
    });
}

function showError(msg) {
    const errorBox = document.getElementById('errorBox');
    if (errorBox) {
        errorBox.textContent = msg;
        errorBox.classList.remove('hidden');
    }
}

function hideError() {
    const errorBox = document.getElementById('errorBox');
    if (errorBox) {
        errorBox.classList.add('hidden');
    }
}

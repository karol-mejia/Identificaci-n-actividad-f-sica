// Variables globales
let globalPatients = {};
let currentChart = null;

// Mapa de actividades
const activityMap = {
    '1': 'Sentado en una silla',
    '2': 'Acostado',
    '3': 'Deambulando'
};

// Referencias al DOM
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const patientList = document.getElementById('patientList');
const errorBox = document.getElementById('errorBox');
const activityFilter = document.getElementById('activityFilter');

// Event Listener para cargar archivos
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    uploadStatus.textContent = `Procesando: ${file.name}...`;
    errorBox.classList.add('hidden');
    globalPatients = {}; 
    patientList.innerHTML = '';

    try {
        if (file.name.endsWith('.zip')) {
            await processZip(file);
        } else if (file.name.endsWith('.csv')) {
            await processCSV(file.name, file);
        } else {
            showError("Formato no soportado. Por favor sube un archivo .zip o .csv");
        }
    } catch (err) {
        showError(`Error crítico al procesar el archivo: ${err.message}`);
    }
});

// Extraer género del nombre del archivo (soporta nombres con o sin extensión)
function extractGender(filename) {
    const cleanName = filename.replace('.csv', '').trim();
    const lastChar = cleanName.slice(-1).toUpperCase();
    
    if (lastChar === 'F') return 'Femenino';
    if (lastChar === 'M') return 'Masculino';
    
    return 'Desconocido';
}

// Procesar archivo ZIP flexible (admite subcarpetas e ignora archivos basura)
async function processZip(file) {
    const zip = new JSZip();
    try {
        const contents = await zip.loadAsync(file);
        let count = 0;

        for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
            // Ignorar carpetas y archivos ocultos del sistema
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

        if (count === 0) {
            showError("No se encontraron archivos de pacientes válidos dentro del ZIP.");
        } else {
            uploadStatus.textContent = `${count} pacientes cargados exitosamente.`;
            renderPatientList();
        }
    } catch (err) {
        showError(`Error al descomprimir el archivo: ${err.message}`);
    }
}

// Procesar un CSV individual
function processCSV(filename, file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        parsePatientData(filename, e.target.result);
        uploadStatus.textContent = `Paciente cargado exitosamente.`;
        renderPatientList();
    };
    reader.readAsText(file);
}

// Analizar y filtrar columnas del CSV (Columnas 1, 2, 3, 4 y 9 -> Índices 0, 1, 2, 3, 8)
function parsePatientData(filename, csvString) {
    const parsed = Papa.parse(csvString, {
        skipEmptyLines: true,
        dynamicTyping: true 
    });

    const rows = parsed.data;
    if (!rows || rows.length === 0) return;
    
    if (rows[0].length < 9) {
        showError(`El archivo ${filename} tiene menos de 9 columnas. Se ha ignorado.`);
        return;
    }

    const patientId = filename.replace('.csv', '');
    const gender = extractGender(filename);
    let processedData = [];
    let activityCounts = {};

    rows.forEach((row, index) => {
        if (index === 0 && typeof row[0] === 'string') return;

        const time = row[0];
        const accFrontal = row[1];
        const accVertical = row[2];
        const accLateral = row[3];
        const activityCode = String(row[8]);

        if (time === null || accFrontal === null || activityCode === null) return;

        processedData.push({ time, accFrontal, accVertical, accLateral, activityCode });

        activityCounts[activityCode] = (activityCounts[activityCode] || 0) + 1;
    });

    globalPatients[patientId] = {
        id: patientId,
        gender: gender,
        data: processedData,
        activityCounts: activityCounts,
        totalRecords: processedData.length,
        totalTime: processedData.length > 0 ? processedData[processedData.length - 1].time : 0
    };
}

// Renderizar la lista de pacientes
function renderPatientList() {
    patientList.innerHTML = '';
    const patients = Object.keys(globalPatients);
    
    patients.forEach(id => {
        const li = document.createElement('li');
        li.textContent = `☐ ${id}`;
        li.onclick = () => {
            document.querySelectorAll('#patientList li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            displayPatientData(id);
        };
        patientList.appendChild(li);
    });
}

let activePatientId = null;

// Mostrar información del paciente seleccionado
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
        const activityName = activityMap[code] || `Actividad Desconocida (${code})`;
        tr.innerHTML = `<td>${activityName}</td><td>${count}</td>`;
        tbody.appendChild(tr);
    }

    drawChart(patient.data, 'all');
}

// Escuchar cambios en el filtro de actividad
activityFilter.addEventListener('change', (e) => {
    if (activePatientId) {
        drawChart(globalPatients[activePatientId].data, e.target.value);
    }
});

// Dibujar gráfica con Chart.js
function drawChart(data, filterCode) {
    const ctx = document.getElementById('accelerationChart').getContext('2d');
    
    if (currentChart) {
        currentChart.destroy();
    }

    const filteredData = filterCode === 'all' 
        ? data 
        : data.filter(d => d.activityCode === filterCode);

    const downsampled = filteredData.filter((_, i) => i % 5 === 0);

    const labels = downsampled.map(d => d.time);
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Frontal (G)', data: downsampled.map(d => d.accFrontal), borderColor: 'red', borderWidth: 1, pointRadius: 0 },
                { label: 'Vertical (G)', data: downsampled.map(d => d.accVertical), borderColor: 'blue', borderWidth: 1, pointRadius: 0 },
                { label: 'Lateral (G)', data: downsampled.map(d => d.accLateral), borderColor: 'green', borderWidth: 1, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { title: { display: true, text: 'Tiempo (s)' } },
                y: { title: { display: true, text: 'Aceleración (G)' } }
            }
        }
    });
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
}
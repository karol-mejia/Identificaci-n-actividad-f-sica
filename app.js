// Variables globales
let globalPatients = {};
let currentChart = null;

// Configuración de actividades, puntos por segundo y colores
const activityConfig = {
    '1': { name: 'Sentado en una silla', ptsPerSec: 0.5, color: '#f39c12' },
    '2': { name: 'Acostado', ptsPerSec: 0.0, color: '#95a5a6' },
    '3': { name: 'Deambulando (Caminar)', ptsPerSec: 2.0, color: '#2ecc71' }
};

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const activityFilter = document.getElementById('activityFilter');

    if (!fileInput) return;

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

    if (activityFilter) {
        activityFilter.addEventListener('change', (e) => {
            if (activePatientId && globalPatients[activePatientId]) {
                drawChart(globalPatients[activePatientId].data, e.target.value);
            }
        });
    }
});

// Extraer género
function extractGender(filename) {
    const cleanName = filename.replace(/\.[^/.]+$/, "").trim();
    const lastChar = cleanName.slice(-1).toUpperCase();
    
    if (lastChar === 'F') return 'Femenino';
    if (lastChar === 'M') return 'Masculino';
    return 'Desconocido';
}

// Formatear segundos a texto legible (ej: 2 min 15 s)
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs} s`;
    return `${mins} min ${secs} s`;
}

// Procesar ZIP con múltiples pacientes
async function processZip(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error("La librería JSZip no está cargada.");
    }

    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('__MACOSX') || relativePath.startsWith('.')) {
            continue;
        }

        const filename = relativePath.split('/').pop();
        if (filename && !filename.startsWith('.')) {
            const fileData = await zipEntry.async("string");
            if (fileData && fileData.trim().length > 0) {
                parsePatientData(filename, fileData);
            }
        }
    }

    finishPatientLoading();
}

// Procesar un solo archivo CSV (Paciente Individual)
function processCSV(filename, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            parsePatientData(filename, e.target.result);
            finishPatientLoading();
            resolve();
        };
        reader.onerror = () => reject(new Error("Error de lectura en el archivo."));
        reader.readAsText(file);
    });
}

function finishPatientLoading() {
    const loadedCount = Object.keys(globalPatients).length;
    const statusText = document.getElementById('uploadStatus');

    if (loadedCount === 0) {
        showError("No se pudieron extraer datos válidos del archivo.");
        if (statusText) statusText.textContent = "Sin datos válidos";
    } else {
        if (statusText) {
            statusText.textContent = loadedCount === 1 
                ? "1 paciente cargado exitosamente." 
                : `${loadedCount} pacientes cargados exitosamente.`;
        }
        renderPatientList();
    }
}

// Parsear datos del CSV y calcular métricas de recompensas
function parsePatientData(filename, csvString) {
    if (!csvString || !csvString.trim()) return;

    const lines = csvString.trim().split(/\r?\n/);
    let processedData = [];
    let activityCounts = {};

    lines.forEach((line) => {
        const row = line.trim().split(/[\s,]+/);
        if (row.length < 4) return;

        const time = parseFloat(row[0]);
        const accFrontal = parseFloat(row[1]);
        const accVertical = parseFloat(row[2]);
        const accLateral = parseFloat(row[3]);
        
        const rawAct = row[8] !== undefined ? row[8] : (row[4] !== undefined ? row[4] : '1');
        const activityCode = String(rawAct);

        if (isNaN(time) || isNaN(accFrontal)) return;

        processedData.push({ time, accFrontal, accVertical, accLateral, activityCode });
        activityCounts[activityCode] = (activityCounts[activityCode] || 0) + 1;
    });

    if (processedData.length > 0) {
        const patientId = filename.replace(/\.[^/.]+$/, "");
        const gender = extractGender(patientId);
        const totalRecords = processedData.length;
        const totalTime = processedData[processedData.length - 1].time;

        // Cálculo de Puntos y Nivel
        let score = 0;
        let activeRecords = 0; // Tiempo en 'Deambulando'

        for (const [code, count] of Object.entries(activityCounts)) {
            const config = activityConfig[code] || { ptsPerSec: 0.5 };
            score += count * config.ptsPerSec;
            if (code === '3') activeRecords += count;
        }

        const activePercentage = ((activeRecords / totalRecords) * 100).toFixed(1);

        globalPatients[patientId] = {
            id: patientId,
            gender: gender,
            data: processedData,
            activityCounts: activityCounts,
            totalRecords: totalRecords,
            totalTime: totalTime,
            score: Math.round(score),
            activePercentage: parseFloat(activePercentage)
        };
    }
}

// Renderizar lista de pacientes con medallas y puntos
function renderPatientList() {
    const list = document.getElementById('patientList');
    list.innerHTML = '';
    
    // Ordenar pacientes por puntaje (Ranking)
    const sortedPatients = Object.values(globalPatients).sort((a, b) => b.score - a.score);

    sortedPatients.forEach((patient, index) => {
        const li = document.createElement('li');
        let badge = '🥉';
        if (index === 0) badge = '🥇';
        else if (index === 1) badge = '🥈';

        li.innerHTML = `<span>${badge} 👤 ${patient.id}</span> <strong style="color: #27ae60;">${patient.score} pts</strong>`;
        li.onclick = () => {
            document.querySelectorAll('#patientList li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            displayPatientData(patient.id, index + 1, sortedPatients.length);
        };
        list.appendChild(li);
    });

    if (sortedPatients.length > 0) {
        list.children[0].click();
    }
}

let activePatientId = null;

// Mostrar detalles completos del paciente seleccionado
function displayPatientData(id, rankPosition, totalPatients) {
    activePatientId = id;
    const patient = globalPatients[id];
    
    document.getElementById('patientInfo').classList.remove('hidden');
    document.getElementById('chartContainer').classList.remove('hidden');

    document.getElementById('lblId').textContent = patient.id;
    document.getElementById('lblGender').textContent = patient.gender;
    document.getElementById('lblRecords').textContent = patient.totalRecords;
    document.getElementById('lblTime').textContent = `${patient.totalTime} s (${formatDuration(patient.totalTime)})`;

    // Actualizar Encabezado de la Tabla
    const thead = document.querySelector('#activityTable thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th>Actividad</th>
                <th>Tiempo Estimado</th>
                <th>Porcentaje (%)</th>
                <th>Puntos Ganados</th>
            </tr>
        `;
    }

    // Llenar datos de la tabla con tiempo, % y puntos
    const tbody = document.querySelector('#activityTable tbody');
    tbody.innerHTML = '';

    for (const [code, count] of Object.entries(patient.activityCounts)) {
        const config = activityConfig[code] || { name: `Actividad ${code}`, ptsPerSec: 0.5 };
        const percent = ((count / patient.totalRecords) * 100).toFixed(1);
        const timeInSec = Math.round((count / patient.totalRecords) * patient.totalTime);
        const points = Math.round(count * config.ptsPerSec);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${config.name}</strong></td>
            <td>${formatDuration(timeInSec)}</td>
            <td><span style="background-color: #e8f8f5; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${percent}%</span></td>
            <td style="color: #27ae60; font-weight: bold;">+${points} pts</td>
        `;
        tbody.appendChild(tr);
    }

    // Crear o actualizar la Tarjeta de Recompensas
    renderRewardCard(patient, rankPosition, totalPatients);

    // Dibujar gráfica
    drawChart(patient.data, 'all');
}

// Genera una tarjeta visual de Gamificación y Recompensas
function renderRewardCard(patient, rankPosition, totalPatients) {
    let rewardBox = document.getElementById('rewardCard');
    
    if (!rewardBox) {
        rewardBox = document.createElement('div');
        rewardBox.id = 'rewardCard';
        rewardBox.style.cssText = "margin-top: 15px; padding: 15px; background: #f8f9fa; border-left: 5px solid #2ecc71; border-radius: 6px;";
        const infoContainer = document.getElementById('patientInfo');
        infoContainer.appendChild(rewardBox);
    }

    let medal = '🥉 Bronce (Nivel Iniciador)';
    if (patient.activePercentage >= 35) medal = '🥇 Oro (Atleta Destacado)';
    else if (patient.activePercentage >= 15) medal = '🥈 Plata (Activo en Marcha)';

    const rankText = totalPatients > 1 ? `| <strong>Posición:</strong> #${rankPosition} de ${totalPatients}` : '';

    rewardBox.innerHTML = `
        <h3 style="margin-top: 0; color: #2c3e50;">🏆 Sistema de Recompensas</h3>
        <p style="margin: 5px 0;"><strong>Puntaje de Actividad:</strong> <span style="font-size: 1.2em; color: #27ae60; font-weight: bold;">${patient.score} Puntos</span> ${rankText}</p>
        <p style="margin: 5px 0;"><strong>Insignia Obtenida:</strong> ${medal}</p>
        <p style="margin: 5px 0;"><strong>Tiempo en Movimiento (Deambulando):</strong> ${patient.activePercentage}% del total</p>
    `;
}

// Dibujar gráfica con Chart.js
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
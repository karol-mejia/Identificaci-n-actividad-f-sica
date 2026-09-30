// ============================================================================
// CONFIGURACIÓN GLOBAL Y ESTADOS
// ============================================================================
let globalPatients = {};
let currentChart = null;
let activePatientId = null;

// Configuración de actividades y puntos por segundo
const activityConfig = {
    '1': { name: 'Sentado en una silla', ptsPerSec: 0.5, color: '#f39c12' },
    '2': { name: 'Acostado', ptsPerSec: 0.0, color: '#95a5a6' },
    '3': { name: 'Deambulando (Caminar)', ptsPerSec: 2.0, color: '#2ecc71' }
};

// ============================================================================
// FUNCIONES DE DETECCIÓN INTELIGENTE
// ============================================================================

/**
 * Detecta automáticamente el delimitador de columnas (;, ,, tabulación o |)
 * analizando la consistencia de las primeras filas del archivo.
 */
function detectDelimiter(textContent) {
    const lines = textContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return ',';

    // Tomar una muestra de hasta 10 filas
    const sampleLines = lines.slice(0, 10);
    const candidates = [';', '\t', '|', ','];
    
    let bestDelimiter = ',';
    let maxScore = -Infinity;

    candidates.forEach(cand => {
        const counts = sampleLines.map(line => (line.split(cand).length - 1));
        const total = counts.reduce((acc, val) => acc + val, 0);

        if (total > 0) {
            const avg = total / counts.length;
            // Varianza para castigar candidatos con conteo irregular entre líneas
            const variance = counts.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / counts.length;
            const score = avg - (variance * 1.5);
            
            if (score > maxScore) {
                maxScore = score;
                bestDelimiter = cand;
            }
        }
    });

    return bestDelimiter;
}

/**
 * Extrae el género del participante a partir del nombre del archivo.
 */
function extractGender(filename) {
    const clean = filename.toLowerCase();
    if (clean.includes('karol') || clean.includes('maria') || clean.includes('ana') || clean.endsWith('f')) {
        return 'Femenino';
    }
    if (clean.includes('juan') || clean.includes('carlos') || clean.includes('pedro') || clean.endsWith('m')) {
        return 'Masculino';
    }
    return 'Desconocido';
}

/**
 * Infiere el código de actividad predeterminado si el archivo no contiene columna de etiqueta.
 */
function inferActivityFromFilename(filename) {
    const name = filename.toLowerCase();
    if (name.includes('acostad') || name.includes('lying') || name.includes('cama')) return '2';
    if (name.includes('deambula') || name.includes('camin') || name.includes('paso') || name.includes('marcha')) return '3';
    return '1'; // Sentado por defecto
}

/**
 * Convierte segundos a un formato de texto limpio (ej: "35 s" o "2 min 15 s").
 */
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs} s`;
    return `${mins} min ${secs} s`;
}

// ============================================================================
// INICIALIZACIÓN Y EVENTOS DE CARGA
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const activityFilter = document.getElementById('activityFilter');

    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (uploadStatus) uploadStatus.textContent = `Procesando: ${file.name}...`;
        hideError();
        globalPatients = {}; 
        
        const patientList = document.getElementById('patientList');
        if (patientList) patientList.innerHTML = '';

        try {
            const fileNameLower = file.name.toLowerCase();
            if (fileNameLower.endsWith('.zip')) {
                await processZip(file);
            } else {
                // Procesa archivos .csv, .txt, .text o cualquier archivo de texto plano
                await processTextFile(file.name, file);
            }
        } catch (err) {
            showError(`Error al procesar el archivo: ${err.message}`);
            if (uploadStatus) uploadStatus.textContent = "Error en la carga";
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

// ============================================================================
// LECTURA DE ARCHIVOS (ZIP, CSV, TXT, TEXT)
// ============================================================================
async function processZip(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error("La librería JSZip no está cargada en el proyecto.");
    }

    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('__MACOSX') || relativePath.startsWith('.')) {
            continue;
        }

        const filename = relativePath.split('/').pop();
        if (filename && !filename.startsWith('.')) {
            const lowerName = filename.toLowerCase();
            // Acepta .csv, .txt, .text y archivos sin extensión dentro del ZIP
            if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || lowerName.endsWith('.text') || !lowerName.includes('.')) {
                const fileData = await zipEntry.async("string");
                if (fileData && fileData.trim().length > 0) {
                    parsePatientData(filename, fileData);
                }
            }
        }
    }

    finishPatientLoading();
}

function processTextFile(filename, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            parsePatientData(filename, e.target.result);
            finishPatientLoading();
            resolve();
        };
        reader.onerror = () => reject(new Error("No se pudo leer el archivo seleccionado."));
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

// ============================================================================
// PROCESAMIENTO Y PARSEO DE DATOS
// ============================================================================
function parsePatientData(filename, csvString) {
    if (!csvString || !csvString.trim()) return;

    // 1. Detectar automáticamente el separador de columnas (;, ,, \t, |)
    const delimiter = detectDelimiter(csvString);

    const lines = csvString.trim().split(/\r?\n/);
    let processedData = [];
    let activityCounts = {};

    const defaultActivity = inferActivityFromFilename(filename);

    // Convertidor a número que acepta coma decimal (ej: 0,741 -> 0.741)
    const parseNum = (val) => {
        if (val === undefined || val === null) return NaN;
        return parseFloat(String(val).replace(',', '.').trim());
    };

    lines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;

        // Dividir usando el delimitador detectado
        const row = cleanLine.split(delimiter);
        if (row.length < 4) return;

        const time = parseNum(row[0]);
        let accFrontal = parseNum(row[1]);
        let accVertical = parseNum(row[2]);
        let accLateral = parseNum(row[3]);

        // Ignorar filas de encabezado con texto
        if (isNaN(time) || isNaN(accFrontal) || isNaN(accVertical) || isNaN(accLateral)) return;

        // Convertir m/s² a G si los valores corresponden a m/s² (ej: gravedad ~ 9.81)
        if (Math.abs(accVertical) > 3.0 || Math.abs(accFrontal) > 3.0 || Math.abs(accLateral) > 3.0) {
            accFrontal = accFrontal / 9.80665;
            accVertical = accVertical / 9.80665;
            accLateral = accLateral / 9.80665;
        }

        // Obtener la etiqueta de la actividad
        let activityCode = defaultActivity;
        if (row[8] !== undefined && !isNaN(parseNum(row[8]))) {
            activityCode = String(Math.round(parseNum(row[8])));
        } else if (row[4] !== undefined && !isNaN(parseNum(row[4])) && row.length === 5) {
            activityCode = String(Math.round(parseNum(row[4])));
        }

        if (activityCode === '4') activityCode = '3';

        processedData.push({ time, accFrontal, accVertical, accLateral, activityCode });
        activityCounts[activityCode] = (activityCounts[activityCode] || 0) + 1;
    });

    if (processedData.length > 0) {
        const patientId = filename.replace(/\.[^/.]+$/, "");
        const gender = extractGender(patientId);
        const totalRecords = processedData.length;
        const startTime = processedData[0].time;
        const endTime = processedData[processedData.length - 1].time;
        const totalTime = Math.max(1, Math.round(endTime - startTime));

        let score = 0;
        let activeRecords = 0;

        for (const [code, count] of Object.entries(activityCounts)) {
            const config = activityConfig[code] || { ptsPerSec: 0.5 };
            score += count * config.ptsPerSec;
            if (code === '3') activeRecords += count;
        }

        const activePercentage = parseFloat(((activeRecords / totalRecords) * 100).toFixed(1));

        globalPatients[patientId] = {
            id: patientId,
            gender: gender,
            data: processedData,
            activityCounts: activityCounts,
            totalRecords: totalRecords,
            totalTime: totalTime,
            score: Math.round(score),
            activePercentage: activePercentage
        };
    }
}

// ============================================================================
// PRESENTACIÓN DE LA INTERFAZ
// ============================================================================
function renderPatientList() {
    const list = document.getElementById('patientList');
    if (!list) return;

    list.innerHTML = '';
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

    if (sortedPatients.length > 0 && list.children.length > 0) {
        list.children[0].click();
    }
}

function displayPatientData(id, rankPosition, totalPatients) {
    activePatientId = id;
    const patient = globalPatients[id];
    
    const infoBox = document.getElementById('patientInfo');
    const chartBox = document.getElementById('chartContainer');
    if (infoBox) infoBox.classList.remove('hidden');
    if (chartBox) chartBox.classList.remove('hidden');

    const lblId = document.getElementById('lblId');
    const lblGender = document.getElementById('lblGender');
    const lblRecords = document.getElementById('lblRecords');
    const lblTime = document.getElementById('lblTime');

    if (lblId) lblId.textContent = patient.id;
    if (lblGender) lblGender.textContent = patient.gender;
    if (lblRecords) lblRecords.textContent = patient.totalRecords;
    if (lblTime) lblTime.textContent = formatDuration(patient.totalTime);

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

    const tbody = document.querySelector('#activityTable tbody');
    if (tbody) {
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
    }

    renderRewardCard(patient, rankPosition, totalPatients);
    drawChart(patient.data, 'all');
}

function renderRewardCard(patient, rankPosition, totalPatients) {
    let rewardBox = document.getElementById('rewardCard');
    
    if (!rewardBox) {
        rewardBox = document.createElement('div');
        rewardBox.id = 'rewardCard';
        rewardBox.style.cssText = "margin-top: 15px; padding: 15px; background: #f8f9fa; border-left: 5px solid #2ecc71; border-radius: 6px;";
        const infoContainer = document.getElementById('patientInfo');
        if (infoContainer) infoContainer.appendChild(rewardBox);
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

// ============================================================================
// GRÁFICO (CHART.JS)
// ============================================================================
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

    // Muestreo para mantener agilidad en la navegación
    const downsampled = filteredData.filter((_, i) => i % 5 === 0);
    const labels = downsampled.map(d => d.time.toFixed(2));
    
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

// ============================================================================
// MANEJO DE ERRORES Y UI
// ============================================================================
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
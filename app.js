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

// Función para limpiar y extraer el nombre real del paciente desde el nombre del archivo
function obtenerNombrePaciente(filename) {
    let sinExtension = filename.replace(/\.[^/.]+$/, "");
    
    // Separa por guion bajo, medio o largo para aislar el nombre del paciente
    let separadores = /[_–-]/;
    if (separadores.test(sinExtension)) {
        let partes = sinExtension.split(separadores);
        return partes[0].trim(); // Retorna "Mejia Karol"
    }
    
    return sinExtension.trim();
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

    // 1. Detectar automáticamente el separador de columnas
    const delimiter = detectDelimiter(csvString);
    const lines = csvString.trim().split(/\r?\n/);
    let processedData = [];
    let activityCounts = {};

    const defaultActivity = inferActivityFromFilename(filename);

    const parseNum = (val) => {
        if (val === undefined || val === null) return NaN;
        return parseFloat(String(val).replace(',', '.').trim());
    };

    lines.forEach((line) => {
        const cleanLine = line.trim();
        if (!cleanLine) return;

        const row = cleanLine.split(delimiter);
        if (row.length < 4) return;

        const time = parseNum(row[0]);
        let accFrontal = parseNum(row[1]);
        let accVertical = parseNum(row[2]);
        let accLateral = parseNum(row[3]);

        if (isNaN(time) || isNaN(accFrontal) || isNaN(accVertical) || isNaN(accLateral)) return;

        if (Math.abs(accVertical) > 3.0 || Math.abs(accFrontal) > 3.0 || Math.abs(accLateral) > 3.0) {
            accFrontal = accFrontal / 9.80665;
            accVertical = accVertical / 9.80665;
            accLateral = accLateral / 9.80665;
        }

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
        // Obtenemos el nombre base unificado (ej: "Mejia Karol")
        const patientId = obtenerNombrePaciente(filename);
        const gender = extractGender(patientId);

        // Si el paciente aún no está en el objeto global, lo inicializamos
        if (!globalPatients[patientId]) {
            globalPatients[patientId] = {
                id: patientId,
                gender: gender,
                data: [],
                activityCounts: {},
                totalRecords: 0,
                totalTime: 0,
                score: 0,
                activePercentage: 0
            };
        }

        const patient = globalPatients[patientId];
        
        // Acumulamos los nuevos datos del archivo a los ya existentes del paciente
        patient.data = patient.data.concat(processedData);

        // Combinamos los conteos de actividad
        for (const [code, count] of Object.entries(activityCounts)) {
            patient.activityCounts[code] = (patient.activityCounts[code] || 0) + count;
        }

        patient.totalRecords += processedData.length;

        // Recalculamos métricas globales del paciente unificado
        const startTime = patient.data[0].time;
        const endTime = patient.data[patient.data.length - 1].time;
        patient.totalTime = Math.max(1, Math.round(endTime - startTime));

        let score = 0;
        let activeRecords = 0;

        for (const [code, count] of Object.entries(patient.activityCounts)) {
            const config = activityConfig[code] || { ptsPerSec: 0.5 };
            score += count * config.ptsPerSec;
            if (code === '3') activeRecords += count;
        }

        patient.score = Math.round(score);
        patient.activePercentage = parseFloat(((activeRecords / patient.totalRecords) * 100).toFixed(1));
    }
}
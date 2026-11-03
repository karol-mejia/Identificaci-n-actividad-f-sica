// ==========================================================
// VARIABLES GLOBALES DE LA APLICACIÓN
// ==========================================================
let globalPatients = {};
let activePatientId = null;
let chartInstance = null;

// ==========================================================
// GESTIÓN DE ERRORES EN INTERFAZ
// ==========================================================
function showError(message) {
    let errorDiv = document.getElementById('errorBanner');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorBanner';
        errorDiv.style.cssText = 'background: #fee2e2; color: #b91c1c; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #fecaca; font-size: 14px;';
        const container = document.querySelector('.main-container');
        if (container) container.insertBefore(errorDiv, container.firstChild);
    }
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('errorBanner');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

// ==========================================================
// LECTURA DE ARCHIVOS COMPRIMIDOS (ZIP)
// ==========================================================
async function processZip(file) {
    if (typeof JSZip === 'undefined') {
        throw new Error("La librería JSZip no está cargada en el proyecto.");
    }
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    
    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('MACOSX') || relativePath.startsWith('.')) {
            continue;
        }
        const filename = relativePath.split('/').pop();
        
        if (filename && !filename.startsWith('.') && !filename.toLowerCase().includes('readme')) {
            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || lowerName.endsWith('.text') || !lowerName.includes('.')) {
                try {
                    const fileDataString = await zipEntry.async("string");
                    if (fileDataString && fileDataString.trim().length > 0) {
                        const blob = new Blob([fileDataString], { type: 'text/plain' });
                        const extractedFile = new File([blob], filename, { type: 'text/plain' });
                        await processTextFile(extractedFile);
                    }
                } catch (innerErr) {
                    console.warn(`No se pudo leer el archivo interno ${filename}:`, innerErr);
                }
            }
        }
    }
}

// ==========================================================
// ENVÍO DE ARCHIVOS AL BACKEND Y UNIFICACIÓN
// ==========================================================
async function processTextFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('https://backend-acelerometria.onrender.com/analizar', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Error HTTP: ${response.status}`);
        }

        const data = await response.json();
        
        if (data && data.id) {
            if (globalPatients[data.id]) {
                globalPatients[data.id].data = globalPatients[data.id].data.concat(data.data);
                globalPatients[data.id].totalRecords += data.totalRecords;
                globalPatients[data.id].totalTime += data.totalTime;
                
                for (let [code, count] of Object.entries(data.activityCounts)) {
                    globalPatients[data.id].activityCounts[code] = (globalPatients[data.id].activityCounts[code] || 0) + count;
                }
                
                const totalRecs = globalPatients[data.id].totalRecords;
                const counts = globalPatients[data.id].activityCounts;
                const ptsConfig = {'1': 0.5, '2': 0.0, '3': 2.0, '4': 2.0};
                let newScore = 0;
                let activeRecs = 0;
                const totalT = globalPatients[data.id].totalTime;

                for (let [code, count] of Object.entries(counts)) {
                    const ptsPerSec = ptsConfig[code] || 0.5;
                    const timeFraction = count / totalRecs;
                    newScore += (timeFraction * totalT) * ptsPerSec;
                    if (code === '3' || code === '4') {
                        activeRecs += count;
                    }
                }
                globalPatients[data.id].score = Math.round(newScore);
                globalPatients[data.id].activePercentage = totalRecs > 0 ? parseFloat(((activeRecs / totalRecs) * 100).toFixed(1)) : 0.0;
            } else {
                globalPatients[data.id] = data;
            }
        }
        return data;

    } catch (error) {
        console.warn('Archivo omitido por el servidor:', error);
    }
}

// ==========================================================
// RENDERIZADO DE PACIENTES Y PANEL DE INFORMACIÓN DETALLADA
// ==========================================================
function finishPatientLoading() {
    const patientList = document.getElementById('patientList');
    if (!patientList) return;
    
    patientList.innerHTML = '';
    const patientIds = Object.keys(globalPatients);
    
    if (patientIds.length === 0) {
        patientList.innerHTML = '<p style="color: #6b7280; font-style: italic;">No hay pacientes válidos cargados</p>';
        return;
    }

    patientIds.sort((a, b) => globalPatients[b].score - globalPatients[a].score);

    patientIds.forEach((id, index) => {
        const patient = globalPatients[id];
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; margin-bottom: 10px; border-radius: 8px; background: white; border: 1px solid #e5e7eb; cursor: pointer; transition: all 0.2s;';
        
        let rankBadge = '';
        if (index === 0) rankBadge = '🥇 1er Lugar';
        else if (index === 1) rankBadge = '🥈 2do Lugar';
        else if (index === 2) rankBadge = '🥉 3er Lugar';
        else rankBadge = `#${index + 1}`;

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${patient.id}</strong>
                <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${rankBadge}</span>
            </div>
            <div style="font-size: 13px; color: #4b5563; margin-top: 6px;">
                Puntaje: <b>${patient.score} pts</b> | Activo: <b>${patient.activePercentage}%</b>
            </div>
        `;

        item.addEventListener('click', () => {
            document.querySelectorAll('#patientList > div').forEach(el => el.style.borderColor = '#e5e7eb');
            item.style.borderColor = '#3b82f6';
            activePatientId = id;
            
            showPatientInfo(patient);
            const filterSelect = document.getElementById('activityFilter');
            const filterVal = filterSelect ? filterSelect.value : 'all';
            drawChart(patient.data, filterVal);
        });

        patientList.appendChild(item);
    });

    if (patientIds.length > 0) {
        activePatientId = patientIds[0];
        const firstItem = patientList.firstChild;
        if (firstItem) firstItem.style.borderColor = '#3b82f6';
        showPatientInfo(globalPatients[activePatientId]);
        drawChart(globalPatients[activePatientId].data, 'all');
    }
}

// ==========================================================
// PANEL DE INFORMACIÓN DETALLADA DEL PACIENTE
// ==========================================================
function showPatientInfo(patient) {
    let infoPanel = document.getElementById('patientInfoPanel');
    const container = document.querySelector('.main-container') || document.body;

    if (!infoPanel) {
        infoPanel = document.createElement('div');
        infoPanel.id = 'patientInfoPanel';
        infoPanel.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 15px; align-items: center;';
        
        const chartSection = document.querySelector('div:has(#activityChart)') || container;
        container.insertBefore(infoPanel, chartSection);
    }

    infoPanel.innerHTML = `
        <div>
            <h3 style="margin: 0 0 5px 0; color: #1e293b; font-size: 18px;">👤 ${patient.id}</h3>
            <div style="font-size: 13px; color: #64748b; display: flex; gap: 15px;">
                <span>Género: <b>${patient.gender}</b></span>
                <span>Edad: <b>${patient.age} años</b></span>
                <span>Peso: <b>${patient.weight} kg</b></span>
            </div>
        </div>
        <div style="display: flex; gap: 20px; font-size: 14px; color: #334155;">
            <div>⏱️ Tiempo: <b>${patient.totalTime} s</b></div>
            <div>🏆 Puntaje: <b style="color: #2563eb;">${patient.score} pts</b></div>
            <div>⚡ Actividad: <b style="color: #16a34a;">${patient.activePercentage}%</b></div>
        </div>
    `;
}

// ==========================================================
// VISUALIZACIÓN DE GRÁFICAS CON CHART.JS
// ==========================================================
function drawChart(records, activityFilter) {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;

    let filteredRecords = records;
    if (activityFilter && activityFilter !== 'all') {
        filteredRecords = records.filter(r => String(r.activityCode) === String(activityFilter));
    }

    const step = Math.max(1, Math.floor(filteredRecords.length / 600));
    const sampled = filteredRecords.filter((_, i) => i % step === 0);

    const labels = sampled.map(r => r.time);
    const frontal = sampled.map(r => r.accFrontal);
    const vertical = sampled.map(r => r.accVertical);
    const lateral = sampled.map(r => r.accLateral);

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Acel. Frontal', data: frontal, borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0, tension: 0.1 },
                { label: 'Acel. Vertical', data: vertical, borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0, tension: 0.1 },
                { label: 'Acel. Lateral', data: lateral, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0, tension: 0.1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Tiempo (s)' } },
                y: { title: { display: true, text: 'Aceleración' } }
            }
        }
    });
}

// ==========================================================
// INICIALIZACIÓN DE EVENTOS AL CARGAR LA PÁGINA
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const activityFilter = document.getElementById('activityFilter');

    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        if (uploadStatus) uploadStatus.textContent = "Procesando archivos con el servidor...";
        hideError();
        globalPatients = {};

        const patientList = document.getElementById('patientList');
        if (patientList) patientList.innerHTML = '';

        try {
            for (const file of files) {
                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.endsWith('.zip')) {
                    await processZip(file);
                } else {
                    await processTextFile(file);
                }
            }
            
            finishPatientLoading(); 
            if (uploadStatus) uploadStatus.textContent = "¡Archivos cargados y analizados con éxito!";

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
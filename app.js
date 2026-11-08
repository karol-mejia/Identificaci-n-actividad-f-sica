let globalPatients = {};
let activePatientId = null;
let chartInstance = null;
const BACKEND_URL = 'https://backend-acelerometria.onrender.com';

function showError(message) {
    let errorDiv = document.getElementById('errorBanner');
    const container = document.querySelector('.main-container') || document.body;
    
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorBanner';
        errorDiv.style.cssText = 'background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca; font-size: 14px; font-weight: 500; line-height: 1.5;';
        container.insertBefore(errorDiv, container.firstChild);
    }
    errorDiv.innerHTML = `⚠️ <b>Error en la validación del archivo:</b> ${message}`;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('errorBanner');
    if (errorDiv) errorDiv.style.display = 'none';
}

function resetDashboard() {
    globalPatients = {};
    activePatientId = null;
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    const patientList = document.getElementById('patientList');
    if (patientList) patientList.innerHTML = '<p style="color: #6b7280; font-style: italic;">Cargando e inspeccionando estructura...</p>';
    
    const dash = document.getElementById('patientDashboardView');
    if (dash) dash.innerHTML = '';
}

async function processZip(file) {
    if (typeof JSZip === 'undefined') throw new Error("JSZip no está cargado.");
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    
    let errors = [];
    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('MACOSX') || relativePath.startsWith('.')) continue;
        const filename = relativePath.split('/').pop();
        if (filename && !filename.startsWith('.') && !filename.toLowerCase().includes('readme')) {
            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || lowerName.endsWith('.txtux') || !lowerName.includes('.')) {
                try {
                    const arrayBuffer = await zipEntry.async("arraybuffer");
                    const blob = new Blob([arrayBuffer]);
                    const extractedFile = new File([blob], filename);
                    await processTextFile(extractedFile);
                } catch (e) {
                    errors.push(`${filename}: ${e.message}`);
                }
            }
        }
    }
    if (errors.length > 0) {
        throw new Error(errors.join("<br>"));
    }
}

async function processTextFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    // 1. Paso de Inspección Previa
    const inspectResponse = await fetch(`${BACKEND_URL}/inspeccionar`, {
        method: 'POST',
        body: formData
    });
    
    const inspectData = await inspectResponse.json();
    if (!inspectResponse.ok) {
        throw new Error(inspectData.error || `No se logró identificar la estructura del archivo ${file.name}`);
    }

    // 2. Paso de Análisis y Procesamiento Completo
    const analyzeResponse = await fetch(`${BACKEND_URL}/analizar`, {
        method: 'POST',
        body: formData
    });

    const data = await analyzeResponse.json();
    if (!analyzeResponse.ok) {
        throw new Error(data.error || 'Error al procesar el archivo.');
    }

    if (data && data.id) {
        if (globalPatients[data.id]) {
            let previousMaxTime = 0;
            if (globalPatients[data.id].data && globalPatients[data.id].data.length > 0) {
                previousMaxTime = globalPatients[data.id].data[globalPatients[data.id].data.length - 1].time || 0;
            }

            if (previousMaxTime > 0 && data.data) {
                data.data.forEach(row => {
                    row.time = parseFloat((row.time + previousMaxTime).toFixed(1));
                });
            }

            globalPatients[data.id].totalRecords += data.totalRecords;
            globalPatients[data.id].score += data.score;
            globalPatients[data.id].data = globalPatients[data.id].data.concat(data.data);
            
            let t1 = parseInt(globalPatients[data.id].totalTime) || 0;
            let t2 = parseInt(data.totalTime) || 0;
            globalPatients[data.id].totalTime = `${t1 + t2} s`;

            if (data.activityBreakdown) {
                if (!globalPatients[data.id].activityBreakdown) {
                    globalPatients[data.id].activityBreakdown = [];
                }
                data.activityBreakdown.forEach(newAct => {
                    let existing = globalPatients[data.id].activityBreakdown.find(a => a.activity === newAct.activity);
                    if (existing) {
                        let et1 = parseInt(existing.time) || 0;
                        let et2 = parseInt(newAct.time) || 0;
                        existing.time = `${et1 + et2} s`;

                        let ep1 = parseInt(existing.points.replace('+', '').replace(' pts', '')) || 0;
                        let ep2 = parseInt(newAct.points.replace('+', '').replace(' pts', '')) || 0;
                        existing.points = `+${ep1 + ep2} pts`;
                    } else {
                        globalPatients[data.id].activityBreakdown.push(newAct);
                    }
                });
            }

            let totalSecs = parseInt(globalPatients[data.id].totalTime) || 1;
            let weightedSum = 0;
            const weights = { 'Sentado en la cama': 0.3, 'Sentado en una silla': 0.5, 'Acostado': 0.1, 'Deambulando': 1.0 };
            
            globalPatients[data.id].activityBreakdown.forEach(act => {
                let actSecs = parseInt(act.time) || 0;
                let pct = ((actSecs / totalSecs) * 100).toFixed(1);
                act.percentage = `${pct}%`;
                let w = weights[act.activity] || 0.5;
                weightedSum += actSecs * w;
            });

            globalPatients[data.id].activePercentage = parseFloat(((weightedSum / totalSecs) * 100).toFixed(1));
            globalPatients[data.id].badge = globalPatients[data.id].score > 1500 ? "Oro (Nivel Avanzado)" : (globalPatients[data.id].score > 800 ? "Plata (Nivel Intermedio)" : "Bronce (Nivel Iniciador)");
            globalPatients[data.id].lastMeta = inspectData.meta;
        } else {
            globalPatients[data.id] = data;
            globalPatients[data.id].lastMeta = inspectData.meta;
        }
    }
}

function finishPatientLoading() {
    const patientList = document.getElementById('patientList');
    if (!patientList) return;
    patientList.innerHTML = '';
    const patientIds = Object.keys(globalPatients);
    
    if (patientIds.length === 0) {
        patientList.innerHTML = '<p style="color: #6b7280; font-style: italic;">No hay registros cargados</p>';
        return;
    }

    patientIds.sort((a, b) => globalPatients[b].score - globalPatients[a].score);

    patientIds.forEach((id, index) => {
        const patient = globalPatients[id];
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; margin-bottom: 10px; border-radius: 8px; background: white; border: 1px solid #e5e7eb; cursor: pointer; transition: all 0.2s;';
        
        let rankBadge = index === 0 ? '🥇 1er Lugar' : (index === 1 ? '🥈 2do Lugar' : (index === 2 ? '🥉 3er Lugar' : `#${index + 1}`));

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>👤 ${patient.id}</strong>
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
            renderPatientDashboard(patient, index + 1, patientIds.length);
            drawChart(patient.data);
        });

        patientList.appendChild(item);
    });

    if (patientIds.length > 0) {
        activePatientId = patientIds[0];
        const firstItem = patientList.firstChild;
        if (firstItem) {
            firstItem.style.borderColor = '#3b82f6';
            renderPatientDashboard(globalPatients[activePatientId], 1, patientIds.length);
            drawChart(globalPatients[activePatientId].data);
        }
    }
}

function renderPatientDashboard(patient, rank, totalPatients) {
    let mainContainer = document.getElementById('patientDashboardView');
    
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.id = 'patientDashboardView';
        mainContainer.style.cssText = 'background: white; border-radius: 10px; padding: 25px; border: 1px solid #e5e7eb; margin-top: 20px;';
        const targetParent = document.querySelector('.main-container') || document.body;
        targetParent.appendChild(mainContainer);
    }

    let rowsHtml = '';
    let breakdown = patient.activityBreakdown || [];

    breakdown.forEach(row => {
        rowsHtml += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px; font-weight: 500; color: #334155;">${row.activity}</td>
                <td style="padding: 12px; color: #475569;">${row.time}</td>
                <td style="padding: 12px;"><span style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: bold;">${row.percentage}</span></td>
                <td style="padding: 12px; color: #16a34a; font-weight: bold;">${row.points}</td>
            </tr>
        `;
    });

    const meta = patient.lastMeta || {};
    const colsDet = meta.columnas_detectadas ? meta.columnas_detectadas.join(', ') : 'Automáticas';

    mainContainer.innerHTML = `
        <!-- Vista previa de estructura identificada (Requisito #6) -->
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 15px; margin-bottom: 20px; font-size: 13px; color: #1e40af;">
            <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">🔍 Estructura Identificada Automáticamente:</div>
            <div>• <b>Filas Procesadas:</b> ${meta.total_filas_validas || patient.totalRecords} de ${meta.total_filas_originales || patient.totalRecords}</div>
            <div>• <b>Encabezados / Columnas:</b> ${colsDet}</div>
            <div>• <b>Separador detectado:</b> <code>${meta.separador_utilizado || 'Autodetectado'}</code></div>
        </div>

        <h2 style="margin-top: 0; color: #1e293b; font-size: 22px;">Datos del Paciente: ${patient.id}</h2>
        <div style="font-size: 14px; color: #475569; margin-bottom: 20px; display: flex; gap: 30px; flex-wrap: wrap;">
            <div>Género: <b>${patient.gender}</b></div>
            <div>Registros Totales: <b>${patient.totalRecords}</b></div>
            <div>Tiempo Total: <b>${patient.totalTime}</b></div>
        </div>

        <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 10px;">Resumen de Actividades</h3>
        <div style="overflow-x: auto; margin-bottom: 25px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                <thead>
                    <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;">
                        <th style="padding: 10px;">Actividad</th>
                        <th style="padding: 10px;">Tiempo Estimado</th>
                        <th style="padding: 10px;">Porcentaje (%)</th>
                        <th style="padding: 10px;">Puntos Ganados</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; color: #1e293b; font-size: 16px; margin-bottom: 10px;">
                🏆 Sistema de Recompensas
            </div>
            <div style="font-size: 14px; color: #334155; line-height: 1.6;">
                Puntaje de Actividad: <b style="color: #16a34a;">${patient.score} Puntos</b> | Posición: <b>#${rank} de ${totalPatients}</b><br>
                Insignia Obtenida: 🏅 <b>${patient.badge}</b><br>
                Tiempo en Movimiento: <b>${patient.activePercentage}% del total</b>
            </div>
        </div>
    `;
}

function drawChart(records) {
    const ctx = document.getElementById('activityChart');
    if (!ctx || !records) return;

    const selectFilter = document.querySelector('.visualization-container select') || document.querySelector('select');
    
    let filteredRecords = records;
    if (selectFilter && selectFilter.value && selectFilter.value !== 'Todas las actividades') {
        const valMap = { 
            'Sentado en la cama': 1, 
            'Sentado en una silla': 2, 
            'Acostado': 3, 
            'Deambulando': 4
        };
        const targetCode = valMap[selectFilter.value];
        if (targetCode) {
            filteredRecords = records.filter(r => r.activityCode === targetCode);
        }
    }

    if (selectFilter && !selectFilter.dataset.listenerAdded) {
        selectFilter.addEventListener('change', () => {
            if (activePatientId && globalPatients[activePatientId]) {
                drawChart(globalPatients[activePatientId].data);
            }
        });
        selectFilter.dataset.listenerAdded = 'true';
    }

    const step = Math.max(1, Math.floor(filteredRecords.length / 600));
    const sampled = filteredRecords.filter((_, i) => i % step === 0);

    const labels = sampled.map(r => r.time);
    const frontal = sampled.map(r => r.accFrontal);
    const vertical = sampled.map(r => r.accVertical);
    const lateral = sampled.map(r => r.accLateral);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Acel. Frontal', data: frontal, borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0 },
                { label: 'Acel. Vertical', data: vertical, borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0 },
                { label: 'Acel. Lateral', data: lateral, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Tiempo Total Acumulado (s)' } },
                y: { title: { display: true, text: 'Aceleración (G)' } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');

    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        if (uploadStatus) uploadStatus.textContent = "Inspeccionando y procesando...";
        hideError();
        resetDashboard();

        try {
            for (const file of files) {
                if (file.name.toLowerCase().endsWith('.zip')) {
                    await processZip(file);
                } else {
                    await processTextFile(file);
                }
            }
            finishPatientLoading();
            if (uploadStatus) uploadStatus.textContent = "¡Estructura validada y cargada!";
        } catch (err) {
            showError(err.message);
            if (uploadStatus) uploadStatus.textContent = "Error en la estructura del archivo";
        } finally {
            e.target.value = '';
        }
    });
});
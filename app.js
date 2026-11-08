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
        errorDiv.style.cssText = 'background: #fee2e2; color: #b91c1c; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca; font-size: 14px; font-weight: 500;';
        container.insertBefore(errorDiv, container.firstChild);
    }
    errorDiv.innerHTML = `⚠️ <b>Aviso:</b> ${message}`;
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
    if (patientList) patientList.innerHTML = '<p style="color: #6b7280; font-style: italic;">Cargando archivos del ZIP...</p>';
    
    const dash = document.getElementById('patientDashboardView');
    if (dash) dash.innerHTML = '';

    const dataTableContainer = document.getElementById('activityDataTableContainer');
    if (dataTableContainer) dataTableContainer.innerHTML = '';
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
            if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || lowerName.endsWith('.txtux') || lowerName.endsWith('.json') || !lowerName.includes('.')) {
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

    const response = await fetch(`${BACKEND_URL}/analizar`, {
        method: 'POST',
        body: formData
    });

    const textRes = await response.text();
    let data;
    try {
        data = JSON.parse(textRes);
    } catch (err) {
        throw new Error(`Error en servidor (${response.status}): ${textRes.substring(0, 100)}`);
    }

    if (!response.ok) {
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
                    } else {
                        globalPatients[data.id].activityBreakdown.push(newAct);
                    }
                });
            }
        } else {
            globalPatients[data.id] = data;
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
            updateVisualizationsAndTable(patient.data);
        });

        patientList.appendChild(item);
    });

    if (patientIds.length > 0) {
        activePatientId = patientIds[0];
        const firstItem = patientList.firstChild;
        if (firstItem) {
            firstItem.style.borderColor = '#3b82f6';
            renderPatientDashboard(globalPatients[activePatientId], 1, patientIds.length);
            updateVisualizationsAndTable(globalPatients[activePatientId].data);
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

    const rfStatus = patient.randomForestMetrics && patient.randomForestMetrics.status ? patient.randomForestMetrics.status : 'Modelo Activo';

    mainContainer.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 15px; margin-bottom: 20px; font-size: 13px; color: #166534;">
            <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">🤖 Estado del Modelo Random Forest:</div>
            <div>• <b>Estado:</b> ${rfStatus}</div>
            <div>• <b>Columnas Procesadas:</b> Columnas 1, 2, 3, 4 y 9 verificadas.</div>
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

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; font-weight: bold; color: #1e293b; font-size: 16px; margin-bottom: 10px;">
                🏆 Sistema de Recompensas y Motivación
            </div>
            <div style="font-size: 14px; color: #334155; line-height: 1.6;">
                Puntaje Total: <b style="color: #16a34a;">${patient.score} Puntos</b> | Posición: <b>#${rank} de ${totalPatients}</b><br>
                Insignia: 🏅 <b>${patient.badge}</b><br>
                💬 <b>Mensaje de Motivación:</b> <i>"${patient.motivationMessage || '¡Sigue esforzándote!'}"</i>
            </div>
        </div>
    `;
}

function updateVisualizationsAndTable(records) {
    const selectFilter = document.querySelector('.visualization-container select') || document.querySelector('select');
    
    let filteredRecords = records;
    let selectedActivityName = 'Todas las actividades';

    if (selectFilter && selectFilter.value) {
        selectedActivityName = selectFilter.value;
        if (selectedActivityName !== 'Todas las actividades') {
            const valMap = { 
                'Sentado en la cama': 1, 
                'Sentado en una silla': 2, 
                'Acostado': 3, 
                'Deambulando': 4 
            };
            const targetCode = valMap[selectedActivityName];
            if (targetCode !== undefined) {
                filteredRecords = records.filter(r => r.activityCode === targetCode);
            }
        }
    }

    if (selectFilter && !selectFilter.dataset.listenerAdded) {
        selectFilter.addEventListener('change', () => {
            if (activePatientId && globalPatients[activePatientId]) {
                updateVisualizationsAndTable(globalPatients[activePatientId].data);
            }
        });
        selectFilter.dataset.listenerAdded = 'true';
    }

    drawChart(filteredRecords, selectedActivityName);
    renderActivityDataTable(filteredRecords, selectedActivityName);
}

function drawChart(records, activityName) {
    const ctx = document.getElementById('activityChart');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    if (!records || records.length === 0) {
        const parent = ctx.parentNode;
        let warningBox = document.getElementById('noDataChartMsg');
        if (!warningBox) {
            warningBox = document.createElement('div');
            warningBox.id = 'noDataChartMsg';
            warningBox.style.cssText = 'padding: 40px; text-align: center; color: #b91c1c; font-style: italic; background: #fee2e2; border-radius: 8px; margin-top: 10px; font-size: 14px;';
            parent.appendChild(warningBox);
        }
        warningBox.textContent = `⚠️ No hay datos disponibles para la actividad "${activityName}" en los registros de este archivo.`;
        ctx.style.display = 'none';
        return;
    } else {
        const warningBox = document.getElementById('noDataChartMsg');
        if (warningBox) warningBox.remove();
        ctx.style.display = 'block';
    }

    const step = Math.max(1, Math.floor(records.length / 600));
    const sampled = records.filter((_, i) => i % step === 0);

    const labels = sampled.map(r => r.time);
    const frontal = sampled.map(r => r.accFrontal);
    const vertical = sampled.map(r => r.accVertical);
    const lateral = sampled.map(r => r.accLateral);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Acel. Frontal (Col. 2)', data: frontal, borderColor: '#3b82f6', borderWidth: 1.5, pointRadius: 0 },
                { label: 'Acel. Vertical (Col. 3)', data: vertical, borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0 },
                { label: 'Acel. Lateral (Col. 4)', data: lateral, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Tiempo (Columna 1 - s)' } },
                y: { title: { display: true, text: 'Aceleración (G)' } }
            }
        }
    });
}

function renderActivityDataTable(records, activityName) {
    let dataTableContainer = document.getElementById('activityDataTableContainer');
    const mainContainer = document.querySelector('.main-container') || document.body;

    if (!dataTableContainer) {
        dataTableContainer = document.createElement('div');
        dataTableContainer.id = 'activityDataTableContainer';
        dataTableContainer.style.cssText = 'background: white; border-radius: 10px; padding: 25px; border: 1px solid #e5e7eb; margin-top: 20px;';
        mainContainer.appendChild(dataTableContainer);
    }

    if (!records || records.length === 0) {
        dataTableContainer.innerHTML = `
            <h3 style="color: #1e293b; font-size: 18px; margin-top: 0;">Registros de la Actividad: ${activityName}</h3>
            <div style="padding: 20px; text-align: center; color: #b91c1c; background: #fee2e2; border-radius: 6px; font-size: 14px;">
                ⚠️ No hay registros reales disponibles para esta actividad.
            </div>
        `;
        return;
    }

    const displayRows = records.slice(0, 100);
    let rowsHtml = '';
    const activityLabelsMap = { 
        1: 'Sentado en la cama', 
        2: 'Sentado en una silla', 
        3: 'Acostado', 
        4: 'Deambulando' 
    };

    displayRows.forEach(r => {
        let actText = activityLabelsMap[r.activityCode] || `Código ${r.activityCode}`;
        rowsHtml += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px; color: #334155;">${r.time} s</td>
                <td style="padding: 10px; color: #3b82f6;">${r.accFrontal}</td>
                <td style="padding: 10px; color: #10b981;">${r.accVertical}</td>
                <td style="padding: 10px; color: #f59e0b;">${r.accLateral}</td>
                <td style="padding: 10px; font-weight: 500; color: #475569;">${actText}</td>
            </tr>
        `;
    });

    dataTableContainer.innerHTML = `
        <h3 style="color: #1e293b; font-size: 18px; margin-top: 0;">Registros Reales: ${activityName}</h3>
        <p style="font-size: 13px; color: #64748b; margin-bottom: 15px;">
            Mostrando <b>${displayRows.length}</b> de <b>${records.length}</b> registros reales (Columnas 1, 2, 3, 4 y 9).
        </p>
        <div style="overflow-x: auto; max-height: 350px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; background: #f8fafc; position: sticky; top: 0;">
                        <th style="padding: 10px;">Tiempo (Col. 1)</th>
                        <th style="padding: 10px;">Acel. Frontal (Col. 2)</th>
                        <th style="padding: 10px;">Acel. Vertical (Col. 3)</th>
                        <th style="padding: 10px;">Acel. Lateral (Col. 4)</th>
                        <th style="padding: 10px;">Actividad (Col. 9)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const uploadStatus = document.getElementById('uploadStatus');

    if (!fileInput) return;

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        if (uploadStatus) uploadStatus.textContent = "Procesando datos reales y modelo RF...";
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
            if (uploadStatus) uploadStatus.textContent = "¡Procesamiento completado con éxito!";
        } catch (err) {
            showError(err.message);
            if (uploadStatus) uploadStatus.textContent = "Error en el procesamiento";
        } finally {
            e.target.value = '';
        }
    });
});
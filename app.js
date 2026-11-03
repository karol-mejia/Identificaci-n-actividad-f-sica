// ==========================================================
// VARIABLES GLOBALES DE LA APLICACIÓN
// ==========================================================
let globalPatients = {};
let activePatientId = null;
let chartInstance = null;

// ==========================================================
// GESTIÓN DE ERRORES EN INTERFAZ (Versión Segura)
// ==========================================================
function showError(message) {
    let errorDiv = document.getElementById('errorBanner');
    const container = document.querySelector('.main-container') || document.body;
    
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'errorBanner';
        errorDiv.style.cssText = 'background: #fee2e2; color: #b91c1c; padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #fecaca; font-size: 14px;';
        container.prepend(errorDiv); // Usar prepend evita fallos de nodos hijos
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
        throw new Error("La librería JSZip no está cargada.");
    }
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    
    for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir || relativePath.includes('MACOSX') || relativePath.startsWith('.')) continue;
        const filename = relativePath.split('/').pop();
        if (filename && !filename.startsWith('.') && !filename.toLowerCase().includes('readme')) {
            const lowerName = filename.toLowerCase();
            if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt') || !lowerName.includes('.')) {
                try {
                    const text = await zipEntry.async("string");
                    if (text.trim().length > 0) {
                        const blob = new Blob([text], { type: 'text/plain' });
                        const extractedFile = new File([blob], filename, { type: 'text/plain' });
                        await processTextFile(extractedFile);
                    }
                } catch (e) {
                    console.warn(`Error leyendo ${filename}:`, e);
                }
            }
        }
    }
}

async function processTextFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('https://backend-acelerometria.onrender.com/analizar', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Error en el servidor');
        const data = await response.json();
        if (data && data.id) {
            globalPatients[data.id] = data;
        }
    } catch (err) {
        console.warn('Archivo omitido:', err);
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
            renderPatientDashboard(patient, index + 1, patientIds.length);
            drawChart(patient.data);
        });

        patientList.appendChild(item);
    });

    if (patientIds.length > 0) {
        activePatientId = patientIds[0];
        const firstItem = patientList.firstChild;
        if (firstItem) firstItem.style.borderColor = '#3b82f6';
        renderPatientDashboard(globalPatients[activePatientId], 1, patientIds.length);
        drawChart(globalPatients[activePatientId].data);
    }
}

function renderPatientDashboard(patient, rank, totalPatients) {
    const mainContainer = document.querySelector('.main-container') || document.body;
    let dash = document.getElementById('patientDashboardView');

    if (!dash) {
        dash = document.createElement('div');
        dash.id = 'patientDashboardView';
        dash.style.cssText = 'background: white; border-radius: 10px; padding: 25px; border: 1px solid #e5e7eb; margin-top: 20px;';
        mainContainer.appendChild(dash);
    }

    let rowsHtml = '';
    if (patient.activityBreakdown && patient.activityBreakdown.length > 0) {
        patient.activityBreakdown.forEach(row => {
            rowsHtml += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 12px; font-weight: 500; color: #334155;">${row.activity}</td>
                    <td style="padding: 12px; color: #475569;">${row.time}</td>
                    <td style="padding: 12px;"><span style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 13px; font-weight: bold;">${row.percentage}</span></td>
                    <td style="padding: 12px; color: #16a34a; font-weight: bold;">${row.points}</td>
                </tr>
            `;
        });
    }

    dash.innerHTML = `
        <h2 style="margin-top: 0; color: #1e293b; font-size: 22px;">Datos del Paciente: ${patient.id}</h2>
        <div style="font-size: 14px; color: #475569; margin-bottom: 20px; display: flex; gap: 30px;">
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
                Tiempo en Movimiento (Deambulando): <b>${patient.activePercentage}% del total</b>
            </div>
        </div>
    `;
}

function drawChart(records) {
    const ctx = document.getElementById('activityChart');
    if (!ctx || !records) return;

    const step = Math.max(1, Math.floor(records.length / 600));
    const sampled = records.filter((_, i) => i % step === 0);

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
                x: { title: { display: true, text: 'Tiempo (s)' } },
                y: { title: { display: true, text: 'Aceleración' } }
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

        if (uploadStatus) uploadStatus.textContent = "Procesando archivos...";
        hideError();
        globalPatients = {};

        try {
            for (const file of files) {
                if (file.name.toLowerCase().endsWith('.zip')) {
                    await processZip(file);
                } else {
                    await processTextFile(file);
                }
            }
            finishPatientLoading();
            if (uploadStatus) uploadStatus.textContent = "¡Cargado con éxito!";
        } catch (err) {
            showError(`Error al procesar el archivo: ${err.message}`);
            if (uploadStatus) uploadStatus.textContent = "Error en la carga";
        }
    });
});
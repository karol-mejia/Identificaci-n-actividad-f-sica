// Renderizado dinámico de gráficas individuales para las 4 actividades
const actividadesConfig = [
    { code: 1, title: "Sentado en una cama", containerId: "chart-cama", emptyMsgId: "msg-cama" },
    { code: 2, title: "Sentado en una silla", containerId: "chart-silla", emptyMsgId: "msg-silla" },
    { code: 3, title: "Acostado", containerId: "chart-acostado", emptyMsgId: "msg-acostado" },
    { code: 4, title: "Deambulando", containerId: "chart-deambulando", emptyMsgId: "msg-deambulando" }
];

let chartInstances = {};

function renderizarGraficasActividades(registrosReales) {
    actividadesConfig.forEach(act => {
        // Filtrar registros exactos asignados a la actividad actual (Cols 1, 2, 3, 4)
        const datosFiltrados = registrosReales.filter(r => r.activityCode === act.code);
        
        const canvasElem = document.getElementById(act.containerId);
        const msgElem = document.getElementById(act.emptyMsgId);

        // Si la actividad no tiene registros, mostrar mensaje explícito sin generar gráfica ficticia
        if (!datosFiltrados || datosFiltrados.length === 0) {
            if (canvasElem) canvasElem.style.display = "none";
            if (msgElem) {
                msgElem.style.display = "block";
                msgElem.innerText = `No hay datos disponibles para la actividad: ${act.title}.`;
            }
            return;
        }

        // Si existen registros, mostrar el canvas y construir la gráfica real
        if (canvasElem) canvasElem.style.display = "block";
        if (msgElem) msgElem.style.display = "none";

        const timestamps = datosFiltrados.map(d => d.time);
        const accX = datosFiltrados.map(d => d.accFrontal);
        const accY = datosFiltrados.map(d => d.accVertical);
        const accZ = datosFiltrados.map(d => d.accLateral);

        // Destruir instancia previa de Chart.js si existe
        if (chartInstances[act.code]) {
            chartInstances[act.code].destroy();
        }

        const ctx = canvasElem.getContext('2d');
        chartInstances[act.code] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'Acc Frontal (G)', data: accX, borderColor: '#e74c3c', fill: false, pointRadius: 1 },
                    { label: 'Acc Vertical (G)', data: accY, borderColor: '#2ecc71', fill: false, pointRadius: 1 },
                    { label: 'Acc Lateral (G)', data: accZ, borderColor: '#3498db', fill: false, pointRadius: 1 }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: `Acelerometría - ${act.title}` }
                },
                scales: {
                    x: { title: { display: true, text: 'Tiempo (s)' } },
                    y: { title: { display: true, text: 'Aceleración (G)' } }
                }
            }
        });
    });
}

function actualizarDashboardUI(jsonData) {
    // 1. Puntuación y Mensajes de Motivación Reales
    document.getElementById("scoreValue").innerText = jsonData.score;
    document.getElementById("userBadge").innerText = jsonData.badge;
    document.getElementById("motivationText").innerText = jsonData.motivationMessage;

    // 2. Desglose de Tabla de Datos
    const tbody = document.getElementById("tablaDesgloseBody");
    tbody.innerHTML = "";
    jsonData.activityBreakdown.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.activity}</td>
            <td>${item.records}</td>
            <td>${item.time}</td>
            <td>${item.percentage}</td>
            <td><strong>${item.points}</strong></td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Generar Gráficas Individuales con datos correspondientes
    renderizarGraficasActividades(jsonData.data);
}
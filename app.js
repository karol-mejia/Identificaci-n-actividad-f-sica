// Extraer el género del nombre del archivo (soporta nombres con o sin extensión)
function extractGender(filename) {
    const cleanName = filename.replace('.csv', '').trim();
    const lastChar = cleanName.slice(-1).toUpperCase();
    
    if (lastChar === 'F') return 'Femenino';
    if (lastChar === 'M') return 'Masculino';
    
    return 'Desconocido';
}

// Procesar archivo ZIP flexible (admite subcarpetas y archivos sin extensión .csv)
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

            // Procesar solo si es un archivo con nombre válido (ej. d1p01M, d2p01F.csv, etc.)
            if (filename && !filename.startsWith('.')) {
                const fileData = await zipEntry.async("string");
                
                // Verificar que el contenido no esté vacío
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
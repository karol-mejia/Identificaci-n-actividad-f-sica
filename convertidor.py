import os
import re
import json
import glob
import pandas as pd

def decodificar_texto(file_bytes):
    encodings = ['utf-16', 'utf-16le', 'utf-16be', 'utf-8', 'latin-1', 'cp1252']
    for enc in encodings:
        try:
            text = file_bytes.decode(enc)
            if text and len(text.strip()) > 0:
                if enc in ['utf-16', 'utf-16le', 'utf-16be', 'utf-8']:
                    return text
                if text.count('\x00') < (len(text) * 0.05):
                    return text
        except Exception:
            continue
    return file_bytes.decode('latin-1', errors='ignore')

def procesar_archivo_a_json(filepath):
    filename = os.path.basename(filepath)
    clean_filename = os.path.splitext(filename)[0]
    b_lower = filename.lower()

    if 'acostada' in b_lower:
        activity_code = 3
        act_name = 'Acostado'
    elif 'sentada' in b_lower:
        activity_code = 2
        act_name = 'Sentado en una silla'
    elif 'bipeda' in b_lower or 'bípeda' in b_lower:
        activity_code = 2
        act_name = 'Bípeda / Estática'
    elif 'marcha' in b_lower or 'caminar' in b_lower:
        activity_code = 4
        act_name = 'Deambulando'
    else:
        activity_code = 1
        act_name = 'Sentado en la cama'

    words = re.split(r'[_\s-]+', clean_filename)
    clean_words = [w.strip() for w in words if w.lower() not in ['sentada', 'bipeda', 'bípeda', 'marcha', 'acostada', 'caminar', 'datos'] and not w.isdigit()]
    patient_id = " ".join(clean_words).strip().title()
    if not patient_id:
        patient_id = f"Paciente {clean_filename.upper()}"

    try:
        with open(filepath, 'rb') as f:
            file_bytes = f.read()
    except Exception as e:
        print(f"❌ No se pudo abrir {filename}: {e}")
        return None

    text_data = decodificar_texto(file_bytes)
    lines = text_data.splitlines()

    data_rows = []
    for line in lines:
        line_str = line.strip()
        if not line_str or any(w in line_str.lower() for w in ['time', 't(s)', 'acc', 'gyro', 'roll', 'pitch', 'yaw']):
            continue
        
        normalized = line_str.replace(',', '.')
        nums = re.findall(r'[-+]?\d*\.?\d+', normalized)
        
        if len(nums) >= 2:
            try:
                t_val = float(nums[0])
                ax = float(nums[1])
                ay = float(nums[2]) if len(nums) > 2 else ax
                az = float(nums[3]) if len(nums) > 3 else ax
                
                code_to_use = activity_code
                if len(nums) >= 9:
                    try:
                        code_to_use = int(float(nums[8]))
                    except:
                        code_to_use = activity_code

                data_rows.append({
                    "time": t_val,
                    "accFrontal": ax,
                    "accVertical": ay,
                    "accLateral": az,
                    "activityCode": code_to_use
                })
            except Exception:
                continue

    if not data_rows:
        return None

    df = pd.DataFrame(data_rows)
    total_records = len(df)
    
    t_min = df['time'].min()
    t_max = df['time'].max()
    raw_duration = t_max - t_min

    if raw_duration > 10000:
        total_time = int(round(raw_duration / 1000.0))
        df['time'] = ((df['time'] - t_min) / 1000.0).round(1)
    elif raw_duration > 0:
        total_time = int(round(raw_duration))
        df['time'] = (df['time'] - t_min).round(1)
    else:
        total_time = max(1, int(round(total_records / 50.0)))
        df['time'] = [round(i / 50.0, 1) for i in range(total_records)]

    total_time = max(1, total_time)
    pts_config = {1: 5, 2: 5, 3: 2, 4: 30}
    pts_per_sec = pts_config.get(activity_code, 5)
    points_earned = int(total_time * (pts_per_sec / 10.0) * 10)

    json_data = {
        "id": patient_id,
        "gender": "Femenino" if clean_filename[-1].upper() == 'F' else "Masculino",
        "totalRecords": total_records,
        "totalTime": f"{total_time} s",
        "score": points_earned,
        "badge": "Oro (Nivel Avanzado)" if points_earned > 1500 else ("Plata (Nivel Intermedio)" if points_earned > 800 else "Bronce (Nivel Iniciador)"),
        "activePercentage": 100.0,
        "motivationMessage": "¡Gran trabajo! Tus datos reales de acelerometría se han procesado correctamente.",
        "activityBreakdown": [{
            "activity": act_name,
            "time": f"{total_time} s",
            "percentage": "100.0%",
            "points": f"+{points_earned} pts",
            "code": activity_code
        }],
        "data": df.to_dict(orient='records')
    }

    return json_data

def convertir_carpeta():
    output_dir = "json_convertidos"
    os.makedirs(output_dir, exist_ok=True)
    
    # Búsqueda recursiva en todas las subcarpetas (S1_Dataset, S2_Dataset, etc.)
    extensiones = ['*.txt', '*.txtux', '*.csv', '*.dat']
    archivos = []
    for ext in extensiones:
        archivos.extend(glob.glob(f"**/{ext}", recursive=True))
    
    print(f"📦 Encontrados {len(archivos)} archivos en total dentro de las subcarpetas...")

    pacientes_unificados = {}

    for f in archivos:
        res = procesar_archivo_a_json(f)
        if res:
            pid = res["id"]
            if pid not in pacientes_unificados:
                pacientes_unificados[pid] = res
            else:
                p = pacientes_unificados[pid]
                p["totalRecords"] += res["totalRecords"]
                p["score"] += res["score"]
                p["activityBreakdown"].extend(res["activityBreakdown"])
                
                prev_max_time = p["data"][-1]["time"] if p["data"] else 0
                for row in res["data"]:
                    row["time"] = round(row["time"] + prev_max_time, 1)
                p["data"].extend(res["data"])

    for pid, pdata in pacientes_unificados.items():
        filename_json = f"{re.sub(r'[^a-zA-Z0-9_]', '_', pid)}.json"
        ruta_salida = os.path.join(output_dir, filename_json)
        with open(ruta_salida, 'w', encoding='utf-8') as out:
            json.dump(pdata, out, ensure_ascii=False, indent=2)
        print(f"✅ Generado: {filename_json}")

    print(f"\n🎉 ¡Proceso terminado! La carpeta '{output_dir}' ya ha sido creada con los archivos JSON.")

if __name__ == "__main__":
    convertir_carpeta()
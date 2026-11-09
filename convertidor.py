import os
import re
import json
import glob
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

def decodificar_texto(file_bytes):
    encodings = ['utf-16', 'utf-16le', 'utf-16be', 'utf-8', 'latin-1', 'cp1252']
    for enc in encodings:
        try:
            text = file_bytes.decode(enc)
            if text and len(text.strip()) > 8:
                return text
        except Exception:
            continue
    return file_bytes.decode('latin-1', errors='ignore')

def procesar_archivo_a_df(filepath):
    filename = os.path.basename(filepath)
    clean_filename = os.path.splitext(filename)[0]
    
    # Determinar el género basado en la nomenclatura del paciente (ej. d1p01M -> M = Masculino, F = Femenino)[cite: 11]
    genero = "Femenino"
    if clean_filename.upper().endswith('M'):
        genero = "Masculino"
    elif clean_filename.upper().endswith('F'):
        genero = "Femenino"

    try:
        with open(filepath, 'rb') as f:
            file_bytes = f.read()
    except Exception:
        return None
    
    text_data = decodificar_texto(file_bytes)
    lines = text_data.splitlines()
    
    data_rows = []
    for line in lines:
        line_str = line.strip()
        if not line_str or any(w in line_str.lower() for w in ['time', 't(s)', 'acc', 'gyro', 'roll', 'pitch', 'yaw', 'readme']):
            continue
        
        normalized = line_str.replace(',', '.')
        nums = re.findall(r'[-+]?\d*\.?\d+', normalized)
        
        # Extracción estricta asegurando tener al menos hasta la Columna 9 (índice 8)
        if len(nums) >= 9:
            try:
                t_val = float(nums[0])   # Columna 1: tiempo (s)
                ax = float(nums[1])      # Columna 2: aceleración frontal (G)
                ay = float(nums[2])      # Columna 3: aceleración vertical (G)
                az = float(nums[3])      # Columna 4: aceleración lateral (G)
                act_code = int(float(nums[8])) # Columna 9: etiqueta de actividad
                
                # Considerar únicamente códigos de actividad válidos (1, 2, 3, 4)
                if act_code in [1, 2, 3, 4]:
                    data_rows.append({
                        "time": t_val,
                        "accFrontal": ax,
                        "accVertical": ay,
                        "accLateral": az,
                        "activityCode": act_code
                    })
            except Exception:
                continue

    if not data_rows:
        return None
    
    df = pd.DataFrame(data_rows)
    return clean_filename, genero, df

def entrenar_evaluar_random_forest(df_total):
    print("\n--- Entrenamiento y Evaluación del Random Forest (Columnas 2, 3, 4 y 9) ---")
    
    X = df_total[['accFrontal', 'accVertical', 'accLateral']]
    y = df_total['activityCode']
    
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    y_pred = clf.predict(X_test)
    
    print("\n[Reporte de Clasificación]")
    print(classification_report(y_test, y_pred, target_names=[
        "Sentado en una cama (1)",
        "Sentado en una silla (2)",
        "Acostado (3)",
        "Deambulando (4)"
    ]))
    
    print("\n[Matriz de Confusión]")
    cm = confusion_matrix(y_test, y_pred, labels=[1, 2, 3, 4])
    print(cm)
    
    return clf

def convertir_dataset():
    output_dir = "json_convertidos"
    os.makedirs(output_dir, exist_ok=True)
    
    # Buscar archivos dentro de las carpetas estándar S1_Dataset y S2_Dataset[cite: 11]
    extensiones = ['*.txt', '*.txtux', '*.csv', '*.dat']
    archivos = []
    for ext in extensiones:
        archivos.extend(glob.glob(f"**/S1_Dataset/{ext}", recursive=True))
        archivos.extend(glob.glob(f"**/S2_Dataset/{ext}", recursive=True))
        
    if not archivos:
        for ext in extensiones:
            archivos.extend([f for f in glob.glob(f"**/{ext}", recursive=True) if 'json_convertidos' not in f and 'README' not in f.upper()])

    print(f"Archivos de pacientes encontrados en el dataset: {len(archivos)}")
    
    todos_los_dfs = []
    archivos_procesados = []
    
    for f in archivos:
        res = procesar_archivo_a_df(f)
        if res:
            p_id, genero, df_file = res
            todos_los_dfs.append(df_file)
            archivos_procesados.append((p_id, genero, df_file))
            
    if not todos_los_dfs:
        print("No se encontraron registros válidos con las columnas requeridas.")
        return
    
    df_global = pd.concat(todos_los_dfs, ignore_index=True)
    
    # Entrenar el modelo con los datos reales
    modelo_rf = entrenar_evaluar_random_forest(df_global)
    
    nombres_actividades = {
        1: "Sentado en una cama",
        2: "Sentado en una silla",
        3: "Acostado",
        4: "Deambulando"
    }
    
    pts_config = {1: 5, 2: 5, 3: 2, 4: 30}
    
    # Generar un archivo JSON independiente por cada paciente
    for p_id, genero, df_paciente in archivos_procesados:
        X_pac = df_paciente[['accFrontal', 'accVertical', 'accLateral']]
        df_paciente['predictedCode'] = modelo_rf.predict(X_pac)
        
        total_records = len(df_paciente)
        total_time_s = max(1, int(df_paciente['time'].max() - df_paciente['time'].min())) if total_records > 1 else 1
        
        score_total = 0
        breakdown = []
        
        for code in [1, 2, 3, 4]:
            sub_df = df_paciente[df_paciente['predictedCode'] == code]
            rec_count = len(sub_df)
            if rec_count > 0:
                name_act = nombres_actividades[code]
                duration_act = int((rec_count / total_records) * total_time_s)
                pts_act = int(duration_act * (pts_config[code] / 10.0))
                score_total += pts_act
                
                breakdown.append({
                    "code": code,
                    "activity": name_act,
                    "records": rec_count,
                    "time": f"{duration_act} s",
                    "percentage": f"{round((rec_count / total_records) * 100, 1)}%",
                    "points": f"+{pts_act} pts"
                })
        
        if score_total > 1000:
            msg = "¡Excelente nivel de movimiento! Tus registros de acelerometría reflejan un gran desempeño dinámico."
            badge = "Oro (Nivel Avanzado)"
        elif score_total > 400:
            msg = "Buen equilibrio de actividad física. Continúa manteniendo una rutina constante."
            badge = "Plata (Nivel Intermedio)"
        else:
            msg = "Registro procesado con éxito. Se recomienda incrementar los periodos de deambulación."
            badge = "Bronce (Nivel Iniciador)"

        json_output = {
            "id": p_id,
            "gender": genero,
            "totalRecords": total_records,
            "totalTime": f"{total_time_s} s",
            "score": score_total,
            "badge": badge,
            "motivationMessage": msg,
            "activityBreakdown": breakdown,
            "data": df_paciente[['time', 'accFrontal', 'accVertical', 'accLateral', 'predictedCode']].rename(
                columns={'predictedCode': 'activityCode'}
            ).to_dict(orient='records')
        }
        
        nombre_limpio = re.sub(r'[^a-zA-Z0-9_]', '_', p_id)
        ruta_salida = os.path.join(output_dir, f"{nombre_limpio}.json")
        with open(ruta_salida, 'w', encoding='utf-8') as out:
            json.dump(json_output, out, ensure_ascii=False, indent=2)

    print(f"\n¡Proceso finalizado con éxito! Se han generado todos los archivos JSON independientes en '{output_dir}'.")

if __name__ == '__main__':
    convertir_dataset()
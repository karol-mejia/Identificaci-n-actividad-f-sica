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
            if text and len(text.strip()) > 0:
                return text
        except Exception:
            continue
    return file_bytes.decode('latin-1', errors='ignore')

def procesar_archivo_a_df(filepath):
    filename = os.path.basename(filepath)
    clean_filename = os.path.splitext(filename)[0]
    
    if 'readme' in filename.lower():
        return None
    
    # Determinar género por el sufijo del nombre del archivo (M o F)
    genero = "Masculino" if filename.upper().endswith('M') else "Femenino"

    try:
        with open(filepath, 'rb') as f:
            file_bytes = f.read()
    except Exception as e:
        print(f"  [Error al abrir] {filename}: {e}")
        return None
    
    text_data = decodificar_texto(file_bytes)
    lines = text_data.splitlines()
    
    # Mapeo por defecto según el nombre del archivo
    b_lower = filename.lower()
    if 'acostad' in b_lower:
        default_code = 3
    elif 'silla' in b_lower or 'sentad' in b_lower:
        default_code = 2
    elif any(w in b_lower for w in ['marcha', 'caminar', 'deambula']):
        default_code = 4
    else:
        default_code = 1

    data_rows = []
    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        
        # Ignorar cabeceras típicas
        if any(w in line_str.lower() for w in ['t(s)', 'gyro', 'roll', 'pitch', 'yaw']):
            continue
        
        normalized = line_str.replace(',', '.')
        nums = re.findall(r'[-+]?\d*\.?\d+', normalized)
        
        # Si la línea tiene al menos 4 números, los aprovechamos
        if len(nums) >= 4:
            try:
                t_val = float(nums[0])   # Tiempo
                ax = float(nums[1])      # Aceleración frontal
                ay = float(nums[2])      # Aceleración vertical
                az = float(nums[3])      # Aceleración lateral
                
                # Columna 9 (índice 8) si existe
                act_code = default_code
                if len(nums) >= 9:
                    try:
                        val_col9 = int(float(nums[8]))
                        if val_col9 in [1, 2, 3, 4]:
                            act_code = val_col9
                    except:
                        pass
                
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
        print(f"  [Sin datos válidos] {filename}")
        return None
    
    df = pd.DataFrame(data_rows)
    return clean_filename, genero, df

def entrenar_evaluar_random_forest(df_total):
    print("\n--- Entrenamiento del Random Forest con datos reales ---")
    X = df_total[['accFrontal', 'accVertical', 'accLateral']]
    y = df_total['activityCode']
    
    clases_presentes = sorted(y.unique())
    nombres_todas_las_clases = {
        1: "Sentado en una cama (1)",
        2: "Sentado en una silla (2)",
        3: "Acostado (3)",
        4: "Deambulando (4)"
    }
    target_names = [nombres_todas_las_clases[c] for c in clases_presentes]
    
    use_stratify = y if y.value_counts().min() >= 2 else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=use_stratify
    )
    
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    y_pred = clf.predict(X_test)
    
    print("\n[Reporte de Clasificación]")
    print(classification_report(
        y_test, 
        y_pred, 
        labels=clases_presentes, 
        target_names=target_names, 
        zero_division=0
    ))
    
    print("\n[Matriz de Confusión]")
    cm = confusion_matrix(y_test, y_pred, labels=[1, 2, 3, 4])
    print(cm)
    
    return clf

def convertir_dataset():
    output_dir = "json_convertidos"
    os.makedirs(output_dir, exist_ok=True)
    
    archivos = []
    # Recorrer de forma absoluta S1_Dataset y S2_Dataset buscando cualquier archivo de paciente
    for base_dir in ["S1_Dataset", "S2_Dataset"]:
        if os.path.exists(base_dir):
            for root, dirs, files in os.walk(base_dir):
                for file in files:
                    if 'readme' not in file.lower():
                        archivos.append(os.path.join(root, file))

    print(f"Total de archivos encontrados en las carpetas: {len(archivos)}")
    
    todos_los_dfs = []
    archivos_procesados = []
    
    for f in archivos:
        res = procesar_archivo_a_df(f)
        if res:
            p_id, genero, df_file = res
            todos_los_dfs.append(df_file)
            archivos_procesados.append((p_id, genero, df_file))
            
    print(f"Archivos procesados con éxito: {len(archivos_procesados)}")
    
    if not todos_los_dfs:
        print("Error: No se encontraron registros válidos.")
        return
    
    df_global = pd.concat(todos_los_dfs, ignore_index=True)
    modelo_rf = entrenar_evaluar_random_forest(df_global)
    
    nombres_actividades = {
        1: "Sentado en una cama",
        2: "Sentado en una silla",
        3: "Acostado",
        4: "Deambulando"
    }
    pts_config = {1: 5, 2: 5, 3: 2, 4: 30}
    
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
        
        ruta_salida = os.path.join(output_dir, f"{p_id}.json")
        with open(ruta_salida, 'w', encoding='utf-8') as out:
            json.dump(json_output, out, ensure_ascii=False, indent=2)

    print(f"\n¡Proceso finalizado! Se han guardado exitosamente los archivos JSON en '{output_dir}'.")
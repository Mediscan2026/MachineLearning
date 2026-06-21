import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import cv2
import pandas as pd
import easyocr
import re
from difflib import get_close_matches, SequenceMatcher
from werkzeug.utils import secure_filename
import base64
import numpy as np

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = 'uploads'

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'bmp'}

CSV_PATH = os.path.join(os.path.dirname(__file__), 'data.csv')

noms_list = []
df = None

if os.path.exists(CSV_PATH):
    df = pd.read_csv(CSV_PATH)
    df['nom'] = df['nom'].astype(str).str.lower().str.strip()
    noms_list = df['nom'].tolist()

reader = None

def get_reader():
    global reader
    if reader is None:
        reader = easyocr.Reader(['ar', 'en'], gpu=False)
    return reader

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def nettoyer_ocr(mot):
    mot = mot.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
    mot = mot.lower().strip()
    mot = mot.replace('0', 'o').replace('1', 'l').replace('5', 's').replace('8', 'b')
    mot = re.sub(r'(\d)[o]', r'\g<1>0', mot)
    mot = re.sub(r'[l](\d)', r'1\g<1>', mot)
    mot = re.sub(r'[^a-z0-9-]', '', mot)
    return mot

def extraire_dosage(texte_complet, text_list):
    texte_corrige = (texte_complet
                     .replace('O', '0').replace('o', '0')
                     .replace('I', '1').replace('l', '1'))
    pattern = r'(\d+[\.,]?\d*)\s*(mg|ml|g|µg|ui)'
    match = re.search(pattern, texte_corrige, re.IGNORECASE)
    if match:
        return f"{match.group(1).replace(',', '.')}{match.group(2).lower()}"
    for i, mot in enumerate(text_list):
        if mot.isdigit() and int(mot) > 5:
            if i + 1 < len(text_list) and 'mg' in text_list[i + 1].lower():
                return f"{mot}mg"
    return None

def read_texte_from_array(img):
    r = get_reader()
    result = r.readtext(img)
    text = [txt for bbox, txt, conf in result if conf > 0.2]

    if not text:
        return {
            "status": "error",
            "message": "Texte non lisible sur l'image",
            "nom": None,
            "dosage": None,
            "raw_text": []
        }

    texte_complet = " ".join(text)
    dosage = extraire_dosage(texte_complet, text)

    if not noms_list:
        return {
            "status": "no_db",
            "message": "Base de données non chargée — placez data.csv à côté de app.py",
            "nom": None,
            "dosage": dosage,
            "raw_text": text
        }

    candidats = []

    for mot in text:
        if len(mot) < 4:
            continue
        mot_clean = nettoyer_ocr(mot)

        if mot_clean in noms_list:
            row = df[df['nom'] == mot_clean].iloc[0] if df is not None else None
            extra = _extra_info(row)
            return {
                "status": "found",
                "message": "Médicament identifié",
                "nom": mot_clean,
                "dosage": dosage,
                "raw_text": text,
                "extra": extra,
                "confidence": 1.0
            }

        matches = get_close_matches(mot_clean, noms_list, n=1, cutoff=0.8)
        if matches:
            score = SequenceMatcher(None, mot_clean, matches[0]).ratio()
            row = df[df['nom'] == matches[0]].iloc[0] if df is not None else None
            candidats.append((score, matches[0], row))

    if candidats:
        candidats.sort(reverse=True, key=lambda x: x[0])
        best_score, best_nom, best_row = candidats[0]
        extra = _extra_info(best_row)
        return {
            "status": "found",
            "message": "Médicament identifié (correspondance approximative)",
            "nom": best_nom,
            "dosage": dosage,
            "raw_text": text,
            "extra": extra,
            "confidence": round(best_score, 2)
        }

    return {
        "status": "not_found",
        "message": "Médicament non trouvé dans la base de données",
        "nom": None,
        "dosage": dosage,
        "raw_text": text,
        "extra": None,
        "confidence": 0
    }

def _extra_info(row):
    if row is None:
        return {}
    try:
        return {k: str(v) for k, v in row.items() if k != 'nom' and str(v) not in ('nan', '')}
    except Exception:
        return {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/scan', methods=['POST'])
def scan():
    if 'file' in request.files:
        file = request.files['file']
        if file.filename == '':
            return jsonify({"status": "error", "message": "Aucun fichier sélectionné"}), 400
        if not allowed_file(file.filename):
            return jsonify({"status": "error", "message": "Format non supporté (jpg, png, webp…)"}), 400

        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    elif request.is_json and 'image' in request.json:
        data_url = request.json['image']
        header, encoded = data_url.split(',', 1)
        img_data = base64.b64decode(encoded)
        file_bytes = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    else:
        return jsonify({"status": "error", "message": "Aucune image fournie"}), 400

    if img is None:
        return jsonify({"status": "error", "message": "Impossible de lire l'image"}), 400

    result = read_texte_from_array(img)
    return jsonify(result)

@app.route('/api/status')
def status():
    return jsonify({
        "db_loaded": len(noms_list) > 0,
        "db_count": len(noms_list),
        "ocr_ready": reader is not None
    })

if __name__ == '__main__':
    os.makedirs('uploads', exist_ok=True)
    print("🚀  MediScan lancé → http://127.0.0.1:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
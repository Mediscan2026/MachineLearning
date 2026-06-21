# MediScan — Guide d'installation

## Structure du projet

```
mediscan/
├── app.py              ← serveur Flask (backend OCR)
├── data.csv            ← votre base de données (à placer ici)
├── requirements.txt
├── templates/
│   └── index.html      ← interface web
└── static/
    ├── css/style.css
    └── js/app.js
```

## Installation (une seule fois)

```bash
# 1. Installer les dépendances Python
pip install -r requirements.txt

# 2. Placer votre fichier data.csv dans le dossier mediscan/
#    (le fichier doit avoir une colonne "nom")
```

## Lancer le site

```bash
cd mediscan
python app.py
```

Ouvrez ensuite **http://127.0.0.1:5000** dans votre navigateur.

## Utilisation

1. Cliquez **Choisir un fichier** ou glissez une photo de médicament
2. Vérifiez l'aperçu
3. Cliquez **Analyser l'image**
4. Le résultat s'affiche : nom, dosage, et toutes les infos de votre CSV

## Notes

- Le badge en haut à droite indique si `data.csv` est bien chargé
- La première analyse est plus lente (chargement d'EasyOCR)
- Les images sont traitées en mémoire, rien n'est sauvegardé sur disque

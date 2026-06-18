"""
Test basique de l'API Zefix - Canton de Vaud.
Script jetable pour valider la connexion et comprendre la structure de réponse.
"""

import requests

# URL de l'endpoint de recherche Zefix
URL = "https://www.zefix.ch/ZefixREST/sw/v4/company/search"

# Paramètres de recherche : toutes les entreprises actives du canton de Vaud
payload = {
    "name": "",
    "canton": "VD",
    "activeOnly": True,
}

# Headers requis pour envoyer du JSON
headers = {
    "Content-Type": "application/json",
}

try:
    # Envoi de la requête POST avec un timeout de 30 secondes
    response = requests.post(URL, json=payload, headers=headers, timeout=30)

    # Affichage du code statut HTTP
    print(f"Statut HTTP : {response.status_code}")

    # Vérification que la réponse est OK (lève une exception sinon)
    response.raise_for_status()

    # Parsing du JSON de réponse
    data = response.json()

    # La réponse peut être une liste directe ou un objet avec clé
    # On affiche le type et les clés pour comprendre la structure
    print(f"Type de réponse : {type(data).__name__}")

    if isinstance(data, list):
        results = data
    elif isinstance(data, dict):
        print(f"Clés de la réponse : {list(data.keys())}")
        # Tenter de trouver la liste de résultats
        results = data.get("list") or data.get("results") or data.get("companies") or []
    else:
        results = []

    print(f"Nombre total de résultats : {len(results)}")
    print("-" * 60)

    # Affichage des 3 premières entreprises
    for i, company in enumerate(results[:3], 1):
        print(f"\n--- Entreprise {i} ---")
        # On affiche toutes les clés de la première entreprise pour comprendre la structure
        if i == 1:
            print(f"  Clés disponibles : {list(company.keys())}")
        print(f"  Nom     : {company.get('name', 'N/A')}")
        print(f"  UID     : {company.get('uid', 'N/A')}")
        print(f"  Canton  : {company.get('canton', 'N/A')}")
        print(f"  Statut  : {company.get('status', 'N/A')}")
        # Afficher aussi le purpose (but social) car c'est ce qu'on utilisera pour filtrer par secteur
        purpose = company.get("purpose", "")
        if purpose:
            print(f"  But     : {purpose[:120]}...")

except requests.exceptions.Timeout:
    print("ERREUR : Timeout - l'API Zefix n'a pas répondu dans les 30 secondes.")

except requests.exceptions.HTTPError as e:
    print(f"ERREUR HTTP {response.status_code} : {e}")
    # Afficher le body de l'erreur pour comprendre le problème
    print(f"Détails : {response.text[:500]}")

except requests.exceptions.ConnectionError:
    print("ERREUR : Impossible de se connecter à l'API Zefix. Vérifie ta connexion.")

except requests.exceptions.RequestException as e:
    print(f"ERREUR inattendue : {e}")

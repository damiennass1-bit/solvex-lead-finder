"""
Test basique API Apollo - recherche contacts chez Zurich Instruments.
Script jetable pour valider la connexion et la structure de réponse.
"""

import json
import os

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("APOLLO_API_KEY")
if not API_KEY:
    print("ERREUR : APOLLO_API_KEY manquant dans .env")
    exit(1)

URL = "https://api.apollo.io/api/v1/mixed_people/search"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
}

payload = {
    "organization_names": ["Zurich Instruments"],
    "person_titles": [
        "chief technology officer",
        "head of manufacturing",
        "operations director",
        "plant manager",
        "production director",
        "head of engineering",
        "maintenance manager",
    ],
    "page_size": 5,
}

try:
    response = requests.post(URL, json=payload, headers=headers, timeout=30)
    print(f"Statut HTTP : {response.status_code}")

    if response.status_code != 200:
        print(f"Erreur : {response.text[:500]}")
        exit(1)

    data = response.json()

    # Structure globale
    print(f"\nClés racine : {list(data.keys())}")
    print(f"Nombre de résultats (people) : {len(data.get('people', []))}")

    # Affichage des contacts trouvés
    people = data.get("people", [])
    for i, person in enumerate(people[:5], 1):
        print(f"\n{'─' * 60}")
        print(f"Contact {i} :")
        print(f"  Prénom     : {person.get('first_name')}")
        print(f"  Nom        : {person.get('last_name')}")
        print(f"  Poste      : {person.get('title')}")
        print(f"  Email      : {person.get('email')}")
        print(f"  LinkedIn   : {person.get('linkedin_url')}")
        print(f"  Entreprise : {person.get('organization', {}).get('name')}")
        print(f"  Email status: {person.get('email_status')}")

    # JSON brut du premier résultat pour voir toutes les clés
    if people:
        print(f"\n{'═' * 60}")
        print("JSON brut du 1er contact (toutes les clés) :")
        print(json.dumps(people[0], indent=2, ensure_ascii=False)[:3000])

except requests.exceptions.Timeout:
    print("ERREUR : Timeout (30s)")
except requests.exceptions.RequestException as e:
    print(f"ERREUR : {e}")

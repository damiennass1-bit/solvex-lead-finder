"""
Importer Apollo CSV → Notion.

Usage :
    python importer.py                  # dry-run (affiche sans écrire)
    python importer.py --apply          # écrit dans Notion
"""

import argparse
import datetime
import logging
import os
import sys

import pandas as pd
from dotenv import load_dotenv
from notion_client import Client, APIResponseError

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

CSV_PATH = "apollo-export.csv"
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID", "35e731e2-ebf8-8001-bc48-f1d56b7e99bb")
SEMAINE = datetime.date.today().isocalendar()[1]

# ─── Mappings ─────────────────────────────────────────────────────────────────

INDUSTRY_MAP = {
    "pharmaceuticals": "Pharma",
    "biotechnology": "Pharma",
    "medical devices": "Pharma",
    "hospital & health care": "Pharma",
    "electrical/electronic manufacturing": "Manufacturing",
    "mechanical or industrial engineering": "Manufacturing",
    "machinery": "Manufacturing",
    "industrial automation": "Manufacturing",
    "renewables & environment": "Énergie",
    "utilities": "Énergie",
    "oil & energy": "Énergie",
    "food & beverages": "Agro",
    "food production": "Agro",
    "chemicals": "Chimie",
    "water treatment": "Eau",
    "environmental services": "Eau",
}

STATE_TO_CANTON = {
    "geneva": "GE",
    "vaud": "VD",
    "zurich": "ZH",
    "zuerich": "ZH",
    "ticino": "TI",
    "aargau": "AG",
    "basel-stadt": "BS",
    "basel-landschaft": "Autre",
    "canton of bern": "BE",
    "bern": "BE",
    "canton of zug": "Autre",
    "st. gallen": "Autre",
    "fribourg": "FR",
    "neuchatel": "NE",
    "neuchâtel": "NE",
    "valais": "VS",
    "jura": "JU",
    "lucerne": "LU",
}


# ─── Fonctions de transformation ─────────────────────────────────────────────

def map_secteur(industry) -> str | None:
    if pd.isna(industry):
        return None
    return INDUSTRY_MAP.get(str(industry).strip().lower())


def map_canton(state) -> str:
    if pd.isna(state):
        return "Autre"
    return STATE_TO_CANTON.get(str(state).strip().lower(), "Autre")


def map_taille(employees) -> str | None:
    try:
        n = int(employees)
    except (ValueError, TypeError):
        return None
    if n < 50:
        return None
    if n < 100:
        return "50-99"
    if n < 250:
        return "100-249"
    if n < 500:
        return "250-499"
    if n < 1000:
        return "500-999"
    return "1000+"


# ─── Construction page Notion ─────────────────────────────────────────────────

def build_page_properties(row: pd.Series) -> dict:
    """Construit le dict properties pour l'API Notion."""
    props = {
        "Entreprise": {"title": [{"text": {"content": str(row.get("Company Name", "")).strip()}}]},
        "Statut": {"select": {"name": "Sourcé"}},
        "semaine": {"number": SEMAINE},
    }

    secteur = map_secteur(row.get("Industry"))
    if secteur:
        props["secteur"] = {"select": {"name": secteur}}

    taille = map_taille(row.get("# Employees"))
    if taille:
        props["Taille"] = {"select": {"name": taille}}

    canton = map_canton(row.get("Company State"))
    props["Canton"] = {"select": {"name": canton}}

    website = row.get("Website")
    if pd.notna(website) and str(website).strip():
        props["source url"] = {"url": str(website).strip()}

    linkedin = row.get("Company Linkedin Url")
    if pd.notna(linkedin) and str(linkedin).strip():
        props["Linkedin"] = {"url": str(linkedin).strip()}

    return props


def build_page_content(row: pd.Series) -> list:
    """Construit le contenu (children blocks) de la page Notion."""

    def safe(col):
        v = row.get(col)
        return str(v).strip() if pd.notna(v) and str(v).strip() else ""

    company = safe("Company Name")
    industry = safe("Industry")
    employees = safe("# Employees")
    city = safe("Company City")
    state = safe("Company State")
    founded = safe("Founded Year")
    description = safe("Short Description")
    website = safe("Website")
    linkedin = safe("Company Linkedin Url")

    blocks = []

    # Heading
    blocks.append({
        "object": "block",
        "type": "heading_1",
        "heading_1": {"rich_text": [{"text": {"content": company}}]},
    })

    # Infos clés avec bold
    def bold_line(label, value):
        return {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [
                    {"text": {"content": label}, "annotations": {"bold": True}},
                    {"text": {"content": f" : {value}"}},
                ]
            },
        }

    if industry:
        blocks.append(bold_line("Industrie", industry))
    if employees:
        blocks.append(bold_line("Effectif", f"{employees} salariés"))
    location = ", ".join(filter(None, [city, state]))
    if location:
        blocks.append(bold_line("Localisation", location))
    if founded:
        blocks.append(bold_line("Fondée en", founded))

    # Description
    if description:
        blocks.append({
            "object": "block",
            "type": "heading_2",
            "heading_2": {"rich_text": [{"text": {"content": "Description"}}]},
        })
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": [{"text": {"content": description[:2000]}}]},
        })

    # Liens
    if website or linkedin:
        blocks.append({
            "object": "block",
            "type": "heading_2",
            "heading_2": {"rich_text": [{"text": {"content": "Liens"}}]},
        })
        if website:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [
                    {"text": {"content": "Site : "}},
                    {"text": {"content": website, "link": {"url": website}}},
                ]},
            })
        if linkedin:
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [
                    {"text": {"content": "LinkedIn : "}},
                    {"text": {"content": linkedin, "link": {"url": linkedin}}},
                ]},
            })

    return blocks


# ─── Import principal ─────────────────────────────────────────────────────────

def run(apply: bool = False):
    if not os.path.exists(CSV_PATH):
        logger.error(f"Fichier introuvable : {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)
    logger.info(f"CSV chargé : {len(df)} lignes, {len(df.columns)} colonnes")

    # Init Notion
    notion = None
    if apply:
        token = os.getenv("NOTION_API_KEY")
        if not token:
            logger.error("NOTION_API_KEY manquant dans .env")
            sys.exit(1)
        notion = Client(auth=token)
        logger.info("Connexion Notion OK")

    imported = 0
    skipped = 0
    errors = 0

    # Dry-run : tableau résumé
    if not apply:
        print(f"\n{'─' * 80}")
        print(f"{'Entreprise':<30} {'Secteur':<15} {'Taille':<10} {'Canton':<8}")
        print(f"{'─' * 80}")

    for idx, row in df.iterrows():
        company_name = row.get("Company Name", "")
        if pd.isna(company_name) or not str(company_name).strip():
            logger.warning(f"Ligne {idx + 1} : nom vide, skippée")
            skipped += 1
            continue

        company_name = str(company_name).strip()
        secteur = map_secteur(row.get("Industry")) or "—"
        taille = map_taille(row.get("# Employees")) or "—"
        canton = map_canton(row.get("Company State"))

        if not apply:
            print(f"{company_name:<30} {secteur:<15} {taille:<10} {canton:<8}")
            imported += 1
            continue

        # Mode apply : écriture Notion
        props = build_page_properties(row)
        content = build_page_content(row)

        try:
            notion.pages.create(
                parent={"database_id": NOTION_DATABASE_ID},
                properties=props,
                children=content,
            )
            logger.info(f"✅ {company_name}")
            imported += 1
        except APIResponseError as e:
            # Si un select n'existe pas, retenter sans les selects problématiques
            if "is not a property that exists" in str(e) or "not a valid option" in str(e):
                logger.warning(f"⚠️  {company_name} : propriété invalide, retry sans selects optionnels")
                # Retirer les selects optionnels et retenter
                for key in ["secteur", "Taille", "Canton"]:
                    props.pop(key, None)
                try:
                    notion.pages.create(
                        parent={"database_id": NOTION_DATABASE_ID},
                        properties=props,
                        children=content,
                    )
                    logger.info(f"✅ {company_name} (sans selects)")
                    imported += 1
                except Exception as e2:
                    logger.error(f"❌ {company_name} : {e2}")
                    errors += 1
            else:
                logger.error(f"❌ {company_name} : {e}")
                errors += 1
        except Exception as e:
            logger.error(f"❌ {company_name} : {e}")
            errors += 1

    # Résumé final
    print(f"\n{'═' * 80}")
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[{mode}] {imported} importés | {skipped} skippés | {errors} erreurs")
    print(f"Semaine ISO : {SEMAINE}")
    print(f"{'═' * 80}")


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Apollo CSV → Notion")
    parser.add_argument("--apply", action="store_true", help="Écrire dans Notion (sinon dry-run)")
    args = parser.parse_args()
    run(apply=args.apply)

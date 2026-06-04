# Solvex · Lead Finder

Outil de recherche de décideurs B2B **à la demande** pour Actemium Suisse.
Tu tapes une entreprise + un lieu → Claude (avec recherche web) vérifie la cible,
identifie le bon acheteur/décideur pour l'automation industrielle, déduit l'email pro
et rédige un brouillon de message LinkedIn (FR / DE / IT selon le canton).

## Stack
- **Frontend** : React + Vite
- **Backend** : Netlify Function (la clé API reste cachée côté serveur)
- **IA** : API Anthropic avec l'outil `web_search`
- **Coût** : ~0,02–0,05 CHF par recherche (uniquement l'API Anthropic). Aucun autre abonnement.

---

## 1. Lancer en local

```bash
npm install
npm install -g netlify-cli   # une seule fois
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
netlify dev                  # lance Vite + les fonctions sur http://localhost:8888
```

> `netlify dev` est important : il fait tourner le frontend ET la fonction ensemble.
> `npm run dev` seul ne lance pas le backend.

## 2. Déployer sur Netlify

**Option A — via GitHub (recommandé, auto-deploy à chaque push) :**
1. Pousse ce dossier dans un repo GitHub.
2. Sur Netlify : *Add new site → Import from GitHub* → choisis le repo.
3. Build settings : détectés automatiquement via `netlify.toml` (build `npm run build`, publish `dist`).
4. **Site settings → Environment variables** → ajoute `ANTHROPIC_API_KEY` (et éventuellement `CLAUDE_MODEL`).
5. Deploy. C'est en ligne.

**Option B — en ligne de commande :**
```bash
npm run build
netlify deploy --prod
# puis configurer ANTHROPIC_API_KEY dans le dashboard Netlify
```

---

## 3. Variables d'environnement

| Variable | Obligatoire | Défaut | Rôle |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | oui | — | Clé API Anthropic |
| `CLAUDE_MODEL` | non | `claude-sonnet-4-6` | Modèle utilisé |

---

## Conformité (nLPD)
Outil de prospection B2B. Les emails sont **déduits** de sources publiques avec un niveau
de confiance affiché — à vérifier avant tout envoi. Aucune donnée n'est stockée côté serveur.
Usage encadré : finalité commerciale claire, identification de l'expéditeur, droit d'opposition.
À valider avec la DPO de VINCI Energies CH avant déploiement large.

## Évolutions possibles (v2)
- Brancher **Apollo.io** ou **Dropcontact** pour des emails vérifiés à 100 % (au lieu de déduits).
- Historiser les recherches dans **Supabase** (base déjà dans ta stack).
- Export CSV / push direct vers le CRM Zoho de Marc.
- Mode "batch" : coller une liste d'entreprises → traitement en lot.

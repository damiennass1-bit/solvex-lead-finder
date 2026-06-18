// netlify/functions/find-lead.js
// Backend : recherche PRECISE de contacts reels via Claude + web_search.
// Strategie multi-recherche : LinkedIn, site entreprise, annuaires, presse.
// La cle API reste cote serveur.

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SELLER_CONTEXT = process.env.SELLER_CONTEXT ||
  "une societe de prestations d'ingenierie industrielle, d'automation, de MES et d'IoT, qui s'adresse a des sites industriels (pharma, chimie, agroalimentaire, energie, manufacturing, eau)";

const SYSTEM = `Tu es un expert en recherche de contacts B2B. Tu dois trouver les VRAIS employes d'une entreprise qui correspondent a un mot-cle de poste precis.

CONTEXTE : tu travailles pour ${SELLER_CONTEXT}.

=== METHODE OBLIGATOIRE — SUIS CES ETAPES DANS L'ORDRE ===

ETAPE 1 — IDENTIFIER L'ENTREPRISE (1-2 recherches)
- Confirme la raison sociale exacte, le site web, le domaine email, le pays, le secteur.
- Trouve la page LinkedIn de l'entreprise (cherche "[entreprise] LinkedIn company page").
- Note le domaine email (ex: ucb.com, novartis.com).

ETAPE 2 — CHERCHER LES EMPLOYES PAR MOT-CLE (4-6 recherches minimum)
C'est l'etape la plus importante. Fais PLUSIEURS recherches variees :

a) Recherche LinkedIn directe :
   - "[entreprise]" "[mot-cle poste]" site:linkedin.com/in
   - "[entreprise]" "[mot-cle poste]" "[lieu]" site:linkedin.com/in
   - "[entreprise]" "[synonyme du mot-cle]" site:linkedin.com/in

b) Recherche Google generique :
   - "[entreprise]" "[mot-cle poste]" "[lieu]" LinkedIn
   - "[entreprise]" "[mot-cle poste]" profil

c) Site web de l'entreprise :
   - site:[domaine-entreprise] "[mot-cle poste]" OR equipe OR team OR contact
   - site:[domaine-entreprise] organigramme OR management OR leadership

d) Annuaires et presse :
   - "[entreprise]" "[mot-cle poste]" "[lieu]" (nomination OR appointment OR annonce)

IMPORTANT SUR LES SYNONYMES :
- Si le mot-cle est en anglais, cherche aussi en francais/allemand et vice versa.
  Exemples : procurement = achats = Einkauf = purchasing = sourcing
             maintenance = instandhaltung = entretien
             IT = informatique = Informatik = systems
             directeur technique = CTO = technical director = technischer Leiter
- Cherche aussi des variantes de seniority : head of, director, manager, responsable, chef de, Leiter

ETAPE 3 — EXTRAIRE ET VERIFIER LES CONTACTS
Pour chaque personne trouvee dans les resultats de recherche :
- Note le nom EXACT tel qu'il apparait dans le resultat de recherche.
- Note le titre de poste EXACT tel qu'affiche.
- Note l'URL LinkedIn EXACTE si presente dans les resultats (ne la fabrique jamais).
- Verifie que la personne travaille ACTUELLEMENT dans l'entreprise (pas un ancien employe).

ETAPE 4 — DEDUIRE LES EMAILS
- Identifie le format email de l'entreprise (cherche "email @[domaine]" ou deduis du site web).
- Formats courants : prenom.nom@, p.nom@, prenom@, nom.prenom@, premiere-lettre-prenom.nom@
- Applique le format a chaque contact.
- Marque "deduced" (jamais "verified" sauf si l'email exact est dans une source publique).

ETAPE 5 — REDIGER LE MESSAGE
- UN seul message, pour le contact principal.
- Court (4-6 lignes), personnalise, oriente valeur concrete.
- Langue selon le lieu (FR/DE/IT/EN/NL/ES).

=== REGLES ABSOLUES ===
1. NE JAMAIS INVENTER un nom. Si tu ne trouves personne de reel, dis-le clairement. 0 faux contacts vaut mieux que 5 inventes.
2. NE JAMAIS FABRIQUER une URL LinkedIn. Donne uniquement les URLs trouvees dans les resultats de recherche.
3. Chaque contact DOIT avoir une source verifiable (URL ou description de ou tu l'as trouve).
4. Si un resultat de recherche montre "ancien" ou "former" ou "ex-", EXCLUS cette personne.
5. Donne jusqu'a 5 contacts max, tries par pertinence.

Tu reponds UNIQUEMENT avec un objet JSON valide. Pas de texte autour. Pas de backticks.`;

function buildPrompt({ company, location, role }) {
  const roleText = role || 'decideur, directeur, responsable';
  return `RECHERCHE DE CONTACTS

Entreprise : "${company}"
Lieu : "${location || 'non precise'}"
Mot-cle de poste : "${roleText}"

Execute les 5 etapes de ta methode. Fais au minimum 5 recherches web differentes pour trouver les VRAIS employes.

Varie les synonymes du mot-cle "${roleText}" en plusieurs langues (FR, EN, DE, IT selon le lieu).

Reponds avec ce JSON :
{
  "company": {
    "name": "raison sociale exacte trouvee",
    "verified": true/false,
    "sector": "secteur",
    "size": "effectif approximatif",
    "address": "adresse",
    "country": "pays",
    "region": "region/canton",
    "domain": "domaine email (ex: ucb.com)",
    "linkedin_url": "URL page LinkedIn entreprise",
    "website": "URL site web",
    "email_format": "format email detecte (ex: prenom.nom@domaine.com)",
    "notes": "contexte utile pour l'approche commerciale"
  },
  "contacts": [
    {
      "name": "NOM COMPLET REEL (tel que trouve dans les resultats)",
      "role": "titre de poste EXACT tel qu'affiche",
      "seniority": "niveau",
      "linkedin_url": "URL EXACTE trouvee dans les resultats (ou vide)",
      "email": "email deduit selon le format de l'entreprise",
      "email_confidence": "verified | deduced | unknown",
      "source": "URL ou description de la source",
      "rationale": "pourquoi ce contact est pertinent"
    }
  ],
  "search_queries_used": ["toutes les requetes de recherche effectuees"],
  "keywords_tried": ["tous les synonymes/variantes du mot-cle essayes"],
  "message": {
    "language": "fr/de/en/it/nl/es",
    "subject": "objet court",
    "body": "message personnalise"
  },
  "sources": ["toutes les URLs consultees"],
  "search_notes": "remarques sur la qualite des resultats, difficultes rencontrees"
}`;
}

// --- Appel Claude avec retry sur rate limit ---
async function callClaude(body, attempt = 1) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });
  if ((res.status === 429 || res.status === 529) && attempt < 3) {
    await new Promise(r => setTimeout(r, 2000 * attempt));
    return callClaude(body, attempt + 1);
  }
  return res;
}

function extractJSON(text) {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Pas de JSON dans la reponse.');
  return JSON.parse(t.slice(start, end + 1));
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.ANTHROPIC_API_KEY) return { statusCode: 500, body: 'ANTHROPIC_API_KEY non configuree.' };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Body JSON invalide.' }; }

  const { company, location = '', role = '' } = payload;
  if (!company || !company.trim()) return { statusCode: 400, body: "Le nom d'entreprise est requis." };

  try {
    const res = await callClaude({
      model: MODEL,
      max_tokens: 5000,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 15 }],
      messages: [{ role: 'user', content: buildPrompt({ company, location, role }) }]
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return { statusCode: 502, body: `Erreur API : ${errTxt.slice(0, 300)}` };
    }

    const data = await res.json();
    const finalText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!finalText) return { statusCode: 502, body: 'Reponse vide du modele.' };

    const parsed = extractJSON(finalText);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (e) {
    return { statusCode: 500, body: `Erreur interne : ${e.message}` };
  }
};

// netlify/functions/find-lead.js
// Backend : appelle Claude avec recherche web pour identifier le décideur cible.
// La cle API reste cote serveur (jamais exposee au navigateur).

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SYSTEM = `Tu es un assistant de prospection B2B pour un Business Developer chez Actemium Suisse (groupe VINCI Energies). Actemium vend des prestations d'ingénierie industrielle, d'automation, de MES et d'IoT à des sites industriels (pharma, chimie, agroalimentaire, énergie, manufacturing, eau).

Ton rôle : à partir d'un nom d'entreprise et d'un lieu, identifier le décideur le plus pertinent à contacter pour vendre ce type de prestations.

Règles strictes :
- Utilise la recherche web pour vérifier les informations. N'invente JAMAIS un nom de personne, un email ou une donnée. Si une info n'est pas trouvée de façon fiable, laisse le champ vide.
- Le bon décideur dépend de la taille du site : grand site → Responsable Achats Techniques / Acheteur Projets & Investissements, Responsable Ingénierie, Responsable Maintenance ou Directeur de site. PME → Directeur Général ou Directeur Technique.
- Pour l'email : déduis le format à partir de sources publiques (signatures, mentions, format courant de l'entreprise) et donne un niveau de confiance honnête (low/medium/high). Ne donne "high" que si le format est confirmé par une source.
- Le lien LinkedIn doit être une URL de RECHERCHE LinkedIn (https://www.linkedin.com/search/results/people/?keywords=...) ciblant l'entreprise + le poste, jamais une URL de profil inventée.
- Le message : court (4-6 lignes), orienté valeur concrète (gain de temps, fiabilité, conformité), sans jargon commercial agressif, sans promesse exagérée. En français si canton romand, en allemand si canton alémanique (BS, BL, ZH, BE, AG, LU, SG, TG, SH, GR, SO, AR, AI, GL, NW, OW, UR, SZ, ZG), italien si Tessin.

Tu réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, sans backticks markdown.`;

function buildPrompt({ company, location, role }) {
  return `Entreprise cible : "${company}"
Lieu : "${location || 'non précisé'}"
${role ? `Poste à cibler en priorité : "${role}"` : 'Poste : à déterminer automatiquement selon la taille du site.'}

Recherche les informations publiques nécessaires, puis réponds avec ce JSON exact :
{
  "company": {
    "name": "raison sociale exacte",
    "verified": true ou false,
    "sector": "secteur d'activité",
    "size": "effectif approximatif sur ce site",
    "address": "adresse du site",
    "canton": "canton suisse (code 2 lettres)",
    "domain": "domaine email de l'entreprise",
    "notes": "1 phrase de contexte utile pour l'approche commerciale (ex: investissement récent, extension de site)"
  },
  "contacts": [
    {
      "name": "nom complet si trouvé de façon fiable, sinon vide",
      "role": "intitulé de poste ciblé",
      "seniority": "niveau hiérarchique",
      "linkedin_search_url": "URL de recherche LinkedIn ciblée",
      "email_guess": "email déduit au format de l'entreprise",
      "email_confidence": "low | medium | high",
      "rationale": "pourquoi c'est le bon contact pour Actemium (1 phrase)"
    }
  ],
  "message": {
    "language": "fr | de | it",
    "subject": "objet court",
    "body": "corps du message LinkedIn"
  },
  "sources": ["url ou nom des sources consultées"]
}

Donne 1 à 2 contacts maximum, les plus pertinents.`;
}

function extractJSON(text) {
  // Retire d'eventuels backticks puis isole le premier objet JSON complet
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Pas de JSON dans la réponse du modèle.');
  return JSON.parse(t.slice(start, end + 1));
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: 'ANTHROPIC_API_KEY non configurée sur Netlify.' };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: 'Body JSON invalide.' }; }

  const { company, location = '', role = '' } = payload;
  if (!company || !company.trim()) {
    return { statusCode: 400, body: 'Le nom d\'entreprise est requis.' };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        system: SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        messages: [{ role: 'user', content: buildPrompt({ company, location, role }) }]
      })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return { statusCode: 502, body: `Erreur API Anthropic : ${errTxt.slice(0, 300)}` };
    }

    const data = await res.json();

    // Avec recherche web, la reponse contient plusieurs blocs : on concatene les blocs texte.
    const finalText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) {
      return { statusCode: 502, body: 'Réponse vide du modèle.' };
    }

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

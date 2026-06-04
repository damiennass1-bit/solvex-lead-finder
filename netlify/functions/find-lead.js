// netlify/functions/find-lead.js
// Backend : appelle Claude pour identifier le décideur cible.
// La cle API reste cote serveur (jamais exposee au navigateur).

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `Tu es un assistant de prospection B2B pour un Business Developer chez Actemium Suisse (groupe VINCI Energies). Actemium vend des prestations d'ingénierie industrielle, d'automation, de MES et d'IoT à des sites industriels (pharma, chimie, agroalimentaire, énergie, manufacturing, eau).

Ton rôle : à partir d'un nom d'entreprise et d'un lieu, utiliser la recherche web pour trouver le NOM RÉEL du décideur le plus pertinent à contacter.

Règles strictes :
- Tu DOIS utiliser la recherche web pour trouver le nom réel d'une personne sur LinkedIn, le site de l'entreprise, ou d'autres sources publiques. Cherche par exemple "site:linkedin.com [entreprise] [poste] [lieu]".
- N'invente JAMAIS un nom. Si après recherche tu ne trouves vraiment personne, laisse le champ "name" vide, mais essaie FORT de trouver un vrai nom.
- Le bon décideur dépend de la taille du site : grand site → Responsable Achats Techniques, Responsable Ingénierie, Responsable Maintenance ou Directeur de site. PME → Directeur Général ou Directeur Technique.
- Pour l'email : déduis le format à partir du domaine de l'entreprise (prenom.nom@domaine.ch, p.nom@domaine.com, etc.). Confiance "medium" si tu as le nom + le domaine, "high" seulement si confirmé par une source.
- Le lien LinkedIn doit être une URL de RECHERCHE LinkedIn (https://www.linkedin.com/search/results/people/?keywords=...) ciblant l'entreprise + le poste, jamais une URL de profil inventée.
- Le message : court (4-6 lignes), orienté valeur concrète (gain de temps, fiabilité, conformité), sans jargon commercial agressif. TOUJOURS écrire "Actemium" correctement. En français si canton romand, en allemand si canton alémanique, italien si Tessin.

IMPORTANT : Tu réponds UNIQUEMENT avec un objet JSON valide. Pas de texte avant ni après. Pas de backticks markdown. Juste le JSON brut.`;

function buildPrompt({ company, location, role }) {
  return `Entreprise cible : "${company}"
Lieu : "${location || 'non précisé'}"
${role ? `Poste à cibler en priorité : "${role}"` : 'Poste : à déterminer automatiquement selon la taille du site.'}

ÉTAPE 1 : Utilise la recherche web pour trouver le NOM RÉEL de la personne occupant ce poste dans cette entreprise. Cherche sur LinkedIn et sur le site de l'entreprise.
ÉTAPE 2 : Construis le JSON avec les vraies infos trouvées.

Réponds avec ce JSON exact (et RIEN d'autre) :
{
  "company": {
    "name": "raison sociale exacte",
    "verified": true,
    "sector": "secteur d'activité",
    "size": "effectif approximatif sur ce site",
    "address": "adresse du site si connue",
    "canton": "canton suisse (code 2 lettres)",
    "domain": "domaine email de l'entreprise",
    "notes": "1 phrase de contexte utile pour l'approche commerciale"
  },
  "contacts": [
    {
      "name": "NOM RÉEL trouvé par recherche web (ou vide si introuvable)",
      "role": "intitulé de poste",
      "seniority": "niveau hiérarchique",
      "linkedin_search_url": "URL de recherche LinkedIn ciblée",
      "email_guess": "prenom.nom@domaine.com déduit",
      "email_confidence": "medium",
      "rationale": "pourquoi c'est le bon contact pour Actemium"
    }
  ],
  "message": {
    "language": "fr",
    "subject": "objet court",
    "body": "corps du message LinkedIn (4-6 lignes, mentionne Actemium)"
  },
  "sources": ["URLs des sources consultées"]
}

Donne 1 à 2 contacts maximum, les plus pertinents.`;
}

function extractJSON(text) {
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Pas de JSON dans la réponse. Brut : ' + t.slice(0, 300));
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
        max_tokens: 1500,
        system: SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages: [{ role: 'user', content: buildPrompt({ company, location, role }) }]
      })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return { statusCode: 502, body: `Erreur API Anthropic : ${errTxt.slice(0, 300)}` };
    }

    const data = await res.json();

    // Avec web_search, la reponse peut contenir plusieurs blocs.
    // On concatene tous les blocs texte pour extraire le JSON final.
    const finalText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) {
      // Si stop_reason est tool_use, le modele veut encore chercher mais on a sa reponse partielle
      // On renvoie une erreur explicative
      if (data.stop_reason === 'tool_use') {
        return { statusCode: 504, body: 'La recherche prend trop de temps. Réessayez avec un poste plus précis.' };
      }
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

// netlify/functions/find-lead.js
// Backend : appelle Claude pour identifier le décideur cible.
// La cle API reste cote serveur (jamais exposee au navigateur).

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `Tu es un assistant de prospection B2B pour un Business Developer chez Actemium Suisse (groupe VINCI Energies). Actemium vend des prestations d'ingénierie industrielle, d'automation, de MES et d'IoT à des sites industriels (pharma, chimie, agroalimentaire, énergie, manufacturing, eau).

Ton rôle : à partir d'un nom d'entreprise et d'un lieu, utiliser la recherche web pour trouver le NOM RÉEL et le PROFIL LINKEDIN du décideur.

STRATÉGIE DE RECHERCHE (suis ces étapes dans l'ordre) :
1. Cherche "site:linkedin.com/in [entreprise] [poste demandé] [lieu]"
2. Si pas de résultat, cherche "site:linkedin.com/in [entreprise] achat technique OR ingénierie OR maintenance [lieu]"
3. Cherche aussi "[entreprise] [lieu] organigramme" ou "[entreprise] [lieu] équipe direction"

Règles strictes :
- Tu DOIS trouver un vrai nom. Cherche activement sur LinkedIn, le site de l'entreprise, les articles de presse. Ne te contente JAMAIS de "Nom à confirmer" sans avoir essayé plusieurs recherches.
- Le bon décideur dépend de la taille du site : grand site → Responsable Achats Techniques, Acheteur Projets & Investissements, Responsable Ingénierie, Responsable Maintenance. PME → Directeur Général ou Directeur Technique.
- Pour le LinkedIn : donne L'URL DIRECTE du profil LinkedIn si tu la trouves (ex: https://www.linkedin.com/in/prenom-nom-123abc/). Si tu ne trouves pas le profil exact, donne une URL de recherche LinkedIn comme fallback.
- Pour l'email : donne UNIQUEMENT un email que tu as trouvé dans une source publique (site web, signature, article, annuaire). Si tu n'as PAS trouvé l'email exact dans une source fiable, laisse le champ "email_guess" comme une chaîne VIDE "". Ne déduis JAMAIS un email, ne devine JAMAIS. Un faux email est pire que pas d'email.
- Le message : court (4-6 lignes), personnalisé avec le prénom du contact si trouvé, orienté valeur concrète. TOUJOURS écrire "Actemium" correctement. Français si canton romand, allemand si alémanique, italien si Tessin.

IMPORTANT : Tu réponds UNIQUEMENT avec un objet JSON valide. Pas de texte avant ni après. Pas de backticks markdown. Juste le JSON brut.`;

function buildPrompt({ company, location, role }) {
  return `Entreprise cible : "${company}"
Lieu : "${location || 'non précisé'}"
${role ? `Poste à cibler en priorité : "${role}"` : 'Poste : à déterminer automatiquement selon la taille du site.'}

OBLIGATOIRE : Fais au moins 2 recherches web pour trouver le NOM RÉEL et le PROFIL LINKEDIN de cette personne. Ne réponds pas sans avoir cherché.

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
      "name": "NOM RÉEL trouvé (OBLIGATOIRE — cherche sur LinkedIn)",
      "role": "intitulé de poste",
      "seniority": "niveau hiérarchique",
      "linkedin_url": "URL DIRECTE du profil LinkedIn (https://linkedin.com/in/xxx) ou URL de recherche en fallback",
      "email_guess": "email RÉEL trouvé dans une source publique, ou chaîne vide si non trouvé",
      "email_confidence": "high si trouvé dans une source, sinon ne pas inclure",
      "rationale": "pourquoi c'est le bon contact pour Actemium"
    }
  ],
  "message": {
    "language": "fr",
    "subject": "objet court",
    "body": "corps du message LinkedIn personnalisé avec le prénom"
  },
  "sources": ["URLs des sources consultées"]
}

Donne 1 à 2 contacts maximum.`;
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
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: buildPrompt({ company, location, role }) }]
      })
    });

    if (!res.ok) {
      const errTxt = await res.text();
      return { statusCode: 502, body: `Erreur API Anthropic : ${errTxt.slice(0, 300)}` };
    }

    const data = await res.json();

    const finalText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!finalText) {
      if (data.stop_reason === 'tool_use') {
        return { statusCode: 504, body: 'La recherche prend trop de temps. Réessayez ou précisez le poste.' };
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

import { useState, useEffect } from 'react';

const LOADING_STEPS = [
  "Vérification de l'entreprise…",
  "Identification du décideur cible…",
  "Recherche sur sources publiques…",
  "Déduction de l'email pro…",
  "Rédaction du message…"
];

function CopyBtn({ text, label = 'Copier' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
      {copied ? '✓ Copié' : label}
    </button>
  );
}

export default function App() {
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    const t = setInterval(() => setStepIdx(i => Math.min(i + 1, LOADING_STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, [loading]);

  const run = async () => {
    if (!company.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/find-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: company.trim(), location: location.trim(), role: role.trim() })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erreur serveur (${res.status}). ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !loading) run(); };

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <div className="brand-mark">S</div>
            <div>
              <div className="brand-name">Solvex · Lead Finder</div>
              <div className="brand-sub">Actemium Suisse</div>
            </div>
          </div>
          <div className="status-pill"><span className="status-dot"></span>Opérationnel</div>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <div className="eyebrow">Recherche de décideurs · à la demande</div>
          <h1 className="title">Tape une entreprise.<br/>Trouve <em>le bon acheteur.</em></h1>
          <p className="lede">
            Entreprise + lieu → l'outil vérifie la cible, identifie le décideur le plus pertinent
            pour l'automation industrielle, déduit son email pro et rédige un brouillon de message.
          </p>

          <div className="panel">
            <div className="field-row">
              <div className="field">
                <label>Entreprise</label>
                <input value={company} onChange={e => setCompany(e.target.value)} onKeyDown={onKey}
                  placeholder="ex. UCB Farchim" autoFocus />
              </div>
              <div className="field">
                <label>Lieu / canton</label>
                <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={onKey}
                  placeholder="ex. Bulle, FR" />
              </div>
            </div>
            <div className="field field-full">
              <label>Poste ciblé <span style={{textTransform:'none',color:'var(--text-faint)'}}>(optionnel)</span></label>
              <input value={role} onChange={e => setRole(e.target.value)} onKeyDown={onKey}
                placeholder="ex. Responsable achats techniques — laisser vide = auto" />
            </div>
            <button className="run-btn" onClick={run} disabled={loading || !company.trim()}>
              {loading ? 'Recherche en cours…' : 'Trouver le décideur →'}
            </button>
            <p className="hint">
              <b>nLPD :</b> usage prospection B2B uniquement. Les emails sont déduits de sources publiques,
              à valider avant tout envoi. Aucune donnée n'est stockée.
            </p>
          </div>
        </section>

        {loading && (
          <section className="loading">
            <div className="loading-steps">
              {LOADING_STEPS.map((s, i) => (
                <div key={i} className={`lstep ${i === stepIdx ? 'active' : ''} ${i < stepIdx ? 'done' : ''}`}>
                  <span className="lstep-ico">
                    {i < stepIdx ? '✓' : i === stepIdx ? <span className="spinner"></span> : '○'}
                  </span>
                  {s}
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <section className="results">
            <div className="err"><b>Échec de la recherche.</b><br/>{error}</div>
          </section>
        )}

        {result && (
          <section className="results">
            {/* ENTREPRISE */}
            <div className="res-card">
              <div className="card-head">
                <span className="card-label">Entreprise</span>
                <span className={`verified ${result.company?.verified ? 'ok' : 'no'}`}>
                  {result.company?.verified ? '● Vérifiée' : '◐ Non confirmée'}
                </span>
              </div>
              <div className="card-body">
                <div className="co-name">{result.company?.name || company}</div>
                <div className="co-meta">
                  {result.company?.sector && <span className="tag">Secteur · <b>{result.company.sector}</b></span>}
                  {result.company?.size && <span className="tag">Effectif · <b>{result.company.size}</b></span>}
                  {result.company?.canton && <span className="tag">Canton · <b>{result.company.canton}</b></span>}
                  {result.company?.domain && <span className="tag">Domaine · <b>{result.company.domain}</b></span>}
                </div>
                {result.company?.address && <div className="co-notes">📍 {result.company.address}</div>}
                {result.company?.notes && <div className="co-notes">{result.company.notes}</div>}
              </div>
            </div>

            {/* CONTACTS */}
            <div className="res-card">
              <div className="card-head">
                <span className="card-label">Décideur(s) ciblé(s)</span>
              </div>
              <div className="card-body">
                {(result.contacts || []).length === 0 && (
                  <div className="co-notes">Aucun contact nominatif fiable trouvé sur sources publiques. Utilise le lien de recherche LinkedIn ci-dessous.</div>
                )}
                {(result.contacts || []).map((c, i) => (
                  <div className="contact" key={i}>
                    <div className="contact-top">
                      <div>
                        <div className="contact-name">
                          {c.name ? c.name : <span className="unknown">Nom à confirmer</span>}
                        </div>
                        <div className="contact-role">{c.role}{c.seniority ? ` · ${c.seniority}` : ''}</div>
                      </div>
                    </div>
                    {c.rationale && <div className="contact-rationale">{c.rationale}</div>}
                    <div className="datarow">
                      {c.email_guess && (
                        <span className="data-chip">
                          {c.email_guess}
                          {c.email_confidence && <span className={`conf ${c.email_confidence}`}>{c.email_confidence}</span>}
                          <CopyBtn text={c.email_guess} label="Copier" />
                        </span>
                      )}
                      {(c.linkedin_url || c.linkedin_search_url) && (
                        <span className="data-chip">
                          <a href={c.linkedin_url || c.linkedin_search_url} target="_blank" rel="noreferrer">
                            {c.linkedin_url && !c.linkedin_url.includes('search') ? '↗ Profil LinkedIn' : '↗ Recherche LinkedIn'}
                          </a>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MESSAGE */}
            {result.message?.body && (
              <div className="res-card">
                <div className="card-head">
                  <span className="card-label">Brouillon de message · {result.message.language?.toUpperCase()}</span>
                  <CopyBtn text={(result.message.subject ? result.message.subject + '\n\n' : '') + result.message.body} label="Copier le message" />
                </div>
                <div className="card-body">
                  <div style={{marginBottom: 12}}><span className="draft-flag">⚠ Brouillon — à relire avant envoi</span></div>
                  {result.message.subject && <div className="msg-subject">{result.message.subject}</div>}
                  <div className="msg-body">{result.message.body}</div>
                </div>
              </div>
            )}

            {/* SOURCES */}
            {(result.sources || []).length > 0 && (
              <div className="res-card">
                <div className="card-head"><span className="card-label">Sources consultées</span></div>
                <div className="card-body sources">
                  {result.sources.map((s, i) => (
                    <div key={i}>· {s.startsWith('http') ? <a href={s} target="_blank" rel="noreferrer">{s}</a> : s}</div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="foot">
          <span>SOLVEX · {new Date().getFullYear()}</span>
          <span className="compliance">
            Outil de prospection B2B. Données issues de sources publiques, à vérifier avant usage.
            Conforme à un usage nLPD encadré (finalité commerciale, droit d'opposition).
          </span>
        </footer>
      </main>
    </>
  );
}

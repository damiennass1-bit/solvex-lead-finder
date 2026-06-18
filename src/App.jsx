import { useState, useEffect } from 'react';
import ShaderBackground from './ShaderBackground.jsx';

const LOADING_STEPS = [
  "Verification de l'entreprise...",
  "Recherche LinkedIn des employes...",
  "Analyse des profils trouves...",
  "Deduction des emails pro...",
  "Redaction du message..."
];

const CONF = {
  verified: { label: 'verifie', cls: 'conf-high' },
  deduced:  { label: 'deduit', cls: 'conf-medium' },
  unknown:  { label: 'introuvable', cls: 'conf-low' }
};

function CopyBtn({ text, label = 'Copier' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
      {copied ? '✓' : label}
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
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setStepIdx(0);
    setElapsed(0);
    const stepTimer = setInterval(() => setStepIdx(i => Math.min(i + 1, LOADING_STEPS.length - 1)), 3200);
    const clockTimer = setInterval(() => setElapsed(t => t + 1), 1000);
    return () => { clearInterval(stepTimer); clearInterval(clockTimer); };
  }, [loading]);

  const run = async () => {
    if (!company.trim() || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/find-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: company.trim(), location: location.trim(), role: role.trim() }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) { const txt = await res.text(); throw new Error(`Erreur (${res.status}). ${txt.slice(0, 200)}`); }
      setResult(await res.json());
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('La recherche a pris trop de temps (>2 min). Reessaie ou simplifie le mot-cle.');
      } else {
        setError(e.message || 'Une erreur est survenue.');
      }
    } finally { setLoading(false); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !loading) run(); };
  const contactCount = result?.contacts?.length || 0;

  return (
    <>
      <ShaderBackground />

      <div className="app-overlay">
        {/* Hero Section */}
        <header className="hero-section">
          <div className="hero-badge anim-fade-down">
            <span className="hero-badge-dot"></span>
            <span>Prospection B2B · Industrie</span>
          </div>

          <div className="hero-titles">
            <h1 className="hero-h1 anim-fade-up d1">Trouvez vos</h1>
            <h1 className="hero-h1 hero-h1-accent anim-fade-up d2">decideurs cles.</h1>
          </div>

          <p className="hero-sub anim-fade-up d3">
            Entreprise + fonction — l'outil cherche sur LinkedIn les vrais employes,
            leurs profils, emails pro et redige un message personnalise.
          </p>
        </header>

        {/* Search Panel */}
        <section className="search-panel anim-fade-up d4">
          <div className="search-grid">
            <div className="search-field">
              <label>Entreprise</label>
              <input value={company} onChange={e => setCompany(e.target.value)} onKeyDown={onKey}
                placeholder="UCB, Novartis, Bobst..." autoFocus />
            </div>
            <div className="search-field">
              <label>Lieu / pays</label>
              <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={onKey}
                placeholder="Suisse, Bale, Belgique..." />
            </div>
          </div>
          <div className="search-field search-field-main">
            <label>Fonction / mot-cle <span className="star">*</span></label>
            <input value={role} onChange={e => setRole(e.target.value)} onKeyDown={onKey}
              placeholder="procurement, achats, maintenance, IT, directeur technique..."
              className="input-highlight" />
            <span className="field-tip">Plus le mot-cle est precis, meilleurs sont les resultats.</span>
          </div>
          <button className="cta-btn" onClick={run} disabled={loading || !company.trim()}>
            {loading ? 'Recherche en cours...' : 'Trouver les contacts'}
          </button>
        </section>

        {/* Loading */}
        {loading && (
          <section className="loading-section anim-fade-up">
            {LOADING_STEPS.map((s, i) => (
              <div key={i} className={`load-step ${i === stepIdx ? 'active' : ''} ${i < stepIdx ? 'done' : ''}`}>
                <span className="load-ico">
                  {i < stepIdx ? '✓' : i === stepIdx ? <span className="spinner"></span> : '○'}
                </span>
                {s}
              </div>
            ))}
            <div className="load-timer">{elapsed}s — la recherche precise prend 20 a 60s</div>
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="result-section">
            <div className="error-box">{error}</div>
          </section>
        )}

        {/* Results */}
        {result && (
          <section className="result-section">
            {/* Company Card */}
            <div className="card anim-rise">
              <div className="card-header">
                <span className="card-tag">Entreprise</span>
                <span className={`verified-badge ${result.company?.verified ? 'ok' : ''}`}>
                  {result.company?.verified ? '● Verifiee' : '◐ Non confirmee'}
                </span>
              </div>
              <div className="card-content">
                <h2 className="company-name">{result.company?.name || company}</h2>
                <div className="tag-row">
                  {result.company?.sector && <span className="info-tag">{result.company.sector}</span>}
                  {result.company?.size && <span className="info-tag">{result.company.size} emp.</span>}
                  {result.company?.region && <span className="info-tag">{result.company.region}</span>}
                  {result.company?.country && <span className="info-tag">{result.company.country}</span>}
                  {result.company?.domain && <span className="info-tag">{result.company.domain}</span>}
                </div>
                {result.company?.address && <p className="company-note">📍 {result.company.address}</p>}
                <div className="company-links">
                  {result.company?.linkedin_url && (
                    <a href={result.company.linkedin_url} target="_blank" rel="noreferrer" className="li-link">
                      ↗ LinkedIn
                    </a>
                  )}
                  {result.company?.website && (
                    <a href={result.company.website} target="_blank" rel="noreferrer" className="li-link">
                      ↗ Site web
                    </a>
                  )}
                </div>
                {result.company?.email_format && (
                  <p className="company-note"><span className="format-label">Format email :</span> {result.company.email_format}</p>
                )}
                {result.company?.notes && <p className="company-note">{result.company.notes}</p>}
              </div>
            </div>

            {/* Contacts Card */}
            <div className="card anim-rise d1">
              <div className="card-header">
                <span className="card-tag">Contacts trouves ({contactCount})</span>
                {contactCount > 0 && <span className="card-tag-sub">Resultats reels</span>}
              </div>
              <div className="card-content">
                {contactCount === 0 && (
                  <p className="empty-msg">Aucun contact trouve. Essaie un mot-cle different.</p>
                )}
                {(result.contacts || []).map((c, i) => {
                  const conf = CONF[c.email_confidence] || CONF.unknown;
                  return (
                    <div className="contact-row" key={i}>
                      <div className="contact-header">
                        <span className="contact-idx">{i + 1}</span>
                        <div className="contact-info">
                          <span className="contact-name">
                            {c.name || 'Nom a confirmer'}
                            {c.linkedin_url && (
                              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="li-badge">LinkedIn ↗</a>
                            )}
                          </span>
                          <span className="contact-role">{c.role}{c.seniority ? ` · ${c.seniority}` : ''}</span>
                        </div>
                      </div>
                      {c.rationale && <p className="contact-rationale">{c.rationale}</p>}
                      {c.source && <p className="contact-source">Source: {c.source}</p>}
                      <div className="email-row">
                        {c.email ? (
                          <span className="email-chip">
                            {c.email}
                            <span className={`conf-badge ${conf.cls}`}>{conf.label}</span>
                            <CopyBtn text={c.email} />
                          </span>
                        ) : (
                          <span className="email-chip muted">email introuvable</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Message Card */}
            {result.message?.body && (
              <div className="card anim-rise d2">
                <div className="card-header">
                  <span className="card-tag">Message · {(result.message.language || '').toUpperCase()}</span>
                  <CopyBtn
                    text={(result.message.subject ? result.message.subject + '\n\n' : '') + result.message.body}
                    label="Copier"
                  />
                </div>
                <div className="card-content">
                  <span className="draft-label">Brouillon — a relire avant envoi</span>
                  {result.message.subject && <div className="msg-subject">{result.message.subject}</div>}
                  <div className="msg-body">{result.message.body}</div>
                </div>
              </div>
            )}

            {/* Search Notes */}
            {result.search_notes && (
              <div className="card anim-rise d2b">
                <div className="card-header"><span className="card-tag">Remarques</span></div>
                <div className="card-content"><p className="search-notes">{result.search_notes}</p></div>
              </div>
            )}

            {/* Keywords + Queries */}
            {((result.keywords_tried || []).length > 0 || (result.search_queries_used || []).length > 0) && (
              <div className="card anim-rise d3">
                <div className="card-header"><span className="card-tag">Detail des recherches</span></div>
                <div className="card-content">
                  {(result.keywords_tried || []).length > 0 && (
                    <div className="keywords-section">
                      <span className="mini-label">Mots-cles essayes</span>
                      <div className="keyword-chips">
                        {result.keywords_tried.map((k, i) => <span key={i} className="keyword-chip">{k}</span>)}
                      </div>
                    </div>
                  )}
                  {(result.search_queries_used || []).length > 0 && (
                    <div className="queries-section">
                      <span className="mini-label">Requetes</span>
                      <div className="queries">
                        {result.search_queries_used.map((q, i) => <div key={i}><code>{q}</code></div>)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sources */}
            {(result.sources || []).length > 0 && (
              <div className="card anim-rise d4">
                <div className="card-header"><span className="card-tag">Sources</span></div>
                <div className="card-content queries">
                  {result.sources.map((s, i) => (
                    <div key={i}>
                      {String(s).startsWith('http')
                        ? <a href={s} target="_blank" rel="noreferrer">{s}</a>
                        : s}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="app-footer">
          <span>SOLVEX · {new Date().getFullYear()}</span>
          <span className="compliance-text">
            Prospection B2B. Donnees publiques, a verifier. Emails deduits marques comme tels.
          </span>
        </footer>
      </div>
    </>
  );
}

// Nexus – Oberfläche im Stil von dash.slxt.dev / slxt.org (Apple HIG). Logik und API unverändert.
import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  Home, Hash, MessageCircle, User, Settings, SquarePen, ChevronLeft, Heart, Repeat2, Trash2,
  Image as ImageIcon, X, Check, Loader2, AlertCircle, BadgeCheck, LogOut, UserPlus, Search,
  Send, Inbox, TrendingUp, Sparkles, MailCheck, Sun, Moon,
} from 'lucide-react';
import { api, auth, connectEvents, compressImage } from './api.js';

const MAX_POST_LEN = 280;
const MAX_DM_LEN = 1000;
const ruhig = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================ Helfer
const formatTime = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
  return new Date(ts).toLocaleDateString();
};
// Farbe für Initialen-Avatare: kräftig genug für weißen Text (Kontrast)
const hashColor = (str) => {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 42%)`;
};
const extractHashtags = (text) => {
  const m = text.match(/#[\wÀ-ſ]+/g) || [];
  return [...new Set(m.map((t) => t.substring(1).toLowerCase()))];
};

// ============================================================ Himmel (wie slxt.org)
function Himmel() {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current, cv = box.querySelector('canvas'), ctx = cv.getContext('2d'), schnuppen = box.lastChild;
    const sterne = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = window.innerWidth, h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      for (let i = 0, n = Math.round(w * h / 5200); i < n; i++) {
        ctx.globalAlpha = 0.25 + Math.random() * 0.65;
        ctx.fillStyle = Math.random() < 0.15 ? '#cdd8ff' : '#ffffff';
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h * 0.92, Math.random() < 0.08 ? 1.3 : Math.random() * 0.8 + 0.3, 0, Math.PI * 2); ctx.fill();
      }
    };
    sterne();
    let rt; const groesse = () => { clearTimeout(rt); rt = setTimeout(sterne, 200); };
    window.addEventListener('resize', groesse);
    const meteor = () => {
      if (ruhig() || document.hidden) return;
      const W = window.innerWidth, H = window.innerHeight, len = 80 + Math.random() * 150, dir = Math.random() < 0.5 ? 1 : -1;
      const ang = (14 + Math.random() * 26) * Math.PI / 180, dist = Math.max(W, H) * (0.22 + Math.random() * 0.25);
      const x0 = dir > 0 ? Math.random() * W * 0.65 : W * 0.35 + Math.random() * W * 0.65, y0 = Math.random() * H * 0.42;
      const x1 = x0 + dir * Math.cos(ang) * dist, y1 = y0 + Math.sin(ang) * dist, deg = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
      const el = document.createElement('i'); el.className = 'meteor'; el.style.width = `${len}px`; el.style.opacity = '0'; schnuppen.append(el);
      const at = (x, y, s) => `translate(${x - len}px, ${y - 1}px) rotate(${deg}deg) scaleX(${s})`;
      const a = el.animate([{ transform: at(x0, y0, 0.3), opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.9, offset: 0.65 }, { transform: at(x1, y1, 1), opacity: 0 }],
        { duration: 650 + Math.random() * 700, easing: 'cubic-bezier(.3, .55, .55, 1)' });
      a.onfinish = a.oncancel = () => el.remove();
    };
    let t;
    const plan = (erst) => { t = setTimeout(() => { meteor(); plan(false); }, erst ? 2500 + Math.random() * 3000 : 6000 + Math.random() * 10000); };
    plan(true);
    return () => { window.removeEventListener('resize', groesse); clearTimeout(t); clearTimeout(rt); };
  }, []);
  return <div ref={ref} className="himmel" aria-hidden="true"><canvas /><div className="sternschnuppen" /></div>;
}

// ============================================================ Grundbausteine
function Avatar({ user, size = 40, onClick, label }) {
  const stil = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  let innen;
  let klasse = 'avatar';
  if (!user) innen = null;
  else if (user.isOwner) { klasse += ' besitzer'; innen = <img src="/logo.svg" alt="" />; }
  else if (user.avatar) innen = <img src={user.avatar} alt="" />;
  else { stil.background = hashColor(user.id || user.username); innen = (user.displayName || user.username || '?').charAt(0).toUpperCase(); }
  if (onClick) {
    return <button type="button" className={klasse} style={stil} onClick={onClick} aria-label={label || `Profile of ${user?.displayName || ''}`}>{innen}</button>;
  }
  return <span className={klasse} style={stil} aria-hidden="true">{innen}</span>;
}

function Abzeichen({ user }) {
  if (!user?.isOwner) return null;
  return <span className="abzeichen" title="Admin" aria-label="Admin"><BadgeCheck aria-hidden="true" /></span>;
}

function PostContent({ content, onHashtag }) {
  if (!content) return null;
  const parts = content.split(/(#[\wÀ-ſ]+|@[\w]+|https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith('#')) {
          return <button key={i} type="button" className="tag" onClick={(e) => { e.stopPropagation(); onHashtag && onHashtag(p.substring(1).toLowerCase()); }}>{p}</button>;
        }
        if (p.startsWith('@')) return <span key={i} className="erwaehnung">{p}</span>;
        if (p.startsWith('http')) return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="link" onClick={(e) => e.stopPropagation()}>{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// Hell/Dunkel (public/modus.js, Standard hell; Wahl bleibt im Browser)
function useModus() {
  const [modus, setModus] = useState(() => window.slxtModus?.get() || 'dunkel');
  useEffect(() => {
    // flushSync: sofort neu zeichnen, damit die Momentaufnahme fürs Überblenden schon das neue Symbol zeigt
    const f = (e) => flushSync(() => setModus(e.detail));
    window.addEventListener('modus', f);
    return () => window.removeEventListener('modus', f);
  }, []);
  // Wechsel wie auf allen slxt-Seiten: langsam überblenden (modus.js → slxtModus.sanft), sonst direkt
  return [modus, (m) => {
    const s = window.slxtModus;
    if (!s || m === s.get()) return;
    if (s.sanft) s.sanft(); else s.setzen(m);
  }];
}

function ModusKnopf({ className = 'knopf rund ohne' }) {
  const [modus, setzen] = useModus();
  const dunkel = modus === 'dunkel';
  const text = dunkel ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className={className} onClick={() => setzen(dunkel ? 'hell' : 'dunkel')} aria-label={text} title={text}>
      {dunkel ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

// Rechtliches (zentral auf slxt.org, deutsch)
const RECHT = [
  ['Imprint', 'https://slxt.org/impressum/'],
  ['Privacy', 'https://slxt.org/datenschutz/#nexus'],
  ['Terms', 'https://slxt.org/nutzungsbedingungen/'],
];
function RechtLinks({ className = 'recht-links' }) {
  return (
    <nav className={className} aria-label="Legal">
      {RECHT.map(([t, h]) => <a key={t} href={h} target="_blank" rel="noopener noreferrer">{t}</a>)}
      <span className="leise">(in German)</span>
    </nav>
  );
}

function Laedt({ text = 'Loading…' }) {
  return <div className="laedt" role="status"><Loader2 size={20} className="dreht" aria-hidden="true" />{text}</div>;
}

function Leer({ icon: Icon = Sparkles, titel, text, children }) {
  return (
    <div className="leer">
      <Icon aria-hidden="true" />
      <strong>{titel}</strong>
      {text && <span>{text}</span>}
      {children}
    </div>
  );
}

// Kopfleiste einer Ansicht: Zurück (mit Text), Titel, Aktionen rechts
function Kopf({ titel, unter, onBack, backLabel = 'Back', children, marke }) {
  return (
    <header className="kopf">
      {onBack && (
        <button type="button" className="zurueck" onClick={onBack} aria-label={backLabel}>
          <ChevronLeft aria-hidden="true" /><span className="nur-breit">{backLabel}</span>
        </button>
      )}
      {marke && !onBack && <img src="/logo.svg" alt="" width="32" height="32" className="mobil-marke" style={{ borderRadius: 9 }} />}
      <div className="titel">
        <h1>{titel}</h1>
        {unter && <div className="unter">{unter}</div>}
      </div>
      {children}
    </header>
  );
}

// Segment-Steuerung (gleich breite Segmente, gleitender Daumen)
function Segmente({ werte, wert, onChange, label }) {
  const i = Math.max(0, werte.findIndex(([w]) => w === wert));
  return (
    <div className="segmente" role="tablist" aria-label={label}>
      <span className="daumen" aria-hidden="true" style={{ width: `calc((100% - 6px) / ${werte.length})`, transform: `translateX(${i * 100}%)` }} />
      {werte.map(([w, text]) => (
        <button key={w} type="button" role="tab" aria-selected={w === wert} onClick={() => onChange(w)}>{text}</button>
      ))}
    </div>
  );
}

// Überlagerung (kein <dialog>: Safari/WebKit lässt Animationen im Top-Layer hängen)
function Ueberlagerung({ titel, onClose, children, rechts }) {
  const ref = useRef(null);
  const schliessen = useRef(onClose);
  schliessen.current = onClose;   // aktuelle Funktion merken, ohne den Effekt neu zu starten (Fokus bleibt beim Live-Update)
  useEffect(() => {
    const vorher = document.activeElement;
    const taste = (e) => {
      if (e.key === 'Escape') schliessen.current();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('button, input, textarea, [href]')].filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', taste);
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('textarea, input')?.focus(), 30);
    return () => { window.removeEventListener('keydown', taste); document.documentElement.style.overflow = ''; vorher?.focus?.(); };
  }, []);
  return (
    <div className="ueberlagerung">
      <div className="hintergrund" onClick={onClose} aria-hidden="true" />
      <div className="blatt" role="dialog" aria-modal="true" aria-label={titel} ref={ref}>
        <div className="blatt-kopf">
          <div className="platz"><button type="button" className="knopf ohne klein" onClick={onClose}>Cancel</button></div>
          <h2>{titel}</h2>
          <div className="platz" style={{ textAlign: 'right' }}>{rechts}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Image">
      <button type="button" className="knopf rund" onClick={onClose} aria-label="Close" autoFocus><X aria-hidden="true" /></button>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ============================================================ Anmeldung
function AuthScreen({ onAuthenticated }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [regToken, setRegToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newAvatar, setNewAvatar] = useState(null);
  const fileRef = useRef(null);

  const submitEmail = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await api.requestCode(email.trim().toLowerCase());
      setEmail(email.trim().toLowerCase());
      setStep('code');
    } catch (err) { setError(err.message || 'Could not send the code.'); }
    setBusy(false);
  };
  const submitCode = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await api.verifyCode(email, code.trim());
      if (res.needsRegistration) {
        setRegToken(res.regToken);
        const sug = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 15) || 'user';
        setNewUsername(sug); setNewDisplay(sug);
        setStep('profile');
      } else { auth.setToken(res.token); onAuthenticated(res.user); }
    } catch (err) { setError(err.message || 'That code didn’t work.'); }
    setBusy(false);
  };
  const handleAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please choose an image.'); return; }
    try { setNewAvatar(await compressImage(f, 200, 0.75)); }
    catch { setError('Could not process the image.'); }
  };
  const submitProfile = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await api.register(regToken, newUsername, newDisplay, newAvatar);
      auth.setToken(res.token); onAuthenticated(res.user);
    } catch (err) { setError(err.message || 'Could not create your profile.'); }
    setBusy(false);
  };

  const schritt = { email: 0, code: 1, profile: 2 }[step];
  const Fehler = () => error ? <div className="fehler" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</div> : null;

  return (
    <main className="anmeldung">
      <ModusKnopf className="knopf rund modus-fest" />
      <div className="karte">
        <img className="logo" src="/logo.svg" alt="" width="72" height="72" />
        <h1>nexus<span className="punkt">.</span></h1>
        <p className="unterzeile">
          {step === 'email' && 'Sign in or create an account with your email.'}
          {step === 'code' && <>We sent a 6-digit code to <strong>{email}</strong>.</>}
          {step === 'profile' && 'Almost there – choose how others see you.'}
        </p>
        <div className="schritte" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i === schritt ? 'an' : ''} />)}</div>

        {step === 'email' && (
          <form onSubmit={submitEmail}>
            <label className="feld"><span>Email</span>
              <input className="eingabe" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck="false" />
            </label>
            <button type="submit" disabled={busy || !email.trim()} className="knopf primaer gross">
              {busy ? <Loader2 size={18} className="dreht" aria-hidden="true" /> : null}{busy ? 'Sending…' : 'Continue'}
            </button>
            <Fehler />
          </form>
        )}
        {step === 'code' && (
          <form onSubmit={submitCode}>
            <label className="feld"><span>Verification Code</span>
              <input className="eingabe code" autoFocus required maxLength={6} value={code} inputMode="numeric" autoComplete="one-time-code"
                pattern="[0-9]{6}" aria-describedby="code-hilfe" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
              <small id="code-hilfe">Check your inbox – the code is valid for a few minutes.</small>
            </label>
            <button type="submit" disabled={busy || code.length !== 6} className="knopf primaer gross">
              {busy ? <Loader2 size={18} className="dreht" aria-hidden="true" /> : null}{busy ? 'Checking…' : 'Verify'}
            </button>
            <button type="button" className="knopf ohne" onClick={() => { setStep('email'); setCode(''); setError(''); }}>Use a Different Email</button>
            <Fehler />
          </form>
        )}
        {step === 'profile' && (
          <form onSubmit={submitProfile}>
            <div className="avatar-wahl">
              <Avatar user={{ username: newUsername || '?', displayName: newDisplay, avatar: newAvatar }} size={72} />
              <div style={{ display: 'grid', gap: 4 }}>
                <button type="button" className="knopf klein" onClick={() => fileRef.current?.click()}><ImageIcon size={16} aria-hidden="true" />Choose Photo</button>
                <small className="leise">Optional – you can change it later.</small>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
            </div>
            <label className="feld"><span>Username</span>
              <div className="mit-vorsatz"><span aria-hidden="true">@</span>
                <input className="eingabe" value={newUsername} maxLength={20} autoCapitalize="none" spellCheck="false" required
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
              </div>
              <small>Letters, numbers and _ – can’t be changed later.</small>
            </label>
            <label className="feld"><span>Display Name</span>
              <input className="eingabe" value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} maxLength={30} required />
            </label>
            <button type="submit" disabled={busy} className="knopf primaer gross">
              {busy ? <Loader2 size={18} className="dreht" aria-hidden="true" /> : null}{busy ? 'Creating…' : 'Join Nexus'}
            </button>
            <small className="leise zustimmung">By joining you accept the <a href="https://slxt.org/nutzungsbedingungen/" target="_blank" rel="noopener noreferrer">Terms of Use</a> and
              confirm you are at least 14. How your data is used: <a href="https://slxt.org/datenschutz/#nexus" target="_blank" rel="noopener noreferrer">Privacy Policy</a> (both in German).</small>
            <Fehler />
          </form>
        )}
        <RechtLinks />
      </div>
    </main>
  );
}

// ============================================================ Verfassen
function Composer({ user, onSubmit, replyTo = null, placeholder = null, autoFocus = false }) {
  const [content, setContent] = useState('');
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const pickImage = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please choose an image.'); return; }
    if (f.size > 15 * 1024 * 1024) { setError('That image is too large (max. 15 MB).'); return; }
    setError(''); setUploading(true);
    try { setImage(await compressImage(f, 1200, 0.82)); }
    catch { setError('Could not process the image.'); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    const t = content.trim();
    if ((!t && !image) || busy) return;
    setBusy(true); setError('');
    try {
      let imageUrl = null;
      if (image) imageUrl = (await api.upload(image)).url;
      await onSubmit({ content: t, imageUrl });
      setContent(''); setImage(null);
    } catch (e) { setError(e.message || 'Could not post.'); }
    setBusy(false);
  };

  const remaining = MAX_POST_LEN - content.length;
  const over = remaining < 0;
  const canSubmit = (content.trim() || image) && !over && !busy && !uploading;
  const anteil = Math.min(1, content.length / MAX_POST_LEN), umfang = 2 * Math.PI * 10;

  return (
    <div className="verfassen">
      <Avatar user={user} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} autoFocus={autoFocus}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
          aria-label={replyTo ? `Reply to @${replyTo.username}` : 'New post'}
          placeholder={placeholder || (replyTo ? `Reply to @${replyTo.username}` : 'What’s happening?')} rows={2} />
        {image && (
          <div className="anhang">
            <img src={image} alt="Attached image" />
            <button type="button" className="knopf rund klein" onClick={() => setImage(null)} aria-label="Remove image"><X size={16} aria-hidden="true" /></button>
          </div>
        )}
        <div className="werkzeuge">
          <button type="button" className="knopf rund ohne" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Add image" title="Add image">
            {uploading ? <Loader2 size={20} className="dreht" aria-hidden="true" /> : <ImageIcon size={20} aria-hidden="true" style={{ color: 'var(--akzent)' }} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} hidden />
          {extractHashtags(content).length > 0 && <span className="leise" style={{ fontSize: 'var(--t-mini)' }}>{extractHashtags(content).length} #</span>}
          <div className="rechts-teil">
            {content.length > 0 && (
              <>
                {remaining <= 20 && <span className={`rest ${over ? 'ueber' : ''}`} aria-live="polite">{remaining}</span>}
                <svg className={`ring ${over ? 'ueber' : remaining <= 20 ? 'knapp' : ''}`} viewBox="0 0 26 26" aria-hidden="true">
                  <circle className="bahn" cx="13" cy="13" r="10" fill="none" strokeWidth="2.5" />
                  <circle className="wert" cx="13" cy="13" r="10" fill="none" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={umfang} strokeDashoffset={umfang * (1 - anteil)} />
                </svg>
              </>
            )}
            <button type="button" onClick={submit} disabled={!canSubmit} className="knopf primaer klein">
              {busy ? <Loader2 size={16} className="dreht" aria-hidden="true" /> : null}{replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
        </div>
        {error && <div className="fehler" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</div>}
      </div>
    </div>
  );
}

// ============================================================ Beitrag
function PostCard({ post, currentUser, onAction, onNavigate, onHashtag, onLightbox, hervor = false }) {
  const [pop, setPop] = useState('');
  if (!post || !post.author) return null;
  if (post.repostOf && !post.content && !post.imageUrl) return null;

  const liked = post.viewer?.liked;
  const reposted = post.viewer?.reposted;
  const canDelete = currentUser.id === post.authorId || currentUser.isOwner;
  const tun = (aktion) => (e) => {
    e.stopPropagation();
    if (!ruhig() && aktion !== 'delete') { setPop(aktion); setTimeout(() => setPop(''), 500); }
    onAction(aktion, post.id);
  };
  const oeffnen = () => { if (!hervor) onNavigate('post', post.id); };

  return (
    <article className={`karte post${hervor ? ' hervor' : ''}`} onClick={oeffnen} aria-label={`Post by ${post.author.displayName}`}>
      <Avatar user={post.author} size={hervor ? 52 : 44} onClick={(e) => { e.stopPropagation(); onNavigate('profile', post.authorId); }} />
      <div className="rumpf">
        <div className="zeile">
          <button type="button" className="name" onClick={(e) => { e.stopPropagation(); onNavigate('profile', post.authorId); }}>{post.author.displayName}</button>
          <Abzeichen user={post.author} />
          <span className="handle">@{post.author.username}</span>
          {!hervor && <><span className="handle" aria-hidden="true">·</span>
            <button type="button" className="zeit" onClick={(e) => { e.stopPropagation(); onNavigate('post', post.id); }} aria-label={`Open post from ${new Date(post.createdAt).toLocaleString()}`}>
              <time dateTime={post.createdAt}>{formatTime(post.createdAt)}</time></button></>}
          {canDelete && (
            <button type="button" className="knopf rund ohne loeschen" onClick={tun('delete')} aria-label="Delete post" title="Delete">
              <Trash2 size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {post.replyTo && <div className="antwort-hinweis">Reply in a thread</div>}
        {post.content && <div className="inhalt"><PostContent content={post.content} onHashtag={onHashtag} /></div>}
        {post.imageUrl && (
          <button type="button" className="bild" onClick={(e) => { e.stopPropagation(); onLightbox(post.imageUrl); }} aria-label="Show image larger">
            <img src={post.imageUrl} alt="" loading="lazy" />
          </button>
        )}
        {hervor && <div className="detail-zeit"><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div>}
        <div className="aktionen">
          <button type="button" className="aktion antwort" onClick={(e) => { e.stopPropagation(); onNavigate('post', post.id); }} aria-label={`Reply, ${post.counts?.replies || 0} replies`}>
            <MessageCircle aria-hidden="true" /><span>{post.counts?.replies || 0}</span>
          </button>
          <button type="button" className={`aktion repost${reposted ? ' an' : ''}${pop === 'repost' ? ' pop' : ''}`} onClick={tun('repost')}
            aria-pressed={!!reposted} aria-label={`Repost, ${post.counts?.reposts || 0}`}>
            <Repeat2 aria-hidden="true" /><span>{post.counts?.reposts || 0}</span>
          </button>
          <button type="button" className={`aktion like${liked ? ' an' : ''}${pop === 'like' ? ' pop' : ''}`} onClick={tun('like')}
            aria-pressed={!!liked} aria-label={`Like, ${post.counts?.likes || 0}`}>
            <Heart aria-hidden="true" /><span>{post.counts?.likes || 0}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

// ============================================================ Navigation
const NAV = [
  { id: 'feed', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Hash },
  { id: 'messages', label: 'Messages', icon: MessageCircle },
  { id: 'profile', label: 'Profile', icon: User },
];

function Sidebar({ currentUser, currentView, onNavigate, onLogout, onCompose, unreadDMs }) {
  const items = [...NAV, { id: 'settings', label: 'Settings', icon: Settings }];
  return (
    <aside className="seitenleiste" aria-label="Navigation">
      <button type="button" className="marke" onClick={() => onNavigate('feed')} aria-label="Nexus – Home">
        <img src="/logo.svg" alt="" width="38" height="38" /><span>nexus<span className="punkt">.</span></span>
      </button>
      <nav style={{ display: 'grid', gap: 4 }}>
        {items.map((item) => {
          const Icon = item.icon;
          const aktiv = currentView === item.id;
          return (
            <button key={item.id} type="button" className="nav-punkt" aria-current={aktiv ? 'page' : undefined}
              onClick={() => onNavigate(item.id, item.id === 'profile' ? currentUser.id : null)}>
              <Icon aria-hidden="true" strokeWidth={aktiv ? 2.4 : 2} /><span>{item.label}</span>
              {item.id === 'messages' && unreadDMs > 0 && <span className="badge" aria-label={`${unreadDMs} unread`}>{unreadDMs > 99 ? '99+' : unreadDMs}</span>}
            </button>
          );
        })}
      </nav>
      <button type="button" className="knopf primaer gross neu" onClick={onCompose}><SquarePen size={20} aria-hidden="true" />New Post</button>
      <div className="konto">
        <Avatar user={currentUser} size={40} />
        <div className="wer"><strong>{currentUser.displayName}</strong><span>@{currentUser.username}</span></div>
        <ModusKnopf />
        <button type="button" className="knopf rund ohne" onClick={onLogout} aria-label="Log out" title="Log out"><LogOut size={20} aria-hidden="true" /></button>
      </div>
    </aside>
  );
}

function TabLeiste({ currentView, onNavigate, currentUser, unreadDMs }) {
  return (
    <nav className="tableiste" aria-label="Navigation">
      {NAV.map((item) => {
        const Icon = item.icon;
        const aktiv = currentView === item.id;
        return (
          <button key={item.id} type="button" className="tab" aria-current={aktiv ? 'page' : undefined}
            onClick={() => onNavigate(item.id, item.id === 'profile' ? currentUser.id : null)}>
            <Icon aria-hidden="true" strokeWidth={aktiv ? 2.4 : 1.9} />{item.label}
            {item.id === 'messages' && unreadDMs > 0 && <span className="badge" aria-label={`${unreadDMs} unread`}>{unreadDMs > 9 ? '9+' : unreadDMs}</span>}
          </button>
        );
      })}
    </nav>
  );
}

// Aktion „Neuer Beitrag“ in der Kopfleiste (schmal) – Tabs navigieren nur
const NeuKnopf = ({ onCompose }) => (
  <button type="button" className="knopf rund nur-schmal" onClick={onCompose} aria-label="New post" style={{ color: 'var(--akzent)' }}>
    <SquarePen size={22} aria-hidden="true" />
  </button>
);

// Gemeinsame Aktionen für Beitragslisten
function useBeitragsAktionen(finde, load, onRefresh, nachLoeschen) {
  return async (action, id) => {
    try {
      if (action === 'like') {
        const p = finde(id);
        if (!p) return;
        if (p.viewer?.liked) await api.unlike(id); else await api.like(id);
      } else if (action === 'repost') {
        await api.createPost({ repostOf: id });
      } else if (action === 'delete') {
        if (!window.confirm('Delete this post? This can’t be undone.')) return;
        await api.deletePost(id);
        if (nachLoeschen && nachLoeschen(id)) return;
      }
      load(); onRefresh();
    } catch (e) { console.error(e); }
  };
}

// ============================================================ Feed
function FeedView({ currentUser, onNavigate, onHashtag, onLightbox, refreshKey, onRefresh, onCompose }) {
  const [tab, setTab] = useState('all');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.getFeed(tab); setPosts(r.posts || []); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, [tab]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleAction = useBeitragsAktionen((id) => posts.find((x) => x.id === id), load, onRefresh);
  const createPost = async ({ content, imageUrl }) => { await api.createPost({ content, imageUrl }); load(); onRefresh(); };

  return (
    <>
      <Kopf titel="Home" marke>
        <span className="live nur-breit" title="New posts appear automatically"><span className="punkt-live" aria-hidden="true" />Live</span>
        <NeuKnopf onCompose={onCompose} />
      </Kopf>
      <Segmente label="Feed" werte={[['all', 'For You'], ['following', 'Following']]} wert={tab} onChange={setTab} />
      <div className="karte nur-breit"><Composer user={currentUser} onSubmit={createPost} /></div>
      {loading && posts.length === 0 && <Laedt text="Loading posts…" />}
      {!loading && posts.length === 0 && (
        tab === 'following'
          ? <Leer icon={UserPlus} titel="Nothing Here Yet" text="Follow people to see their posts in this tab."><button type="button" className="knopf primaer" onClick={() => onNavigate('explore')}>Find People</button></Leer>
          : <Leer titel="No Posts Yet" text="Be the first to share something."><button type="button" className="knopf primaer" onClick={onCompose}>New Post</button></Leer>
      )}
      <div className="liste">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} />
        ))}
      </div>
    </>
  );
}

// ============================================================ Explore
function ExploreView({ currentUser, hashtag, initialQuery = '', onNavigate, onHashtag, onLightbox, refreshKey, onRefresh, onCompose }) {
  const [query, setQuery] = useState(initialQuery);
  const [posts, setPosts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [feed, trend] = await Promise.all([hashtag ? api.getFeed('all', hashtag) : api.getFeed('all'), api.trending()]);
      setPosts(feed.posts || []); setTrending(trend.tags || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [hashtag]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);

  const handleAction = useBeitragsAktionen((id) => posts.find((x) => x.id === id), load, onRefresh);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? posts.filter((p) => (p.content || '').toLowerCase().includes(q) || p.author?.username.toLowerCase().includes(q) || p.author?.displayName.toLowerCase().includes(q))
    : posts;

  return (
    <>
      {hashtag ? (
        <Kopf titel={`#${hashtag}`} unter={`${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`} onBack={() => onNavigate('explore')} backLabel="Explore">
          <NeuKnopf onCompose={onCompose} />
        </Kopf>
      ) : (
        <Kopf titel="Explore" marke><NeuKnopf onCompose={onCompose} /></Kopf>
      )}
      {!hashtag && (
        <label className="suchfeld" style={{ marginTop: 12 }}>
          <Search aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts and people" aria-label="Search posts and people" enterKeyHint="search" />
        </label>
      )}
      {!hashtag && !q && (
        <section className="karte" style={{ padding: 16, marginTop: 12 }} aria-labelledby="trends-titel">
          <h2 id="trends-titel" style={{ fontSize: '1.125rem', fontWeight: 800, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={20} aria-hidden="true" style={{ color: 'var(--akzent)' }} />Trending
          </h2>
          {trending.length === 0 ? <p className="leise">No trends yet – add a #hashtag to your next post.</p> : (
            <div className="trends">
              {trending.map(({ tag, c }) => (
                <button key={tag} type="button" className="trend" onClick={() => onHashtag(tag)}>
                  <strong>#{tag}</strong><span>{c} {c === 1 ? 'post' : 'posts'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      {loading && posts.length === 0 ? <Laedt /> : filtered.length === 0
        ? <Leer icon={Search} titel="No Results" text={q ? `Nothing matches “${query.trim()}”. Try another word.` : 'No posts here yet.'} />
        : (
          <div className="liste">
            {filtered.map((p) => (
              <PostCard key={p.id} post={p} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} />
            ))}
          </div>
        )}
    </>
  );
}

// ============================================================ Profil
function ProfileView({ userId, currentUser, onNavigate, onHashtag, onLightbox, refreshKey, onRefresh, onCompose }) {
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [replies, setReplies] = useState([]);
  const [tab, setTab] = useState('posts');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, p, r] = await Promise.all([api.getUser(userId), api.getUserPosts(userId, false), api.getUserPosts(userId, true)]);
      setData(u); setPosts(p.posts || []); setReplies(r.posts || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleFollow = async () => {
    if (data.viewer.isFollowing) await api.unfollow(userId); else await api.follow(userId);
    load(); onRefresh();
  };
  const handleAction = useBeitragsAktionen((id) => [...posts, ...replies].find((x) => x.id === id), load, onRefresh);

  if (!data) return <><Kopf titel="Profile" onBack={() => onNavigate('feed')} backLabel="Home" />{loading ? <Laedt /> : <Leer icon={User} titel="Profile Not Found" />}</>;
  const list = tab === 'posts' ? posts : replies;
  const u = data.user;

  return (
    <>
      <Kopf titel={u.displayName} unter={`${data.counts.posts} ${data.counts.posts === 1 ? 'post' : 'posts'}`} onBack={() => onNavigate('feed')} backLabel="Home">
        <NeuKnopf onCompose={onCompose} />
      </Kopf>
      <section className="karte profil" aria-label="Profile">
        <div className="oben">
          <Avatar user={u} size={88} />
          <div className="knoepfe">
            {!data.viewer.isSelf && (
              <button type="button" className="knopf umriss" onClick={() => onNavigate('dm', userId)}><MessageCircle size={18} aria-hidden="true" />Message</button>
            )}
            {data.viewer.isSelf ? (
              <button type="button" className="knopf umriss" onClick={() => onNavigate('settings')}><Settings size={18} aria-hidden="true" />Edit Profile</button>
            ) : data.viewer.isFollowing ? (
              <button type="button" className="knopf umriss folge-ich" onClick={toggleFollow} aria-label={`Following – unfollow @${u.username}`}>
                <Check size={18} aria-hidden="true" />Following
              </button>
            ) : (
              <button type="button" className="knopf primaer" onClick={toggleFollow}><UserPlus size={18} aria-hidden="true" />Follow</button>
            )}
          </div>
        </div>
        <h2>{u.displayName} <Abzeichen user={u} /></h2>
        <div className="handle">@{u.username}</div>
        {u.bio && <p className="bio"><PostContent content={u.bio} onHashtag={onHashtag} /></p>}
        <div className="zahlen">
          <span><strong>{data.counts.following}</strong> Following</span>
          <span><strong>{data.counts.followers}</strong> {data.counts.followers === 1 ? 'Follower' : 'Followers'}</span>
        </div>
      </section>
      <Segmente label="Profile" werte={[['posts', 'Posts'], ['replies', 'Replies']]} wert={tab} onChange={setTab} />
      {list.length === 0
        ? <Leer icon={tab === 'posts' ? SquarePen : MessageCircle} titel={tab === 'posts' ? 'No Posts Yet' : 'No Replies Yet'}
            text={data.viewer.isSelf ? (tab === 'posts' ? 'Share your first post.' : 'Replies you write appear here.') : undefined} />
        : <div className="liste">{list.map((p) => (
            <PostCard key={p.id} post={p} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} />
          ))}</div>}
    </>
  );
}

// ============================================================ Thread
function PostDetailView({ postId, currentUser, onNavigate, onHashtag, onLightbox, refreshKey, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.getPost(postId)); }
    catch { setData({ error: true }); }
    setLoading(false);
  }, [postId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const handleAction = useBeitragsAktionen(
    (id) => [data?.post, ...(data?.parents || []), ...(data?.replies || [])].filter(Boolean).find((x) => x.id === id),
    load, onRefresh, (id) => { if (id === postId) { onNavigate('feed'); return true; } return false; });
  const createReply = async ({ content, imageUrl }) => { await api.createPost({ content, imageUrl, replyTo: postId }); load(); onRefresh(); };

  if (loading && !data) return <><Kopf titel="Post" onBack={() => onNavigate('feed')} backLabel="Home" /><Laedt /></>;
  if (!data || data.error) return (
    <><Kopf titel="Post" onBack={() => onNavigate('feed')} backLabel="Home" />
      <Leer icon={AlertCircle} titel="Post Not Available" text="It may have been deleted."><button type="button" className="knopf primaer" onClick={() => onNavigate('feed')}>Back to Home</button></Leer></>
  );
  const { post, parents, replies } = data;
  return (
    <>
      <Kopf titel="Post" onBack={() => onNavigate('feed')} backLabel="Home" />
      <div className="liste">
        {parents.map((p) => (
          <PostCard key={p.id} post={p} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} />
        ))}
        <PostCard post={post} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} hervor />
        <div className="karte"><Composer user={currentUser} onSubmit={createReply} replyTo={post.author} /></div>
        {replies.map((r) => (
          <PostCard key={r.id} post={r} currentUser={currentUser} onAction={handleAction} onNavigate={onNavigate} onHashtag={onHashtag} onLightbox={onLightbox} />
        ))}
      </div>
    </>
  );
}

// ============================================================ Einstellungen
function SettingsView({ currentUser, onNavigate, onUserUpdated, onLogout }) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const gesperrt = currentUser.isOwner;
  const [modus, setModus] = useModus();

  const handleAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Please choose an image.'); return; }
    try { setAvatar(await compressImage(f, 200, 0.75)); }
    catch { setError('Could not process the image.'); }
  };
  const save = async () => {
    setError(''); setSaving(true);
    try {
      const r = await api.updateMe({ displayName, bio, avatar });
      onUserUpdated(r.user);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message || 'Could not save.'); }
    setSaving(false);
  };

  return (
    <>
      <Kopf titel="Settings" onBack={() => onNavigate('profile', currentUser.id)} backLabel="Profile" />
      <div className="karte einstellungen">
        {gesperrt && <div className="hinweis-box warn">This is the system’s owner profile – it can’t be edited here.</div>}
        <div className="avatar-wahl">
          <Avatar user={{ ...currentUser, avatar }} size={80} />
          <button type="button" className="knopf" disabled={gesperrt} onClick={() => fileRef.current?.click()}><ImageIcon size={18} aria-hidden="true" />Change Photo</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
        </div>
        <div className="feld"><span>Appearance</span>
          <Segmente label="Appearance" werte={[['hell', 'Light'], ['dunkel', 'Dark']]} wert={modus} onChange={setModus} />
          <small>Saved in this browser. Dark is the default.</small>
        </div>
        <label className="feld"><span>Display Name</span>
          <input className="eingabe" disabled={gesperrt} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={30} />
        </label>
        <div className="feld"><span>Username</span>
          <div className="eingabe" aria-readonly="true" style={{ color: 'var(--text-2)' }}>@{currentUser.username}</div>
          <small>Usernames can’t be changed.</small>
        </div>
        <label className="feld"><span>Bio</span>
          <textarea className="eingabe" disabled={gesperrt} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="Tell people a little about yourself" />
          <small style={{ textAlign: 'right' }}>{160 - bio.length} characters left</small>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="knopf primaer" onClick={save} disabled={saving || gesperrt}>
            {saving ? <Loader2 size={16} className="dreht" aria-hidden="true" /> : saved ? <Check size={16} aria-hidden="true" /> : null}
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" className="knopf gefahr nur-schmal" onClick={onLogout}><LogOut size={18} aria-hidden="true" />Log Out</button>
        </div>
        {error && <div className="fehler" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</div>}
        <RechtLinks />
        <small className="leise">To delete your account, email office@slxt.org from your registered address.</small>
      </div>
    </>
  );
}

// ============================================================ Nachrichten
function MessagesView({ currentUser, onNavigate, refreshKey }) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.threads(); setThreads(r.threads || []); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <>
      <Kopf titel="Messages" marke>
        <button type="button" className="knopf rund" onClick={() => setPicking(true)} aria-label="New message" title="New message" style={{ color: 'var(--akzent)' }}>
          <SquarePen size={22} aria-hidden="true" />
        </button>
      </Kopf>
      {loading && threads.length === 0 && <Laedt />}
      {!loading && threads.length === 0 && (
        <Leer icon={Inbox} titel="No Messages" text="Start a private conversation with anyone on Nexus.">
          <button type="button" className="knopf primaer" onClick={() => setPicking(true)}>New Message</button>
        </Leer>
      )}
      {threads.length > 0 && (
        <div className="karte" style={{ marginTop: 12, padding: 4 }}>
          {threads.map((t, i) => (
            <div key={t.partner.id}>
              {i > 0 && <div className="trennstrich" />}
              <button type="button" className={`faden${t.unread > 0 ? ' ungelesen' : ''}`} onClick={() => onNavigate('dm', t.partner.id)}>
                <Avatar user={t.partner} size={48} />
                <div className="rumpf">
                  <div className="oben">
                    <strong>{t.partner.displayName}</strong><Abzeichen user={t.partner} />
                    <span className="leise" style={{ fontSize: 'var(--t-mini)' }}>@{t.partner.username}</span>
                    <span className="zeit">{formatTime(t.lastMessage.createdAt)}</span>
                  </div>
                  <div className="vorschau">
                    <span>{t.lastMessage.isMine ? 'You: ' : ''}{t.lastMessage.content}</span>
                    {t.unread > 0 && <span className="badge" style={{ flex: 'none' }} aria-label={`${t.unread} unread`}>{t.unread > 99 ? '99+' : t.unread}</span>}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
      {picking && <UserPicker currentUser={currentUser} onPick={(u) => { setPicking(false); onNavigate('dm', u.id); }} onClose={() => setPicking(false)} />}
    </>
  );
}

function UserPicker({ onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = q ? await api.searchUsers(q) : await api.suggestions(); setUsers(r.users || []); }
      catch { setUsers([]); }
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Ueberlagerung titel="New Message" onClose={onClose}>
      <div style={{ padding: 12 }}>
        <label className="suchfeld"><Search aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" aria-label="Search people" />
        </label>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
        {loading && <Laedt text="Searching…" />}
        {!loading && users.length === 0 && <Leer icon={Search} titel="No People Found" text="Try a different name." />}
        {!loading && users.map((u) => (
          <button key={u.id} type="button" className="faden" onClick={() => onPick(u)}>
            <Avatar user={u} size={40} />
            <div className="rumpf"><div className="oben"><strong>{u.displayName}</strong><Abzeichen user={u} /></div>
              <div className="vorschau"><span>@{u.username}</span></div></div>
          </button>
        ))}
      </div>
    </Ueberlagerung>
  );
}

function ConversationView({ partnerId, onNavigate, refreshKey, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.conversation(partnerId)); }
    catch { setData({ error: true }); }
    setLoading(false);
  }, [partnerId]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [data?.messages?.length]);

  const send = async (e) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (content.length > MAX_DM_LEN) { setError(`Messages can be up to ${MAX_DM_LEN} characters.`); return; }
    setError(''); setSending(true);
    try { await api.sendMessage(partnerId, content); setDraft(''); load(); onRefresh(); }
    catch (e) { setError(e.message || 'Could not send.'); }
    setSending(false);
  };

  if (loading && !data) return <><Kopf titel="Message" onBack={() => onNavigate('messages')} backLabel="Messages" /><Laedt /></>;
  if (!data || data.error) return <><Kopf titel="Message" onBack={() => onNavigate('messages')} backLabel="Messages" /><Leer icon={User} titel="Person Not Found" /></>;

  const { partner, messages } = data;
  return (
    <div className="gespraech">
      <Kopf titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{partner.displayName}<Abzeichen user={partner} /></span>}
        unter={`@${partner.username}`} onBack={() => onNavigate('messages')} backLabel="Messages">
        <Avatar user={partner} size={36} onClick={() => onNavigate('profile', partner.id)} label={`Profile of ${partner.displayName}`} />
      </Kopf>
      <div ref={scrollRef} className="verlauf" aria-live="polite">
        {messages.length === 0 && <Leer icon={MessageCircle} titel="Say Hi" text={`This is the start of your conversation with ${partner.displayName}.`} />}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showAvatar = !m.isMine && (!prev || prev.senderId !== m.senderId);
          const showTime = !prev || (new Date(m.createdAt) - new Date(prev.createdAt)) > 5 * 60 * 1000;
          return (
            <div key={m.id}>
              {showTime && <div className="zeitstempel">{new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>}
              <div className={`blase-zeile${m.isMine ? ' mein' : ''}`}>
                {!m.isMine && <div className="blase-platz">{showAvatar && <Avatar user={partner} size={32} />}</div>}
                <div className="blase">
                  {m.content}
                  <div className="meta"><time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>{m.isMine && m.readAt && <><Check aria-hidden="true" /><span className="vh">Read</span></>}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="eingabe-leiste">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={MAX_DM_LEN} aria-label={`Message to @${partner.username}`}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} placeholder="Message" />
        <button type="submit" className="knopf primaer rund" disabled={!draft.trim() || sending} aria-label="Send">
          {sending ? <Loader2 size={20} className="dreht" aria-hidden="true" /> : <Send size={20} aria-hidden="true" />}
        </button>
      </form>
      {error && <div className="fehler" role="alert" style={{ padding: '0 16px 8px' }}><AlertCircle size={16} aria-hidden="true" />{error}</div>}
    </div>
  );
}

// ============================================================ Verfassen-Blatt
function ComposeModal({ user, onSubmit, onClose }) {
  return (
    <Ueberlagerung titel="New Post" onClose={onClose}>
      <Composer user={user} autoFocus onSubmit={async (data) => { await onSubmit(data); onClose(); }} />
    </Ueberlagerung>
  );
}

// ============================================================ Rechte Spalte
function RightPanel({ onNavigate, refreshKey, onRefresh }) {
  const [suggestions, setSuggestions] = useState([]);
  const [latency, setLatency] = useState(null);
  const [online, setOnline] = useState(true);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    api.suggestions().then((r) => setSuggestions(r.users || [])).catch(() => {});
    const start = performance.now();
    fetch('/api/health').then((r) => { setOnline(r.ok); setLatency(Math.round(performance.now() - start)); }).catch(() => setOnline(false));
  }, [refreshKey]);

  return (
    <aside className="rechts" aria-label="Sidebar">
      <form onSubmit={(e) => { e.preventDefault(); onNavigate('explore', { suche }); }}>
        <label className="suchfeld"><Search aria-hidden="true" />
          <input type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search Nexus" aria-label="Search Nexus" enterKeyHint="search" />
        </label>
      </form>
      {suggestions.length > 0 && (
        <section className="karte" aria-labelledby="vorschlaege">
          <h3 id="vorschlaege">Who to Follow</h3>
          {suggestions.map((u) => (
            <div key={u.id} className="person">
              <Avatar user={u} size={40} onClick={() => onNavigate('profile', u.id)} />
              <button type="button" className="wer" onClick={() => onNavigate('profile', u.id)}>
                <strong>{u.displayName} <Abzeichen user={u} /></strong><span>@{u.username}</span>
              </button>
              <button type="button" className="knopf primaer klein" onClick={async () => { await api.follow(u.id); onRefresh(); }}>Follow</button>
            </div>
          ))}
        </section>
      )}
      <section className="karte" aria-labelledby="status-titel">
        <h3 id="status-titel">Status</h3>
        <div className="status-zeile"><span>Connection</span><span style={{ color: online ? 'var(--gut)' : 'var(--schlecht)' }}>{online ? 'Online' : 'Offline'}</span></div>
        <div className="status-zeile"><span>Response Time</span><span>{latency == null ? '–' : `${latency} ms`}</span></div>
        <div className="status-zeile"><span>Updates</span><span>Live</span></div>
      </section>
      <p className="fuss-info">nexus · by <a href="https://slxt.org" target="_blank" rel="noopener noreferrer">slxt.org</a></p>
      <RechtLinks />
    </aside>
  );
}

// ============================================================ App
export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState({ name: 'feed', payload: null });
  const [composeOpen, setComposeOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [unreadDMs, setUnreadDMs] = useState(0);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    (async () => {
      if (!auth.getToken()) { setLoading(false); return; }
      try { const r = await api.me(); setCurrentUser(r.user); }
      catch { auth.clear(); }
      setLoading(false);
    })();
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!currentUser) return;
    try { const r = await api.unreadCount(); setUnreadDMs(r.count || 0); } catch {}
  }, [currentUser]);
  useEffect(() => { refreshUnread(); }, [refreshUnread, refreshKey]);

  useEffect(() => {
    if (!currentUser) return;
    const off = connectEvents({
      'post:new': () => setRefreshKey((k) => k + 1),
      'post:deleted': () => setRefreshKey((k) => k + 1),
      'dm:new': (msg) => {
        setRefreshKey((k) => k + 1);
        if (!(view.name === 'dm' && view.payload === msg.senderId)) setUnreadDMs((n) => n + 1);
      },
      'dm:sent': () => setRefreshKey((k) => k + 1),
      'dm:read': () => setRefreshKey((k) => k + 1),
    });
    return off;
  }, [currentUser, view.name, view.payload]);

  // Ungelesene im Tab-Titel (wie Mail/Messages)
  useEffect(() => { document.title = unreadDMs > 0 ? `(${unreadDMs}) Nexus` : 'Nexus'; }, [unreadDMs]);

  const onAuthenticated = (user) => { setCurrentUser(user); setView({ name: 'feed', payload: null }); };
  const onLogout = () => { auth.clear(); setCurrentUser(null); setView({ name: 'feed', payload: null }); };
  const navigate = (name, payload = null) => {
    setView({ name, payload });
    window.scrollTo({ top: 0, behavior: ruhig() ? 'auto' : 'smooth' });
    if (name === 'dm') setUnreadDMs(0);
  };
  const handleHashtag = (tag) => navigate('hashtag', tag);
  const triggerRefresh = () => setRefreshKey((k) => k + 1);
  const oeffneVerfassen = () => setComposeOpen(true);

  if (loading) return <><Himmel /><Laedt text="" /></>;
  if (!currentUser) return <><Himmel /><AuthScreen onAuthenticated={onAuthenticated} /></>;

  const shared = { currentUser, onNavigate: navigate, onHashtag: handleHashtag, onLightbox: setLightboxSrc, refreshKey, onRefresh: triggerRefresh, onCompose: oeffneVerfassen };
  let content;
  if (view.name === 'feed') content = <FeedView {...shared} />;
  else if (view.name === 'explore') content = <ExploreView {...shared} initialQuery={view.payload?.suche || ''} />;
  else if (view.name === 'hashtag') content = <ExploreView {...shared} hashtag={view.payload} />;
  else if (view.name === 'profile') content = <ProfileView key={view.payload} {...shared} userId={view.payload} />;
  else if (view.name === 'post') content = <PostDetailView key={view.payload} {...shared} postId={view.payload} />;
  else if (view.name === 'settings') content = <SettingsView currentUser={currentUser} onNavigate={navigate} onUserUpdated={setCurrentUser} onLogout={onLogout} />;
  else if (view.name === 'messages') content = <MessagesView currentUser={currentUser} onNavigate={navigate} refreshKey={refreshKey} />;
  else if (view.name === 'dm') content = <ConversationView key={view.payload} partnerId={view.payload} onNavigate={navigate} refreshKey={refreshKey} onRefresh={triggerRefresh} />;

  const navView = view.name === 'hashtag' ? 'explore'
    : view.name === 'post' ? 'feed'
    : view.name === 'dm' ? 'messages'
    : view.name === 'profile' && view.payload !== currentUser.id ? 'feed'
    : view.name;

  return (
    <>
      <a className="springen" href="#inhalt">Skip to content</a>
      <Himmel />
      <div className="app">
        <Sidebar currentUser={currentUser} currentView={navView} onNavigate={navigate} onLogout={onLogout} onCompose={oeffneVerfassen} unreadDMs={unreadDMs} />
        <main className="haupt" id="inhalt">{content}</main>
        <RightPanel onNavigate={navigate} refreshKey={refreshKey} onRefresh={triggerRefresh} />
      </div>
      <TabLeiste currentView={navView} onNavigate={navigate} currentUser={currentUser} unreadDMs={unreadDMs} />
      {composeOpen && (
        <ComposeModal user={currentUser} onClose={() => setComposeOpen(false)}
          onSubmit={async ({ content, imageUrl }) => { await api.createPost({ content, imageUrl }); triggerRefresh(); }} />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </>
  );
}

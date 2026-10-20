import { useEffect } from 'react'
import { projects, site } from '../content/site'
import './reading.css'

/** Simple, fast, accessible version of everything in the room. Also the no-WebGL fallback. */
export function ReadingView({ fallback = false }: { fallback?: boolean }) {
  useEffect(() => {
    document.getElementById('boot')?.remove()
    document.body.classList.add('reading-body')
    document.documentElement.classList.add('reading-root')
    document.title = `${site.name} — reading version`
    // deep links (#/work/<id>) scroll to the matching section
    const id = location.hash.replace(/^#\/?/, '').split('/')
    const target = document.getElementById(id[1] ? `project-${id[1]}` : id[0] || '')
    target?.scrollIntoView()
    return () => {
      document.body.classList.remove('reading-body')
      document.documentElement.classList.remove('reading-root')
    }
  }, [])
  const roomHref = location.pathname + location.hash
  const c = site.contact
  return (
    <div className="reading">
      <header className="r-head">
        <img
          className="r-hero"
          src="/images/still.jpg"
          alt="A wooden desk at night in front of a rainy window: a CRT television on a VCR, stacks of labelled video tapes, a red desk lamp, a plant and a yellow legal pad."
          width={1920}
          height={1080}
        />
        <p className="r-kicker">{site.location}</p>
        <h1>{site.name}</h1>
        <p className="r-tag">{site.tagline}</p>
        <nav aria-label="Sections" className="r-nav">
          <a href="#about">About</a>
          <a href="#work">Work</a>
          <a href="#resume">Résumé</a>
          <a href="#contact">Contact</a>
          {!fallback && <a href={roomHref.replace(/\?.*$/, '')} className="r-room">Open the 3D room →</a>}
        </nav>
        {fallback && (
          <p className="r-note" role="note">
            Your browser could not start the interactive 3D room (WebGL 2 is unavailable), so you are seeing the reading
            version. Everything from the room is here.
          </p>
        )}
      </header>

      <main>
        <section id="about" aria-labelledby="about-h">
          <h2 id="about-h">About</h2>
          {site.about.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <h3>Interests</h3>
          <ul>
            {site.about.interests.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <h3>Skills</h3>
          <dl className="r-skills">
            {site.about.skills.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.items.join(', ')}</dd>
              </div>
            ))}
          </dl>
          <h3>Education</h3>
          <ul className="r-edu">
            {site.about.education.map((e) => (
              <li key={e.school}>
                <strong>{e.school}</strong>
                <span>
                  {e.degree}
                  {e.period ? ` · ${e.period}` : ''}
                </span>
                {e.note && <span className="r-dim">{e.note}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section id="work" aria-labelledby="work-h">
          <h2 id="work-h">Work</h2>
          {projects.map((p, i) => (
            <article key={p.id} id={`project-${p.id}`} className="r-project">
              <p className="r-kicker">
                Tape {String(i + 1).padStart(2, '0')} · {p.tape.tag}
                {p.period ? ` · ${p.period}` : ''}
              </p>
              <h3>
                {p.title} {p.placeholder && <span className="r-ph">placeholder</span>}
              </h3>
              <p>{p.summary}</p>
              {p.team && <p className="r-dim">{p.team}</p>}
              {!p.placeholderFields?.includes('contribution') && (
                <>
                  <h4>What I did</h4>
                  <ul>
                    {p.contribution.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </>
              )}
              {p.results && p.results.length > 0 && (
                <>
                  <h4>Results</h4>
                  <ul>
                    {p.results.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </>
              )}
              {p.tech.length > 0 && (
                <p>
                  <span className="r-dim">Built with:</span> {p.tech.join(' · ')}
                </p>
              )}
              {p.links.length > 0 && (
                <p>
                  {p.links.map((l) => (
                    <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </p>
              )}
              {p.media.length === 0 && <p className="r-dim r-small">Screenshots / video: pending (placeholder).</p>}
              {p.media.length > 0 && (
                <div className="r-media">
                  {p.media.map((m) => (
                    <figure key={m.src} className={m.type === 'video' ? 'r-video' : 'r-still'}>
                      {m.type === 'video' ? (
                        <video src={m.src} poster={m.poster} controls preload="none" playsInline />
                      ) : (
                        <img src={m.src} alt={m.caption ?? p.title} loading="lazy" decoding="async" />
                      )}
                      {m.caption && <figcaption>{m.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>

        <section id="resume" aria-labelledby="resume-h">
          <h2 id="resume-h">Résumé</h2>
          <p>
            <a className="r-button" href={site.resume.pdf} download={site.resume.fileName}>
              Download résumé (PDF)
            </a>{' '}
            <a href={site.resume.pdf} target="_blank" rel="noopener noreferrer">
              Open in a new tab ↗
            </a>
          </p>
        </section>

        <section id="contact" aria-labelledby="contact-h">
          <h2 id="contact-h">Contact</h2>
          <ul className="r-links">
            {c.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} target={l.href.startsWith('mailto') ? undefined : '_blank'} rel="noopener noreferrer">
                  {l.label}
                  {l.href.startsWith('mailto') ? `: ${c.email}` : ''}
                </a>
              </li>
            ))}
            {c.phone.show && <li>Phone: {c.phone.value}</li>}
          </ul>
        </section>
      </main>
      <footer className="r-foot">
        <p>
          © {new Date().getFullYear()} {site.name}. Room models built in Blender; props CC0 from Poly Haven.
        </p>
      </footer>
    </div>
  )
}

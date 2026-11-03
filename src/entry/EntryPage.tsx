import { ENTRY_COPY as COPY } from "./copy";

// The theme's colors and font (src/platform/theme/theme.css), inlined: the page is served on its own, before any
// of the app's stylesheets or scripts, so nothing of the app loads until the player continues.
const STYLE = `
:root { color-scheme: dark; }
html, body { margin: 0; background: #0f1424; color: #f2f4ff; font-family: "Inter", system-ui, sans-serif; }
main { box-sizing: border-box; max-width: 640px; margin: 0 auto; padding: 56px 24px 40px; }
.panel { background: #161c30; border: 1px solid #2a3254; border-radius: 20px; padding: 32px; }
.brand { margin: 0 0 4px; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #8f84ff; }
h1 { margin: 0 0 16px; font-size: 28px; }
h2 { margin: 24px 0 8px; font-size: 17px; }
p { margin: 0 0 12px; line-height: 1.55; color: #9aa3c7; }
label { display: flex; gap: 12px; align-items: flex-start; margin: 12px 0; line-height: 1.5; cursor: pointer; }
input[type="checkbox"] { width: 20px; height: 20px; margin: 2px 0 0; flex: none; accent-color: #6b5cff; }
.agree { margin-top: 24px; padding: 16px; border-radius: 12px; background: #1d2440; }
.agree label { margin: 0; }
button { margin-top: 24px; height: 44px; padding: 0 24px; border: 0; border-radius: 12px; background: #6b5cff; color: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
button:hover { background: #5a4be6; }
button:disabled { background: #2a3254; color: #6c76a0; cursor: not-allowed; }
:focus-visible { outline: 2px solid #a99fff; outline-offset: 2px; }
.hint { margin: 8px 0 0; font-size: 14px; }
.foot { margin-top: 24px; font-size: 14px; color: #6c76a0; }
.foot a { color: #9aa3c7; }
`;

// Continue is off until the agreement is ticked (David); the server checks it too. The script only keeps the
// button in step with the box, including when the browser restores a ticked box on Back.
const SCRIPT = `(() => {
  const agree = document.getElementById("agree");
  const go = document.getElementById("continue");
  const hint = document.getElementById("needs-agree");
  const sync = () => { go.disabled = !agree.checked; hint.hidden = agree.checked; };
  agree.addEventListener("change", sync);
  addEventListener("pageshow", sync);
  sync();
})();`;

/** The entry page, whole: rendered to static HTML by the gate (gate.server.ts). `to` is where the player was going. */
export function EntryPage({ to }: { to: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{COPY.title}</title>
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      </head>
      <body>
        <main>
          <form className="panel" method="post" action="/entry">
            <p className="brand">{COPY.title}</p>
            <h1>{COPY.heading}</h1>
            {COPY.what.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <h2>{COPY.musicHeading}</h2>
            <p>{COPY.music}</p>
            <label>
              <input type="checkbox" name="music" value="on" defaultChecked />
              <span>{COPY.playMusic}</span>
            </label>
            <h2>{COPY.shareHeading}</h2>
            <p>{COPY.share}</p>
            <div className="agree">
              <label>
                <input type="checkbox" id="agree" name="agree" value="yes" required />
                <span>{COPY.agree}</span>
              </label>
            </div>
            <input type="hidden" name="to" value={to} />
            <button type="submit" id="continue" disabled aria-describedby="needs-agree">
              {COPY.continue}
            </button>
            <p className="hint" id="needs-agree">
              {COPY.needsAgree}
            </p>
            <p className="foot">
              {COPY.once} <a href="/privacy.html">{COPY.privacy}</a>
            </p>
          </form>
        </main>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      </body>
    </html>
  );
}

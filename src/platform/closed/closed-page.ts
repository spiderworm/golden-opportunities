// The page shown while the game is closed. It is one self-contained file: the
// Station Administrator's portrait is inlined, the styles are inline, and the
// fonts are the site's stack without the web font, so it makes no requests.
// Plot has final say on the copy (US English, no emoji).

import portrait from "../../../public/bosses/full/overall.webp?inline";

export const CLOSED_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Orbital Books is closed for a moment</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #0f1424; color: #f2f4ff;
    font-family: "Inter", system-ui, sans-serif; color-scheme: dark; }
  main { box-sizing: border-box; min-height: 100vh; display: grid; place-items: center;
    padding: 32px 20px; }
  .card { max-width: 560px; background: #161c30; border: 1px solid #2a3254;
    border-radius: 20px; padding: 32px; text-align: center; }
  img { width: 160px; height: 160px; border-radius: 20px; border: 2px solid #d95926;
    background: #1d2440; }
  h1 { font-size: 26px; line-height: 1.25; margin: 24px 0 16px; }
  p { color: #9aa3c7; font-size: 16px; line-height: 1.6; margin: 0 0 14px; }
  .stamp { display: inline-block; margin: 8px 0 20px; padding: 6px 14px; border: 2px solid #8f84ff;
    border-radius: 12px; color: #8f84ff; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; font-size: 13px; transform: rotate(-3deg); }
  .sign { color: #6c76a0; font-size: 14px; margin-top: 22px; }
</style>
</head>
<body>
<main>
  <div class="card">
    <img src="${portrait}" alt="The Station Administrator, a desk-shaped robot holding a clipboard">
    <h1>Sorry, we can't do that for you right now.</h1>
    <div class="stamp">Request admired. Not processed.</div>
    <p>The Station Administrator has reviewed your request and found it excellent, possibly the finest request this office has received all quarter. Regrettably, the bookshop is too busy being magnificent to fulfill it.</p>
    <p>Orbital Books has stepped away from the counter for a short recalibration. Every shelf is accounted for. Every ledger is perfect. When the doors reopen, they will be noticeably better doors.</p>
    <p>Please try again in a few minutes. There is no form to fill in: the Administrator has already filled it in for you, twice, flawlessly.</p>
    <p class="sign">Office of the Station Administrator, Larkspur Station</p>
  </div>
</main>
</body>
</html>
`;

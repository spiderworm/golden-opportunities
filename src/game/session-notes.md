# Server-owned saves: first slice

The shell middleware creates one save before parallel page loaders run. Its HttpOnly,
SameSite=Strict cookie contains only a cryptographically random ID; HTTPS adds Secure.
The seed, discoveries and sale facts stay on the server. The station opens 1 January
2194. Only a committed played quarter opens 2194-Q1 and advances to 1 April.
Investigation uses this save's QueryView. Each browser profile gets an independent save.

Files live in ORBITAL_DATA_DIR/saves (default .data/saves), with private directory/file
permissions. All reads, creates and updates acquire a directory-wide exclusive lock, check revisions on writes, and publish by
atomic rename. Failed writes leave the old save visible. Readers never see half a file.
This supports one local app, not a distributed deployment. Each lock records its owner
PID, OS process start time (`ps -o lstart`, fixed C locale), and acquisition timestamp.
The timestamp is diagnostic only: elapsed time never permits takeover. Recovery requires
ESRCH or a verified different process start time for the same PID. Permission failures,
failed process inspection and malformed ownership fail closed with SAVE_BUSY; callers
can retry. A live but paused owner retains exclusive access until it releases the lock.

The owner metadata is written into a private candidate directory first, then published
by atomic rename. There is no visible ownerless initialization window. Only one contender
can remove a dead owner's unique marker; acquisition still requires publishing a complete
directory. Old-owner cleanup cannot remove a successor marker. Unverifiable legacy empty
locks require an operator to confirm no old writer exists before removing them; their age
alone is not evidence. The OS start-time inspection requires local POSIX `ps`, already
present on the development host. Atomic rename does not guarantee durability against power
loss before disk sync. Candidate directories left before publication do not hold the lock.

Save IDs are validated before filesystem access; malformed/unknown API sessions fail.
An unknown page cookie starts a new save on GET only. Corrupt saves fail rather than reset.
Bootstrap is limited to 30 new saves per process per minute. Saves are bounded to 16 MiB,
100,000 M1 sale facts and one played quarter. The browser cookie lasts 30 days. Storage holds at most 200 saves and 256 MiB.
Reads refresh a durable last-used timestamp (file mtime); saves untouched for 30 days
expire on the next store operation, including direct reads. Admission evicts the least
recently used other saves first, never the requester or a save with a legacy update lock.
Budgets are checked under the directory lock across processes and survive restarts.
Updates reserve their full temporary-file size as well as the old file, bounding peak
bytes. If the protected/locked saves prevent admission, SAVE_CAPACITY fails the write
without deleting them. Orphaned atomic-write temporary files are removed under the lock. No player content or save identifiers enter analytics.

Sale facts persist in normalized Sale form and rejoin the unchanged workbook catalog
when serving a view; generated labels cannot replace catalog facts. Counterfactual lines
never belong in played[]. The simulation integration will atomically store the selected
plan, outcome and actual facts together. The store is server-only, not a mutation API.

## Query access

Browser queries require a same-origin local request and an existing save cookie. API calls
never bootstrap a save. `issueGameQueryToken(saveId)` in query-token.server.ts is server-only:
the admitted assistant provider resolves the cookie and issues one capability per answer.
The child receives it only through ORBITAL_QUERY_TOKEN; request Host and bodies never choose
a token destination or save. The configured endpoint stays loopback-only in the tool server.

Capabilities expire after three minutes, are revoked after provider cleanup, and bind the
save revision at issuance. A changed revision ends the capability, so compare_data cannot
combine successful calls across a quarter transition. Invalidated tokens return
SESSION_ENDED/401 with fixed content-free text. Issuance is capped at four per save and
64 globally. No capability can fall back to baseline history or choose another save.
No token, save identifier or query content enters telemetry. The startup global bearer
has been removed. isLocalBrowserRequest is exported by query/access.server.ts for reuse.

Decide/Result retain their stub until the simulation integration atomically stores actual
facts and the outcome. Browser and agent query access is ready for those committed facts.

The capability boundary is between local HTTP callers and server-owned save state. It
is not isolation from code running as the same OS user, which can inspect private
application files/processes. No public token-minting endpoint exists. Authorization
is repeated after body arrival, immediately before synchronous query execution, so
revocation, expiry or revision changes during a slow body cannot produce a response.

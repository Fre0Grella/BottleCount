// Google OAuth implicit flow + Sheets API
// Uses postMessage from a dedicated oauth-callback page to avoid
// Cross-Origin-Opener-Policy issues with popup.location polling.
// noinspection SpellCheckingInspection

const CLIENT_ID  = '402376254532-ji43fivhq1ksni3pahe1hrsblvsbsm7l.apps.googleusercontent.com';
const SCOPES     = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';
const SHEET_NAME = 'BottleCount';

// In-memory only — never persisted (implicit flow tokens are short-lived)
let accessToken: string | null = null;

export function getAccessToken() { return accessToken; }
export function isConnected()    { return !!accessToken; }

// ── OAuth ──────────────────────────────────────────────────────────────────
// Standard pattern: redirect to /oauth-callback, which does
// window.opener.postMessage(token) and closes itself.
// No cross-origin popup.location polling → no COOP warnings.

export function startOAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    const base        = window.location.origin + (import.meta.env.BASE_URL ?? '/');
    const redirectUri = base.replace(/\/$/, '') + '/oauth-callback';

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',     CLIENT_ID);
    url.searchParams.set('redirect_uri',  redirectUri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope',         SCOPES);
    url.searchParams.set('prompt',        'select_account');

    const popup = window.open(url.toString(), 'google_oauth', 'width=520,height=640,left=200,top=100');
    if (!popup) {
      reject(new Error('Pop-up blocked — please allow pop-ups for this site.'));
      return;
    }

    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      popup.close();
      reject(new Error('Sign-in timed out. Please try again.'));
    }, 5 * 60 * 1000);

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'GOOGLE_OAUTH_TOKEN') {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        accessToken = data.token as string;
        resolve(accessToken);
      } else if (data.type === 'GOOGLE_OAUTH_ERROR') {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        popup?.close();
        const msg = data.error === 'access_denied'
          ? 'Access denied. Make sure you are listed as a test user in Google Cloud Console.'
          : `Google OAuth error: ${data.error}`;
        reject(new Error(msg));
      }
    }

    window.addEventListener('message', onMessage);
  });
}

// ── Sheet setup ────────────────────────────────────────────────────────────

const REQUIRED_HEADERS: Record<string, string[]> = {
  parties: ['id', 'name', 'date', 'createdat'],
  tickets: ['id', 'partyid', 'guestname', 'used', 'usedat', 'expiresat'],
};

export async function connectSheet(token: string): Promise<string> {
  const listRes = await gapi(
    token, 'GET',
    `https://www.googleapis.com/drive/v3/files` +
    `?q=name%3D'BottleCount'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse` +
    `&fields=files(id%2Cname)`
  );
  const files: { id: string; name: string }[] = listRes.files ?? [];

  if (files.length > 0) {
    const sheetId = files[0].id;
    await validateHeaders(token, sheetId);
    return sheetId;
  }

  // Create new spreadsheet with parties, tickets, and config tabs
  const createRes = await gapi(token, 'POST',
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { title: 'parties' } },
        { properties: { title: 'tickets' } },
        { properties: { title: 'config'  } },
      ],
    }
  );
  const sheetId: string = createRes.spreadsheetId;

  await batchUpdate(token, sheetId, [
    { range: 'parties!A1', values: [['id', 'name', 'date', 'createdAt']] },
    { range: 'tickets!A1', values: [['id', 'partyId', 'guestName', 'used', 'usedAt', 'expiresAt']] },
    { range: 'config!A1',  values: [['key', 'value']] },
  ]);

  return sheetId;
}

async function validateHeaders(token: string, sheetId: string) {
  for (const tab of ['parties', 'tickets'] as const) {
    const res = await gapi(token, 'GET',
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tab}!A1:Z1`
    );
    const headers: string[] = (res.values?.[0] ?? []).map((h: string) => h.trim().toLowerCase());
    const required = REQUIRED_HEADERS[tab];
    const missing  = required.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(
        `The existing "${SHEET_NAME}" spreadsheet has incorrect headers in the "${tab}" tab.\n` +
        `Missing columns: ${missing.join(', ')}.\n` +
        `Please fix the sheet manually or rename/delete it so BottleCount can recreate it.`
      );
    }
  }
}

// ── Config (HMAC key) ──────────────────────────────────────────────────────

/**
 * Push the local HMAC key JWK to the config tab if no key is stored yet.
 * Returns the JWK that should be used (remote if it existed, local otherwise).
 */
export async function syncHmacKey(token: string, sheetId: string, localJwk: JsonWebKey): Promise<JsonWebKey> {
  // Read the config tab
  const res  = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/config!A2:B`
  );
  const rows: string[][] = res.values ?? [];
  const existing = rows.find(r => r[0] === 'hmac_key');

  if (existing?.[1]) {
    // Sheet already has a key — parse and return it so all devices share it
    try { return JSON.parse(existing[1]) as JsonWebKey; } catch { /* fall through to overwrite */ }
  }

  // No key in sheet yet — push the local one so other devices can adopt it
  await appendRows(token, sheetId, 'config', [['hmac_key', JSON.stringify(localJwk)]]);
  return localJwk;
}

// ── Read / Write ───────────────────────────────────────────────────────────

export async function pullAll(token: string, sheetId: string) {
  const [partiesRes, ticketsRes] = await Promise.all([
    gapi(token, 'GET', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/parties!A1:Z`),
    gapi(token, 'GET', `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/tickets!A1:Z`),
  ]);
  return {
    parties: rowsToObjects(partiesRes.values ?? []),
    tickets: rowsToObjects(ticketsRes.values ?? []),
  };
}

export async function pushParties(token: string, sheetId: string, parties: any[]) {
  if (!parties.length) return;
  const existing    = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/parties!A2:A`
  );
  const existingIds = new Set((existing.values ?? []).flat().map(String));
  const newRows     = parties
    .filter(p => !existingIds.has(String(p.id)))
    .map(p  => [p.id, p.name, p.date ?? '', p.createdAt]);
  if (!newRows.length) return;
  await appendRows(token, sheetId, 'parties', newRows);
}

export async function pushTickets(token: string, sheetId: string, tickets: any[]) {
  if (!tickets.length) return;
  const existing    = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/tickets!A2:A`
  );
  const existingIds = new Set((existing.values ?? []).flat().map(String));
  const newRows     = tickets
    .filter(t => !existingIds.has(String(t.id)))
    .map(t  => [t.id, t.partyId, t.guestName, t.used ? 'TRUE' : 'FALSE', t.usedAt ?? '', t.expiresAt]);
  if (!newRows.length) return;
  await appendRows(token, sheetId, 'tickets', newRows);
}

export async function markTicketUsed(token: string, sheetId: string, ticketId: number, usedAt: string) {
  const res  = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/tickets!A2:A`
  );
  const ids  = (res.values ?? []).flat() as string[];
  const idx  = ids.findIndex(id => String(id) === String(ticketId));
  if (idx === -1) return;
  const row  = idx + 2;
  await batchUpdate(token, sheetId, [
    { range: `tickets!D${row}`, values: [['TRUE']] },
    { range: `tickets!E${row}`, values: [[usedAt]] },
  ]);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function gapi(token: string, method: string, url: string, body?: any) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `Google API error ${res.status}`);
  }
  return res.json();
}

async function appendRows(token: string, sheetId: string, tab: string, rows: any[][]) {
  await gapi(
    token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: rows }
  );
}

async function batchUpdate(token: string, sheetId: string, data: { range: string; values: any[][] }[]) {
  await gapi(
    token, 'POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
    { valueInputOption: 'RAW', data }
  );
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']))
  );
}

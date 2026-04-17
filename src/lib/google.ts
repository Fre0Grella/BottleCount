// Google OAuth implicit flow + Sheets API
// Client ID is public-safe in implicit flow

const CLIENT_ID = '402376254532-ji43fivhq1ksni3pahe1hrsblvsbsm7l.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly';
const SHEET_NAME = 'BottleCount';

// In-memory only — never persisted
let accessToken: string | null = null;

export function getAccessToken() { return accessToken; }
export function isConnected() { return !!accessToken; }

// ── OAuth ──────────────────────────────────────────────────────────────────

export function startOAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUri = window.location.origin + window.location.pathname;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('prompt', 'select_account');

    const popup = window.open(url.toString(), 'google_oauth', 'width=500,height=600');
    if (!popup) { reject(new Error('Popup blocked — please allow pop-ups for this site.')); return; }

    const timer = setInterval(() => {
      try {
        if (popup.closed) { clearInterval(timer); reject(new Error('Popup closed before completing sign-in.')); return; }
        const params = new URLSearchParams(popup.location.hash.slice(1));
        const token = params.get('access_token');
        if (token) {
          clearInterval(timer);
          popup.close();
          accessToken = token;
          resolve(token);
        }
      } catch { /* cross-origin — still loading */ }
    }, 300);
  });
}

// ── Sheet setup ────────────────────────────────────────────────────────────

const REQUIRED_HEADERS: Record<string, string[]> = {
  parties: ['id', 'name', 'date', 'createdat'],
  tickets: ['id', 'partyid', 'guestname', 'used', 'usedat', 'expiresat'],
};

export async function connectSheet(token: string): Promise<string> {
  // 1. Find existing BottleCount sheet
  const listRes = await gapi(
    token, 'GET',
    `https://www.googleapis.com/drive/v3/files?q=name%3D'${encodeURIComponent(SHEET_NAME)}'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse&fields=files(id,name)`
  );
  const files: { id: string; name: string }[] = listRes.files ?? [];

  if (files.length > 0) {
    const sheetId = files[0].id;
    // Validate headers — throws a clear error if malformed
    await validateHeaders(token, sheetId);
    return sheetId;
  }

  // 2. Create new spreadsheet with both tabs
  const createRes = await gapi(token, 'POST',
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      properties: { title: SHEET_NAME },
      sheets: [
        { properties: { title: 'parties' } },
        { properties: { title: 'tickets' } },
      ],
    }
  );
  const sheetId: string = createRes.spreadsheetId;

  // 3. Write headers
  await batchUpdate(token, sheetId, [
    { range: 'parties!A1', values: [['id', 'name', 'date', 'createdAt']] },
    { range: 'tickets!A1', values: [['id', 'partyId', 'guestName', 'used', 'usedAt', 'expiresAt']] },
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
    const missing = required.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      throw new Error(
        `The existing "${SHEET_NAME}" spreadsheet has incorrect headers in the "${tab}" tab.\n` +
        `Missing columns: ${missing.join(', ')}.\n` +
        `Please fix the sheet manually or rename/delete it so BottleCount can recreate it.`
      );
    }
  }
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
  const existing = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/parties!A2:A`
  );
  const existingIds = new Set((existing.values ?? []).flat().map(String));
  const newRows = parties
    .filter(p => !existingIds.has(String(p.id)))
    .map(p => [p.id, p.name, p.date ?? '', p.createdAt]);
  if (!newRows.length) return;
  await appendRows(token, sheetId, 'parties', newRows);
}

export async function pushTickets(token: string, sheetId: string, tickets: any[]) {
  if (!tickets.length) return;
  const existing = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/tickets!A2:A`
  );
  const existingIds = new Set((existing.values ?? []).flat().map(String));
  const newRows = tickets
    .filter(t => !existingIds.has(String(t.id)))
    .map(t => [t.id, t.partyId, t.guestName, t.used ? 'TRUE' : 'FALSE', t.usedAt ?? '', t.expiresAt]);
  if (!newRows.length) return;
  await appendRows(token, sheetId, 'tickets', newRows);
}

export async function markTicketUsed(token: string, sheetId: string, ticketId: number, usedAt: string) {
  const res = await gapi(token, 'GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/tickets!A2:A`
  );
  const ids: string[] = (res.values ?? []).flat();
  const rowIndex = ids.findIndex(id => String(id) === String(ticketId));
  if (rowIndex === -1) return; // not synced yet — local mark is enough
  const row = rowIndex + 2; // +1 header, +1 one-based
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
      Authorization: `Bearer ${token}`,
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

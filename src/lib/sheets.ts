import { getKey } from './db';
import type { SheetsConfig, ValidationResult } from './types';

export async function validateWithSheet(ticketId: number): Promise<ValidationResult> {
  const config = await getKey<SheetsConfig | null>('sheets_config', null);
  if (!config?.url || !config?.token)
    return { ok: false, reason: 'unauthorized' };

  const res = await fetch(config.url, {
    method:   'POST',
    redirect: 'follow',                                        // Apps Script redirects once
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body:     JSON.stringify({ ticketId, token: config.token }),
  });
  return res.json() as Promise<ValidationResult>;
}

export async function getSheetsConfig(): Promise<SheetsConfig | null> {
  return getKey<SheetsConfig | null>('sheets_config', null);
}

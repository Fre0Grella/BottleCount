// BottleCount — Google Apps Script ticket validator
// Deploy as a Web App: Execute as Me, Anyone can access.
// Set TOKEN in Script Properties (File → Project properties → Script properties).

const SECRET = PropertiesService.getScriptProperties().getProperty("TOKEN");

function doPost(e) {
  const { ticketId, token } = JSON.parse(e.postData.contents);

  if (token !== SECRET) {
    return json({ ok: false, reason: "unauthorized" });
  }

  const lock = LockService.getPublicLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const data  = sheet.getDataRange().getValues();

    // Column A: ticketId, Column B: used (boolean), Column C: usedAt (ISO string)
    const row = data.findIndex(r => r[0] === ticketId);

    if (row === -1) {
      return json({ ok: false, reason: "unknown_ticket" });
    }
    if (data[row][1]) {
      return json({ ok: false, reason: "already_used", usedAt: data[row][2] });
    }

    sheet.getRange(row + 1, 2).setValue(true);
    sheet.getRange(row + 1, 3).setValue(new Date().toISOString());
    return json({ ok: true });

  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

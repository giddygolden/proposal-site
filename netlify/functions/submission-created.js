// Netlify runs this function automatically on every verified form submission
// (the filename "submission-created" is a Netlify convention — no webhook
// configuration needed, and no failure counter that can disable it).
//
// It forwards the submission to the Google Apps Script that writes the
// Joshua Sharman lead-tracker sheet. Apps Script answers POSTs with a 302
// redirect, which broke Netlify's outgoing-webhook feature (it re-POSTs the
// redirect target, gets 405, counts it as a failure and eventually disables
// the hook). Here we simply don't follow the redirect: by the time Google
// sends the 302, the script has already run and the row is written.

const SHEET_WEBHOOK =
  'https://script.google.com/macros/s/AKfycbz0JDzq-TV5V4FBEFjf325gzAaJCU18ujxuJ1pf-d8ZiyxzOH-fCWvXgigxJlcUQOrK-w/exec?key=leadtrackersheetsharman123';

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body);      // { payload: { data: {...}, ... } }
    const form = body && body.payload && body.payload.form_name;

    // Only forms that feed the lead tracker get forwarded to the sheet.
    if (form !== 'quiz-funnel' && form !== 'contact-form') {
      return { statusCode: 200, body: 'ignored: ' + form };
    }

    let payload = body.payload;

    if (form === 'contact-form') {
      // The sheet has no dedicated email column, so fold phone + email into
      // the one "phone" field the Apps Script already writes there. Every
      // other lead-quiz-only field (they_are, timing, setting, etc.) is left
      // blank so the row still lines up under the right headers.
      const d = payload.data || {};
      payload = {
        ...payload,
        data: {
          name: d.name || '',
          phone: [d.phone, d.email].filter(Boolean).join(' · '),
          page: 'Contact page',
          ad_tracking: 'Direct (contact form)',
        },
      };
    }

    const res = await fetch(SHEET_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
      redirect: 'manual',                     // 302 from Google = success, don't chase it
    });

    // 2xx or 3xx both mean the script ran.
    const ok = res.status < 400;
    console.log('sheet webhook status:', res.status, ok ? '(ok)' : '(error)');
    return { statusCode: 200, body: ok ? 'ok' : 'sheet returned ' + res.status };
  } catch (err) {
    // Never fail the submission itself over sheet plumbing.
    console.error('sheet forward failed:', err);
    return { statusCode: 200, body: 'error logged' };
  }
};

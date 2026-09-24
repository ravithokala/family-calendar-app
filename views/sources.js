// @ts-check

import { el, niceDate } from '../dom.js';
import { openSheet, showIssues, toast } from './sheet.js';
import { field, input, select, checkbox, saveButton, busy } from './fields.js';

/**
 * Sources from the phone (ADR-075, ADR-082): paste a message or pick a PDF; the app shows the
 * prompt to run in your own assistant, then imports its JSON reply for review. No AI is called
 * by the app.
 *
 * @typedef {{ source_id: string, title: string, source_type: string, source_url: string|null, received_at: string,
 *   trust_level: string, candidates: number }} SourceSummary
 */

/** Keep within the server's limit. */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** @param {File} file @returns {Promise<string>} */
const readBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/**
 * Add a source.
 * @param {import('./forms.js').FormContext} ctx
 * @param {Array<{ activity_id: string, person: string, name: string }>} activities
 */
export function sourceSheet(ctx, activities) {
  /** @type {Array<[string, string]>} */
  const about = [['OTHER|', 'Anything (general)'],
    ...ctx.meta.schools.map((s) => /** @type {[string, string]} */ ([`SCHOOL|${s.school_id}`, `School: ${s.person} ${s.school_name}`])),
    ...activities.map((a) => /** @type {[string, string]} */ ([`ACTIVITY|${a.activity_id}`, `Activity: ${a.person} ${a.name}`]))];
  const f = {
    title: input('text', null, { placeholder: 'e.g. Club WhatsApp, 24 Sep' }),
    about: select('OTHER|', about),
    official: checkbox(false, 'Official (from the school or club itself)'),
    auto: checkbox(false, 'Add clear new events without asking'),
    kind: select('text', [['text', 'Paste a message'], ['pdf', 'Upload a PDF']]),
    text: /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '6', placeholder: 'Paste the message here' })),
    file: /** @type {HTMLInputElement} */ (el('input', { type: 'file', accept: 'application/pdf,.pdf' })),
  };
  const autoRow = el('div', {}, f.auto.node);
  const textRow = field('Message', f.text);
  const fileRow = field('PDF (up to 10 MB)', f.file);
  const sync = () => {
    autoRow.hidden = !f.official.get();
    if (!f.official.get()) f.auto.box.checked = false;
    const pdf = f.kind.get() === 'pdf';
    textRow.hidden = pdf;
    fileRow.hidden = !pdf;
  };
  f.official.box.addEventListener('change', sync);
  f.kind.node.addEventListener('change', sync);
  sync();

  const form = el('div', { class: 'form' },
    field('Title', f.title.node), field('About', f.about.node), f.official.node, autoRow,
    field('What', f.kind.node), textRow, fileRow,
    el('div', { class: 'actions' }, saveButton('Save and get the prompt', async () => {
      const [scopeType, scopeId] = (f.about.get() ?? 'OTHER|').split('|');
      const base = { title: f.title.get(), scope_type: scopeType, scope_id: scopeId || null, official: f.official.get(), auto_approve: f.auto.get() };
      /** @type {import('../api.js').ApiResponse} */
      let r;
      if (f.kind.get() === 'pdf') {
        const file = f.file.files?.[0];
        if (!file) { showIssues(sheet.messages, { errors: [{ field: '', message: 'Choose a PDF.' }], warnings: [] }); return; }
        if (file.size > MAX_PDF_BYTES) { showIssues(sheet.messages, { errors: [{ field: '', message: 'The PDF is over 10 MB.' }], warnings: [] }); return; }
        r = await ctx.call('sources.addPdf', { ...base, file_name: file.name, content_base64: await readBase64(file) });
      } else {
        r = await ctx.call('sources.addText', { ...base, text: f.text.value });
      }
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      sheet.close();
      extractSheet(ctx, r.data.source, r.data.prompt, r.warnings);
    })));
  const sheet = openSheet('Add a source', form);
}

/**
 * Step two: copy the prompt to your assistant (attaching the PDF if it is one), paste its reply,
 * import. What it finds goes to Review.
 * @param {import('./forms.js').FormContext} ctx
 * @param {{ source_id: string, title: string, source_type: string, source_url?: string|null }} source
 * @param {string} prompt
 * @param {Array<{ message: string }>} [warnings]
 */
export function extractSheet(ctx, source, prompt, warnings = []) {
  const promptBox = /** @type {HTMLTextAreaElement} */ (el('textarea', { class: 'prompt', rows: '6', readonly: true }));
  promptBox.value = prompt;
  const reply = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: '6', placeholder: "Paste the assistant's reply here" }));
  const copied = el('span', { class: 'muted small' });
  const pdf = source.source_type === 'PDF';
  const form = el('div', { class: 'form' },
    warnings.map((w) => el('div', { class: 'msg warning' }, w.message)),
    el('ol', { class: 'steps' },
      el('li', {}, 'Copy the prompt into ChatGPT or Claude', pdf ? el('strong', {}, ' and attach the PDF') : '', '.'),
      el('li', {}, 'Paste its reply below.'),
      el('li', {}, 'Import: what it finds appears in Review.')),
    promptBox,
    el('div', { class: 'row-actions' },
      el('button', { class: 'link', type: 'button', onclick: async () => {
        try { await navigator.clipboard.writeText(prompt); copied.textContent = 'Copied.'; } catch (e) { promptBox.select(); copied.textContent = 'Select all and copy.'; }
      } }, 'Copy prompt'), copied,
      pdf && source.source_url ? el('a', { class: 'link', href: source.source_url, target: '_blank', rel: 'noopener' }, 'Open the PDF') : ''),
    field("Assistant's reply", reply),
    el('div', { class: 'actions' }, saveButton('Import', async () => {
      const r = await ctx.call('review.importCandidates', { source_id: source.source_id, json: reply.value });
      if (!r.ok) { showIssues(sheet.messages, r); return; }
      const d = r.data;
      const parts = [
        d.autoApproved && `${d.autoApproved} added`, d.proposed && `${d.proposed} to review`, d.needsAttention && `${d.needsAttention} to check`,
        d.possiblyRemoved && `${d.possiblyRemoved} possibly removed`, d.unchanged && `${d.unchanged} already on the calendar`,
        d.alreadyCancelled && `${d.alreadyCancelled} already cancelled`, d.alreadyPending && `${d.alreadyPending} already waiting`,
      ].filter(Boolean);
      sheet.close();
      ctx.saved(`Imported: ${parts.join(', ') || 'nothing new'}.`, r);
    })));
  const sheet = openSheet(`Extract: ${source.title}`, form);
}

/**
 * Recent message and PDF sources, to carry on with one later.
 * @param {import('./forms.js').FormContext} ctx
 * @param {SourceSummary[]} sources
 */
export function recentSources(ctx, sources) {
  if (sources.length === 0) return el('p', { class: 'muted small' }, 'No sources yet.');
  return el('ul', { class: 'items' }, sources.slice(0, 8).map((s) => el('li', { class: 'item' },
    el('span', { class: 'time' }, niceDate(s.received_at.slice(0, 10))),
    el('div', { class: 'body' },
      el('div', {}, s.title),
      el('div', { class: 'details' }, `${s.source_type === 'PDF' ? 'PDF' : 'Message'}${s.trust_level === 'AUTHORITATIVE' ? ' · official' : ''} · ${s.candidates} found`),
      el('div', { class: 'row-actions' }, el('button', { class: 'link', type: 'button', onclick: async (/** @type {Event} */ ev) => {
        const r = await busy(/** @type {HTMLButtonElement} */ (ev.currentTarget), () => ctx.call('sources.prompt', { source_id: s.source_id }));
        if (r.ok) extractSheet(ctx, s, r.data.prompt);
        else toast(r.errors.map((e) => e.message).join('; '));
      } }, 'Extract again'))))));
}

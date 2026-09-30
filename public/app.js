import { compatibleModels, decisionRequest, distribution } from './contract.js';
const $ = id => document.getElementById(id);
let busy = false;
function reset() {
  $('bars').replaceChildren(); $('raw-panel').hidden = true;
  $('result-heading').textContent = 'A little clarity.';
  $('status').textContent = 'Your result will appear here.';
  $('error').textContent = '';
}
async function request(path, options) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(35_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
async function loadModels() {
  $('refresh').disabled = true; $('run').disabled = true; reset();
  const previous = $('model').value;
  $('model').replaceChildren();
  $('connection').textContent = 'Looking for System One models…';
  try {
    const models = compatibleModels(await request('/api/models'));
    for (const model of models) $('model').add(new Option(model.display_name || model.id, model.id));
    if (models.some(m => m.id === previous)) $('model').value = previous;
    $('connection').textContent = models.length ? `${models.length} compatible model${models.length === 1 ? '' : 's'} ready` : 'No compatible models. Start Laya on the serving node, then refresh.';
  } catch (error) { $('connection').textContent = error.message; }
  finally { $('refresh').disabled = false; $('run').disabled = !$('model').value; }
}
$('refresh').addEventListener('click', loadModels);
$('mode').addEventListener('change', () => {
  $('choices-field').hidden = $('mode').value !== 'choice';
  $('question').value = $('mode').value === 'choice' ? 'Which team should handle this?' : 'Is this a billing issue?';
});
$('form').addEventListener('input', () => { if (!busy) reset(); });
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  reset();
  let body;
  try {
    body = decisionRequest({ model: $('model').value, state: $('state').value, instructions: $('question').value, mode: $('mode').value, choices: $('choices').value });
  } catch (error) { $('error').textContent = error.message; return; }
  busy = true;
  const controls = [...$('form').querySelectorAll('input, textarea, select, button')];
  controls.forEach(c => { c.disabled = true; });
  document.querySelector('.results').setAttribute('aria-busy', 'true');
  $('status').textContent = 'Reading your text…';
  const started = performance.now();
  try {
    const data = await request('/api/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const values = distribution(data);
    $('result-heading').textContent = values[0][0];
    $('status').textContent = `Decision returned in ${Math.round(performance.now() - started)} ms`;
    for (const [label, probability] of values) {
      const row = document.createElement('div'); row.className = 'result-row';
      const heading = document.createElement('div'); heading.className = 'result-label';
      const name = document.createElement('span'); name.textContent = label;
      const value = document.createElement('strong'); value.textContent = `${(probability * 100).toFixed(1)}%`;
      const bar = document.createElement('progress'); bar.max = 1; bar.value = probability; bar.setAttribute('aria-label', label);
      heading.append(name, value); row.append(heading, bar); $('bars').append(row);
    }
    $('raw').textContent = JSON.stringify(data, null, 2); $('raw-panel').hidden = false;
  } catch (error) {
    $('error').textContent = error.message;
    $('status').textContent = 'No decision returned. Check the connection and try again.';
  } finally {
    busy = false; controls.forEach(c => { c.disabled = false; });
    document.querySelector('.results').setAttribute('aria-busy', 'false');
  }
});
loadModels();

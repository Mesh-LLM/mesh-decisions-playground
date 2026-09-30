export function compatibleModels(data) {
  if (!Array.isArray(data?.data)) throw new Error('Mesh returned an invalid model list.');
  return data.data.filter(m => typeof m.id === 'string' && !['auto', 'mesh'].includes(m.id)
    && Array.isArray(m.capabilities) && m.capabilities.includes('system_one'));
}

export function decisionRequest({ model, state, instructions, mode, choices }) {
  if (!model || ['auto', 'mesh'].includes(model)) throw new Error('Choose a compatible model.');
  if (!state?.trim() || !instructions?.trim()) throw new Error('Enter text and a question.');
  const question = { type: mode, instructions: instructions.trim() };
  if (mode === 'choice') {
    const labels = choices.split('\n').map(s => s.trim()).filter(Boolean);
    if (labels.length < 2 || labels.length > 16) throw new Error('Enter 2–16 choices, one per line.');
    if (new Set(labels).size !== labels.length) throw new Error('Each choice must be unique.');
    question.criteria = Object.fromEntries(labels.map(label => [label, label]));
  } else if (mode !== 'noul') throw new Error('Unsupported question type.');
  return { model, state, questions: { decision: question } };
}

export function distribution(data) {
  const answer = data?.answers?.decision;
  let values;
  if (answer?.type === 'noul') values = [['Yes', answer.noul], ['No', 1 - answer.noul]];
  else if (answer?.type === 'choice' && answer.probabilities) values = Object.entries(answer.probabilities);
  if (!values?.length || values.some(([, p]) => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1)) {
    throw new Error('Mesh returned an invalid decision result.');
  }
  return values.sort((a, b) => b[1] - a[1]);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function canonicalizeName(name, existingNames) {
  const trimmed = String(name || '').trim();
  const normalized = normalizeName(trimmed);

  if (!normalized) {
    return '';
  }

  const prior = existingNames.find((n) => normalizeName(n) === normalized);
  return prior || trimmed;
}

module.exports = {
  normalizeName,
  canonicalizeName,
};

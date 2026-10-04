(() => {
  const languages = ['en', 'hi', 'mr'];
  let catalog = null;

  function collectContentStrings(source = catalog) {
    if (!source) return [];
    const rows = [];
    for (const language of languages) {
      for (const [key, value] of Object.entries(source.translations?.[language] || {})) {
        rows.push({ key: `ui.${key}`, language, value: String(value) });
      }
    }

    function visit(value, path) {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}.${item?.id || index}`));
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const language of languages) {
        if (typeof value[language] === 'string') rows.push({ key: path, language, value: value[language] });
        if (Array.isArray(value[language])) {
          value[language].forEach((text, index) => rows.push({ key: `${path}.${index}`, language, value: text }));
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (languages.includes(key) && (typeof child === 'string' || Array.isArray(child))) continue;
        visit(child, `${path}.${key}`);
      }
    }

    for (const key of ['modules', 'quiz', 'suggestions', 'assistant']) visit(source[key], key);
    return rows;
  }

  function applyContentStrings(rows, target = catalog) {
    if (!target) return;
    for (const row of rows || []) {
      if (!languages.includes(row.language) || typeof row.key !== 'string') continue;
      if (row.key.startsWith('ui.')) {
        const key = row.key.slice(3);
        if (Object.hasOwn(target.translations?.[row.language] || {}, key)) target.translations[row.language][key] = row.value;
        continue;
      }

      const parts = row.key.split('.');
      let current = target[parts.shift()];
      for (const part of parts.slice(0, -1)) {
        if (Array.isArray(current)) current = current.find((item, index) => String(item?.id || index) === part);
        else current = current?.[part];
        if (!current) break;
      }
      if (!current) continue;
      const leaf = parts.at(-1);
      if (Array.isArray(current)) {
        const item = current.find((entry, index) => String(entry?.id || index) === leaf);
        if (item && typeof item === 'object') item[row.language] = row.value;
      } else if (Array.isArray(current[row.language]) && /^\d+$/.test(leaf)) {
        current[row.language][Number(leaf)] = row.value;
      } else if (current[leaf] && typeof current[leaf] === 'object') {
        current[leaf][row.language] = row.value;
      }
    }
  }

  window.SaathiCatalog = {
    set: (value) => { catalog = value; },
    get: () => catalog,
    collectContentStrings,
    applyContentStrings
  };
})();

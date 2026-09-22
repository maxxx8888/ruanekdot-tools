function parseCsv(text) {
    const tags = new Set();
    const lines = text.split(/\r?\n/);
    let nonEmpty = 0, rawCount = 0;

    // Первая строка — заголовок, пропускаем
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        nonEmpty++;

        // Убираем все кавычки, заменяем табы на запятые
        const normalized = line.replace(/"/g, '').replace(/\t/g, ',');
        const parts = normalized.split(',');
        rawCount += parts.length;

        for (let raw of parts) {
            let p = String(raw).toLowerCase().trim().replace(/\s+/g, ' ');

            if (!p) continue;
            if (p.length < 3) continue;
            if (p.length > 20) continue;
            if (p.split(/\s+/).length > 2) continue;
            if (!/^[а-яё0-9\-\s]+$/i.test(p)) continue;
            if (/^\d+$/.test(p)) continue;
            if (/\d{4,}/.test(p)) continue;    // отсеиваем даты и счётчики

            tags.add(p);
        }
    }

    const arr = Array.from(tags);
    console.log('📚 CSV: строк=' + nonEmpty + ', ячеек=' + rawCount + ', тегов после фильтра=' + arr.length);
    return arr;
}

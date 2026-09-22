function parseCsv(text) {
    const tags = new Set();
    const lines = text.split(/\r?\n/);

    // Пропускаем первую строку (заголовок: name, value, ...)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        // Разделитель колонок — табуляция
        const cols = line.split('\t');
        if (cols.length < 2) continue;

        // Берём только колонки name (0) и value (1) — там списки тегов через запятую
        for (let ci = 0; ci < 2; ci++) {
            let cell = String(cols[ci] || '').replace(/^"|"$/g, '').trim();
            if (!cell) continue;

            // Разбиваем ячейку по запятым
            const parts = cell.split(',');
            for (let p of parts) {
                p = p.toLowerCase().trim()
                     .replace(/^["'«»]+|["'«»]+$/g, '')
                     .replace(/\s+/g, ' ')
                     .trim();

                // ⚡ Жёсткие фильтры — только одиночные теги
                if (!p) continue;
                if (p.length < 3) continue;                  // слишком коротко
                if (p.length > 20) continue;                 // слишком длинно
                if (p.split(/\s+/).length > 2) continue;     // максимум 2 слова
                if (!/^[а-яё0-9\-\s]+$/i.test(p)) continue;  // только русские буквы, цифры, дефис
                if (/^\d+$/.test(p)) continue;               // только цифры

                tags.add(p);
            }
        }
    }

    const arr = Array.from(tags);
    console.log('📚 Спарсено тегов из CSV:', arr.length);
    return arr;
}

// tags-db.js — v3
// CSV у нас табулированный: name \t value \t value_lower \t ...
// Внутри колонок name и value — теги через запятую.
// CACHE_KEY = 'v3' — старый кэш v2 автоматически игнорируется.

(function () {
    'use strict';

    const CSV_URL = 'https://cdn.jsdelivr.net/gh/maxxx8888/ruanekdot-tools@main/000.csv';
    const DB_NAME = 'ruanekdot';
    const STORE = 'tags';
    const CACHE_KEY = 'v3';                 // ← сменили с v2 на v3, чтобы сбросить старый кэш
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

    let _db = null;
    let _loading = null;

    // ═══ IndexedDB helpers ═══
    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbGet(key) {
        const db = await openDb();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async function idbSet(key, val) {
        const db = await openDb();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put(val, key);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    }

    // ═══ Парсер CSV (табулированный, с запятыми внутри ячеек) ═══
    function parseCsv(text) {
        const tags = new Set();
        const lines = text.split(/\r?\n/);

        // Строка 1 — заголовок (name,value,value_lower,date_created,...). Пропускаем.
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            // 1. Разбиваем строку по ТАБУЛЯЦИИ — это разделитель колонок
            const cols = line.split('\t');
            if (cols.length < 2) continue;

            // 2. Берём только колонки 0 (name) и 1 (value) — там теги через запятую
            for (let ci = 0; ci < 2; ci++) {
                let cell = cols[ci] || '';
                // Убираем обрамляющие кавычки ячейки
                cell = cell.replace(/^"+|"+$/g, '');

                // 3. Дробим ячейку по запятым
                const parts = cell.split(',');
                for (let raw of parts) {
                    let p = String(raw).toLowerCase().trim()
                        .replace(/^["'«»\s]+|["'«»\s]+$/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();

                    // 4. Жёсткие фильтры — только одиночные теги
                    if (!p) continue;
                    if (p.length < 3) continue;                  // короче 3
                    if (p.length > 20) continue;                 // длиннее 20
                    if (p.split(/\s+/).length > 2) continue;     // максимум 2 слова
                    if (!/^[а-яё0-9\-\s]+$/i.test(p)) continue;  // только русские, цифры, дефис, пробел
                    if (/^\d+$/.test(p)) continue;               // только цифры — мусор

                    tags.add(p);
                }
            }
        }

        const arr = Array.from(tags);
        console.log('📚 Спарсено тегов из CSV:', arr.length);
        return arr;
    }

    // ═══ Загрузка ═══
    async function load() {
        if (_db) return _db;
        if (_loading) return _loading;

        _loading = (async () => {
            // 1. Пробуем кэш
            try {
                const cached = await idbGet(CACHE_KEY);
                if (cached && cached.t && Date.now() - cached.t < CACHE_TTL && Array.isArray(cached.v)) {
                    _db = cached.v;
                    console.log('📚 Теги из кэша:', _db.length);
                    return _db;
                }
            } catch (e) {}

            // 2. Скачиваем CSV
            console.log('📥 Загружаю 000.csv (14 МБ, только при первом заходе)...');
            const t0 = Date.now();
            const resp = await fetch(CSV_URL, { mode: 'cors' });
            if (!resp.ok) throw new Error('CSV: HTTP ' + resp.status);
            const text = await resp.text();
            const tags = parseCsv(text);
            const dt = ((Date.now() - t0) / 1000).toFixed(1);
            console.log('📚 Теги загружены:', tags.length, 'шт. за', dt, 'сек');

            _db = tags;
            try {
                await idbSet(CACHE_KEY, { t: Date.now(), v: tags });
            } catch (e) {
                console.warn('IndexedDB переполнен:', e);
            }
            return _db;
        })();

        return _loading;
    }

    // ═══ Поиск ═══
    function norm(s) {
        return String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
    }

    function search(query, limit) {
        if (!_db || !query) return [];
        limit = limit || 12;
        const q = norm(query);
        if (q.length < 1) return [];

        const result = [];
        for (let i = 0; i < _db.length && result.length < limit; i++) {
            const tag = _db[i];
            if (norm(tag).indexOf(q) === 0) result.push(tag);
        }
        return result;
    }

    window.TagsDB = { load, search };
})();

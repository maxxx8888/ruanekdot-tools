// tags-db.js — v2
// Загружает 000.csv (14 МБ) ОДИН РАЗ, конвертирует в массив тегов,
// кэширует в IndexedDB (не в localStorage — там лимит 5 МБ).
// При повторных заходах — мгновенно из кэша.

(function () {
    'use strict';

    const CSV_URL = 'https://cdn.jsdelivr.net/gh/maxxx8888/ruanekdot-tools@main/000.csv';
    const DB_NAME = 'ruanekdot';
    const STORE = 'tags';
    const CACHE_KEY = 'v2';
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 дней

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

    // ═══ Парсер CSV ═══
    function parseCsv(text) {
        const tags = new Set();
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            if (!line) continue;
            // простая логика: разбиваем по запятым, но учитываем кавычки
            const parts = [];
            let cur = '';
            let inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuote = !inQuote; continue; }
                if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
                cur += ch;
            }
            parts.push(cur);

            for (let p of parts) {
                p = p.toLowerCase().trim().replace(/^["'«»]+|["'«»]+$/g, '');
                if (!p) continue;
                if (p.length < 3 || p.length > 40) continue;
                if (!/[а-яa-z]/.test(p)) continue;
                if (/^\d+$/.test(p)) continue;
                tags.add(p);
            }
        }
        return Array.from(tags);
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

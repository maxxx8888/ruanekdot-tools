// tags-db.js — v6
// ⚠️ ЯВНАЯ МЕТКА: если в консоли "🟢 tags-db v6" — скрипт обновился.

(function () {
    'use strict';

    console.log('🟢 tags-db v6 — старт');

    const CSV_URL = 'https://cdn.jsdelivr.net/gh/maxxx8888/ruanekdot-tools@main/000.csv';
    const DB_NAME = 'ruanekdot';
    const STORE = 'tags';
    const CACHE_KEY = 'v6';                                  // ← бампнули кэш
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;              // 30 дней

    let _db = null;
    let _loading = null;

    // ─────────────────────────────────────────────────────────────
    // IndexedDB
    // ─────────────────────────────────────────────────────────────
    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
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

    // ─────────────────────────────────────────────────────────────
    // CSV парсер
    // ─────────────────────────────────────────────────────────────
    function parseCsv(text) {
        const tags = new Set();
        const lines = text.split(/\r?\n/);
        let nonEmpty = 0;
        let rawCount = 0;

        console.log('🔎 tags-db v6: первая строка =', JSON.stringify(lines[0] || '').substring(0, 200));

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            nonEmpty++;

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
                if (/\d{4,}/.test(p)) continue;
                tags.add(p);
            }
        }

        const arr = Array.from(tags);
        console.log('🟢 tags-db v6: строк=' + nonEmpty + ', ячеек=' + rawCount + ', тегов=' + arr.length);
        return arr;
    }

    // ─────────────────────────────────────────────────────────────
    // Загрузка (кэш + сеть)
    // ─────────────────────────────────────────────────────────────
    async function load() {
        if (_db) return _db;
        if (_loading) return _loading;

        _loading = (async () => {
            try {
                const cached = await idbGet(CACHE_KEY);
                if (cached && cached.t && Date.now() - cached.t < CACHE_TTL && Array.isArray(cached.v)) {
                    _db = cached.v;
                    console.log('🟢 tags-db v6: из кэша', _db.length);
                    return _db;
                }
            } catch (e) {}

            console.log('📥 tags-db v6: скачиваю CSV...');
            const t0 = Date.now();
            const resp = await fetch(CSV_URL, { mode: 'cors' });
            if (!resp.ok) throw new Error('CSV: HTTP ' + resp.status);
            const text = await resp.text();
            const tags = parseCsv(text);
            const dt = ((Date.now() - t0) / 1000).toFixed(1);
            console.log('🟢 tags-db v6: загружено', tags.length, 'тегов за', dt, 'сек');

            _db = tags;
            try { await idbSet(CACHE_KEY, { t: Date.now(), v: tags }); } catch (e) {}
            return _db;
        })();

        return _loading;
    }

    // ─────────────────────────────────────────────────────────────
    // Утилиты
    // ─────────────────────────────────────────────────────────────
    // Нормализация (ё→е, нижний регистр, обрезка/схлопывание пробелов)
    function normalize(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Старый norm — оставлен для совместимости с v5-кодом
    function norm(s) {
        return String(s || '').toLowerCase().replace(/ё/g, 'е').trim();
    }

    function isReady() {
        return Array.isArray(_db) && _db.length > 0;
    }

    // Точная проверка наличия тега
    function has(tag) {
        if (!isReady()) return false;
        const t = normalize(tag);
        if (!t) return false;
        for (let i = 0; i < _db.length; i++) {
            if (normalize(_db[i]) === t) return true;
        }
        return false;
    }

    function getAll() {
        return isReady() ? _db.slice() : [];
    }

    function count() {
        return isReady() ? _db.length : 0;
    }

    // ─────────────────────────────────────────────────────────────
    // Поиск (префикс + подстрока, сортировка по релевантности)
    // ─────────────────────────────────────────────────────────────
    function search(query, limit) {
        if (!isReady() || !query) return [];
        limit = limit || 12;

        const q = normalize(query);
        if (q.length < 1) return [];

        const prefix = [];
        const substr = [];

        for (let i = 0; i < _db.length; i++) {
            const n = normalize(_db[i]);
            const idx = n.indexOf(q);
            if (idx === 0) {
                prefix.push(_db[i]);
            } else if (idx > 0) {
                substr.push(_db[i]);
            }
            if (prefix.length >= limit && substr.length >= limit) break;
        }

        return prefix.concat(substr).slice(0, limit);
    }

    // ─────────────────────────────────────────────────────────────
    // Публичный API
    // ─────────────────────────────────────────────────────────────
    const api = {
        version: 'v6',
        load,                 // () => Promise<string[]>
        search,               // (query, limit) => string[]
        searchEx: search,     // синоним
        has,                  // (tag) => boolean
        getAll,               // () => string[]
        count,                // () => number
        isReady,              // () => boolean
        normalize,            // (s) => string
        get tags() {          // геттер — всегда актуальный массив
            return isReady() ? _db.slice() : [];
        }
    };

    // Основное имя
    window.tagsDb = api;

    // Обратная совместимость со старым кодом
    window.TagsDB = window.TagsDB || {};
    Object.assign(window.TagsDB, api);

    console.log('🟢 tags-db v6: API готов (tagsDb / TagsDB)');
})();

// tags-db.js — v1
// Загружает 000.csv, строит индекс, даёт поиск и автодополнение
(function () {
    'use strict';

    const CSV_URL = '/000.csv';
    const CACHE_KEY = 'tags_db_v1';
    const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов

    let DB = null;         // массив нормализованных тегов
    let INDEX = null;      // { byName: Map, byPrefix: Map }

    // ─── CSV-парсер (учитывает кавычки и запятые внутри кавычек) ───
    function parseCSV(text) {
        const rows = [];
        let row = [], field = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i], nx = text[i + 1];
            if (inQ) {
                if (ch === '"' && nx === '"') { field += '"'; i++; }
                else if (ch === '"') inQ = false;
                else field += ch;
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ',') { row.push(field); field = ''; }
                else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
                else if (ch !== '\r') field += ch;
            }
        }
        if (field || row.length) { row.push(field); rows.push(row); }
        return rows;
    }

    // ─── Нормализация тега ───
    function norm(t) {
        return String(t || '')
            .trim()
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[«»"']/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^[,;.\-\s]+|[,;.\-\s]+$/g, '');
    }

    // ─── Строим индекс ───
    function buildIndex(tags) {
        const byName = new Map();
        const byPrefix = new Map();
        for (const t of tags) {
            byName.set(t.name, t);
            // все префиксы длиной 2..6 для быстрого поиска
            const maxLen = Math.min(t.name.length, 6);
            for (let L = 2; L <= maxLen; L++) {
                const p = t.name.substring(0, L);
                if (!byPrefix.has(p)) byPrefix.set(p, []);
                byPrefix.get(p).push(t);
            }
        }
        return { byName, byPrefix };
    }

    // ─── Загрузка ───
    async function load() {
        if (DB) return DB;

        // кэш
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (raw) {
                const c = JSON.parse(raw);
                if (c.ts && Date.now() - c.ts < CACHE_TTL) {
                    DB = c.tags;
                    INDEX = buildIndex(DB);
                    console.log('📚 Теги из кэша:', DB.length);
                    return DB;
                }
            }
        } catch (e) {}

        const resp = await fetch(CSV_URL, { cache: 'force-cache' });
        if (!resp.ok) throw new Error('CSV не загружен: ' + resp.status);
        const text = await resp.text();
        const rows = parseCSV(text);

        const seen = new Map(); // name -> {name, count, freq}
        // каждая строка: name, value, value_lower, date_created, date_last_used, count
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || !r[1]) continue;
            const weight = parseInt(r[5] || '1', 10) || 1;
            const tags = String(r[1]).split(',').map(s => s.trim()).filter(Boolean);
            for (const tag of tags) {
                const n = norm(tag);
                if (n.length < 3 || n.length > 25) continue;
                if (/^\d+$/.test(n)) continue;
                if (!/[а-яa-z]/i.test(n)) continue;
                if (!seen.has(n)) seen.set(n, { name: n, count: 0, freq: 0 });
                const rec = seen.get(n);
                rec.count += weight;
                rec.freq += 1;
            }
        }

        DB = [...seen.values()].sort((a, b) => b.count - a.count);
        INDEX = buildIndex(DB);

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), tags: DB }));
        } catch (e) {}

        console.log('📚 Теги загружены:', DB.length);
        return DB;
    }

    // ─── Поиск с ранжированием ───
    function search(query, limit) {
        limit = limit || 12;
        if (!INDEX) return [];
        const q = norm(query);
        if (q.length < 2) return [];

        const seen = new Map(); // name -> score

        // 1) точное совпадение / префикс
        const prefixBucket = INDEX.byPrefix.get(q.substring(0, Math.min(q.length, 6))) || [];
        for (const t of prefixBucket) {
            let score = 0;
            if (t.name === q) score = 10000;
            else if (t.name.startsWith(q)) score = 5000 + t.count;
            else if (t.name.includes(q)) score = 1000 + t.count;
            else {
                // по словам
                const qw = q.split(' ');
                const tw = t.name.split(' ');
                let ok = true;
                for (const w of qw) {
                    if (!tw.some(x => x.startsWith(w))) { ok = false; break; }
                }
                if (ok) score = 500 + t.count;
            }
            if (score > 0) seen.set(t.name, Math.max(seen.get(t.name) || 0, score));
        }

        return [...seen.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name]) => name);
    }

    // ─── Получить статистику тега ───
    function stats(name) {
        if (!INDEX) return null;
        return INDEX.byName.get(norm(name)) || null;
    }

    // ─── Публичное API ───
    window.TagsDB = {
        load,
        search,
        normalize: norm,
        stats,
        get list() { return DB || []; }
    };
})();
// text-tools.js — v1
// Чистое форматирование: тире, кавычки, диалоги, склейка строк, чистка UI соцсетей
(function () {
    'use strict';

    function isListLine(s) {
        return /^\s*(>|—|•|\*|–|-|\d+[.)])\s/.test(s);
    }

    // Склейка разорванных строк в один абзац (не список, не диалог)
    function smartJoinLines(text) {
        if (!text) return '';
        const lines = String(text).split('\n');
        const out = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const prev = out.length ? out[out.length - 1] : null;
            const prevIsList = prev !== null && isListLine(prev);
            const lineIsList = isListLine(line);
            if (prev !== null && prev !== '' && line !== '' &&
                /^[а-яёa-z]/.test(line) &&
                !/[.!?…:;]\s*$/.test(prev) &&
                !prevIsList && !lineIsList &&
                !/^[•·\-–—*]\s/.test(line) &&
                !/^\s*\d+[.)]\s/.test(line) && !/^\s*\d+[.)]\s/.test(prev)) {
                out[out.length - 1] = prev + ' ' + line;
            } else {
                out.push(line);
            }
        }
        return out.join('\n');
    }

    // Диалог: короткое тире (–) в начало каждой реплики
    function formatDialogue(text) {
        if (!text) return '';
        const lines = String(text).split('\n')
            .map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim())
            .filter(Boolean);
        if (lines.length < 2) return text;
        if (lines.some(l => /^>/.test(l))) return text;

        const isNumbered = lines.some(l => /^\s*\d+[.)]\s/.test(l));
        if (isNumbered) {
            return lines.map(l => /^[-–—]\s/.test(l)
                ? '– ' + l.replace(/^[-–—]+\s*/, '')
                : l).join('\n');
        }

        const dashed = lines.filter(l => /^[-–—]\s/.test(l)).length;
        if (dashed === lines.length) {
            return lines.map(l => '– ' + l.replace(/^[-–—]+\s*/, '')).join('\n');
        }

        const hasQ = lines.some(l => /\?/.test(l));
        const allShort = lines.every(l => l.length <= 200);
        const lastShort = lines[lines.length - 1].length <= 100;
        const isDlg = dashed > 0 || hasQ || (lines.length >= 2 && allShort) ||
                      (lines.length >= 3 && lastShort);

        if (!isDlg) {
            return lines.map(l => /^[-–—]\s/.test(l)
                ? '– ' + l.replace(/^[-–—]+\s*/, '')
                : l).join('\n');
        }

        return lines.map(l => '– ' + l.replace(/^[-–—]+\s*/, '')).join('\n');
    }

    // Убираем UI соцсетей (имена, @user, даты, счётчики)
    function cleanSocialUI(text) {
        if (!text) return '';
        return String(text).split('\n').map(line => {
            let s = line.replace(/^\s*[-–—•*]\s*/, '').trim();
            if (!s) return '';

            if (/^В\s+ответ\s+@/i.test(s)) return '';
            if (/^@[a-zA-Z0-9_.]{2,30}(\s|$)/.test(s)) return '';
            if (/^[A-ZА-ЯЁ][a-zа-яё]+\s+[A-ZА-ЯЁ][a-zа-яё]+\s+@/.test(s)) return '';
            if (/^[A-ZА-ЯЁ][a-zа-яё]+\s+@[a-zA-Z0-9_.]+/.test(s)) return '';
            if (/^\d{1,2}:\d{2}\s+\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/.test(s)) return '';
            if (/Twitter\s+for\s+(iPhone|Android|iPad|Web)/i.test(s)) return '';
            if (/^\d+[\s,]*(просмотр|like|лайк|retweet|repost|reply|коммент)/i.test(s)) return '';
            if (/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}\s*$/.test(s)) return '';
            if (/^\d{1,2}:\d{2}\s*$/.test(s)) return '';
            s = s.replace(/\s+@[a-zA-Z0-9_.]{2,30}\s*$/g, '');
            return s;
        }).filter((l, i, arr) => !(!l && arr[i - 1] === '')).join('\n')
          .replace(/\n{3,}/g, '\n\n').trim();
    }

    // Полный конвейер
    function editRussianText(text) {
        if (!text) return '';
        let r = String(text);

        r = cleanSocialUI(r);

        // «З.» → «3.» (частый OCR-баг)
        r = r.replace(/^\s*[Зз][.)]\s+/gm, m => m.replace(/[Зз]/, '3'));
        r = r.replace(/^\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/gm, '');

        // длинные тире
        r = r.replace(/\n\s*[-–—]{1,10}\s+(?![>])/g, '\n— ');
        r = r.replace(/(\S)[ \t]+--[ \t]+(\S)/g, '$1 — $2');

        // кавычки-ёлочки
        r = r.replace(/"([^"\n]{1,300})"/g, '«$1»');
        r = r.replace(/'([^'\n]{1,300})'/g, '«$1»');
        r = r.replace(/«\s+/g, '«').replace(/\s+»/g, '»');

        // мусор
        r = r.replace(/[|\\\/<>]+\s*$/g, '');
        r = r.replace(/[|\\\/<>]+(\s*\n)/g, '$1');

        // пунктуация
        r = r.replace(/\s+([.,!?;:])/g, '$1');
        r = r.replace(/([.,!?;:])([А-ЯA-Zа-яa-zЁё])/g, '$1 $2');
        r = r.replace(/([.,!?;:]){2,}/g, '$1');
        r = r.replace(/[ \t]+/g, ' ');

        // тримминг по строкам
        r = r.split('\n').map(l => l.trim())
             .filter(l => !/^В ответ\s+@/i.test(l) && !/^@[a-zA-Z0-9_.]{2,30}$/.test(l))
             .join('\n');
        r = r.replace(/\n{3,}/g, '\n\n');

        r = smartJoinLines(r);
        r = formatDialogue(r);
        return r.trim();
    }

    // Снять markdown
    function stripMarkdown(s) {
        return String(s || '')
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            .replace(/__([^_\n]+)__/g, '$1')
            .replace(/\*([^*\n]+)\*/g, '$1')
            .replace(/```([^`]+)```/g, '$1')
            .replace(/`([^`\n]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '');
    }

    function capitalizeFirst(t) {
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    }

    window.TextTools = {
        edit: editRussianText,
        dialogue: formatDialogue,
        join: smartJoinLines,
        cleanUI: cleanSocialUI,
        stripMarkdown,
        capitalizeFirst
    };
})();
/*
 * 扶養親族確認調査書 印刷システム — コアロジック（純粋関数）
 * ブラウザでは window.Core、Node では module.exports として読み込める。
 * 仕様書: docs/spec.md
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===== 元号 ===== (docs/spec.md 4.8) */
  var ERAS = [
    { sign: 'R', name: '令和', start: [2019, 5, 1] },
    { sign: 'H', name: '平成', start: [1989, 1, 8] },
    { sign: 'S', name: '昭和', start: [1926, 12, 25] },
    { sign: 'T', name: '大正', start: [1912, 7, 30] },
    { sign: 'M', name: '明治', start: [1868, 9, 8] }
  ];

  /** Y/M/D から UTC 基準の Date を作る（タイムゾーンの影響を受けないため） */
  function ymd(y, m, d) { return new Date(Date.UTC(y, m - 1, d)); }
  function parts(dt) { return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; }

  /**
   * 各種表現を Date に正規化する。(docs/spec.md 5.4)
   * - Date            → そのまま（UTCの同日付に揃える）
   * - 数値            → Excelシリアル値（1900日付システム / 基準 1899-12-30）
   * - 文字列          → YYYY-MM-DD / YYYY/M/D を受け付ける
   * - null/空/変換不能 → null
   */
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      // SheetJS の cellDates はローカル時刻の Date を返すためローカル値で読み直す
      return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }
    if (typeof v === 'number') {
      if (!isFinite(v) || v <= 0) return null;
      var ms = Math.round(v) * 86400000 + Date.UTC(1899, 11, 30);
      var d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === 'string') {
      var s = v.trim();
      var m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
      if (m) return ymd(+m[1], +m[2], +m[3]);
      var n = Number(s);
      if (s !== '' && isFinite(n)) return toDate(n);
      return null;
    }
    return null;
  }

  /** Date → "YYYY-MM-DD"（CSV出力用。UTC基準で内部表現と一致させる）。不正なら空文字。 */
  function formatIso(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return '';
    var p = parts(dt);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return p.y + '-' + pad(p.m) + '-' + pad(p.d);
  }

  /** Date → 和暦略記（例: 1960-03-01 → "S35.3.1"）。範囲外は null。 */
  function formatWareki(dt) {
    if (!(dt instanceof Date) || isNaN(dt.getTime())) return null;
    var p = parts(dt);
    for (var i = 0; i < ERAS.length; i++) {
      var e = ERAS[i];
      if (dt.getTime() >= ymd(e.start[0], e.start[1], e.start[2]).getTime()) {
        // 元年も「1」と表記する（docs/spec.md 4.8）
        return e.sign + (p.y - e.start[0] + 1) + '.' + p.m + '.' + p.d;
      }
    }
    return null;
  }

  /** 基準日時点の満年齢。(docs/spec.md 4.9) */
  function calcAge(birth, base) {
    if (!birth || !base) return null;
    var b = parts(birth), t = parts(base);
    var age = t.y - b.y;
    if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
    return age < 0 ? null : age;
  }

  /** 比較用の文字列正規化（NFKC＋空白除去）。(docs/spec.md 3.4) */
  function normalizeKey(s) {
    if (s === null || s === undefined) return '';
    var t = String(s);
    if (typeof t.normalize === 'function') t = t.normalize('NFKC');
    return t.replace(/[\s　]+/g, '');
  }

  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = Number(String(v).trim());
    return isFinite(n) ? n : null;
  }

  function toStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  /** 年度パラメータ。(docs/spec.md 3.1 / 4.11) */
  function fiscalParams(fy) {
    var base = ymd(fy, 6, 1);
    var p = parts(base);
    return {
      fy: fy,
      baseDate: base,                                   // 基準日 = FY年6月1日
      birthLimit: ymd(fy - 18, 4, 1),                   // 生年月日上限
      heading: '扶養親族（' + p.m + '.' + p.d + '時点　扶養手当対象者）'
    };
  }

  /** 今日の日付から年度（4月始まり）を求める */
  function currentFy(today) {
    var d = today || new Date();
    return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  }

  /* ===== 抽出 ===== (docs/spec.md 3.2) */

  /**
   * @param {Object} args
   *   roster  {Array<Object>} 名簿データ行（列名は名簿の見出しそのまま）
   *   deps    {Array<Object>} 扶養データ行
   *   fy      {number}        対象年度（西暦）
   *   config  {Object}        設定（assets/config.js）
   * @returns {{sheets:Array, errors:Array, warnings:Array, infos:Array, stats:Object}}
   */
  function extract(args) {
    var roster = args.roster || [];
    var deps = args.deps || [];
    var cfg = args.config || {};
    var fp = fiscalParams(args.fy);
    var C = cfg.columns || {};

    var excluded = (cfg.excludedStatuses || []).map(normalizeKey);
    var knownIncluded = (cfg.knownIncludedStatuses || []).map(normalizeKey);
    var maxRows = cfg.maxDependentsPerSheet || 9;

    var errors = [], warnings = [], infos = [];
    var stats = {
      rosterRows: roster.length, depRows: deps.length,
      activeStaff: 0, excludedByStatus: 0, unknownStatus: 0,
      targetDeps: 0, staffWithTarget: 0, overflowStaff: 0
    };

    /* --- STEP1 在職者 --- */
    var staffByNo = {};
    var nonTarget = {};          // 名簿にはあるが対象外となった職員 → 理由
    var unknownStatusSeen = {};
    roster.forEach(function (r, i) {
      var row = i + 2;                                     // 見出し1行＋1始まり
      var no = toNum(r[C.rosterNo]);
      if (no === null) {
        errors.push({ src: '名簿', row: row, msg: '「' + C.rosterNo + '」が空または数値ではありません' });
        return;
      }
      if (toNum(r[C.zaishoku]) !== 1) { nonTarget[no] = '在職者ではありません（「' + C.zaishoku + '」が1以外）'; return; }

      var shibun = toStr(r[C.shibun]);
      var key = normalizeKey(shibun);
      if (excluded.indexOf(key) >= 0) {
        stats.excludedByStatus++;
        nonTarget[no] = '身分「' + shibun + '」が対象外に設定されています';
        return;
      }
      if (key && knownIncluded.indexOf(key) < 0 && !unknownStatusSeen[key]) {
        unknownStatusSeen[key] = true;
        stats.unknownStatus++;
        infos.push({
          src: '名簿', row: row,
          msg: '未知の身分「' + shibun + '」を対象に含めました。除外すべき場合は assets/config.js の excludedStatuses に追加してください'
        });
      }
      if (staffByNo[no]) {
        warnings.push({ src: '名簿', row: row, msg: '職員番号 ' + no + ' が重複しています。先に現れた行を使用します' });
        return;
      }
      staffByNo[no] = {
        no: no,
        name: toStr(r[C.rosterName]),
        shozokuCd: toNum(r[C.shozokuCd]),
        shozokuName: toStr(r[C.shozokuName]),
        kakariCd: toNum(r[C.kakariCd]),
        deps: []
      };
      stats.activeStaff++;
    });

    /* --- STEP2 対象扶養親族 --- */
    var orphan = {};
    deps.forEach(function (d, i) {
      var row = i + 2;
      if (toNum(d[C.depYear]) !== fp.fy) return;
      if (toNum(d[C.teate]) !== 1) return;
      var kingaku = toNum(d[C.kingaku]);
      if (kingaku === null || kingaku <= 0) return;

      var birth = toDate(d[C.birthday]);
      if (!birth) {
        errors.push({ src: '扶養', row: row, msg: '「' + C.birthday + '」を日付として読み取れません（' + toStr(d[C.depName]) + '）' });
        return;
      }
      if (birth.getTime() > fp.birthLimit.getTime()) return;   // 生年月日上限

      var no = toNum(d[C.depNo]);
      if (no === null) {
        errors.push({ src: '扶養', row: row, msg: '「' + C.depNo + '」が空または数値ではありません' });
        return;
      }
      var staff = staffByNo[no];
      if (!staff) {
        if (!orphan[no]) {
          orphan[no] = true;
          warnings.push({
            src: '扶養', row: row,
            msg: '職員番号 ' + no + ' は印刷対象外です（' +
                 (nonTarget[no] || '名簿データに該当する職員番号がありません') + '）'
          });
        }
        return;
      }
      staff.deps.push({
        row: row,
        name: toStr(d[C.depName]),
        birth: birth,
        birthWareki: formatWareki(birth),
        age: calcAge(birth, fp.baseDate),
        jyun: toNum(d[C.jyun]),
        kingaku: kingaku          // 扶養手当月額。様式には印字しないが、CSV一覧では参照用に出力する
      });
      stats.targetDeps++;
    });

    /* --- STEP3/4 結合・並び順 --- */
    var sheets = [];
    Object.keys(staffByNo).forEach(function (k) {
      var s = staffByNo[k];
      if (!s.deps.length) return;

      // 同名・同生年月日の重複を検出（集約はせず全件残す）
      var seen = {};
      s.deps.forEach(function (d) {
        var key = normalizeKey(d.name) + '|' + d.birth.getTime();
        if (seen[key]) {
          warnings.push({ src: '扶養', row: d.row, msg: '職員番号 ' + s.no + ' に同名・同生年月日の扶養親族が重複しています（' + d.name + '）' });
        }
        seen[key] = true;
      });

      s.deps.sort(function (a, b) {
        var x = (a.jyun === null ? 9999 : a.jyun) - (b.jyun === null ? 9999 : b.jyun);
        return x !== 0 ? x : a.row - b.row;
      });

      if (s.deps.length > maxRows) {
        stats.overflowStaff++;
        warnings.push({
          src: '扶養', row: null,
          msg: '職員番号 ' + s.no + '（' + s.name + '）の対象扶養親族が ' + s.deps.length +
               ' 名で1ページに収まりません（上限 ' + maxRows + ' 名）。印刷対象外としたため手作業で対応してください'
        });
        return;
      }
      sheets.push(s);
      stats.staffWithTarget++;
    });

    sheets.sort(function (a, b) {
      return (a.shozokuCd - b.shozokuCd) || (a.kakariCd - b.kakariCd) || (a.no - b.no);
    });

    return { sheets: sheets, errors: errors, warnings: warnings, infos: infos, stats: stats, fiscal: fp };
  }

  return {
    ERAS: ERAS, ymd: ymd, toDate: toDate, toNum: toNum, toStr: toStr,
    formatWareki: formatWareki, formatIso: formatIso, calcAge: calcAge, normalizeKey: normalizeKey,
    fiscalParams: fiscalParams, currentFy: currentFy, extract: extract
  };
});

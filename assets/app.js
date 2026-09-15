/* 画面制御 — ファイル取込・抽出・一覧・印刷プレビュー */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { roster: null, deps: null, result: null, selected: {} };

  /* ===== 取込 ===== */

  function readSheet(file, sheetName) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error(file.name + ' を読み込めませんでした')); };
      fr.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true });
          var name = sheetName || wb.SheetNames[0];
          var ws = wb.Sheets[name];
          if (!ws) throw new Error('シート「' + name + '」が見つかりません（' + file.name + '）');
          resolve({
            rows: XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }),
            sheetName: name
          });
        } catch (e) { reject(e); }
      };
      fr.readAsArrayBuffer(file);
    });
  }

  /** 見出し行に必須列が揃っているか確認する */
  function checkColumns(rows, needed, label) {
    if (!rows.length) throw new Error(label + 'にデータ行がありません');
    var have = Object.keys(rows[0]).map(function (k) { return Core.normalizeKey(k); });
    var missing = needed.filter(function (c) { return have.indexOf(Core.normalizeKey(c)) < 0; });
    if (missing.length) {
      throw new Error(label + 'に必要な列が見つかりません: ' + missing.join(' / ') +
        '\n（見出し行の名称が変わった場合は assets/config.js の columns を修正してください）');
    }
  }

  /* ===== 表示 ===== */

  function renderStats(r) {
    var s = r.stats;
    var items = [
      ['対象職員', s.staffWithTarget, '印刷する枚数', 'accent'],
      ['対象扶養親族', s.targetDeps, '', 'accent'],
      ['在職者', s.activeStaff, '名簿 ' + s.rosterRows + ' 行中', ''],
      ['身分により除外', s.excludedByStatus, '', ''],
      ['エラー', r.errors.length, '', r.errors.length ? 'err' : ''],
      ['警告', r.warnings.length, '', r.warnings.length ? 'warn' : '']
    ];
    $('stats').innerHTML = items.map(function (i) {
      return '<div class="stat' + (i[3] ? ' stat--' + i[3] : '') + '"><b>' + i[1] + '</b><span>' + i[0] +
             (i[2] ? '<br>' + i[2] : '') + '</span></div>';
    }).join('');
  }

  function renderMsgs(r) {
    var groups = [
      ['err',  'エラー（印刷対象から除外しました）', r.errors],
      ['warn', '警告（確認してください）',            r.warnings],
      ['info', 'お知らせ',                            r.infos]
    ];
    $('msgs').innerHTML = groups.filter(function (g) { return g[2].length; }).map(function (g) {
      var lis = g[2].map(function (m) {
        var where = m.src + (m.row ? ' ' + m.row + '行目' : '');
        return '<li>［' + Render.esc(where) + '］' + Render.esc(m.msg) + '</li>';
      }).join('');
      return '<div class="msg ' + g[0] + '"><h3>' + g[1] + '（' + g[2].length + '件）</h3><ul>' + lis + '</ul></div>';
    }).join('') || '<div class="msg info"><h3>エラー・警告はありません</h3></div>';
  }

  function renderList() {
    var r = state.result;
    var sel = $('filterShozoku');
    var cur = sel.value;
    var names = [];
    r.sheets.forEach(function (s) { if (names.indexOf(s.shozokuName) < 0) names.push(s.shozokuName); });
    sel.innerHTML = '<option value="">すべて</option>' +
      names.map(function (n) { return '<option>' + Render.esc(n) + '</option>'; }).join('');
    sel.value = cur;
    drawRows();
  }

  function visibleSheets() {
    var f = $('filterShozoku').value;
    return state.result.sheets.filter(function (s) { return !f || s.shozokuName === f; });
  }

  function drawRows() {
    var tb = $('list').tBodies[0];
    tb.innerHTML = visibleSheets().map(function (s) {
      var on = state.selected[s.no] !== false;
      return '<tr class="' + (on ? '' : 'off') + '" data-no="' + s.no + '">' +
        '<td class="w1"><input type="checkbox" data-no="' + s.no + '"' + (on ? ' checked' : '') + '></td>' +
        '<td>' + Render.esc(s.shozokuName) + '</td>' +
        '<td>' + Render.esc(s.no) + '</td>' +
        '<td>' + Render.esc(s.name) + '</td>' +
        '<td>' + s.deps.map(function (d) {
            return Render.esc(d.name) + '（' + Render.esc(d.birthWareki) + '・' + d.age + '才）';
          }).join('、') + '</td>' +
        '<td class="w1">' + s.deps.length + '</td>' +
      '</tr>';
    }).join('');
    updateCount();
  }

  function chosen() {
    return state.result.sheets.filter(function (s) { return state.selected[s.no] !== false; });
  }

  function updateCount() {
    $('selCount').textContent = '選択 ' + chosen().length + ' 件 / 全 ' + state.result.sheets.length + ' 件';
  }

  /* ===== イベント ===== */

  function ready() {
    $('btnRun').disabled = !($('fRoster').files[0] && $('fDeps').files[0] && $('fy').value);
  }

  function fail(e) {
    $('secResult').classList.remove('hidden');
    $('stats').innerHTML = '';
    $('msgs').innerHTML = '<div class="msg err"><h3>読み込みに失敗しました</h3><ul><li>' +
      Render.esc(e.message || e).replace(/\n/g, '<br>') + '</li></ul></div>';
    $('secList').classList.add('hidden');
    $('secPrint').classList.add('hidden');
  }

  function run() {
    var fy = parseInt($('fy').value, 10);
    var C = Config.columns;
    $('btnRun').disabled = true;
    Promise.all([
      readSheet($('fRoster').files[0], Config.sheetNames.roster),
      readSheet($('fDeps').files[0], Config.sheetNames.deps)
    ]).then(function (res) {
      checkColumns(res[0].rows, [C.rosterNo, C.rosterName, C.zaishoku, C.shibun, C.shozokuName], '名簿データ');
      checkColumns(res[1].rows, [C.depNo, C.depYear, C.depName, C.birthday, C.teate, C.kingaku], '扶養データ');
      state.roster = res[0].rows;
      state.deps = res[1].rows;
      state.result = Core.extract({ roster: state.roster, deps: state.deps, fy: fy, config: Config });
      state.selected = {};

      renderStats(state.result);
      renderMsgs(state.result);
      $('secResult').classList.remove('hidden');
      $('sheets').innerHTML = '';
      $('secPrint').classList.add('hidden');

      if (state.result.sheets.length) {
        renderList();
        $('secList').classList.remove('hidden');
        $('secList').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        $('secList').classList.add('hidden');
      }
    }).catch(fail).then(function () { ready(); });
  }

  function preview() {
    var list = chosen();
    if (!list.length) { alert('印刷対象が選択されていません。'); return; }
    $('sheets').innerHTML = Render.sheets(list, state.result.fiscal);
    $('printCount').textContent = list.length + ' 枚';
    $('secPrint').classList.remove('hidden');
    $('secPrint').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 一覧に表示中（所属フィルタ反映後）の対象扶養親族をCSVで書き出す。印刷用チェックとは独立。 */
  function exportCsv() {
    var list = visibleSheets();
    if (!list.length) { alert('CSVに出力する対象がありません。'); return; }
    var csv = Csv.build(list);
    var filename = '対象扶養親族一覧_' + state.result.fiscal.fy + '年度.csv';
    Csv.download(csv, filename);
  }

  /** 年度hintの本文（例:「令和8年度：基準日 2026/6/1、2008/4/1 以前の出生者が対象」）*/
  function fyHintText(v) {
    return isFinite(v)
      ? Core.fiscalYearLabel(v) + '：基準日 ' + v + '/6/1、' + (v - 18) + '/4/1 以前の出生者が対象'
      : '';
  }

  /** 対象年度プルダウンに選択肢を並べる（当年度を基準に前後の年度を表示。docs/spec.md 6章） */
  function populateFyOptions() {
    var fy0 = Core.currentFy();
    var range = Config.fiscalYearRange || { before: 2, after: 3 };
    var opts = [];
    for (var y = fy0 - range.before; y <= fy0 + range.after; y++) {
      opts.push('<option value="' + y + '"' + (y === fy0 ? ' selected' : '') + '>' +
        Render.esc(Core.fiscalYearLabel(y)) + '（' + y + '）</option>');
    }
    $('fy').innerHTML = opts.join('');
  }

  /** 画面右上・最下部にバージョンを表示する（assets/version.js が値を持つ）。
      別のPCと見た目や動作が食い違ったとき、どちらが新しい版かを一目で確認できるようにするためのもの。 */
  function showVersion() {
    var v = (typeof window !== 'undefined' && window.APP_VERSION) || '不明';
    var d = (typeof window !== 'undefined' && window.APP_VERSION_DATE) || '';
    var badge = $('verBadge');
    if (badge) { badge.textContent = 'Ver ' + v; badge.title = d ? d + ' 更新' : ''; }
    var foot = $('verFoot');
    if (foot) { foot.textContent = 'Ver ' + v + (d ? '（' + d + '）' : ''); }
  }

  document.addEventListener('DOMContentLoaded', function () {
    showVersion();
    populateFyOptions();
    $('fyHint').textContent = fyHintText(parseInt($('fy').value, 10));
    $('fy').addEventListener('change', function () {
      $('fyHint').textContent = fyHintText(parseInt($('fy').value, 10));
      ready();
    });
    $('fRoster').addEventListener('change', ready);
    $('fDeps').addEventListener('change', ready);
    $('btnRun').addEventListener('click', run);
    $('filterShozoku').addEventListener('change', drawRows);

    $('list').addEventListener('change', function (e) {
      var cb = e.target;
      if (cb.tagName !== 'INPUT') return;
      state.selected[cb.dataset.no] = cb.checked;
      cb.closest('tr').classList.toggle('off', !cb.checked);
      updateCount();
    });
    $('chkAll').addEventListener('change', function () {
      var on = $('chkAll').checked;
      visibleSheets().forEach(function (s) { state.selected[s.no] = on; });
      drawRows();
    });
    $('btnAll').addEventListener('click', function () {
      visibleSheets().forEach(function (s) { state.selected[s.no] = true; }); drawRows();
    });
    $('btnNone').addEventListener('click', function () {
      visibleSheets().forEach(function (s) { state.selected[s.no] = false; }); drawRows();
    });
    $('btnPreview').addEventListener('click', preview);
    $('btnCsv').addEventListener('click', exportCsv);
    $('btnPrint').addEventListener('click', function () { window.print(); });
    $('btnBack').addEventListener('click', function () {
      $('sheets').innerHTML = '';
      $('secPrint').classList.add('hidden');
      $('secList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    ready();
  });
})();

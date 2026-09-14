/*
 * CSV出力 — 対象扶養親族の一覧を Excel で開けるCSVに変換する。
 * ブラウザでは window.Csv、Node では module.exports として読み込める。
 */
(function (root, factory) {
  var CoreDep = (typeof module === 'object' && module.exports) ? require('./core.js') : root.Core;
  var api = factory(CoreDep);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Csv = api;
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  var HEADER = [
    '所属名', '職員番号', '職員氏名',
    '扶養親族氏名', '生年月日（和暦）', '生年月日（西暦）', '年齢（基準日時点）',
    '扶養手当月額（円）'
  ];

  /** CSVの1フィールド用にエスケープする（カンマ・ダブルクォート・改行を含む場合のみ引用） */
  function escapeField(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function row(cols) { return cols.map(escapeField).join(','); }

  /**
   * 職員シートの配列（Core.extract() の result.sheets）から CSV 文字列を組み立てる。
   * 1扶養親族 = 1行。改行は Excel 互換のため CRLF、文字化け防止のため先頭に UTF-8 BOM を付ける。
   */
  function build(sheets) {
    var lines = [row(HEADER)];
    sheets.forEach(function (s) {
      s.deps.forEach(function (d) {
        lines.push(row([
          s.shozokuName, s.no, s.name,
          d.name, d.birthWareki || '', Core.formatIso(d.birth),
          d.age === null || d.age === undefined ? '' : d.age,
          d.kingaku
        ]));
      });
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** ブラウザで CSV をファイルとしてダウンロードさせる。 */
  function download(text, filename) {
    var blob = new Blob([text], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  return { HEADER: HEADER, build: build, download: download };
});

/*
 * 帳票レンダラ — 抽出結果を調査書のDOMに変換する。
 * 寸法は assets/form.css（docs/spec.md 4章）に従う。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Render = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 表A（扶養親族）: データ行 = 対象者数 ＋ 予備1行（docs/spec.md 4.10） */
  function tableA(deps) {
    var rows = '';
    for (var i = 0; i < deps.length + 1; i++) {
      var d = deps[i] || null;
      rows +=
        '<tr>' +
          '<td class="t9 just">' + (d ? esc(d.name) : '') + '</td>' +
          '<td></td>' +
          '<td class="t10 just">' + (d ? esc(d.birthWareki || '') : '') + '</td>' +
          '<td class="t11 r">' + (d && d.age !== null ? esc(d.age) : '') + '才</td>' +
          '<td></td>' +
          '<td class="t11 r">円</td>' +
          '<td class="t9 just nw pd">同居・別居</td>' +
          '<td></td>' +
        '</tr>';
    }
    return '' +
      '<table class="tblA">' +
        '<colgroup>' +
          '<col style="width:29.98mm"><col style="width:16.17mm"><col style="width:21.80mm">' +
          '<col style="width:14.26mm"><col style="width:20.03mm"><col style="width:27.86mm">' +
          '<col style="width:19.98mm"><col style="width:20.16mm">' +
        '</colgroup>' +
        '<tr class="hd">' +
          '<td class="t11 just">名前</td>' +
          '<td class="t10 just">続柄</td>' +
          '<td class="t10 just">生年月日</td>' +
          '<td class="t11 just">年齢</td>' +
          '<td class="t11 c">職業</td>' +
          '<td class="t11 c nw pz">今後１年間の<br>総収入見込額</td>' +
          '<td class="t9 just nw pd">同居・別居</td>' +
          '<td class="t10 c">※総務課<br>記載欄</td>' +
        '</tr>' + rows +
      '</table>';
  }

  /** 1職員 = 1ページ */
  function sheet(staff, fiscal) {
    return '' +
    '<div class="sheet">' +
      '<div class="body">' +
        '<div class="title t14 just">扶養親族確認調査書</div>' +
        '<div class="subtitle t11">(扶養手当）</div>' +
        '<div class="shozoku t11">' + esc(staff.shozokuName) + '</div>' +
        '<div class="meiline t11">' +
          '<span class="no">' + esc(staff.no) + '</span>' +
          '<span class="name">' + esc(staff.name) + '</span>' +
        '</div>' +
        '<div class="midashi t10">' + esc(fiscal.heading) + '</div>' +
        tableA(staff.deps) +
        '<div class="setsumei t10">以下の部分は、配偶者を扶養親族としていない場合に記載願います。</div>' +
        '<table class="tblB">' +
          '<colgroup><col style="width:30.08mm"><col style="width:19.98mm"><col style="width:120.20mm"></colgroup>' +
          '<tr>' +
            '<td class="t10 just">配偶者の有・無</td>' +
            '<td class="t9 just">有・無</td>' +
            '<td class="t10" style="padding-left:1.44mm;line-height:1.3">' +
              '（どちらかに○をつけてください。無に○をつけた場合は以下の部分は<br>記載不要です。）</td>' +
          '</tr>' +
        '</table>' +
        '<div class="maru t11"><span class="mk">○</span><span class="tx">配偶者について記載してください。</span></div>' +
        '<table class="tblC">' +
          '<colgroup>' +
            '<col style="width:20.03mm"><col style="width:20.04mm"><col style="width:25.01mm">' +
            '<col style="width:15.00mm"><col style="width:20.03mm"><col style="width:30.00mm">' +
            '<col style="width:20.15mm">' +
          '</colgroup>' +
          '<tr class="hd">' +
            '<td class="t11 just">名前</td><td class="t11 just">続柄</td>' +
            '<td class="t10 just">生年月日</td><td class="t11 just">年齢</td>' +
            '<td class="t11 c">職業</td>' +
            '<td class="t11 c nw pz">今後１年間の<br>総収入見込額</td>' +
            '<td class="t9 just nw pd">同居・別居</td>' +
          '</tr>' +
          '<tr>' +
            '<td></td><td></td><td></td>' +
            '<td class="t11 r">才</td><td></td>' +
            '<td class="t11 r">円</td>' +
            '<td class="t9 just nw pd">同居・別居</td>' +
          '</tr>' +
        '</table>' +
        '<div class="chui t10">' +
          '<div>※注意事項</div>' +
          '<div>１　添付資料は、各部課等の長宛の依頼文書を参照願います。</div>' +
          '<div>２　※欄は記載不要です。</div>' +
          '<div>３　今後１年間の総収入見込額が１３０万を超える場合には扶養の資格喪失となります。</div>' +
        '</div>' +
      '</div>' +
      '<table class="tblD">' +
        '<colgroup><col style="width:50.16mm"><col style="width:30.19mm"></colgroup>' +
        '<tr class="hd"><td class="t10 c">担当者確認年月日</td><td class="t10 c">担当者確認印</td></tr>' +
        '<tr><td class="t10 c">．　　　　．</td><td></td></tr>' +
      '</table>' +
    '</div>';
  }

  function sheets(list, fiscal) {
    return list.map(function (s) { return sheet(s, fiscal); }).join('');
  }

  return { sheet: sheet, sheets: sheets, esc: esc };
});

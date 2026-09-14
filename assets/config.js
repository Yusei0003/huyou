/*
 * 設定ファイル — 運用に合わせてここだけを編集する。
 * 変更後はブラウザで再読み込み（Ctrl+F5）してください。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Config = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {

    /* 対象外とする身分（名簿の「身分」列で判定）。docs/spec.md 3.4
       全角/半角・空白は自動で正規化して突合するため、表記ゆれは気にしなくてよい。 */
    excludedStatuses: [
      'パート（時間額）',
      'パート（日額）'
    ],

    /* 対象に含めることが確認済みの身分。
       ここにも excludedStatuses にも無い身分が現れた場合は、
       「対象に含めたうえで」情報一覧に表示して判断を促す。 */
    knownIncludedStatuses: [
      '正職員'
    ],

    /* 1枚に収まる扶養親族の上限人数。超えた職員は警告を出して印刷対象外とする。 */
    maxDependentsPerSheet: 9,

    /* 取り込むシート名。null なら先頭シートを使う。 */
    sheetNames: { roster: null, deps: null },

    /* 列名の対応。人事給与システムの出力見出しが変わった場合はここを直す。 */
    columns: {
      // 名簿データ
      rosterNo:    '番号',
      rosterName:  '氏名',
      zaishoku:    '在職',
      shibun:      '身分',
      shozokuCd:   '所属CD',
      shozokuName: '所属名',
      kakariCd:    '係CD',
      // 扶養データ
      depNo:       'number',
      depYear:     'year',
      depName:     'kanji',
      birthday:    'birthday',
      teate:       'teate',
      kingaku:     'temp_kingaku',
      jyun:        'temp_jyun'
    }
  };
});

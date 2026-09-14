/* 単体テスト（開発用）: node test/csv.test.js */
'use strict';
const assert = require('assert');
const Core = require('../assets/core.js');
const Csv = require('../assets/csv.js');

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}

var sheets = [
  {
    shozokuName: '議会事務局', no: 1000, name: '志田　一朗',
    deps: [
      { name: '志田　尚子', birth: Core.toDate('1960-03-01'), birthWareki: 'S35.3.1', age: 66, kingaku: 6500 },
      { name: '田中,"太郎"', birth: Core.toDate('1935-01-01'), birthWareki: 'S10.1.1', age: 91, kingaku: 6500 }
    ]
  },
  { shozokuName: '福祉課', no: 1011, name: '鈴木　明', deps: [] }
];

console.log('\n[CSV出力]');
t('先頭にUTF-8 BOMが付く', () => assert.strictEqual(Csv.build(sheets).charCodeAt(0), 0xFEFF));
t('見出し行が仕様どおり', () => {
  const lines = Csv.build(sheets).slice(1).split('\r\n');
  assert.strictEqual(lines[0], Csv.HEADER.join(','));
});
t('1扶養親族=1行、職員情報を繰り返す', () => {
  const lines = Csv.build(sheets).slice(1).split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 1 /* header */ + 2 /* deps */);
  assert.ok(lines[1].startsWith('議会事務局,1000,志田　一朗,志田　尚子,S35.3.1,1960-03-01,66,6500'));
  assert.ok(lines[2].startsWith('議会事務局,1000,志田　一朗,'));
});
t('扶養親族0名の職員は行を出さない', () => {
  const lines = Csv.build(sheets).slice(1).split('\r\n').filter(Boolean);
  assert.ok(!lines.some(l => l.indexOf('福祉課') >= 0));
});
t('カンマ・ダブルクォートを含む氏名は引用符で囲む', () => {
  const lines = Csv.build(sheets).slice(1).split('\r\n').filter(Boolean);
  assert.ok(lines[2].indexOf('"田中,""太郎"""') >= 0, lines[2]);
});
t('改行はCRLF、末尾も改行で終わる', () => {
  const csv = Csv.build(sheets);
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(csv), '裸のLFが含まれている');
});
t('空の一覧はヘッダーのみ', () => {
  const lines = Csv.build([]).slice(1).split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
});

console.log('\n' + pass + ' 件成功' + (process.exitCode ? '' : '、失敗なし'));

/* 単体テスト（開発用）: node test/core.test.js */
'use strict';
const assert = require('assert');
const Core = require('../assets/core.js');
const Config = require('../assets/config.js');

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const D = Core.ymd;

console.log('\n[日付の正規化] docs/spec.md 5.4');
t('Excelシリアル値（名簿）', () => {
  assert.strictEqual(Core.toDate(36602).toISOString().slice(0, 10), '2000-03-17');
  assert.strictEqual(Core.toDate(45017).toISOString().slice(0, 10), '2023-04-01');
});
t('Date（扶養）', () => assert.strictEqual(Core.toDate(new Date(1960, 2, 1)).getTime(), D(1960, 3, 1).getTime()));
t('文字列', () => {
  assert.strictEqual(Core.toDate('1960-03-01').getTime(), D(1960, 3, 1).getTime());
  assert.strictEqual(Core.toDate('1960/3/1').getTime(), D(1960, 3, 1).getTime());
});
t('空・不正は null', () => {
  [null, undefined, '', 'あ', 0, -5].forEach(v => assert.strictEqual(Core.toDate(v), null));
});

console.log('\n[和暦略記] docs/spec.md 4.8');
t('記入例と一致 S35.3.1', () => assert.strictEqual(Core.formatWareki(D(1960, 3, 1)), 'S35.3.1'));
t('ゼロ埋めしない', () => assert.strictEqual(Core.formatWareki(D(1955, 7, 20)), 'S30.7.20'));
t('改元日の境界', () => {
  assert.strictEqual(Core.formatWareki(D(1989, 1, 7)), 'S64.1.7');
  assert.strictEqual(Core.formatWareki(D(1989, 1, 8)), 'H1.1.8');
  assert.strictEqual(Core.formatWareki(D(2019, 4, 30)), 'H31.4.30');
  assert.strictEqual(Core.formatWareki(D(2019, 5, 1)), 'R1.5.1');
  assert.strictEqual(Core.formatWareki(D(1926, 12, 24)), 'T15.12.24');
  assert.strictEqual(Core.formatWareki(D(1926, 12, 25)), 'S1.12.25');
  assert.strictEqual(Core.formatWareki(D(1912, 7, 29)), 'M45.7.29');
  assert.strictEqual(Core.formatWareki(D(1912, 7, 30)), 'T1.7.30');
});
t('元年は 1 と表記', () => assert.strictEqual(Core.formatWareki(D(2019, 12, 31)), 'R1.12.31'));
t('明治より前は null', () => assert.strictEqual(Core.formatWareki(D(1868, 9, 7)), null));

console.log('\n[年齢] docs/spec.md 4.9');
const base26 = Core.fiscalParams(2026).baseDate;
t('記入例と一致（66才）', () => assert.strictEqual(Core.calcAge(D(1960, 3, 1), base26), 66));
t('誕生日前は1歳少ない', () => assert.strictEqual(Core.calcAge(D(1955, 7, 20), base26), 70));
t('基準日が誕生日当日', () => assert.strictEqual(Core.calcAge(D(1960, 6, 1), base26), 66));
t('基準日の前日が誕生日', () => assert.strictEqual(Core.calcAge(D(1960, 6, 2), base26), 65));

console.log('\n[年度パラメータ] docs/spec.md 3.1 / 4.11');
t('R8年度', () => {
  const p = Core.fiscalParams(2026);
  assert.strictEqual(p.baseDate.toISOString().slice(0, 10), '2026-06-01');
  assert.strictEqual(p.birthLimit.toISOString().slice(0, 10), '2008-04-01');
  assert.strictEqual(p.heading, '扶養親族（6.1時点　扶養手当対象者）');
});
t('R9年度は生年月日上限がH21/4/1', () =>
  assert.strictEqual(Core.fiscalParams(2027).birthLimit.toISOString().slice(0, 10), '2009-04-01'));
t('currentFy は4月始まり', () => {
  assert.strictEqual(Core.currentFy(new Date(2026, 2, 31)), 2025);
  assert.strictEqual(Core.currentFy(new Date(2026, 3, 1)), 2026);
});

console.log('\n[身分の正規化] docs/spec.md 3.4');
t('全角/半角括弧・空白を吸収', () => {
  const k = Core.normalizeKey('パート（時間額）');
  assert.strictEqual(Core.normalizeKey('パート(時間額)'), k);
  assert.strictEqual(Core.normalizeKey(' パート （ 時間額 ） '), k);
  assert.strictEqual(Core.normalizeKey('ﾊﾟｰﾄ(時間額)'), k);
});

console.log('\n[抽出] docs/spec.md 3.2');
const XLSX = require('xlsx');
function load(path, sheet) {
  const wb = XLSX.readFile(path, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet || wb.SheetNames[0]], { defval: null, raw: true });
}
const r = Core.extract({
  roster: load('test/fixtures/roster.xlsx'),
  deps: load('test/fixtures/deps.xlsx'),
  fy: 2026, config: Config
});
const byNo = {}; r.sheets.forEach(s => byNo[s.no] = s);

t('対象は 1000 / 1001 / 1011 の3名', () =>
  assert.deepStrictEqual(r.sheets.map(s => s.no), [1000, 1001, 1011]));
t('所属CD順に並ぶ', () =>
  assert.deepStrictEqual(r.sheets.map(s => s.shozokuCd), [1000, 1000, 1300]));
t('職員番号1000は扶養2名、temp_jyun順', () =>
  assert.deepStrictEqual(byNo[1000].deps.map(d => d.name), ['志田　花子', '志田　尚子']));
t('和暦・年齢が付く', () => {
  const d = byNo[1000].deps[1];
  assert.strictEqual(d.birthWareki, 'S35.3.1');
  assert.strictEqual(d.age, 66);
});
t('生年月日上限で子(2015生)は対象外 → 1007は出ない', () => assert.ok(!byNo[1007]));
t('teate=0 は対象外 → 1013は出ない', () => assert.ok(!byNo[1013]));
t('temp_kingaku=0 は対象外 → 1014は出ない', () => assert.ok(!byNo[1014]));
t('在職=0 は対象外 → 1012は出ない', () => assert.ok(!byNo[1012]));
t('身分「パート(時間額)」は除外 → 1010は出ない', () => {
  assert.ok(!byNo[1010]);
  assert.strictEqual(r.stats.excludedByStatus, 1);
});
t('未知の身分は対象に含めて情報を出す', () => {
  assert.ok(byNo[1011]);
  assert.strictEqual(r.infos.filter(m => /会計年度任用職員/.test(m.msg)).length, 1);
});
t('年度違い(2025)は対象外', () =>
  assert.ok(!byNo[1001].deps.some(d => d.row === 11)));
t('名簿にない職員番号は警告（理由つき）', () => {
  const w = r.warnings.filter(m => /1099/.test(m.msg));
  assert.strictEqual(w.length, 1);
  assert.ok(/該当する職員番号がありません/.test(w[0].msg), w[0].msg);
});
t('身分除外の職員は理由を明示して警告', () => {
  const w = r.warnings.filter(m => /1010/.test(m.msg));
  assert.strictEqual(w.length, 1);
  assert.ok(/身分「パート\(時間額\)」が対象外/.test(w[0].msg), w[0].msg);
});
t('birthday欠損はエラー', () =>
  assert.strictEqual(r.errors.filter(m => /欠損　次郎|birthday/.test(m.msg)).length, 1));
t('同名・同生年月日の重複は警告（集約しない）', () => {
  assert.strictEqual(byNo[1001].deps.length, 2);
  assert.ok(r.warnings.some(m => /重複/.test(m.msg)));
});

console.log('\n[1ページ上限] docs/spec.md 4.10');
t('上限超過は印刷対象外にして警告', () => {
  const many = [];
  for (let i = 0; i < 10; i++) {
    many.push({ number: 1000, year: 2026, kanji: '扶養' + i, birthday: new Date(1950, 0, i + 1),
                teate: 1, temp_kingaku: 6500, temp_jyun: i });
  }
  const x = Core.extract({ roster: load('test/fixtures/roster.xlsx'), deps: many, fy: 2026, config: Config });
  assert.ok(!x.sheets.some(s => s.no === 1000));
  assert.strictEqual(x.stats.overflowStaff, 1);
});
t('上限ちょうど9名は対象', () => {
  const many = [];
  for (let i = 0; i < 9; i++) {
    many.push({ number: 1000, year: 2026, kanji: '扶養' + i, birthday: new Date(1950, 0, i + 1),
                teate: 1, temp_kingaku: 6500, temp_jyun: i });
  }
  const x = Core.extract({ roster: load('test/fixtures/roster.xlsx'), deps: many, fy: 2026, config: Config });
  assert.strictEqual(x.sheets.find(s => s.no === 1000).deps.length, 9);
});

console.log('\n' + pass + ' 件成功' + (process.exitCode ? '' : '、失敗なし'));

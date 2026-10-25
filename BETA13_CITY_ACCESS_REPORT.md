# β13 都市選択導線の公開検証

- 基準：GitHub `3201mona/before-the-stars`、公開β12 `cb0587e22329c00be94881155069f1e0068cbfab`（2026-10-25 02:00:53 UTC）。
- 開発ZIP：`BEFORE_THE_STARS_BETA13_CITY_ACCESS_DEV_20261025.zip`。変更は都市・部隊UI、読み込みキャッシュ、都市アクセス回帰検査。公開版の履歴・AI修正を照合して保持。
- 公開版名：Ver.1.0 β13 / `1.0.0-beta.13` / 2026-10-25。
- 運用方針：[BTS_DEVELOPMENT_WORKFLOW_POLICY.md](BTS_DEVELOPMENT_WORKFLOW_POLICY.md)。

## 変更

都市情報の「都市選択」から50都市を14州・地区ごとに選択し、都市名・州名で検索できます。州情報の都市一覧と部隊詳細の所在地も都市情報に接続します。継続戦闘中の部隊は既存の表示位置モデルによる戦場の都市へ接続します。マサチューセッツ本土4都市とメーン地区3都市を分けます。

地図のSVG、都市基準データ、旗配置・透明ヒット領域、戦闘・AI・政治・補給の計算、セーブ形式は変更していません。最大拡大率は150％のままです。プロビデンスの承認済みクリック形状は51×47。10軍の旗は150％で約85.3×53.3、175％でも約81.7×49.1の領域となるため、拡大のみでは重なりを解消できません。直接クリック領域の問題は残り、今回の改善は代替の選択導線です。

## 公開用ファイルで再実行した検査

- `node verification/beta13-city-access-regression.cjs`：50都市・14州地区、都市名／州名／一致なし検索、メニュー開閉、都市タブ切替、州内リンク、所在地リンク、有効／無効ID、SVG寸法・旗配置計算が成功。
- `node verification/beta9-withdrawal-map-ui-regression.cjs`：18件。
- `node verification/blockade-monthly-and-reinforcement-regression.cjs`：14件。
- `node verification/beta11-ai-tempo-regression.cjs`：52件。
- `node verification/patriot_attack_availability_incident_regression.cjs`：8件。
- `node verification/beta8-portfolio-regression.cjs`：19件。
- `node verification/forced-coastal-battle-regression.cjs`：19件。
- `node verification/blockade-combat-regression.cjs`：28件。
- `node verification/patriot-base-campaign-regression.cjs`：25件。
- `node blockade-ui-resume-regression.cjs`：5件。
- `node verification/beta9-combined-battle-state-audit.cjs`：257シナリオ、35,998検査。
- runtimeのJavaScript48ファイルとgame.htmlのインライン1件の構文検査成功。game.html内の静的ローカル参照49件に欠落なし。
- 公開β12とのSVG・都市基準データおよび既存CHANGELOGの一致を確認。

## 検証範囲と公開後の確認

上記はNode/VM検査と静的検査です。公開後の実ブラウザ確認・実配信ファイル照合は公開PRへ追記します。今回、長期AIキャンペーンや両陣営の月次完走は再実施していません。多数の旗が重なった実セーブ、継続戦闘／海上部隊の所在地リンク、小画面・タッチ端末での実操作は未確認です。開発元の途中停止した試遊を完走とは扱いません。

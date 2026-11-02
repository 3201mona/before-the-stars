# β18公開作業への追記 — 2026-11-02

今回のユーザーの公開依頼に基づき、この開発候補をβ18として公開する。基準は公開β17 `26ea25b0f2fb6ce46cbba3734e1825b0bff1b603`。版番号・公開履歴・変更した実行ファイルのキャッシュを更新し、β17以前の修正を保持。

変更点・今回の実検証と未確認範囲は `BETA18_RELEASE_REPORT.md`、`verification/beta18-release-results.json`、`CHANGELOG.md`。公開コミット・Pages・公開ブラウザ検証の最終結果は公開PRと作業報告を参照。次の開発はそのmainの実体を取得し、後続変更を古いZIPで消さない。

以下は取込元ZIPの開発履歴であり、「β18公開は行わない」「未公開」は当時の工程を示す。共同攻撃に関する最終実装は最上段の11月2日共通化節。後段の未修正調査や暫定規則を復活させない。

---

# BEFORE THE STARS β17 — 引き継ぎ

## 2026-11-02 — 共同攻撃の指揮系統を共通化・実装（β17派生・未公開、最新）

- 開発版名：`BEFORE_THE_STARS_BETA17_JOINT_COMMAND_UNIFIED_DEV_20261102`。
- 公開元：`3201mona/before-the-stars`、`main` の β17、コミット `26ea25b0f2fb6ce46cbba3734e1825b0bff1b603`。
- **状態：実装・自動回帰・両陣営AI各10か月の実戦試遊完了。未公開。** 本節より下の「調査段階・未修正」の記述は当時の記録であり、今回の修正後の状態を表さない。
- **β17既存機能を保持**。直前開発で修正した接続表示の港湾・内陸・上陸専用マーカー色も引き継ぐ。`release.json` の β17 表記・公開履歴・ゲーム音声は変更しない。GitHubへのコミット／β18公開は行わない。
- **2026-11-02 追加の画面調整**：政治フェーズの「戦略支配（勝利条件：★100）」で独立派・王党派・未確保の★3行が並ぶ**右側の空きスペース**へ「↗ 戦略地図を見る」文字リンクを移動した。`runtime/route_connection_lens_v1.js` で数値表示とリンクを同じ2カラム枠に収め、値が再描画されてもリンクが消えないよう独立セルに保持。`runtime/route_connection_lens_v1.css` で3行中央の右端に配置し、狭い幅では数値の文字サイズも調整。戦略支配の注釈文・州票・他の政治UIへの影響はなし。

### 共通ルールと変更点

| 対象 | 現行共通ルール／実装 |
|---|---|
| 攻撃開始 | 野戦軍１部隊なら通常指揮官も攻撃可能。**２部隊以上の共同攻撃は、参加する総司令官または方面軍司令官が現場の指揮官**であることを必須とする。特定の将軍名・勢力・都市による例外は設けない。 |
| 継続戦闘への援軍 | 一度に複数軍を送る場合はその援軍群の上位指揮官を必須とし、加えて**援軍参加後の攻撃軍全体**を上記ルールで検査。１軍ずつ後から普通の指揮官を積み重ねる抜け道も防止。指揮可能な上位司令官が戦場に参加した後は、通常指揮官１軍の追加援軍が可能。 |
| 守備側・移動 | 守備側の複数野戦軍による**自動参加は従来どおり**。通常の部隊移動・経路・補給・編成費用への制限追加はなし。 |
| 共通実装 | `runtime/battle_engine_v0_74_retreat.js` に `canCoordinateJointAttack` と `canJoinBattleReinforcement` を置き、`prepareBattle`／`reinforceBattle` の最終防衛線で強制。 |
| AIの戦闘候補 | 王党派・独立派の両AI本体 `runtime/royalist_ai_official_browser_v3.js` と `runtime/patriot_ai_official_browser_v2.js` の通常攻撃候補生成で同じ判定を参照。継続援軍AI `runtime/continuation_battle_ai_v1.js` は候補と最少参加軍に同じ判定を適用。 |
| 人間の操作 | `runtime/army_phase2_ui_v0_77_portraits.js` の候補・実行前プレビューと、`runtime/canonical_city_runtime_v0_74_retreat.js` の継続戦闘への援軍選択UIを共通判定に接続。 |

### ファーガソン蜂起都市についての追加調査

- イベントの南部蜂起都市は**固定ではない**。`runtime/commander_event_engine_v0_77_portraits.js` の `chooseFergusonCity` が、ノースカロライナ・サウスカロライナ・ジョージアの12都市から毎回選ぶ。
- 初期候補は「独立支持率42%以下かつ兵力が１以上の野戦軍不在」。そのうち最低支持率→政治的重要度の大きい都市→都市IDを優先。候補がなければ42%条件を外して野戦軍不在を優先、さらにゼロなら占領の有無に関係なく最小支持率へフォールバックする。**港の有無に加点・減点はない。**
- 開始時の主な数値：`SC_01` ナインティシックス40%（内陸）、`GA_02` オーガスタ41%（内陸）、`SC_02` カムデン43%（内陸）、`GA_04` サバンナ45%（港）。初期配置のままイベント条件を満たすなら `SC_01`。サバンナだけ支持率39%にする仮想試験では `GA_04` に変わる。
- 発生時は独立派の戦略支配★30以上、未発生フラグ。野戦軍1200を発生し、発生都市の独立支持率を25ポイント下げ、二重発生しない。
- **公開歴比較**：GitHubの公開β1・β2・β5・β6・β6修正版・β14・β17に相当する版で、上記南部初期数値が一致。蜂起選択関数自体も初公開版から更新履歴なし。よって「南部の初期支持率変更が公開版で内陸→港に変えた」とは確認できない。ただしプレイ進行中の支持率や駐屯軍が変われば合法的に港町が選ばれる。元のレビューのセーブや発生前ログとの照合は未実施。

### 検証結果（すべて合格）

- `node verification/joint-attack-rank-diagnostic.cjs`：独立派・王党派で計63検証。初期の通常指揮官２軍攻撃、AI候補・AI直接実行、プレイヤーUIの編成選択・不正入力、継続戦闘１軍ずつの援軍をすべて規制。合法な単独軍／上位指揮官率いる複数軍／後からの合法援軍／守備自動参加を確認。
- `node verification/ferguson-location-regression.cjs`：16検証。初期支持率順位、港への移転を生む支持率変化、同率・駐留軍・代替候補・発生★30・1200名・支持率-25・一回限り。
- `node verification/beta9-combined-battle-state-audit.cjs`：257シナリオ、39,549アサーション。古い「上位指揮官不在の複数攻撃援軍」を使っていたテスト配置は合法な上級指揮官に更新し、攻城・陸海援軍・補給断絶・二戦線・撤収を維持。
- `node verification/forced-coastal-battle-regression.cjs`：封鎖港・被害港・沿岸への強行上陸など19件。上級指揮官が合流する合法な試験配置へ更新。
- AI10か月×２試遊：`--player=BRITISH --seed=29` は攻撃９回・異常共同攻撃０・エラー０、`--player=PATRIOT --seed=11` は攻撃１回・異常共同攻撃０・エラー０。どちらも10か月完走。結果は `verification/results/*_unified_joint_command_summary.json`、実行ログは同名 `.jsonl`。過去β17で実際に発生したハウ＋クリントン＋ダンモアの無権限共同攻撃は再発していない。
- `beta11-ai-tempo`、`shared-commander-survival`、`blockade-monthly-and-reinforcement`、`blockade-combat`、`beta8-portfolio`、`patriot-base-campaign`、`patriot_attack_availability_incident`、`route-lens-color`、`route-lens-integration`、`initial-bgm-and-chief-isolation`、`beta13-city-access`、`beta14-political-reference`、`beta14-mobilization-masking`、`beta16-victory-audio`、`beta9-withdrawal-map-ui`、`approved_flag_interaction`、`approved_flag_layout` をそれぞれ再実行し合格。
- 上記のリンク位置調整後も `route-lens-integration-regression` を「★3行の右列に配置」の判定に更新して合格。`route-lens-color-regression`・`joint-attack-rank-diagnostic`・JS構文・diff整合性を再確認。
- 未実施：実ブラウザ／タブレットでの目視と長期試行による発生頻度推定。AI10か月試遊はエンジンレベルであり、UIの手動操作は回帰テストによる。

---

## 2026-11-02 — 接続表示の色固定と共同攻撃の実態調査（β17派生・未公開）

- 開発版名：`BTS_BETA17_ROUTE_MARKER_PALETTE_JOINT_COMMAND_AUDIT_DEV_20261102`。
- 状態：**色表示の修正は静的検証済み・未公開。共同攻撃の不整合は再現済み・未修正。** β18への公開反映は行っていない。
- 基準：`3201mona/before-the-stars`、公開元 `main`、コミット `26ea25b0f2fb6ce46cbba3734e1825b0bff1b603`（2026-10-31、β17）。ユーザーがβ17公開に使用した完全版ZIPを照合したうえで、**現在のGitHub公開ソースを直接の作業起点**にした。`release.json`、入口、タイトルとBGMのβ17版情報は維持。

### 修正した内容

| 対象 | 変更 | 影響ファイル |
|---|---|---|
| 接続表示の都市マーカー | 港湾の丸 `#54DBEA`、内陸の丸 `#F2EEE5`、上陸専用の三角 `#FF9F5B` を固定パレット化。凡例の色も同じトークンから参照し、内陸の凡例を追加。 | `runtime/route_connection_lens_v1.css`、`runtime/route_connection_lens_v1.js` |
| 起点・目的地・隣接表示 | 選択状態やホバーがマーカーの塗り色・不透明度・輪郭色を上書きしていたため廃止。起点・目的地は外側のリング、ホバーは発光で識別する。 | `runtime/route_connection_lens_v1.css` |
| AI共同攻撃の検証 | 本番戦闘エンジン＋両陣営AIで複数通常指揮官の初回共同攻撃、ならびに継続戦闘への別々の通常指揮官の援軍加入を再現。AI長期試遊に不正な共同攻撃を記録する監査項目を追加。 | `verification/joint-attack-rank-diagnostic.cjs`、`verification/beta10_bounded_ai_campaign.cjs` |
| 色の回帰検証 | 正規50都市・104辺・港湾22／内陸22／上陸6の分類と、色指定が地形カテゴリのみで決まることを検証。 | `verification/route-lens-color-regression.cjs` |

### 共同攻撃不具合の調査結果（ルール修正は未着手）

1. **初回攻撃の不整合**：プレイヤーUIの `eligibleAttackArmies` は通常指揮官の単独攻撃を強制するが、`BattleEngine.prepareBattle` は複数軍への総司令官・方面軍司令官の参加を検査しない。両陣営AIの `normal_operations` は通常指揮官だけの集団を `ATTACK` 候補に含め、`prepareAttack` がそのまま開始できる。リー＋パットナム、ハウ＋クリントンで双方再現。
2. **継続戦闘の別経路**：`BattleEngine.reinforceBattle` は「一度の援軍命令で同時に２軍以上」を送る場合だけ上位司令官を要求する。通常指揮官１人で開始した戦闘に、別の通常指揮官を単独援軍として追加する場合は通過する。独立派・王党派とも実際の第一戦闘ラウンドから再現。`continuation_battle_ai_v1.js` もその単独援軍を候補化する。これは同時出撃とは異なる命令だが、結果として複数通常指揮官の攻撃戦闘が成立する。
3. **実際のAIターンで確認**：10か月×２先手のエンジン試遊中、王党派先手seed29の1775年9月に `MA_04 → MA_03`、ハウ・クリントン・ダンモア（全員通常指揮官）の３軍共同攻撃を１件記録。王党派先手は攻撃６回、独立派先手seed11は攻撃１回で、後者では該当０件。いずれも10か月完走、エラー０。発生率を推定できる試行数ではない。
4. **守備と移動**：複数軍が同じ都市を自動防衛するのは攻撃編成と別処理であり、今回の不整合と混同しない。複数軍の移動についても今回はルールを変更しない。

修正方針の次回検討事項：例外的な指揮官名や都市名による禁止ではなく、軍の集合と指揮系統を引数に取る共通の攻撃編成可否ルールを戦闘エンジンに置き、人間UI・両陣営AI・継続戦闘援軍がそれを共有する。継続戦闘の単独援軍を通常指揮官だけで累積させてよいかは、同時共同攻撃の制限と区別して仕様判断を要する。

### 実施した検証

- `node verification/joint-attack-rank-diagnostic.cjs`：両陣営の初回共同攻撃・AI候補・AI実行・継続戦闘への援軍加入、23観測を再現。
- `node verification/route-lens-color-regression.cjs`：固定パレット、マーカー３種50都市、地理104辺が合格。
- `node verification/route-lens-integration-regression.cjs`：既存の都市接続、政治フェーズの閲覧導線が合格。
- `node verification/beta11-ai-tempo-regression.cjs`：52検証合格。
- `node verification/shared-commander-survival-regression.cjs`：両陣営共通リスク28条件合格。
- `node verification/beta9-combined-battle-state-audit.cjs`：257シナリオ、35,998アサーション合格。
- `node verification/beta14-political-reference-regression.cjs`、`node verification/beta14-mobilization-masking-regression.cjs`、`node verification/beta16-victory-audio-regression.cjs`：合格。
- `node verification/beta10_bounded_ai_campaign.cjs --player=BRITISH --seed=29 --months=10 --tag=joint_rank_probe` と独立派先手seed11版：各10か月完走、エラー０、監査結果は `verification/results/*_joint_rank_probe_summary.json` に記録。
- **未実施**：今回の改色後の実ブラウザ目視・タブレット実機確認。AIの一般的な不具合発生頻度の統計的推定。ゲームルール修正の実装。

維持した仕様：β17の戦闘エンジン・両陣営AI・政治・音声・軍旗・正式地図50都市104辺・海路判定・保存形式。公開反映は行っていない。今回の色修正は公開候補だが、共同攻撃不整合は未修正の既知課題として別途設計・実装・検証が必要。

---

## 2026-10-31 — β17公開時の記録（原文）

- 2026-10-31、日本時間。公開依頼された最新ZIPのみ採用。
- リポジトリ：3201mona/before-the-stars、公開元：main。
- 基準公開β16：ed51c49f0dd430bbaabf0d56cb2accb8fdac2fc0。
- 取込元：BTS_ROUTE_LENS_BGM_SHARED_HQ_RISK_DEV_20261031_FULL(1).zip。
- 版：Ver.1.0 β17 / 1.0.0-beta.17。

変更点・実検証・未確認範囲はBETA17_RELEASE_REPORT.md、verification/beta17-release-results.json、CHANGELOG.mdを参照。添付の古いPUBLIC_SOURCE_MANIFEST.jsonはβ16の証拠資料のため、β17のマニフェストとして転用していない。ゲーム本体はruntime/game.html、入口はindex.html。

接続表示／政治中の地図閲覧、初回BGMの無音修正、両陣営共通の総司令官生存評価を採用。前段階の固定護衛数・単独攻撃禁止・陸退路必須の旧試作を復活させない。地図・画像・承認音源を維持。

公開コミット、Pages結果、公開ブラウザ検証の最終値は今回公開PRおよび作業報告を参照。次の開発はmainの実体から開始し、今回ZIPに戻って後続変更を消さない。

運用：BTS_DEVELOPMENT_WORKFLOW_POLICY.md。Git書込認証なしを確認済みで、同じpush失敗を反復しない。実ファイルのGitHubアップロードで差分を送り、リモートの全差分を照合してから統合する。巨大なソースの全文／Base64をツール引数へ渡さない。分割ZIPは作成しない。

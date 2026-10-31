# BEFORE THE STARS β17 — 引き継ぎ

- 2026-10-31、日本時間。公開依頼された最新ZIPのみ採用。
- リポジトリ：3201mona/before-the-stars、公開元：main。
- 基準公開β16：ed51c49f0dd430bbaabf0d56cb2accb8fdac2fc0。
- 取込元：BTS_ROUTE_LENS_BGM_SHARED_HQ_RISK_DEV_20261031_FULL(1).zip。
- 版：Ver.1.0 β17 / 1.0.0-beta.17。

変更点・実検証・未確認範囲はBETA17_RELEASE_REPORT.md、verification/beta17-release-results.json、CHANGELOG.mdを参照。添付の古いPUBLIC_SOURCE_MANIFEST.jsonはβ16の証拠資料のため、β17のマニフェストとして転用していない。ゲーム本体はruntime/game.html、入口はindex.html。

接続表示／政治中の地図閲覧、初回BGMの無音修正、両陣営共通の総司令官生存評価を採用。前段階の固定護衛数・単独攻撃禁止・陸退路必須の旧試作を復活させない。地図・画像・承認音源を維持。

公開コミット、Pages結果、公開ブラウザ検証の最終値は今回公開PRおよび作業報告を参照。次の開発はmainの実体から開始し、今回ZIPに戻って後続変更を消さない。

運用：BTS_DEVELOPMENT_WORKFLOW_POLICY.md。Git書込認証なしを確認済みで、同じpush失敗を反復しない。実ファイルのGitHubアップロードで差分を送り、リモートの全差分を照合してから統合する。巨大なソースの全文／Base64をツール引数へ渡さない。分割ZIPは作成しない。

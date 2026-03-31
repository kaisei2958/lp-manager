# LP工数管理アプリ

Next.js + Supabase + Vercel で動く LP 案件管理システムです。

---

## セットアップ手順

### 1. Supabase プロジェクトを作成

1. [https://supabase.com](https://supabase.com) にアクセスしてアカウント登録
2. 「New Project」でプロジェクトを作成
3. Dashboard の **SQL Editor** を開き、`supabase/schema.sql` の内容を貼り付けて実行
4. **Project Settings > API** から以下の2つをコピーしておく
   - `Project URL`（例: `https://xxxxxxxxxx.supabase.co`）
   - `anon public` key

---

### 2. GitHub にリポジトリを作成

```bash
# このフォルダをターミナルで開いて実行
git init
git add .
git commit -m "initial commit"

# GitHub で新しいリポジトリを作成し、以下を実行
git remote add origin https://github.com/あなたのユーザー名/lp-manager.git
git push -u origin main
```

---

### 3. Backlog 連携を設定（任意）

Backlog の課題と双方向でステータスを同期できます。

1. Backlog にログインし、**個人設定 > API > 新しいAPIキーを発行** でAPIキーを取得
2. スペースキーは `https://{スペースキー}.backlog.com` の `{スペースキー}` 部分
3. 環境変数に以下を設定：
   - `BACKLOG_SPACE_KEY` … スペースキー（例: `yourcompany`）
   - `BACKLOG_API_KEY` … 発行したAPIキー

設定後、各LP案件の編集画面で「Backlog 課題キー」（例: `LP-123`）を入力すると、詳細パネルから以下が可能になります：
- Backlogの課題情報（ステータス・担当者・期日など）をリアルタイム確認
- Backlogのステータスをアプリに同期（← Backlogから同期）
- アプリのステータスをBacklogに反映（→ Backlogに反映）

---

### 4. Slack 連携を設定（任意）

LPに紐づく Slack チャンネルの最新メッセージをアプリ内で確認できます。

**Slack アプリの作成手順：**

1. [https://api.slack.com/apps](https://api.slack.com/apps) で「Create New App」→「From scratch」
2. アプリ名を入力し、ワークスペースを選択
3. 左メニュー **OAuth & Permissions** > **Bot Token Scopes** に以下のスコープを追加：
   - `channels:history`（パブリックチャンネルのメッセージ取得）
   - `channels:read`（チャンネル一覧の取得）
   - `groups:history`（プライベートチャンネルのメッセージ取得）
   - `users:read`（ユーザー名の解決）
4. ページ上部の「Install to Workspace」でインストール
5. 発行された **Bot User OAuth Token**（`xoxb-...`）をコピー
6. アプリを使いたいチャンネルに `/invite @アプリ名` で招待する
7. 環境変数 `SLACK_BOT_TOKEN` にトークンを設定

設定後、LP編集画面で「Slackチャンネル」欄にチャンネル名（例: `lp-s318`）またはチャンネルID（例: `C12345678`）を入力すると、詳細パネルに最新20件のメッセージが表示されます。

---

### 5. Supabase にカラムを追加（Backlog/Slack連携を使う場合）

Backlog・Slack連携を使う場合は、`supabase/migration_add_integrations.sql` をSupabaseのSQL Editorで実行してください：

```sql
alter table lp_cases
  add column if not exists backlog_issue_key text not null default '',
  add column if not exists slack_channel     text not null default '';
```

すでに `supabase/schema.sql` から初期セットアップをした場合のみ必要です（schema.sql にはすでにこれらのカラムが含まれています）。

---

### 6. Vercel にデプロイ

1. [https://vercel.com](https://vercel.com) にアクセスしてGitHubアカウントでログイン
2. 「New Project」→ 先ほど作ったGitHubリポジトリを選択
3. **Environment Variables** に以下を追加：

| Name | Value | 必須 |
|------|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseのProject URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseのanon key | ✅ |
| `BACKLOG_SPACE_KEY` | Backlogスペースキー | 任意 |
| `BACKLOG_API_KEY` | Backlog APIキー | 任意 |
| `SLACK_BOT_TOKEN` | Slack Bot Token（xoxb-...） | 任意 |

4. 「Deploy」ボタンを押すと数分でURLが発行されます ✅

---

### ローカルで動かす場合

```bash
# 依存関係をインストール
npm install

# 環境変数ファイルを作成
cp .env.local.example .env.local
# .env.local を開いて各環境変数を入力（Supabase必須、Backlog/Slack任意）

# 開発サーバーを起動
npm run dev
# → http://localhost:3000 でアクセス
```

---

## 技術スタック

| 役割 | 技術 |
|------|------|
| フロントエンド | Next.js 14 (App Router) + TypeScript |
| データベース | Supabase (PostgreSQL) |
| ホスティング | Vercel |
| スタイル | CSS (グローバル) |
| 外部連携 | Backlog REST API / Slack Web API |

---

## 管理できる情報

- チャンネルID / 案件名 / ステータス
- フロント / ディレクター / デザイン / エンジニア
- 納期 / 配信日
- 目標工数 / 各ロール工数（Dir / Design / Eng）
- 各原価（Dir / Design / Eng / 社内）
- 広告共有状況（URL / GTM / 素材）
- メモ
- Backlog 課題キー（連携用）
- Slack チャンネル名/ID（連携用）

---

## 今後の拡張（オプション）

認証を追加したい場合は Supabase Auth を使って：

```ts
// lib/supabase.ts に追加
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
```

と、`supabase/schema.sql` の RLS ポリシーをユーザーベースに変更すれば実装できます。

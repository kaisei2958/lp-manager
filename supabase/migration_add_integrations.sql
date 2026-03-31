-- =============================================
-- マイグレーション: Backlog / Slack 連携カラム追加
-- Supabase Dashboard > SQL Editor で実行してください
-- =============================================

alter table lp_cases
  add column if not exists backlog_issue_key text not null default '',
  add column if not exists slack_channel     text not null default '';

comment on column lp_cases.backlog_issue_key is 'Backlogの課題キー (例: LP-123)';
comment on column lp_cases.slack_channel     is 'SlackのチャンネルID または名前 (例: C12345678 または lp-s318)';

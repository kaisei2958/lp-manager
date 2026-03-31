-- =============================================
-- LP工数管理 - Supabase スキーマ
-- Supabase Dashboard > SQL Editor で実行してください
-- =============================================

create table if not exists lp_cases (
  id              uuid          default gen_random_uuid() primary key,
  channel         text          not null default '',
  name            text          not null,
  status          text          not null default '進行中'
                    check (status in ('進行中','コーディング','先方チェック','配信待ち','納品','保留','失注')),
  front           text          not null default '',
  director        text          not null default '',
  designer        text          not null default '',
  engineer        text          not null default '',
  deadline        date,
  delivery_date   date,
  target_hours    numeric,
  dir_hours       numeric       not null default 0,
  des_hours       numeric       not null default 0,
  eng_hours       numeric       not null default 0,
  dir_cost        numeric       not null default 0,
  des_cost        numeric       not null default 0,
  eng_cost        numeric       not null default 0,
  int_cost        numeric       not null default 0,
  ad_url          boolean       not null default false,
  ad_gtm          boolean       not null default false,
  ad_mat          boolean       not null default false,
  memo            text          not null default '',
  created_at      timestamptz   not null default now()
);

-- インデックス（検索・ソートの高速化）
create index if not exists lp_cases_status_idx     on lp_cases (status);
create index if not exists lp_cases_deadline_idx   on lp_cases (deadline);
create index if not exists lp_cases_front_idx      on lp_cases (front);
create index if not exists lp_cases_created_at_idx on lp_cases (created_at desc);

-- RLS (Row Level Security) - 今は全員アクセス可にしています
-- 認証を追加する場合はポリシーを変更してください
alter table lp_cases enable row level security;

create policy "allow all" on lp_cases
  for all using (true) with check (true);

-- =============================================
-- サンプルデータ（動作確認用 / 不要なら削除してください）
-- =============================================
insert into lp_cases (channel, name, status, front, director, designer, engineer, deadline, target_hours) values
  ('s318', '第一ホーム_モデルハウスlp',     '配信待ち',   '大谷',  '横橋 / 畑原', '宮路',  '丸山',   '2026-03-25', 90),
  ('s321', '三谷不動産_自社紹介lp',          '先方チェック', '大谷',  '今岡',     '今岡',  '丸山',   '2026-03-31', 90),
  ('s312', '飯島建設_モデルハウスlp',        '配信待ち',   '船田',  '横橋 / 田中', '佐野',  '丸山',   '2026-03-12', 90),
  ('s309', 'オネストアーク_リノリッチlp',   '配信待ち',   '山形',  '横橋 / 畑原', '古俣',  'Jeon',  '2026-01-30', 20),
  ('s313', 'クリエイト礼文_モデルハウスLP', '失注',       '飯田',  '横橋',      '古俣',  '大美浪', '2025-03-31', 130);

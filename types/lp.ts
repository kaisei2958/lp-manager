export type LPStatus =
  | '進行中'
  | 'コーディング'
  | '先方チェック'
  | '配信待ち'
  | '納品'
  | '保留'
  | '失注'

export interface LP {
  id: string
  channel: string
  name: string
  status: LPStatus
  front: string
  director: string
  designer: string
  engineer: string
  deadline: string | null
  delivery_date: string | null
  target_hours: number | null
  dir_hours: number
  des_hours: number
  eng_hours: number
  dir_cost: number
  des_cost: number
  eng_cost: number
  int_cost: number
  ad_url: boolean
  ad_gtm: boolean
  ad_mat: boolean
  memo: string
  backlog_issue_key: string
  slack_channel: string
  created_at: string
}

export type LPInsert = Omit<LP, 'id' | 'created_at'>

export const STATUS_LIST: LPStatus[] = [
  '進行中', 'コーディング', '先方チェック', '配信待ち', '納品', '保留', '失注',
]

export function totalHours(lp: LP): number {
  return (lp.dir_hours || 0) + (lp.des_hours || 0) + (lp.eng_hours || 0)
}

export function totalCost(lp: LP): number {
  return (lp.dir_cost || 0) + (lp.des_cost || 0) + (lp.eng_cost || 0) + (lp.int_cost || 0)
}

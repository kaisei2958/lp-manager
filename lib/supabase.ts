import { createClient } from '@supabase/supabase-js'
import { LP } from '@/types/lp'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ===== CRUD =====

export async function fetchLPs(): Promise<LP[]> {
  const { data, error } = await supabase
    .from('lp_cases')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as LP[]
}

export async function insertLP(lp: Omit<LP, 'id' | 'created_at'>): Promise<LP> {
  const { data, error } = await supabase
    .from('lp_cases')
    .insert([lp])
    .select()
    .single()
  if (error) throw error
  return data as LP
}

export async function updateLP(id: string, lp: Partial<Omit<LP, 'id' | 'created_at'>>): Promise<LP> {
  const { data, error } = await supabase
    .from('lp_cases')
    .update(lp)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as LP
}

export async function deleteLP(id: string): Promise<void> {
  const { error } = await supabase
    .from('lp_cases')
    .delete()
    .eq('id', id)
  if (error) throw error
}

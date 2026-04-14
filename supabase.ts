import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://umblarikptpbjqliixqc.supabase.co'
const supabaseAnonKey = 'sb_publishable_isqIQs13RrNT7ElbhlbDNw_lYNHezGE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

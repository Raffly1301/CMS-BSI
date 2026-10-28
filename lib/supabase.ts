
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bkbeijzetyvdqvscnbwy.supabase.co';
const supabaseAnonKey = 'sb_publishable_ynrmxgHEBcKK2Qvbhv3jiw_vWpVMDfp';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
//developer bounty
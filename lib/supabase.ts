
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gyjzhngedpwgzrzuimzv.supabase.co';
const supabaseAnonKey = 'sb_publishable_FrhqAj1JEzE3rC05A_SH0Q_wdmFjijZ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
//developer bounty
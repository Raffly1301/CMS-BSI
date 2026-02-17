
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gylfxmoiojrzoeqnzpue.supabase.co';
const supabaseAnonKey = 'sb_publishable_0wWpYVTT70nqKmzf5jMU9g_-Kj3PRbl';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

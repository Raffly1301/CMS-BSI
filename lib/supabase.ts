
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iykzgjngkyguwozqkbsr.supabase.co';
const supabaseAnonKey = 'sb_publishable_0gPBBPCS8l1R_hfKG8aKGA_ssDUSIgn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
//rafflypasya01
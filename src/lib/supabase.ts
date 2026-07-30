import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xaddryqbbfgzjbhwrxyl.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_byyZ2PONm5rHXI7qMHYHhQ_ycGIPPAR';

// Publishable key only — safe for client-side use.
// Never put service role key in frontend code.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export const WAM_BUCKET = 'wam-plugins';
export const WAM_STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/${WAM_BUCKET}`;

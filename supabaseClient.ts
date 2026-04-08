import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isBrowser = typeof window !== 'undefined';
const isOnline = () => (isBrowser ? window.navigator.onLine : true);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase Environment Variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: isOnline(),
    detectSessionInUrl: true,
  },
});

if (isBrowser) {
  const syncAutoRefreshWithNetwork = () => {
    try {
      if (window.navigator.onLine) {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    } catch {
      // ignore auth auto-refresh toggle errors
    }
  };

  window.addEventListener('online', syncAutoRefreshWithNetwork);
  window.addEventListener('offline', syncAutoRefreshWithNetwork);
  syncAutoRefreshWithNetwork();
}

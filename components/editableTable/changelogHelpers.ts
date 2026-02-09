import type { SupabaseClient } from '@supabase/supabase-js';

export const insertChangelog = async (
  supabase: SupabaseClient,
  moduleId: string | undefined,
  recordId: string | undefined,
  block: any,
  oldValue: any,
  newValue: any
) => {
  if (!moduleId || !recordId) return;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    await supabase.from('changelogs').insert([
      {
        module_id: moduleId,
        record_id: recordId,
        action: 'update',
        field_name: block?.id || null,
        field_label: block?.titles?.fa || null,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
        user_id: userId,
      },
    ]);
  } catch (err) {
    console.warn('Changelog insert failed:', err);
  }
};

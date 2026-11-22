// Check the deployed API using the same public credentials as the frontend.
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) throw new Error('Missing Supabase configuration');
const headers = { apikey: VITE_SUPABASE_ANON_KEY };
if (VITE_SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + VITE_SUPABASE_ANON_KEY;
const api = VITE_SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/';

async function checkSchema() {
  for (const query of [
    'production_orders?select=production_revision,production_on_hold,production_returned_at&limit=0',
    'stock_transfers?select=production_event_index,notes,stage_task_id,source_task_id,destination_task_id,sender_id,receiver_id,delivered_at,receipt_line_id,receipt_phase&limit=0',
  ]) {
    const response = await fetch(api + query, { headers, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Cannot verify production columns on ' + query.split('?')[0] + ' (HTTP ' + response.status + ')');
  }
  // An empty command has no operation or order. The RPC must reject anonymous callers.
  const response = await fetch(api + 'rpc/commit_production_operation', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: {} }), signal: AbortSignal.timeout(10000),
  });
  const error = await response.json();
  if (![401, 403].includes(response.status) || error?.code !== '42501') {
    throw new Error('Cannot verify the restricted production RPC (HTTP ' + response.status + ')');
  }
  for (const [name, body] of [
    ['save_production_receipt_drafts', { documents: [] }],
    ['production_receipt_action', { command: {} }],
    ['list_production_receipts', { order_ids: [] }],
    ['production_return_history', { order_id: null }],
    ['confirm_legacy_production_receipt', { task_id: null, form_id: '', confirmation_side: '' }],
  ]) {
    const result = await fetch(api + 'rpc/' + name, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    const failure = await result.json();
    if (![401, 403].includes(result.status) || failure?.code !== '42501') {
      throw new Error('Cannot verify restricted receipt RPC ' + name + ' (HTTP ' + result.status + ')');
    }
  }
}

for (let attempt = 1; ; attempt++) {
  try {
    await checkSchema();
    console.log('Production database schema verified.');
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

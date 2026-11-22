export let actor = 'sender';
export const setActor = (value: string) => { actor = value; };
export async function api(path: string, args: object = {}) {
  return fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, actor }) }).then(r=>r.json());
}
export const supabase = {
  rpc: (name: string, args: object) => api('rpc', { name, args }),
  from: (_table: string) => ({ select: (_fields: string) => ({ in: (_field: string, _ids: string[]) => api('products') }) }),
};

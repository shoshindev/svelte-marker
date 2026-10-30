// A SvelteKit API route: each export answers one kind of HTTP request.
import { json } from '@sveltejs/kit';

export function GET({ url }) {
  return json({ path: url.pathname });
}

export async function POST({ request }) {
  return json(await request.json());
}

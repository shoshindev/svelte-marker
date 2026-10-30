// A SvelteKit server route. `load`, `actions` and `prerender` are special here
// because of this file's name. In a plain .js file they'd stay unmarked.
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db.js';

export async function load({ params, url }) {
  const item = await db.find(params.id);

  if (!item) error(404, 'Not found');
  if (url.searchParams.has('old')) redirect(307, '/new');

  return { item };
}

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();

    if (!data.get('name')) return fail(400, { missing: true });
    cookies.set('seen', 'yes', { path: '/' });
  },
};

export const prerender = false;
export const notSpecial = 'stays unmarked';

// SvelteKit calls these hooks on the server. `first` isn't exported, so it isn't
// a hook, and its values stay unmarked.
import { sequence } from '@sveltejs/kit/hooks';

const first = async ({ event, resolve }) => resolve(event);

export const handle = sequence(first);

export function handleError({ error }) {
  console.log(error);
  return { message: 'Something went wrong' };
}

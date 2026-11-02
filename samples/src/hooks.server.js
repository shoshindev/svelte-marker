// SvelteKit calls these hooks on the server. `first` isn't exported, but
// `sequence` hands it to SvelteKit as part of `handle`, so its values are marked
// too. Only this file calls `log`, so its values stay unmarked.
import { sequence } from '@sveltejs/kit/hooks';

const first = async ({ event, resolve }) => resolve(event);

function log({ event }) { console.log(event); }

export const handle = sequence(first);

export function handleError({ error, event }) {
  log({ event });
  return { message: 'Something went wrong' };
}

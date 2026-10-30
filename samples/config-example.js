// Shows a config file. It has a different name from svelte.config.js so that
// the Svelte extension doesn't try to load it.
import adapter from '@sveltejs/adapter-auto';
import { sveltePreprocess } from 'plain-package';

export default { kit: { adapter: adapter() }, preprocess: sveltePreprocess() };

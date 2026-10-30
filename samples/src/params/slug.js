// A SvelteKit route matcher: it decides which values a [slug] route accepts.
export function match(value) {
  return /^[a-z-]+$/.test(value);
}

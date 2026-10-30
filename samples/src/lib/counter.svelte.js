// Runes also work outside components, in .svelte.js and .svelte.ts files.
export function createCounter() {
  let count = $state(0);
  const double = $derived(count * 2);

  return {
    get count() {
      return count;
    },
    get double() {
      return double;
    },
    increment: () => count++,
  };
}

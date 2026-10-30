<!--
  Test file for Svelte Marker. It uses every modern Svelte feature, so you can
  check the orange marks by eye. test/findMarks.test.ts checks them too.

  Nothing between the "unmarked" comments near the end should be marked.
  This isn't a real SvelteKit app, so the imports don't resolve to anything.

  VS Code shows one yellow warning on <svelte:options>. That's expected: $host()
  only works in a custom element, and the project isn't set up to build one.
-->
<svelte:options customElement="marker-demo" />

<script module>
  // Re-exports count as imports too.
  export { PUBLIC_SITE } from '$app/env/public';
</script>

<script>
  // SvelteKit imports: current names
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { browser } from '$app/env';
  import { SECRET_KEY } from '$app/env/private';
  import { formatDate } from '#lib/format.js';
  import { error } from '@sveltejs/kit';

  // SvelteKit imports: older names you'll still meet
  import { PUBLIC_API } from '$env/static/public';
  import { API_KEY } from '$env/dynamic/private';
  import Card from '$lib/Card.svelte';
  import { files } from '$service-worker';

  // Dynamic imports
  const loadForms = () => import('$app/forms');
  const loadTypes = () => import('./$types');

  // Imports from Svelte itself
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  // Your own files stay unmarked. Names from $lib, #lib and $env stay unmarked
  // too, because those are your code. Only the paths above get a mark.
  import './local.css';

  // Runes
  let { title = 'Demo', score = $bindable(0), items = [] } = $props();
  const uid = $props.id();
  const host = $host();

  let count = $state(0);
  let name = $state('Ada');
  let user = $state.raw({ name: 'Ada' });
  let double = $derived(count * 2);
  let total = $derived.by(() => items.reduce((sum, item) => sum + item.size, 0));

  $effect(() => {
    console.log(count);
  });
  $effect.pre(() => {
    console.log(double);
  });
  const stop = $effect.root(() => {
    return () => {};
  });

  const isTracking = () => $effect.tracking();
  const pendingWork = () => $effect.pending();
  const snapshot = () => $state.snapshot(user);

  $inspect(count).with(console.log);

  function traced() {
    $inspect.trace('traced');
    return count;
  }

  // These stay unmarked: this comment says $state(1), and so does the string
  const words = '$state(1) in a string';
  const object = { $state() {} };
  object.$state();

  // Names imported from Svelte and SvelteKit are marked wherever they're used
  const leave = () => goto('/next');
  onMount(() => {
    if (browser) console.log(page.url.href);
  });

  // Here `error` is a local variable, not SvelteKit's error(), so it stays unmarked
  function report(error) {
    console.log(error.message);
  }

  // Helpers for the markup below
  let scrollY = $state(0);
  let tag = $state('h2');
  let input = $state();
  const promise = Promise.resolve(42);
  const logEvent = (event) => console.log(event);

  function tooltip(element, text) {
    element.title = text;
  }

  function attachment(element) {
    element.dataset.ready = 'yes';
    return () => delete element.dataset.ready;
  }
</script>

<!-- Special elements -->
<svelte:head>
  <title>{title}</title>
</svelte:head>

<svelte:window bind:scrollY onkeydown={logEvent} />
<svelte:document onvisibilitychange={logEvent} />
<svelte:body onmouseenter={logEvent} />

<svelte:boundary onerror={logEvent}>
  {#snippet failed(problem, reset)}
    <button onclick={reset}>Try again: {problem.message}</button>
  {/snippet}
  <p>Protected content</p>
</svelte:boundary>

<svelte:element this={tag}>Dynamic tag</svelte:element>

<!-- Template blocks and tags -->
<section>
  {#if count > 10}
    <p>Big</p>
  {:else if count > 5}
    <p>Medium</p>
  {:else}
    <p>Small</p>
  {/if}

  {#each items as item, index (item.id)}
    {const area = item.width * item.height}
    {let note = $state(item.name)}
    {@const label = `${index}: ${item.name}`}
    <p>{label} {area} {note}</p>
  {:else}
    <p>Nothing here</p>
  {/each}

  {#await promise}
    <p>Loading</p>
  {:then value}
    <p>{value}</p>
  {:catch failure}
    <p>{failure.message}</p>
  {/await}

  {#await promise then value}
    <p>{value}</p>
  {/await}

  {#await promise catch failure}
    <p>{failure.message}</p>
  {/await}

  {#key count}
    <p>Rebuilt whenever count changes</p>
  {/key}

  {#snippet row(label, size)}
    <p>{label}: {size}</p>
  {/snippet}

  {@render row('Total', total)}
  {@html '<strong>Trusted HTML</strong>'}
  {@debug count, user}

  <div {@attach attachment}>Attachment</div>

  <!-- A rune can also appear in the markup -->
  <a href="/" aria-current={$state.eager(page.url.pathname) === '/' ? 'page' : null}>Home</a>

  <!-- SvelteKit link options -->
  <a href="/about" data-sveltekit-preload-data="hover" data-sveltekit-reload onclick={leave}>About</a>
</section>

<!-- Directives -->
<section>
  <input bind:value={name} bind:this={input} />
  <p class:active={count > 0} class:double style:color="tomato" style:--size="2px">Class and style</p>
  <p use:tooltip={'Hello'}>Action</p>
  <p transition:fade>Transition</p>
  <p transition:fade|global>Transition with a modifier</p>
  <p in:fly={{ y: 8 }} out:fade>Separate in and out</p>

  <ul>
    {#each items as item (item.id)}
      <li animate:flip>{item.name}</li>
    {/each}
  </ul>
</section>

<!-- unmarked:start -->
<section class="plain" id="plain" data-note="bind:value">
  <!-- In a comment: {#if nothing} bind:value $state(1) <svelte:head> -->
  <button onclick={() => count++} title="$state(1)">Plain onclick</button>
  <a href="/docs" target="_blank">Plain link</a>
  <p>Text like bind:value, in: and out: is only text. {count} {uid} {$page}</p>
  <Card title="A component" />
</section>
<!-- unmarked:end -->

<style>
  /* Nothing in CSS gets marked, not even :global */
  :global(body) {
    margin: 0;
  }

  .plain {
    color: inherit;
  }
</style>

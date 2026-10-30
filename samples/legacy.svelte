<!--
  Legacy syntax. Svelte 5 still accepts it, but new code should use the modern
  forms. It has its own file because Svelte doesn't allow mixing it with the
  modern syntax in test.svelte.
-->
<script>
  import Child from './Child.svelte';

  export let depth = 0;

  $: doubled = depth * 2;

  const everything = $$props;
  const others = $$restProps;
  const hasFooter = $$slots.footer;

  function go() {
    depth += 1;
  }
</script>

<button on:click|once={go} on:keydown>Old event directive</button>

<Child let:item>{item}</Child>

<Child>
  <svelte:fragment slot="row">Goes into a named slot</svelte:fragment>
  <p slot="footer">{doubled} {everything} {others} {hasFooter}</p>
</Child>

<slot name="header" {depth} />

<svelte:component this={Child} />

{#if depth > 0}
  <svelte:self depth={depth - 1} />
{/if}

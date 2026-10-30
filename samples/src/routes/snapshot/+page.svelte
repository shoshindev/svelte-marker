<!-- `snapshot` is special here because of this file's name. -->
<script>
  let comment = $state('');

  export const snapshot = {
    capture: () => comment,
    restore: (value) => (comment = value),
  };
</script>

<textarea bind:value={comment}></textarea>

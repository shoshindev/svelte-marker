# Svelte grammar scopes

Every TextMate scope ending in `.svelte` in the official Svelte for VS Code extension, version 110.3.2.

A scope is the label a grammar puts on each piece of text. Themes use these labels to choose colors. You can see them in VS Code with the **Developer: Inspect Editor Tokens and Scopes** command.

Source: [`packages/svelte-vscode/syntaxes`](https://github.com/sveltejs/language-tools/tree/master/packages/svelte-vscode/syntaxes) in `sveltejs/language-tools`. The main grammar is `svelte.tmLanguage.json`, generated from `svelte.tmLanguage.src.yaml`.

Total: 63 (56 fixed and 6 dynamic in the main grammar, 1 more in the side grammars).

## Why the extension doesn't use these

This list is for reference only. Svelte Marker finds its marks with Svelte's parser instead, for two reasons:

- **Extensions can't read scopes.** VS Code has no stable API for it.
- **They wouldn't separate Svelte from HTML anyway.**
  - `entity.other.attribute-name.svelte` covers every attribute, including plain `onclick`, as well as `class:`.
  - `entity.name.tag.svelte` covers `<div>` as well as `<svelte:head>`.
  - A rune has no scope of its own. Only its `$` is labelled, with `punctuation.definition.variable.svelte`, and `$myStore` gets the same label.
  - `{let}` and `{const}` declaration tags have no scope: the grammar reads them as plain expressions.

## Main grammar: fixed scopes

### comment

- `comment.block.documentation.svelte`
- `comment.block.svelte`
- `comment.line.double-slash.svelte`

### constant

- `constant.numeric.decimal.svelte`

### entity

- `entity.name.tag.svelte`
- `entity.name.type.svelte`
- `entity.other.attribute-name.class.svelte`
- `entity.other.attribute-name.svelte`

### invalid

- `invalid.illegal.characters-not-allowed-here.svelte`

### keyword

- `keyword.control.as.svelte`
- `keyword.control.conditional.svelte`
- `keyword.control.flow.svelte`
- `keyword.control.svelte`
- `keyword.declaration.class.component.svelte`
- `keyword.other.animation.svelte`
- `keyword.other.debugger.svelte`
- `keyword.other.svelte`

### meta

- `meta.brace.round.svelte`
- `meta.embedded.block.svelte`
- `meta.embedded.expression.svelte`
- `meta.script.svelte`
- `meta.special.end.svelte`
- `meta.special.start.svelte`
- `meta.style.svelte`
- `meta.tag.custom.svelte`
- `meta.tag.end.svelte`
- `meta.tag.start.svelte`
- `meta.tag.void.svelte`
- `meta.template.svelte`
- `meta.type.annotation.svelte`

### punctuation

- `punctuation.definition.block.begin.svelte`
- `punctuation.definition.block.end.svelte`
- `punctuation.definition.comment.svelte`
- `punctuation.definition.keyword.svelte`
- `punctuation.definition.string.begin.svelte`
- `punctuation.definition.string.end.svelte`
- `punctuation.definition.tag.begin.svelte`
- `punctuation.definition.tag.end.svelte`
- `punctuation.definition.variable.svelte`
- `punctuation.section.embedded.begin.svelte`
- `punctuation.section.embedded.end.svelte`
- `punctuation.separator.key-value.svelte`
- `punctuation.separator.svelte`

### source

- `source.svelte`

### storage

- `storage.type.class.component.svelte`
- `storage.type.svelte`

### string

- `string.quoted.svelte`
- `string.unquoted.svelte`

### support

- `support.class.component.svelte`
- `support.function.svelte`
- `support.type.property-name.svelte`

### text

- `text.svelte`

### variable

- `variable.function.svelte`
- `variable.language.svelte`
- `variable.other.constant.svelte`
- `variable.parameter.svelte`

## Main grammar: dynamic scopes

These contain a placeholder that the grammar fills with text from the file, so one rule produces many real scopes. `meta.directive.$1.svelte` becomes `meta.directive.bind.svelte`, for example.

| Scope | Placeholder becomes |
|---|---|
| `meta.$1.svelte` | `script`, `style` or `template` |
| `meta.attribute.$1.svelte` | the attribute name, such as `class` |
| `meta.directive.$1.svelte` | the directive, such as `bind` |
| `meta.lang.$3.svelte` | the language, such as `ts` |
| `meta.scope.tag.$2.svelte` | the tag name, such as `div` |
| `meta.special.$3.svelte` | the block or tag keyword, such as `if` |

## Side grammars

The other grammar files handle Pug templates, Svelte code blocks in Markdown, and PostCSS. They reuse scopes from the main grammar and add these:

| Scope | File |
|---|---|
| `meta.tag.svelte` | `pug-svelte.json` |

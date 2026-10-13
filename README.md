# sticky-prompt-line

Tiny Pi extension that shows one dim sticky line when you scroll up in the fullscreen transcript.

It shows the nearest user prompt above the current transcript top. The line stays to one row, truncates overflow with `...`, and jumps to that prompt when clicked.

## Use

From this checkout:

```sh
pi --extension /home/acoote/sticky-prompt-line
```

Or add the package path to your Pi extensions config.

## Check

```sh
npm run check
```

## Notes

Pi does not currently expose transcript scroll state through the public extension API. This first pass uses Pi fullscreen TUI runtime getters for scroll state and its existing prompt navigation method for click-to-jump.

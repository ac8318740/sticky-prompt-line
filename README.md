# sticky-prompt-line

Tiny Pi extension that shows one dim sticky line when you scroll up in the fullscreen transcript.

It shows the nearest user prompt above the current transcript top. The line stays to one row, truncates overflow with `...`, and jumps to that prompt when clicked.

## Install

Install the published package:

```sh
pi install npm:sticky-prompt-line
```

Restart Pi or run `/reload` in an existing session to load the extension.

To try it for one invocation without adding it to your settings:

```sh
pi -e npm:sticky-prompt-line
```

## Local development

From this checkout:

```sh
pi --extension ./index.js
```

## Check

```sh
npm run check
```

## Notes

Pi does not expose role-tagged transcript positions through the public extension API. This extension reads the fullscreen scroll view and Pi's cached rendered child heights, identifies user-message components, and jumps directly to the measured row. It does not count assistant prompt markers, estimate tool heights, render components again, or patch renderers.

This relies on private runtime fields (`getPrimaryScrollView`, `child`, `mouseLayout`, and user-message `text`) and the `UserMessageComponent` class name. Pi upgrades may require changes.

Missing measurements hide the line. The extension skips containers whose rendered height differs from their cached child heights rather than guessing offsets. It does not support custom transcript wrappers that change row order or add padding.

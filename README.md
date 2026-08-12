# Vintage Frames

A web component kit that rebuilds the classic Apple System 7 interface elements.

View the [Examples Page](https://aportilla.github.io/vintage-frames/) to see every element live, with its full API.

```sh
npm install vintage-frames
```

Import the entire kit:

```ts
import 'vintage-frames'
```

Or import just the elements you need:

```ts
import 'vintage-frames/vf-button.js'
import 'vintage-frames/vf-checkbox.js'
```

There is to need to import a stylesheet. The components carry their styles with them.


## Sizing

The original Macintosh computers shipped with a 72 DPI 1-bit black-and-white screen. The user interface artwork was designed specifically to be legible and usable at that exact density. Modern displays, however, come in a wide range of pixel densities, so rendering at a naive 1x/2x/3x is not a viable strategy for replicating the original experience.

With the Vintage Frames kit, every component is authored in *system pixels*, corresponding to the original 72 DPI 1-bit art grid. Components read the browser's display pixel density and scale themselves so that one system pixel is exactly an integer number of hardware display pixels. With this technique, the art always lands on the device-pixel grid, at whatever device/system pixlel ratio lands *closest* to the original 72 DPI.

When the browser is zoomed, components raise or lower their target system DPI but keep rendering onto the native device-pixel grid at the closest integer mapping of device pixels to system pixels, so they always render crisply, with no blurred sub-pixel edges.

## Accessibility

Some liberties have been taken with component interaction and design to support modern web accessibility techniques and conventions. Vintage Frames components act as standard form controls, and display focus state as a 1-bit dashed line beneath the control or label.

## License

[MIT](https://github.com/aportilla/vintage-frames/blob/main/LICENSE) © Adam Portilla. The embedded font faces are fully re-drawn strikes based on Chicago and Geneva, originally created by Susan Kare for Apple.

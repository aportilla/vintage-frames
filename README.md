# Vintage Frames

A web component kit providing implementations of the classic Apple System 7 interface elements.

View the [Examples Page](https://aportilla.github.io/vintage-frames/) to see each of these live, with its full API.

```sh
npm install vintage-frames
```

Import the entire kit
```ts
import 'vintage-frames' 
```

Or you can import just the elements you need
```ts
import 'vintage-frames/vf-button.js'
import 'vintage-frames/vf-checkbox.js'
```

## Sizing

The original Macintosh computers shiped with a 72 DPI 1-bit black and white screen.  The user interface artwork was designed specically to be legible and usable at that exact density.  Modern displays however come in a wide range of pixel densities, so displaying at a naive 1x/2x/3x is not a viable strategy to provide a consistent user expierience that replicates the original UX.

With the Vintage Frames kit, every component is authored in *system pixels*, corresponding to the original 72 DPI 1-bit art grid. Vintage Frame components read the browsers pixel display density and scale themselves so that one system pixel is exactly an integer number of hardware display pixels, so that the art always lands on the device-pixel grid at whatever density is *closest* to the original 72 DPI.

When the browser is zoomed, the components increase/decrease their target system DPI, but continue to render onto the native device pixel grid in the closest integer mapping of device pixels to system pixels, so that the VF components will always render crisply without any sub-pixel blurred edges.

## Accessibility

Some liberties have been taken with component interaction and design to support modern web accessibility techniques and conventions. The Vintage Frame components act as standard form controls and display focus state using a 1-bit dashed line underneath the control or label.

## License

[MIT](https://github.com/aportilla/vintage-frames/blob/main/LICENSE) © Adam Portilla. The embedded font faces are fully re-drawn strikes based on Chicago and Geneva, originally created by Susan Kare for Apple.

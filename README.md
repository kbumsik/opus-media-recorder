# opus-media-recorder

[Try it!](https://kbumsik.io/opus-media-recorder/)

`opus-media-recorder` is a [MediaRecorder API](https://w3c.github.io/mediacapture-record/#mediarecorder-api) polyfill written in ES6 and WebAssembly. It aims a cross-browser Opus codec support with various audio formats such as Ogg and Webm. `opus-media-recorder` can be used as a ployfill, or it can replace the built-in MediaRecorder since `opus-media-recorder` supports more MIME types.

`opus-media-recorder` uses WebAssembly compiled from popular libraries (e.g libopus, libogg, and speexdsp) to ensure performance and standards-compliance.

## Why opus-media-recorder?

|              | opus-media-recorder | Chrome | Firefox | iOS | Edge |
|--------------|:-------------------:|:------:|:-------:|:---:|:----:|
| `audio/ogg`  |          O          |    X   |    O    |  X  |   X  |
| `audio/webm` |         WIP         |    O   |    X    |  X  |   X  |
| `audio/wav`  |          O          |    X   |    X    |  X  |   X  |

\* Both `audio/ogg` and `audio/webm` refer containers with Opus audio codec.

Currently the MediaRecorder API suffers from the two problems:

1. Not all browsers support MediaRecorder.
2. Even the browsers that provides MediaRecorder don't support the same format.

`opus-media-recorder` tackles these problems by supporting all major modern browsers (Chrome, Firefox, iOS, and Edge) and by providing various formats.

By taking advantages of WebAssembly and Web Workers, `opus-media-recorder` tries to have minimum performace panalties of running encoders on a browser.

## How to use

opus-media-recorder is compatible with the [Mediastream Recording API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) standard.

### Thing to know

* The page must be served over HTTPS in order to record.
* Being able to record does *not always* mean you can play it on browsers:
  * macOS/iOS Safari cannot play Ogg Opus natively yet.
  * Edge requires [an extension](https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6513488-ogg-vorbis-and-opus-audio-formats-support-firefox) to play Ogg Opus natively.
  * You can get an Opus decorder to play it. There are Opus decoders available, such as [Chris Rudmin's Opus decoder](https://github.com/chris-rudmin/opus-recorder).
  * Otherwise, users can download as a file and play it using apps like [VLC](https://www.videolan.org/vlc/index.html).

### HTML

The `MediaRecorder` object is available in the global namespace using [UMD](https://github.com/umdjs/umd).

```javascript
<script src="path/to/MediaRecorder.js"></script>
<script>
...
// Existing MediaRecorder is replaced
var recorder = new MediaRecorder(stream);
...
</script>
```

### JavaScript

For futher usages, see the [MDN reference](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), our [example](docs), and other online resources.

```javascript
window.MediaRecorder = require('opus-media-recorder');

var recorder;

function startRecording () {
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    var option = {
      mimeType: 'audio/ogg' // Choose desired format. Default is audio/ogg
    }
    // Start recording
    recorder = new MediaRecorder(stream, option);
    recorder.start();
    // Set record to <audio> when recording will be finished
    recorder.addEventListener('dataavailable', (e) => {
      audioElement.src = URL.createObjectURL(e.data);
    });
  });
}

// Recording should be started in user-initiated event like buttons
recordButton.addEventListener('click', startRecording);

// Stop recording
stopButton.addEventListener('click', () => {
  recorder.stop();
  // Remove “recording” icon from browser tab
  recorder.stream.getTracks().forEach(i => i.stop());
})
```

### Use opus-media-recorder only when a browser don't support it

```javascript
// Check if MediaRecorder available.
if (!window.MediaRecorder) {
  window.MediaRecorder = require('opus-media-recorder');
}
// Check if a target format (e.g. audio/ogg) is supported.
else if (!window.MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
  window.MediaRecorder = require('opus-media-recorder');
}
```

## Browser support

Supported:

* Chrome >= 58
* Firefox >= 53
* Microsoft Edge >= 41
* Safari (macOS and iOS) >= 11

Browsers with issues:

* iOS 11.2 only: Not working due to a regression in WebAssembly: https://bugs.webkit.org/show_bug.cgi?id=181781

## MIME Type support

* `audio/ogg`
* `audio/ogg; codecs=opus`
* `audio/wav` or `audio/wave`
* `audio/webm`: Not yet supported, WIP.

## Limitations

* `opus-media-recorder` throws generic Error objects instead of native DOMException.
* Because `audio/wav` is not designed for streaming, when `mimeType` is `audio/wav`, each `dataavailabe` events produces a complete and seprated `.wav` file that cannot be concatenated togather unlike Ogg and Webm.

## How to build

1. To build from the source, you need [Emscripten](https://github.com/kripken/emscripten), [NPM](https://www.npmjs.com/), and basic C program build systems such as [GNU Make](https://www.gnu.org/software/make/).

2. `npm install` to install JavaScript dependencies.

3. `make all` to build. `PRODUCTION=1 make all` to build for production.

4. `make run` to run a test web server locally. Default URL is `https://localhost:9000` (It has to be HTTPS).

5. `make clean` to clean up build files.

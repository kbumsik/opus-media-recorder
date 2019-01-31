# Webpack example

* `npm run build`: Build using webpack.
* `npm run serve`: Run test server.
* `npm run clean`: Clean up files.

## src.js

```javascript
import OpusMediaRecorder from 'opus-media-recorder';
// Use worker-loader
import Worker from 'opus-media-recorder/encoderWorker.js';
// Use file-loader that returns URL path
import OggOpusWasm from 'opus-media-recorder/OggOpusEncoder.wasm';
import WebMOpusWasm from 'opus-media-recorder/WebMOpusEncoder.wasm';

// Polyfill MediaRecorder
window.MediaRecorder = OpusMediaRecorder;
// Non-standard options
const workerOptions = {
  encoderWorkerFactory: _ => new Worker(),
  OggOpusEncoderWasmPath: OggOpusWasm,
  WebMOpusEncoderWasmPath: WebMOpusWasm
};

let recorder = new MediaRecorder(stream, {}, workerOptions);
```

## webpack.config.js

```diff
 module.exports = {
 
   ...

   module: {
      rules: [
+       {
+         test: /opus-media-recorder\/encoderWorker\.js$/,
+         loader: 'worker-loader'
+       },
+       {
+         test: /opus-media-recorder\/.*\.wasm$/,
+         type: 'javascript/auto',
+         loader: 'file-loader'
+       }
      ]
    }
 };
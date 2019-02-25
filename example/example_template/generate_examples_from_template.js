/**
 * This program search for matching macros (e.g. <@PRE_EXAMPLE@>) and
 * replaces them with desired code for each build targets (docs, webpack,
 * rollup examples). The reason I make this program is to prevent copy-and-paste
 * manually when I make a change with the example so that I can keep examples
 * same.
 *
 * Current macros:
 *   * <@PRE_EXAMPLE@>
 *   * <@WORKER_OPTIONS@>
 *   * <@POST_HTML@>
 *
 * Available generate targets:
 *   * /docs
 *   * /example/webpack
 *   * /example/rollup
 */
function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }
const MagicString = _interopDefault(require('magic-string'));
const path = require('path');
const fs = require('fs');

// https://localhost for testing and other examples.
// https://cdn.jsdelivr.net/npm/opus-media-recorder@latest for docs folder.
const BASE_URL = process.env.BASE_URL || 'https://localhost:9000';
const OUTPUT_DIR = process.env.OUTPUT_DIR || '../../docs';

const EXAMPLE_INPUT = path.join(__dirname, 'example.template.js');
const EXAMPLE_OUTPUT = path.join(OUTPUT_DIR, 'example.js');
const HTML_INPUT = path.join(__dirname, 'index.template.html');
const HTML_OUTPUT = path.join(OUTPUT_DIR, 'index.html');
const targetList = [[EXAMPLE_INPUT, EXAMPLE_OUTPUT],
                    [HTML_INPUT, HTML_OUTPUT]];

// Macro definitions
const macros = (function () {
  switch (path.basename(OUTPUT_DIR)) {
    case 'webpack':
      return {
        PRE_EXAMPLE:
`import OpusMediaRecorder from 'opus-media-recorder';
import EncoderWorker from 'opus-media-recorder/encoderWorker.js';
import OggOpusWasm from 'opus-media-recorder/OggOpusEncoder.wasm';
import WebMOpusWasm from 'opus-media-recorder/WebMOpusEncoder.wasm';`,
        WORKER_OPTIONS: `{
  encoderWorkerFactory: _ => new EncoderWorker(),
  OggOpusEncoderWasmPath: OggOpusWasm,
  WebMOpusEncoderWasmPath: WebMOpusWasm
}`,
        POST_HTML: `<script type="text/javascript" src="bundle.js"></script>`
      };

    case 'docs':
      return {
        PRE_EXAMPLE: '',
        WORKER_OPTIONS: `{
  OggOpusEncoderWasmPath: '${BASE_URL}/OggOpusEncoder.wasm',
  WebMOpusEncoderWasmPath: '${BASE_URL}/WebMOpusEncoder.wasm'
}`,
        POST_HTML:
`<script type="text/javascript" src="${BASE_URL}/OpusMediaRecorder.umd.js"></script>
<script type="text/javascript" src="${BASE_URL}/encoderWorker.umd.js"></script>
<script type="text/javascript" src="${path.basename(EXAMPLE_OUTPUT)}"></script>`
      };

    default:
      throw new Error(`Unexpected generate target: ${OUTPUT_DIR}`);
  }
})();

// Replace
for (const file of targetList) {
  const [input, output] = file;
  if (!fs.existsSync(input)) {
    throw new Error(`File not found: ${input}`);
  }
  const code = fs.readFileSync(input, { encoding: 'UTF-8' });
  const magicString = new MagicString(code);

  const re = new RegExp(`<@(${Object.keys(macros).join('|')})@>`, 'g');
  let match;
  while ((match = re.exec(code))) {
    let start = match.index;
    let end = start + match[0].length;
    const replacement = String(macros[match[1]]);
    magicString.overwrite(start, end, replacement);
  }

  fs.writeFileSync(output, magicString.toString());
  console.log(`File ${path.basename(output)} has been written.`);
}

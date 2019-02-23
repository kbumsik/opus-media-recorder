// rollup.config.js
import replace from 'rollup-plugin-replace';
import html from 'rollup-plugin-bundle-html';

// https://localhost for testing and other examples.
// https://cdn.jsdelivr.net/npm/opus-media-recorder@latest for docs folder.
const BASE_URL = process.env.BASE_URL || 'https://localhost:9000';
const OUPUT_DIR = process.env.OUTPUT_DIR || '../../docs';

// Set substitutions for different example targets
const PRE_EXAMPLE = '';
const WORKER_OPTIONS = `{
  OggOpusEncoderWasmPath: '${BASE_URL}/OggOpusEncoder.wasm',
  WebMOpusEncoderWasmPath: '${BASE_URL}/WebMOpusEncoder.wasm'
}`;

export default {
  input: 'example.js',
  plugins: [
    replace({
      delimiters: ['<@', '@>'],
      sourceMap: true,
      values: {
        PRE_EXAMPLE,
        WORKER_OPTIONS
      }
    }),
    html({
      template: 'index.html',
      dest: OUPUT_DIR,
      filename: 'index.html',
      inject: 'body',
      externals: [
        { type: 'js', file: BASE_URL + '/OpusMediaRecorder.umd.js', pos: 'before' },
        { type: 'js', file: BASE_URL + '/encoderWorker.umd.js', pos: 'before' }
      ]
    })
  ],
  output: [
    {
      file: OUPUT_DIR + '/example.js',
      format: 'iife'
    }
  ]
};

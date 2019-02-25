const path = require('path');

module.exports = {
  entry: './example.js',
  output: {
    path: path.resolve(__dirname),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /opus-media-recorder\/encoderWorker\.js$/,
        loader: 'worker-loader'
      },
      {
        test: /opus-media-recorder\/.*\.wasm$/,
        type: 'javascript/auto',
        loader: 'file-loader'
      }
    ]
  }
};

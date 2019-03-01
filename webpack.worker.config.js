module.exports = {
  output: {
    globalObject: 'typeof OpusMediaRecorder !== \'undefined\' ? OpusMediaRecorder : typeof self !== \'undefined\' ? self : this'
  },
  entry: {
    encoderWorker: './src/encoderWorker.js'
  },
  node: {
    fs: 'empty'
  },
  mode: 'development',
  module: {
    rules: [
      {
        enforce: 'pre',
        test: /\.(js|jsx|mjs)$/,
        exclude: [
          /node_modules/,
          /build/
        ],
        use: 'eslint-loader'
      },
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};

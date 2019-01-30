module.exports = {
  entry: {
    OpusMediaRecorder: './src/OpusMediaRecorder.js'
  },
  mode: 'development',
  output: {
    globalObject: 'typeof self !== \'undefined\' ? self : this'
  },
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
  },
  devServer: {
    contentBase: [`${__dirname}/build`, `${__dirname}/docs`],
    compress: true,
    host: '0.0.0.0',
    port: 9000,
    https: true,
    index: 'index.html',
    overlay: {
      warnings: true,
      errors: true
    },
    watchOptions: {
      poll: false
    }
  }
};

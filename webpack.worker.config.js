const WrapperPlugin = require('wrapper-webpack-plugin');

/**
 * The purpose of this function is to create the header and footer for IIFEed
 * the webpack output of encorderWorker.js.
 */
/* global window */
/* global WorkerGlobalScope */
let encoderWorkerIIFEWrapper = function () {
  function initWorker () {
    // Whole webpack output goes here
  }
  if (typeof window !== 'undefined' &&
      typeof window.OpusMediaRecorder === 'function') {
    // If the script is imported by using <script> tag
    window.OpusMediaRecorder.encoderWorker = initWorker;
  } else if (typeof WorkerGlobalScope !== 'undefined' &&
             self instanceof WorkerGlobalScope) {
    // If it is in web worker environment
    initWorker();
  }
};
let wrapperStr = encoderWorkerIIFEWrapper.toString();

module.exports = {
  plugins: [
    new WrapperPlugin({
      afterOptimizations: true,
      test: /\.js$/, // only wrap output of bundle files with '.js' extension
      // (function () { function initWorker (){
      header: '(' +
              wrapperStr.substr(
                0, wrapperStr.indexOf(
                  '{', wrapperStr.indexOf('initWorker')) + 1) +
              '\n',
      //   } if (typeof window !== 'undefined'...
      //   ...
      // })();
      footer: '\n' +
              wrapperStr.substr(wrapperStr.indexOf('}')) +
              ')();'
    })
  ],
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

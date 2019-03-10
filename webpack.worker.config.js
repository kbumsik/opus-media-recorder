const WrapperPlugin = require('wrapper-webpack-plugin');

module.exports = {
  plugins: [
    new WrapperPlugin({
      afterOptimizations: true,
      test: /\.js$/,
      header: `
(function OpusMediaWorkerUMD(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["encoderWorker"] = factory();
	else
		root["encoderWorker"] = factory();
})(typeof OpusMediaRecorder !== 'undefined' ? OpusMediaRecorder : typeof self !== 'undefined' ? self : this, function() {
return function() {`,
      footer: `}});`
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

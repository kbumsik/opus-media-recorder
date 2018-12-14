module.exports = {
  "entry": {
    MediaRecorder: "./src/MediaRecorder.js"
  },
  "mode": "development",
  "output": {
    "library": "[name]",
    "libraryTarget": "umd",
    "libraryExport": "default",
    "path": `${__dirname}/build`,
    "filename": "[name].js"
  },
  "module": {
    "rules": [
      {
        "enforce": "pre",
        "test": /\.(js|jsx|mjs)$/,
        "exclude": [
          /node_modules/,
          /build/
        ],
        "use": "eslint-loader"
      },
      {
        "test": /\.(js|mjs)$/,
        "exclude": /node_modules/,
        "use": {
          "loader": "babel-loader",
          "options": {
            "presets": ["env"]
          }
        }
      }
      // {
      //   "test": [
      //     /\.wasm$/,
      //     /Worker\.(js|jsx|mjs)$/
      //   ],
      //   "type": "javascript/auto",
      //   "loader": "file-loader",
      //   "options": {
      //     "name": "[name].[ext]"
      //   }
      // }
    ]
  },
  devServer: {
    contentBase: [`${__dirname}/build`, __dirname],
    compress: true,
    port: 9000,
    https: true,
    index: "index.html",
    overlay: {
      warnings: true,
      errors: true
    },
    watchOptions: {
      poll: false
    }
  }
};

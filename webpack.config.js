module.exports = {
  "mode": "development",
  "entry": [
    "./src/MediaRecorder.js"
  ],
  "output": {
    "library": "MediaRecorder",
    "libraryTarget": "umd",
    "libraryExport": "default",
    "path": `${__dirname}/build`,
    "filename": "bundle.js"
  },
  "module": {
    "rules": [
      {
        "enforce": "pre",
        "test": /\.(js|jsx|mjs)$/,
        "exclude": /node_modules/,
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
    ]
  },
  devServer: {
    contentBase: [`${__dirname}/example`, `${__dirname}/build`],
    compress: true,
    port: 9000,
    https: true
  }
};

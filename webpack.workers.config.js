module.exports = {
  "module": {
    "rules": [
//      {
//        "enforce": "pre",
//        "test": /\.(js|jsx|mjs)$/,
//        "exclude": /node_modules/,
//        "use": "eslint-loader"
//      },
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
  }
};

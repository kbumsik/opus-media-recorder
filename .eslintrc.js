module.exports = {
  "extends": "standard",
  "plugins": [
    "html"
  ],
  "parserOptions": {
    "ecmaVersion": 6,
    "sourceType": "module"
  },
  "rules": {
    "linebreak-style": ["error", "unix"],
    "semi": ["error", "always"]
  },
  "env": {
    "browser": true
  },
  "overrides": [
    {
      "files": [ "*.config.js"],
      "rules": {
        "quotes": ["error", "double"]
      }
    }
  ]
};

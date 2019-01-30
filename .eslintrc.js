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
    "semi": ["error", "always"],
    'indent': ['error', 2, {
      "ignoredNodes": ["ConditionalExpression"],
      'MemberExpression': 1,
      "FunctionExpression": {"parameters": "first"},
      "FunctionDeclaration": {"parameters": "first"},
      "CallExpression": {"arguments": "first"},
      "ArrayExpression": "first",
      "ObjectExpression": "first",
      "SwitchCase": 1
    }]
  },
  "env": {
    "browser": true
  }
};

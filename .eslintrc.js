module.exports = {
  extends: 'airbnb-base',
  rules: {
    'global-require': 0,
    'linebreak-style': ['error', 'windows'],
    'no-console': 0,
    'keyword-spacing': [2, {
      before: false,
      after: false,
      overrides: {
        try: { after: true },
        catch: { before: true },
        else: { after: true, before: true },
      },
    }],
    'no-use-before-define': ['error', {functions: false}],
    'prefer-destructuring': false,
  },
};

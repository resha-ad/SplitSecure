module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "security"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:security/recommended-legacy",
  ],
  env: {
    node: true,
    es2021: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "security/detect-object-injection": "off", // too many false positives on Prisma's typed access patterns
  },
  ignorePatterns: ["dist", "node_modules"],
};

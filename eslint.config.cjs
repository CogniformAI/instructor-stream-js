const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-plugin-prettier");
const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
    // Global ignores
    {
        ignores: [
            "**/node_modules/",
            "**/dist/",
            "**/coverage/",
            "**/docs/",
            "**/.eslintrc.cjs",
            "**/package.json",
            "**/tsconfig.json",
        ]
    },
    
    // Base config for all files
    {
        languageOptions: {
            parser: tsParser,
        },

        plugins: {
            "@typescript-eslint": typescriptEslint,
            prettier,
        },

        rules: {
            "import/no-anonymous-default-export": "off",
            "prettier/prettier": "error",
            "linebreak-style": "off",
            "no-prototype-builtins": "off",
            "semi": "off",
            "indent": "off",
            "@typescript-eslint/semi": "off",
            "no-unused-vars": "off",

            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            }],
        },
    },
    
    // TypeScript config
    ...compat.extends("plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"),
    
    // JS/MJS specific config
    {
        files: ["./**/*.mjs", "**/*.js"],
        ...compat.extends("plugin:@typescript-eslint/disable-type-checked")[0],
    }
];
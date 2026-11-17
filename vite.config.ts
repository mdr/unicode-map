import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"

const noReexports = [
  { selector: "ExportAllDeclaration", message: "Don't re-export; import from the defining module." },
  { selector: "ExportNamedDeclaration[source]", message: "Don't re-export; import from the defining module." }
]

// React's DOM refs start as null (`useRef<HTMLDivElement>(null)`); that is the one place it is allowed.
const noNull = [
  {
    selector: "Literal[raw='null']:not(CallExpression[callee.name='useRef'] > Literal)",
    message: "Use undefined, not null."
  },
  { selector: "TSNullKeyword", message: "Use undefined, not null." },
  { selector: "MemberExpression[property.name='toBeNull']", message: "Use toBeUndefined, not toBeNull." }
]

const noFunctionExpressionConsts = [
  { selector: "VariableDeclarator > FunctionExpression", message: "Use an arrow function: const f = () => {}." }
]

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the built site works from any path (e.g. GitHub Pages).
  base: "./",
  server: {
    // public/fonts is a symlink into /nix/store.
    fs: { strict: false }
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]
  },
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "import"],
    categories: {
      correctness: "off"
    },
    options: {
      typeAware: true,
      typeCheck: true
    },
    env: {
      builtin: true
    },
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "public", "result*", ".direnv", ".cache", ".claude/worktrees"],
    rules: {
      "constructor-super": "error",
      "for-direction": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-case-declarations": "error",
      "no-class-assign": "error",
      "no-compare-neg-zero": "error",
      "no-cond-assign": "error",
      "no-const-assign": "error",
      "no-constant-binary-expression": "error",
      "no-constant-condition": "error",
      "no-control-regex": "error",
      "no-debugger": "error",
      "no-delete-var": "error",
      "no-dupe-class-members": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "error",
      "no-empty-character-class": "error",
      "no-empty-pattern": "error",
      "no-empty-static-block": "error",
      "no-ex-assign": "error",
      "no-extra-boolean-cast": "error",
      "no-fallthrough": "error",
      "no-func-assign": "error",
      "no-global-assign": "error",
      "no-import-assign": "error",
      "no-invalid-regexp": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "no-misleading-character-class": "error",
      "no-new-native-nonconstructor": "error",
      "no-nonoctal-decimal-escape": "error",
      "no-obj-calls": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-regex-spaces": "error",
      "no-self-assign": "error",
      "no-setter-return": "error",
      "no-shadow-restricted-names": "error",
      "no-sparse-arrays": "error",
      "no-this-before-super": "error",
      "no-unassigned-vars": "error",
      "no-undef": "error",
      "no-unexpected-multiline": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unused-labels": "error",
      "no-unused-private-class-members": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-useless-assignment": "error",
      "no-useless-backreference": "error",
      "no-useless-catch": "error",
      "no-useless-escape": "error",
      "no-with": "error",
      "preserve-caught-error": "error",
      "require-yield": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-array-constructor": "error",
      "no-unused-expressions": "error",
      "no-useless-constructor": "error",
      "no-empty-function": "error",
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"]
        }
      ],
      eqeqeq: ["error", "smart"],
      // TODO: "error" once MapView, DetailPanel and App are split up.
      "max-lines": ["off", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-depth": ["off", 4],
      "sonarjs/cognitive-complexity": ["off", 15],
      "folders/max-entries": ["error", 30],
      "eslint-js/no-restricted-syntax": ["error", ...noReexports, ...noFunctionExpressionConsts],
      "func-style": ["error", "expression"],
      "prefer-arrow-callback": "error",
      "arrow-body-style": ["error", "as-needed"],
      "typescript/await-thenable": "error",
      "typescript/ban-ts-comment": [
        "error",
        {
          minimumDescriptionLength: 10
        }
      ],
      "typescript/no-array-delete": "error",
      "typescript/no-base-to-string": "error",
      "typescript/no-deprecated": "error",
      "typescript/no-duplicate-enum-values": "error",
      "typescript/no-duplicate-type-constituents": "error",
      "typescript/no-dynamic-delete": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-extra-non-null-assertion": "error",
      "typescript/no-extraneous-class": "error",
      "typescript/no-floating-promises": ["error", { ignoreVoid: true }],
      "typescript/no-for-in-array": "error",
      "typescript/no-generated-empty-object-type": "error",
      "typescript/no-implied-eval": "error",
      "typescript/no-invalid-void-type": "error",
      "typescript/no-meaningless-void-operator": "error",
      "typescript/no-misused-new": "error",
      "typescript/no-misused-promises": "error",
      "typescript/no-misused-spread": "error",
      "typescript/no-mixed-enums": "error",
      "typescript/no-namespace": "error",
      "typescript/no-non-null-asserted-nullish-coalescing": "error",
      "typescript/no-non-null-asserted-optional-chain": "error",
      "typescript/no-redundant-type-constituents": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-this-alias": "error",
      "typescript/no-unnecessary-boolean-literal-compare": "error",
      "typescript/no-unnecessary-condition": "error",
      "typescript/no-unnecessary-template-expression": "error",
      "typescript/no-unnecessary-type-arguments": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unnecessary-type-conversion": "error",
      "typescript/no-unnecessary-type-parameters": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-declaration-merging": "error",
      "typescript/no-unsafe-enum-comparison": "error",
      "typescript/no-unsafe-function-type": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-unary-minus": "error",
      "typescript/no-useless-default-assignment": "error",
      "typescript/no-wrapper-object-types": "error",
      "typescript/only-throw-error": "error",
      "typescript/prefer-as-const": "error",
      "typescript/switch-exhaustiveness-check": "error",
      "typescript/prefer-literal-enum-member": "error",
      "typescript/prefer-namespace-keyword": "error",
      "typescript/prefer-promise-reject-errors": "error",
      "typescript/prefer-reduce-type-parameter": "error",
      "typescript/prefer-return-this-type": "error",
      "typescript/related-getter-setter-pairs": "error",
      "typescript/restrict-plus-operands": [
        "error",
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumberAndString: false,
          allowRegExp: false
        }
      ],
      "typescript/restrict-template-expressions": ["error", { allowNumber: true, allowBoolean: true }],
      "typescript/return-await": ["error", "error-handling-correctness-only"],
      "typescript/triple-slash-reference": "error",
      "typescript/unbound-method": "error",
      "typescript/unified-signatures": "error",
      "typescript/use-unknown-in-catch-callback-variable": "error",
      "typescript/adjacent-overload-signatures": "error",
      "typescript/array-type": "error",
      "typescript/ban-tslint-comment": "error",
      "typescript/class-literal-property-style": "error",
      "typescript/consistent-generic-constructors": "error",
      "typescript/consistent-indexed-object-style": "error",
      "typescript/consistent-type-assertions": "error",
      "typescript/consistent-type-definitions": "error",
      "typescript/no-confusing-non-null-assertion": "error",
      "typescript/no-inferrable-types": "error",
      "typescript/non-nullable-type-assertion-style": "error",
      "typescript/prefer-find": "error",
      "typescript/dot-notation": ["error", { allowIndexSignaturePropertyAccess: true }],
      "typescript/prefer-for-of": "error",
      "typescript/prefer-function-type": "error",
      "typescript/prefer-includes": "error",
      // `||` on a string treats "" as missing too, which is usually the intent.
      "typescript/prefer-nullish-coalescing": ["error", { ignorePrimitives: { string: true } }],
      "typescript/prefer-optional-chain": "error",
      "typescript/prefer-regexp-exec": "error",
      "typescript/prefer-string-starts-ends-with": "error",
      "typescript/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports"
        }
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
      "import/no-cycle": "error"
    },
    overrides: [
      {
        files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
        rules: {
          "constructor-super": "off",
          "getter-return": "off",
          "no-class-assign": "off",
          "no-const-assign": "off",
          "no-dupe-class-members": "off",
          "no-dupe-keys": "off",
          "no-func-assign": "off",
          "no-import-assign": "off",
          "no-new-native-nonconstructor": "off",
          "no-obj-calls": "off",
          "no-redeclare": "off",
          "no-setter-return": "off",
          "no-this-before-super": "off",
          "no-undef": "off",
          "no-unreachable": "off",
          "no-unsafe-negation": "off",
          "no-var": "error",
          // One absence value: undefined, which the language produces anyway. Where an
          // outside API hands back null, convert it on the spot (`?? undefined`).
          // One absence value: undefined, which the language produces anyway. Where an
          // outside API hands back null, convert it on the spot (`?? undefined`).
          "eslint-js/no-restricted-syntax": ["error", ...noNull, ...noReexports, ...noFunctionExpressionConsts],
          "no-with": "off",
          "prefer-const": "error",
          "prefer-rest-params": "error",
          "prefer-spread": "error"
        }
      },
      {
        // Components (.tsx) infer their return type.
        files: ["**/*.ts", "**/*.mts", "**/*.cts"],
        rules: {
          "typescript/explicit-function-return-type": [
            "error",
            { allowExpressions: true, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true }
          ]
        }
      },
      {
        files: ["src/**/*.{ts,tsx}"],
        rules: {
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "error",
          "jsx-a11y/alt-text": "error",
          "jsx-a11y/anchor-ambiguous-text": "error",
          "jsx-a11y/anchor-has-content": "error",
          "jsx-a11y/anchor-is-valid": "error",
          "jsx-a11y/aria-activedescendant-has-tabindex": "error",
          "jsx-a11y/aria-props": "error",
          "jsx-a11y/aria-proptypes": "error",
          "jsx-a11y/aria-role": "error",
          "jsx-a11y/aria-unsupported-elements": "error",
          "jsx-a11y/autocomplete-valid": "error",
          "jsx-a11y/click-events-have-key-events": "error",
          "jsx-a11y/control-has-associated-label": "error",
          "jsx-a11y/heading-has-content": "error",
          "jsx-a11y/html-has-lang": "error",
          "jsx-a11y/iframe-has-title": "error",
          "jsx-a11y/img-redundant-alt": "error",
          "jsx-a11y/interactive-supports-focus": "error",
          "jsx-a11y/label-has-associated-control": "error",
          "jsx-a11y/lang": "error",
          "jsx-a11y/media-has-caption": "error",
          "jsx-a11y/mouse-events-have-key-events": "error",
          "jsx-a11y/no-access-key": "error",
          "jsx-a11y/no-aria-hidden-on-focusable": "error",
          "jsx-a11y/no-autofocus": "error",
          "jsx-a11y/no-distracting-elements": "error",
          "jsx-a11y/no-interactive-element-to-noninteractive-role": "error",
          "jsx-a11y/no-noninteractive-element-interactions": "error",
          "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
          "jsx-a11y/no-noninteractive-tabindex": "error",
          "jsx-a11y/no-redundant-roles": "error",
          "jsx-a11y/no-static-element-interactions": "error",
          // The roles on divs here (dialog, status, radio, img, group) are deliberate: a native <dialog>, <output>,
          // radio <input> or <fieldset> would bring behaviour and styling this UI does not want.
          "jsx-a11y/prefer-tag-over-role": "off"
        },
        plugins: ["react", "jsx-a11y"],
        env: {
          browser: true
        }
      },
      {
        files: ["scripts/**/*.{ts,mjs}", "lint/**/*.ts", "**/*.config.ts"],
        rules: {
          "no-console": "off",
          "no-restricted-imports": "off",
          "typescript/await-thenable": "off",
          "typescript/consistent-return": "off",
          "typescript/consistent-type-exports": "off",
          "typescript/no-array-delete": "off",
          "typescript/no-base-to-string": "off",
          "typescript/no-confusing-void-expression": "off",
          "typescript/no-deprecated": "off",
          "typescript/no-duplicate-type-constituents": "off",
          "typescript/no-floating-promises": "off",
          "typescript/no-for-in-array": "off",
          "typescript/no-generated-empty-object-type": "off",
          "typescript/no-implied-eval": "off",
          "typescript/no-meaningless-void-operator": "off",
          "typescript/no-misused-promises": "off",
          "typescript/no-misused-spread": "off",
          "typescript/no-mixed-enums": "off",
          "typescript/no-redundant-type-constituents": "off",
          "typescript/no-unnecessary-boolean-literal-compare": "off",
          "typescript/no-unnecessary-condition": "off",
          "typescript/no-unnecessary-qualifier": "off",
          "typescript/no-unnecessary-template-expression": "off",
          "typescript/no-unnecessary-type-arguments": "off",
          "typescript/no-unnecessary-type-assertion": "off",
          "typescript/no-unnecessary-type-conversion": "off",
          "typescript/no-unnecessary-type-parameters": "off",
          "typescript/no-unsafe-argument": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-unsafe-call": "off",
          "typescript/no-unsafe-enum-comparison": "off",
          "typescript/no-unsafe-member-access": "off",
          "typescript/no-unsafe-return": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "typescript/no-unsafe-unary-minus": "off",
          "typescript/no-useless-default-assignment": "off",
          "typescript/non-nullable-type-assertion-style": "off",
          "typescript/only-throw-error": "off",
          "typescript/prefer-find": "off",
          "typescript/prefer-includes": "off",
          "typescript/prefer-nullish-coalescing": "off",
          "typescript/prefer-optional-chain": "off",
          "typescript/prefer-promise-reject-errors": "off",
          "typescript/prefer-readonly": "off",
          "typescript/prefer-readonly-parameter-types": "off",
          "typescript/prefer-reduce-type-parameter": "off",
          "typescript/prefer-regexp-exec": "off",
          "typescript/prefer-return-this-type": "off",
          "typescript/prefer-string-starts-ends-with": "off",
          "typescript/promise-function-async": "off",
          "typescript/related-getter-setter-pairs": "off",
          "typescript/require-array-sort-compare": "off",
          "typescript/require-await": "off",
          "typescript/restrict-plus-operands": "off",
          "typescript/restrict-template-expressions": "off",
          "typescript/return-await": "off",
          "typescript/strict-boolean-expressions": "off",
          "typescript/strict-void-return": "off",
          "typescript/switch-exhaustiveness-check": "off",
          "typescript/unbound-method": "off",
          "typescript/use-unknown-in-catch-callback-variable": "off"
        },
        env: {
          browser: true,
          node: true
        }
      },
      {
        files: ["**/*.test.ts"],
        rules: {
          "vitest/expect-expect": [
            "error",
            {
              assertFunctionNames: ["expect", "expectTypeOf", "expect*", "*.expect*", "*.until*"]
            }
          ],
          "vitest/no-commented-out-tests": "error",
          "vitest/no-conditional-expect": "off",
          "vitest/no-disabled-tests": "warn",
          "vitest/no-focused-tests": "error",
          "vitest/no-identical-title": "error",
          "vitest/no-import-node-test": "error",
          "vitest/no-interpolation-in-snapshots": "error",
          "vitest/no-mocks-import": "error",
          "vitest/no-standalone-expect": "error",
          "vitest/no-unneeded-async-expect-function": "error",
          "vitest/prefer-called-exactly-once-with": "error",
          "vitest/require-local-test-context-for-concurrent-snapshots": "error",
          "vitest/valid-describe-callback": "error",
          "vitest/valid-expect": [
            "error",
            {
              maxArgs: 2
            }
          ],
          "vitest/valid-expect-in-promise": "error",
          "vitest/valid-title": "error",
          "no-empty-function": "off",
          "typescript/no-unsafe-assignment": "off",
          "typescript/no-explicit-any": "off"
        },
        plugins: ["vitest"]
      },
      {
        files: ["**/*.config.{js,ts}"],
        rules: {
          "max-lines": "off",
          "sonarjs/cognitive-complexity": "off"
        }
      }
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin"
      },
      { name: "eslint-js", specifier: "oxlint-plugin-eslint" },
      { name: "sonarjs", specifier: "eslint-plugin-sonarjs" },
      { name: "folders", specifier: "./lint/folder-size.ts" }
    ]
  },
  fmt: {
    printWidth: 120,
    semi: false,
    trailingComma: "none",
    sortPackageJson: false,
    ignorePatterns: [
      "dist",
      "node_modules",
      "public",
      "pnpm-lock.yaml",
      "flake.lock",
      ".cache",
      ".claude/worktrees",
      "src/data/*.json"
    ]
  }
})

import type { Config } from "jest";
import path from "path";

const config: Config = {
  rootDir: ".",
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup/jest.setup.js"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.test.json",
    },
  },
  reporters: [
    "default",
    [
      "jest-allure2-reporter",
      {
        resultsDir: path.resolve(__dirname, "allure-results"),
        testCase: {
          attachments: {
            includeConsoleOutput: "on-failure",
          },
        },
      },
    ],
  ],
  coverageDirectory: "<rootDir>/coverage",
  collectCoverageFrom: [
    "<rootDir>/lib/**/*.js",
    "!<rootDir>/lib/index.js",
    "!<rootDir>/lib/server.js",
  ],
  testTimeout: 30000,
  moduleNameMapper: {
    // uuid v13+ is pure ESM; redirect to a CJS shim so Jest (CommonJS mode) can load it
    "^uuid$": "<rootDir>/tests/__mocks__/uuid.js",
    "^@lib/(.*)$": "<rootDir>/lib/$1",
    "^@tests/(.*)$": "<rootDir>/tests/$1",
  },
  // uuid v9+ and some other deps ship as pure ESM; transform them through ts-jest
  transformIgnorePatterns: [
    "/node_modules/(?!(uuid|nanoid|@firebase)/)",
  ],
};

export default config;

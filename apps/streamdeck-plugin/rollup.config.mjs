import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "com.cursorstreamdeck.bridge.sdPlugin");

export default {
  input: "src/plugin.ts",
  output: {
    file: path.join(outDir, "bin", "plugin.js"),
    format: "esm",
    sourcemap: true,
  },
  plugins: [
    typescript({ tsconfig: "./tsconfig.json" }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
  ],
  external: [
    "node:fs",
    "node:path",
    "node:os",
    "node:url",
    "node:http",
    "node:https",
    "node:zlib",
    "fs",
    "path",
    "url",
    "zlib",
  ],
};

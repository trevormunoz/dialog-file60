import dts from "rollup-plugin-dts";

export default {
  input: "scripts/engine-entry.d.mts",
  output: { file: "dist/engine.d.mts", format: "es" },
  plugins: [dts()],
};

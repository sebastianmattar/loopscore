import fs from "fs";
import path from "path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BenchConfigSchema } from "../src/config.js";

const schema = zodToJsonSchema(BenchConfigSchema, {
  name: "BenchConfig",
  target: "jsonSchema7",
});

const outPath = path.resolve(import.meta.dirname, "../bench-config.schema.json");
fs.writeFileSync(outPath, JSON.stringify(schema, null, 2) + "\n");
console.log(`Written: ${outPath}`);

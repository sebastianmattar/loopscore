import fs from "fs";
import path from "path";
import { z } from "zod";
import { BenchConfigSchema } from "../src/config.js";

const schema = z.toJSONSchema(BenchConfigSchema);

const outPath = path.resolve(
  import.meta.dirname,
  "../bench-config.schema.json",
);
fs.writeFileSync(outPath, JSON.stringify(schema, null, 2) + "\n");

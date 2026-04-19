#!/usr/bin/env node
try { process.loadEnvFile(); } catch { /* no .env file */ }
import { buildCLI } from "./cli.js";

buildCLI()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  });

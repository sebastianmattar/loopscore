import type { JudgeProvider } from "../types.js";
import type { CLIProvider } from "./base.js";
import copilotProvider from "./copilot.js";
import geminiProvider from "./gemini.js";
import opencodeProvider from "./opencode.js";

const BUILT_IN_PROVIDERS: Record<JudgeProvider, CLIProvider> = {
  copilot: copilotProvider,
  gemini: geminiProvider,
  opencode: opencodeProvider,
};

export function getProvider(name: JudgeProvider): CLIProvider {
  return BUILT_IN_PROVIDERS[name];
}

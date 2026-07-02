import { Context } from "effect"

/**
 * Carries the repository root directory through the Effect layer so that
 * path-sensitive review logic can resolve relative paths and detect
 * escapes without depending on `process.cwd()`.
 */
export class RepoConfig extends Context.Tag("RepoConfig")<
  RepoConfig,
  { readonly repoRoot: string }
>() {}

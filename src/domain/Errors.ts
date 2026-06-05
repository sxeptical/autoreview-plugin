import { Data } from "effect"

export class BlockedCommandError extends Data.TaggedError("BlockedCommandError")<{
  readonly reason: string
}> {}

export class RequiresHumanApprovalError extends Data.TaggedError("RequiresHumanApprovalError")<{
  readonly reason: string
}> {}

export class BlockedEditError extends Data.TaggedError("BlockedEditError")<{
  readonly reason: string
}> {}

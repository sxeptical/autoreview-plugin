import { Schema } from "effect"

export const DecisionType = Schema.Union(
  Schema.Literal("approve"),
  Schema.Literal("deny"),
  Schema.Literal("require_human")
)

export type DecisionType = Schema.Schema.Type<typeof DecisionType>

export class ReviewDecision extends Schema.Class<ReviewDecision>("ReviewDecision")({
  decision: DecisionType,
  reason: Schema.String
}) {}

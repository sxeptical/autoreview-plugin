import { Context, Effect, Layer, Ref } from "effect"
import type { DecisionType } from "../domain/ReviewDecision.js"

export class ReviewedState extends Context.Tag("ReviewedState")<
  ReviewedState,
  {
    readonly track: (callID: string) => Effect.Effect<void, never>
    readonly isReviewed: (callID: string) => Effect.Effect<boolean, never>
    readonly clear: (callID: string) => Effect.Effect<void, never>
    readonly trackDecision: (callID: string, decision: DecisionType) => Effect.Effect<void, never>
    readonly getDecision: (callID: string) => Effect.Effect<DecisionType | undefined, never>
    readonly clearDecision: (callID: string) => Effect.Effect<void, never>
  }
>() {}

export const ReviewedStateLive = Layer.effect(
  ReviewedState,
  Effect.gen(function* () {
    const reviewedRef = yield* Ref.make<Set<string>>(new Set())
    const decisionsRef = yield* Ref.make<Map<string, DecisionType>>(new Map())

    return {
      track: (callID: string) =>
        Ref.update(reviewedRef, (set) => new Set([...set, callID])),
      
      isReviewed: (callID: string) =>
        Ref.get(reviewedRef).pipe(Effect.map((set) => set.has(callID))),
      
      clear: (callID: string) =>
        Ref.update(reviewedRef, (set) => {
          const newSet = new Set(set)
          newSet.delete(callID)
          return newSet
        }),
      
      trackDecision: (callID: string, decision: DecisionType) =>
        Ref.update(decisionsRef, (map) => new Map([...map, [callID, decision]])),
      
      getDecision: (callID: string) =>
        Ref.get(decisionsRef).pipe(Effect.map((map) => map.get(callID))),
      
      clearDecision: (callID: string) =>
        Ref.update(decisionsRef, (map) => {
          const newMap = new Map(map)
          newMap.delete(callID)
          return newMap
        }),
    }
  })
)

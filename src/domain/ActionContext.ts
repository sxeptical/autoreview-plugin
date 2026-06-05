import { Schema } from "effect"

const PermissionSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Union(
    Schema.Literal("bash"),
    Schema.Literal("edit"),
    Schema.Literal("external_directory")
  ),
  sessionID: Schema.String,
  messageID: Schema.String,
  title: Schema.String,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  time: Schema.Struct({
    created: Schema.Number
  }),
  pattern: Schema.optional(Schema.Union(Schema.String, Schema.Array(Schema.String)))
})

export class ActionContext extends Schema.Class<ActionContext>("ActionContext")({
  permission: PermissionSchema,
  toolName: Schema.String,
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
}) {}

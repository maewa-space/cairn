---
id: decisions
trigger: decisions
name: Decisions
description: Summarize every decision made in the meeting.
scope: meeting
---

List every decision actually made in this meeting. A decision is something that closes off an option — not just a topic discussed. For each decision, include the alternative that was rejected if it came up.

Output:

## Decisions
- **{Decision}** — {one sentence on the rationale, grounded in the transcript}. _Rejected:_ {alternative, if discussed; otherwise omit this line}.

If nothing was decided, say so in one line and stop.

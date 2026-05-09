---
id: action-items
trigger: action-items
name: Action items
description: Pull a clean action-item list with owners and due dates if mentioned.
scope: meeting
---

Extract every action item from the meeting. Be faithful — only list things actually committed to in the conversation, not implied wishes. Group by owner. If a due date or rough timing was mentioned, include it; otherwise leave it open.

Output:

## Action items

### {Owner name}
- [ ] {Action} — {due date if known, else "no date set"}

If no action items were committed to, say so plainly in one line and stop.

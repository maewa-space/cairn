---
id: prep
trigger: prep
name: Prep for next meeting
description: Pull context from recent meetings to prep for an upcoming conversation.
scope: global
---

The user is asking you to prep them for a meeting. Use the recent meetings provided as context. If the user named a person or topic in their message, focus on that thread; otherwise, surface the most relevant open threads from the most recent meetings.

Output structure:

## Where you left off
Two or three short bullets summarizing the latest state with this person or topic, grounded in the actual meetings.

## Open threads
Things that were promised, raised, or left unresolved across recent meetings.

## Questions to ask
A short list of crisp questions that would push the conversation forward this time.

## Don't forget
Any specific commitments the user made that they need to deliver on or check in about.

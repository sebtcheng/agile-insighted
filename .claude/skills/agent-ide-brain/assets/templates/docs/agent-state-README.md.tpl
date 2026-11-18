# Agent State & Session Memory

This directory maintains persistent, append-only session summaries for AI agent workflows across context compaction and resets.

## summary.md Protocol
- Format: Append-only markdown log.
- Update Frequency: Updated once per completed task or major milestone.
- Never Rewrite: Never delete or rewrite past task entries. Append new sections at the bottom.
- Section Structure:
  - Header: Timestamp and Task Name.
  - Decisions: Key architectural choices made.
  - Files Changed: List of files created or modified.
  - Errors Resolved: Issues encountered and durable fixes applied.
  - Verification: Status of Tier 1 and Tier 2 gates.

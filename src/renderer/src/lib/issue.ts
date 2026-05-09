// Re-export from shared so renderer imports keep working unchanged.
// Canonical source: src/shared/issue.ts (used by both renderer and main).
export { deriveIssue, formatIssueDate, type IssueInfo } from '@shared/issue.js';

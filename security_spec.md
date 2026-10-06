# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Authentication & Verification Invariant**: Every read and write operation across `/works`, `/workDocuments`, and `/fileChunks` requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **Ownership Invariant**: Every document in `/works`, `/workDocuments`, and `/fileChunks` must have an `ownerId` matching `request.auth.uid`. Users can never read, list, update, or delete records owned by another UID.
3. **Relational Integrity Invariant**:
   - A `workDocument` cannot be created unless the referenced `workId` exists in `/works/$(incoming().workId)` and belongs to `request.auth.uid`.
   - A `fileChunk` cannot be created unless the referenced `workId` exists in `/works/$(incoming().workId)` and belongs to `request.auth.uid`.
4. **Immutability Invariant**: `ownerId`, `createdAt`, `workId`, and `docId` cannot be altered once created.
5. **Temporal Integrity Invariant**: `createdAt` must equal `request.time` on `create`, and `updatedAt` must equal `request.time` on `update`.

## 2. The "Dirty Dozen" Payloads
1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempting to create a `/works/{workId}` document.
2. **Identity Spoofing on Create**: Setting `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
3. **Shadow Field Injection on Create**: Sending extra field `isAdmin: true` in `/works/{workId}` create payload.
4. **Shadow Field Injection on Update**: Attempting to modify `ownerId` or add `extraField` during `/works/{workId}` update.
5. **Orphaned WorkDocument Create**: Creating a `/workDocuments/{docId}` pointing to a non-existent `workId` or a `workId` owned by another user.
6. **Invalid Category Enum**: Creating a `/workDocuments/{docId}` with `category: "hacked_category"`.
7. **Denial of Wallet Oversized String**: Sending a 5,000-character string in `workName` (max 200) or a >750,000-character string in `fileChunks.data`.
8. **ID Poisoning Attack**: Creating a document with a 300-character ID or special characters outside `^[a-zA-Z0-9_\-]+$`.
9. **Client Timestamp Forgery**: Passing a past or future timestamp instead of `request.time` for `createdAt` or `updatedAt`.
10. **Cross-Tenant List Scraping**: Executing a collection `list` query on `/works` without `where("ownerId", "==", request.auth.uid)`.
11. **Value Poisoning on Update**: Updating `estimatedCost` with a string `"100000"` instead of a valid non-negative number.
12. **Chunk Mutation Attack**: Attempting to `update` an immutable `/fileChunks/{chunkId}` document after creation.

/**
 * Firestore Security Rules Test Specification (Dirty Dozen Payloads)
 */
export const dirtyDozenPayloads = [
  {
    name: '1. Unverified Email Spoof',
    auth: { uid: 'user_1', email: 'user@example.com', email_verified: false },
    path: 'works/work_1',
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '2. Identity Spoofing on Create',
    auth: { uid: 'attacker_1', email_verified: true },
    path: 'works/work_1',
    payload: { ownerId: 'victim_1' },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '3. Shadow Field Injection on Create',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/work_1',
    payload: { ownerId: 'user_1', isAdmin: true },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '4. Shadow Field Injection on Update',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/work_1',
    payload: { isVerified: true },
    op: 'update',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '5. Orphaned WorkDocument Create',
    auth: { uid: 'user_1', email_verified: true },
    path: 'workDocuments/doc_1',
    payload: { ownerId: 'user_1', workId: 'non_existent_work' },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '6. Invalid Category Enum',
    auth: { uid: 'user_1', email_verified: true },
    path: 'workDocuments/doc_1',
    payload: { ownerId: 'user_1', workId: 'work_1', category: 'invalid_cat' },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '7. Denial of Wallet Oversized String',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/work_1',
    payload: { ownerId: 'user_1', workName: 'A'.repeat(1000) },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '8. ID Poisoning Attack',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/invalid$id!@#',
    payload: { ownerId: 'user_1' },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '9. Client Timestamp Forgery',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/work_1',
    payload: { ownerId: 'user_1', createdAt: new Date(2020, 1, 1) },
    op: 'create',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '10. Cross-Tenant List Scraping',
    auth: { uid: 'attacker_1', email_verified: true },
    path: 'works',
    op: 'list',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '11. Value Poisoning on Update',
    auth: { uid: 'user_1', email_verified: true },
    path: 'works/work_1',
    payload: { estimatedCost: '100000' },
    op: 'update',
    expected: 'PERMISSION_DENIED'
  },
  {
    name: '12. Chunk Mutation Attack',
    auth: { uid: 'user_1', email_verified: true },
    path: 'fileChunks/chunk_1',
    payload: { data: 'modified_base64' },
    op: 'update',
    expected: 'PERMISSION_DENIED'
  }
];

# ADR-0003: Persist Mantle Runtime State Through a Semantic IndexedDB Adapter

- Status: Accepted
- Date: 2026-08-30

## Context

Companion is a browser application whose canonical local state must survive page
reloads, browser restarts, agent interruptions, and ZIP export/import. The proof
of concept established that IndexedDB can preserve structured data and native
Blob/File values in the target browser.

Mantle's `DatabaseDriver` is intentionally shaped like SQLite and D1. Emulating
SQL over IndexedDB would add a parser, migration behavior, and query semantics
that the browser does not provide. Mantle also exposes the higher-level
`MantleStorageAdapter` specifically for non-SQL and application-owned storage.

Mantle's storage preparation contract does not own the source manifest bundle;
the host supplies an immutable runtime plan.

## Decision

Companion will implement `MantleStorageAdapter`, not `DatabaseDriver`.

The initial adapter returns Mantle's required `entries` and `views` semantic
ports and declares no native View dialects.

`IndexedDbEntryRepository` implements Mantle's entry read and write contracts.
Each mutation performs its expected-version check and write in one IndexedDB
transaction. Entry identifiers remain globally unique within one prepared
runtime revision as required by the runtime contract.

`IndexedDbViewQueryExecutor` supports only the declarative operators in the
accepted browser profile. It executes Mantle's compiled logical View plan; it
does not parse YAML or create a second View grammar. Unsupported operators and
native SQL Views are rejected during preparation.

Companion owns a separate, minimal bundle repository because the Mantle storage
adapter receives a plan but does not persist the active manifest source:

```ts
interface BundleRecord {
  id: string
  manifestFiles: Readonly<Record<string, string>>
  semanticFingerprint: string
  identity: BundleIdentity
  createdAt: number
}

interface CompanionMetadata {
  activeBundleId: string | null
}
```

The active pointer is the only source of activation truth. Candidate and prior
bundles are ordinary records; rejected imports are not retained by default.
Physical IndexedDB keys are namespaced by bundle ID so a candidate can reuse the
same logical entry IDs as the active or prior revision without overwriting it.
One browser origin may retain many valid inactive bundles, but exactly zero or
one bundle is active for the origin at a time. Activation is not scoped per tab.
Inactive bundles remain available for a later library and switching surface.

Application startup is deterministic:

```text
read active bundle
→ parse and validate manifests
→ validate Companion contract
→ compile RuntimePlan
→ boot Mantle runtime with IndexedDbMantleStorageAdapter
```

The first implementation keeps binary assets in the already proven IndexedDB
asset store and stores asset IDs in Mantle entries. It will implement Mantle's
media ports only when Mantle media lifecycle behavior becomes a real
requirement.

ZIP export contains the resolved manifest YAML files, canonical runtime entries
including journals, Blob assets, and an integrity manifest. Derived projections
are recompiled after import rather than exported.

The integrity manifest records each relative path, byte length, media type, and
SHA-256 digest using the browser's native Web Crypto API.

Import and activation use a staged pointer-swap protocol:

1. Preflight the archive against a versioned profile with explicit compressed
   size, expanded size, file count, path, manifest depth, and asset limits.
   Duplicate, absolute, parent-relative, unknown, or hash-mismatched files are
   rejected.
2. Write the candidate into its own bundle namespace without changing the
   active pointer.
3. Read the stored candidate back and run the full Mantle and Companion
   validation pipeline.
4. After explicit user approval, update only `activeBundleId` in one IndexedDB
   transaction.
5. Keep the prior bundle intact until activation succeeds. Cleanup runs outside
   the activation path.

A startup validation or migration failure never deletes the active bundle. The
application enters a recovery surface that can export the untouched data,
import another bundle, or select a still-valid prior bundle.

Migrations never rewrite the active namespace in place. They produce and
validate a new candidate namespace, then use the same approval and pointer-swap
activation path.

Normal authoring edits do not use bundle pointer-swap. Runs, stages, rules,
memories, item definitions, inventory, loadouts, and other current entries may
be updated in the active namespace after schema, reference, and expected-version
validation. A change to the Fixed Backbone, manifest contract, template
identity, imported archive, or the whole experience still produces a candidate
namespace.

`progress-events` and future journal entries are append-only historical
records. Pending agent turns retain their original request and may only be
resolved by the narrow action transaction. Generic entry update, delete, and
status-transition operations reject these retained history collections. V1
preserves their recorded summaries, dialogue, and timestamps but does not
promise deterministic replay after authoring content changes.

Portable ZIP integrity is a snapshot of one export. Valid active-entry edits do
not invalidate IndexedDB; export recalculates file lengths and hashes from the
current canonical state.

Companion owns one additional semantic `submit-action` repository operation for
product actions that must change multiple canonical entries atomically. Its
IndexedDB implementation checks the expected run revision and commits all
affected entries plus the progress event in one transaction. Agent-turn
resolution uses the same operation and also marks the pending turn resolved.
This product operation is deliberately narrower than a generic unit-of-work
abstraction.

## Consequences

- Mantle application rules remain reusable without pretending IndexedDB is a
  SQL database.
- IndexedDB-specific code is confined to infrastructure adapters.
- Declarative View execution must be implemented and tested against Mantle's
  expected filter, ordering, and pagination behavior.
- Native SQL Views remain unavailable in local bundles.
- Bundle activation and entry persistence are separate contracts and can be
  migrated independently.
- Candidate writes cannot corrupt the active bundle, and activation is an
  atomic pointer change rather than an in-place replacement.
- Users may edit current content without cloning a whole bundle, while history
  rows remain append-only.
- Asset storage remains simple until the full Mantle media workflow is needed.

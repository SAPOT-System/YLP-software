# Shared Engine

Four sub-domains, dependency order bottom→top:

| Sub-domain | Path | Depends on |
|---|---|---|
| core | `shared/core/` | nothing |
| crypto | `shared/crypto/` | core |
| peer | `shared/peer/` | core |
| connection | `shared/connection/` | core, crypto, peer |

Two more directories sit outside that ladder: `shared/components/` (cross-feature UI) and
`shared/hooks/` (the React entry points to the engine), plus `main-container.ts` itself.

**Rule:** sub-domains only import from themselves and sub-domains below them. This holds strictly
today.

Domain features (`chat/`, `auth/`, etc.) depend on the engine. The reverse is the weaker rule:
`main-container.ts` necessarily imports every concrete type it wires, and a few lower-layer files
still reach up into domain features. See
[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md#engine-sub-domains-featuresshared) for the
current list — don't add to it.

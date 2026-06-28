# Shared Engine

Four sub-domains, dependency order bottom→top:

| Sub-domain | Path | Depends on |
|---|---|---|
| core | `shared/core/` | nothing |
| crypto | `shared/crypto/` | core |
| peer | `shared/peer/` | core |
| connection | `shared/connection/` | core, crypto, peer |

**Rule:** sub-domains only import from themselves and sub-domains below them.
Domain features (`chat/`, `auth/`, etc.) depend on the engine — never the reverse.

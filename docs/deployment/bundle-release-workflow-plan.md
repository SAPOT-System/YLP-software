# Independent Deployment Bundle Release Workflow

## Summary

- Introduce the deployment bundle as an independent release unit starting at `0.0.1`.
- Publish bundles from annotated `bundle/vX.Y.Z` tags as dedicated GitHub Releases.
- Treat `bundle/v0.0.1` as a fresh first deployment. Existing locally built server-derived bundles receive no upgrade or rollback compatibility.
- Mirror the repository's existing component release conventions while adding bundle-specific build assets.

## Interfaces and Versioning

- Add `deploy/VERSION` as the bundle version source, initially `0.0.1`. The server version will no longer affect bundle naming, manifests, tags, or compatibility.
- Add a committed bundle policy containing `minimumUpgradeVersion` and `minimumRollbackVersion`, both initially `0.0.1`.
- Extend `scripts/release.sh` with `bundle`, updating `deploy/VERSION`, committing with the repository's deploy scope, and creating `bundle/vX.Y.Z`.
- Introduce manifest schema `2.0` with independent bundle versioning and explicit versions for the bundled server, admin, GSM service, and GSM firmware.
- Correct firmware validation to compare against the GSM service version instead of the bundle version.
- Use bundle-versioned Docker tags so future releases can coexist for rollback.

## Workflow and Build Changes

- Add a tag-triggered GitHub workflow that validates the tag, version, release policy, source commit, and annotated release notes.
- Download and checksum the national MBTiles source, crop Batangas, and validate the result before packaging.
- Add a low-disk build mode that saves images sequentially and removes no-longer-needed Docker data.
- Publish the bundle archive and its SHA-256 file through a draft release that becomes public only after both uploads succeed.
- Update versioning and deployment documentation for the independent bundle lifecycle.

## Verification

- Test policy validation, independent SemVer ordering, schema rejection, map integrity, and firmware-to-GSM compatibility.
- Run Bash syntax checks, deployment script tests, metadata validation tests, and a complete low-disk bundle build.
- Confirm `bundle/v0.0.1` creates one dedicated release without touching or depending on a `server/v*` release.

## Assumptions

- `bundle/v0.0.1` is only for fresh installation.
- No migration path is required for local `v0.1.0` or `v0.1.1` bundles.
- Every distributed rebuild receives a new bundle version even when component versions are unchanged.
- Publishing a GitHub Release does not deploy it to a live server.

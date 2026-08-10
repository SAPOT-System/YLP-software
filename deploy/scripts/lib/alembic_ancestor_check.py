#!/usr/bin/env python3
import argparse
import sys
from alembic.config import Config
from alembic.script import ScriptDirectory


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--versions-dir", required=True)
    parser.add_argument("--live-revision", required=True)
    parser.add_argument("--target-head", required=True)
    args = parser.parse_args()
    config = Config()
    config.set_main_option("script_location", args.versions_dir.rsplit("/versions", 1)[0])
    scripts = ScriptDirectory.from_config(config)
    revision = args.live_revision
    seen = set()
    while revision and revision not in seen:
        if revision == args.target_head:
            return 0
        seen.add(revision)
        script = scripts.get_revision(revision)
        if script is None:
            break
        down = script.down_revision
        revision = down[0] if isinstance(down, tuple) and len(down) == 1 else down
        if isinstance(revision, tuple):
            break
    print(f"target revision {args.target_head} is not an ancestor of {args.live_revision}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

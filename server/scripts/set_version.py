import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.version_writer import is_valid_version, render_version_module  # noqa: E402

VERSION_FILE = Path(__file__).resolve().parents[1] / "app" / "version.py"


def main() -> int:
    if len(sys.argv) != 2 or not is_valid_version(sys.argv[1]):
        print("Usage: set_version.py <X.Y.Z[-(alpha|beta|rc).N]>", file=sys.stderr)
        return 1
    VERSION_FILE.write_text(render_version_module(sys.argv[1]))
    print(f"Server version set to {sys.argv[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

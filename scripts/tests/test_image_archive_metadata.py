from __future__ import annotations

from io import BytesIO
import gzip
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from image_archive_metadata import inspect_archive


class ImageArchiveMetadataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.archive_path = Path(self.temporary_directory.name) / "image.tar"

    def write_archive(self, layers: list[tuple[str, bytes]]) -> None:
        config = "a" * 64
        entry = {
            "Config": f"blobs/sha256/{config}",
            "RepoTags": ["sapot/test:bundle"],
            "Layers": [name for name, _ in layers],
        }
        manifest = json.dumps([entry]).encode()
        with tarfile.open(self.archive_path, "w") as archive:
            for name, data in [("manifest.json", manifest), *layers]:
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, BytesIO(data))

    def test_reads_config_digest_and_unpacked_layer_sizes(self) -> None:
        raw = b"r" * 1024
        compressed_content = b"c" * 4096
        self.write_archive(
            [
                ("blobs/sha256/raw", raw),
                ("blobs/sha256/gzip", gzip.compress(compressed_content)),
            ]
        )

        digest, unpacked_size = inspect_archive(self.archive_path, "sapot/test:bundle")

        self.assertEqual("sha256:" + "a" * 64, digest)
        self.assertEqual(len(raw) + len(compressed_content), unpacked_size)

    def test_rejects_missing_tag(self) -> None:
        self.write_archive([])

        with self.assertRaisesRegex(ValueError, "cannot resolve"):
            inspect_archive(self.archive_path, "sapot/other:bundle")

    def test_rejects_unsupported_zstd_layer(self) -> None:
        self.write_archive([("blobs/sha256/zstd", b"\x28\xb5\x2f\xfddata")])

        with self.assertRaisesRegex(ValueError, "zstd-compressed"):
            inspect_archive(self.archive_path, "sapot/test:bundle")


if __name__ == "__main__":
    unittest.main()

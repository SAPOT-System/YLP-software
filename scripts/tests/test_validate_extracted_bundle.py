from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_extracted_bundle import contains_forbidden_ca_material


class ForbiddenCaMaterialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.directory = Path(self.temporary_directory.name)

    def test_allows_bundle_without_ca_material(self) -> None:
        (self.directory / "manifest.json").write_text("{}", encoding="utf-8")

        self.assertFalse(contains_forbidden_ca_material(self.directory))

    def test_detects_nested_ca_material(self) -> None:
        certs = self.directory / "config/certs"
        certs.mkdir(parents=True)

        for filename in ("server_ca.key", "server_ca.pem"):
            with self.subTest(filename=filename):
                path = certs / filename
                path.touch()
                self.assertTrue(contains_forbidden_ca_material(self.directory))
                path.unlink()

    def test_detects_certificate_generator(self) -> None:
        generator = self.directory / "docker/gen-certs.sh"
        generator.parent.mkdir()
        generator.touch()

        self.assertTrue(contains_forbidden_ca_material(self.directory))


if __name__ == "__main__":
    unittest.main()

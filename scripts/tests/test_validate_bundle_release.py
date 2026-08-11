from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_bundle_release import validate


class ValidateBundleReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.directory = Path(self.temporary_directory.name)
        self.version_file = self.directory / "VERSION"
        self.policy_file = self.directory / "policy.json"
        self.version_file.write_text("0.0.1\n", encoding="utf-8")
        self.write_policy("0.0.1", "0.0.1")

    def write_policy(self, minimum_upgrade: str, minimum_rollback: str) -> None:
        self.policy_file.write_text(
            json.dumps(
                {
                    "schemaVersion": "1.0",
                    "minimumUpgradeVersion": minimum_upgrade,
                    "minimumRollbackVersion": minimum_rollback,
                }
            ),
            encoding="utf-8",
        )

    def test_accepts_initial_family_when_floors_match_exactly(self) -> None:
        for version in ("0.0.1-alpha.1", "0.0.1-beta.1", "0.0.1-rc.1", "0.0.1"):
            self.version_file.write_text(version, encoding="utf-8")
            self.write_policy(version, version)
            self.assertEqual(version, validate(self.version_file, self.policy_file, f"bundle/v{version}")["version"])

    def test_accepts_later_prerelease_with_ordered_floors(self) -> None:
        self.version_file.write_text("0.0.2-rc.1", encoding="utf-8")
        self.write_policy("0.0.1-rc.1", "0.0.1-alpha.1")
        validate(self.version_file, self.policy_file)

    def test_rejects_tag_mismatch(self) -> None:
        with self.assertRaisesRegex(ValueError, "does not match"):
            validate(self.version_file, self.policy_file, "bundle/v0.0.2")

    def test_rejects_non_bundle_tag(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid bundle tag"):
            validate(self.version_file, self.policy_file, "server/v0.0.1")

    def test_rejects_upgrade_floor_at_or_above_bundle_version(self) -> None:
        self.version_file.write_text("0.0.2", encoding="utf-8")
        self.write_policy("0.0.2", "0.0.1")
        with self.assertRaisesRegex(ValueError, "must be older"):
            validate(self.version_file, self.policy_file)

    def test_rejects_rollback_newer_than_upgrade(self) -> None:
        self.version_file.write_text("0.0.2", encoding="utf-8")
        self.write_policy("0.0.1", "0.0.2-alpha.1")
        with self.assertRaisesRegex(ValueError, "cannot be newer"):
            validate(self.version_file, self.policy_file)

    def test_rejects_initial_family_with_different_floor(self) -> None:
        self.version_file.write_text("0.0.1-rc.1", encoding="utf-8")
        self.write_policy("0.0.1", "0.0.1")
        with self.assertRaisesRegex(ValueError, "fresh-install"):
            validate(self.version_file, self.policy_file)

    def test_rejects_zero_and_leading_zeroes(self) -> None:
        for version in ("0.0.0", "00.0.1", "0.01.1", "0.0.01", "0.0.1-rc.01"):
            with self.assertRaises(ValueError):
                validate(self.version_file, self.policy_file, candidate_version=version)

    def test_rejects_unknown_policy_fields(self) -> None:
        policy = json.loads(self.policy_file.read_text(encoding="utf-8"))
        policy["maximumRollbackVersion"] = "0.0.1"
        self.policy_file.write_text(json.dumps(policy), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "invalid policy keys"):
            validate(self.version_file, self.policy_file)


if __name__ == "__main__":
    unittest.main()

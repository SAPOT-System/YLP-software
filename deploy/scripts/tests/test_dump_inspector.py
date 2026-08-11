import gzip
import importlib.util
import json
import os
import sys
import tempfile
import unittest


ROOT = os.path.dirname(os.path.dirname(__file__))
SPEC = importlib.util.spec_from_file_location("dump_inspector", os.path.join(ROOT, "lib", "dump-inspector.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DumpInspectorTests(unittest.TestCase):
    def test_counts_empty_and_extended_rows_without_values_in_summary(self):
        inspector = MODULE.Inspector()
        inspector.feed(b"CREATE TABLE `empty_table` (id int);\n")
        inspector.feed(b"CREATE TABLE `message` (id int, body text);\n")
        inspector.feed(b"INSERT INTO `message` (id, body) VALUES (1, 'comma, and (paren)'),(2, 'text');\n")
        self.assertEqual(inspector.finish(), {"tables": {"empty_table": 0, "message": 2}, "totalRows": 2})

    def test_rejects_insert_for_unknown_table(self):
        inspector = MODULE.Inspector()
        with self.assertRaisesRegex(ValueError, "undeclared"):
            inspector.feed(b"INSERT INTO `unknown` VALUES (1);")

    def test_gzip_inspection_does_not_include_row_value(self):
        secret = "do-not-leak-row-value"
        with tempfile.TemporaryDirectory() as directory:
            dump = os.path.join(directory, "dump.gz")
            summary = os.path.join(directory, "summary.json")
            with gzip.open(dump, "wb") as out:
                out.write(("CREATE TABLE `message` (id int);\nINSERT INTO `message` VALUES (1, '%s');\n-- Dump completed\n" % secret).encode())
            fd = os.open(dump, os.O_RDONLY)
            try:
                old, sys.argv = sys.argv, ["dump-inspector.py", "--fd", str(fd), "--output", summary]
                self.assertEqual(MODULE.main(), 0)
            finally:
                sys.argv = old
                os.close(fd)
            with open(summary, encoding="utf-8") as result:
                self.assertNotIn(secret, result.read())

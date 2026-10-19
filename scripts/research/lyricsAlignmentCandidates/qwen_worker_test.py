"""Small protocol tests; never import the model or network libraries."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import py_compile
import subprocess
import sys

spec = importlib.util.spec_from_file_location("candidate_worker", Path(__file__).with_name("qwen_worker.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ProtocolTests(unittest.TestCase):
    def test_cache_isolation_must_apply_at_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "candidate_cache_probe.py"
            source.write_text("value = 'unbound-cache'\n", encoding="utf-8")
            py_compile.compile(str(source), invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)
            source.write_text("value = 'pinned-source'\n", encoding="utf-8")
            code = f"import sys; sys.path.insert(0, {str(root)!r}); import candidate_cache_probe; print(candidate_cache_probe.value)"
            base = [sys.executable, "-I", "-B"]
            cached = subprocess.check_output(base + ["-c", code], text=True).strip()
            isolated = subprocess.check_output(base + ["-X", f"pycache_prefix={root / 'fresh'}", "-c", code], text=True).strip()
            self.assertEqual(cached, "unbound-cache")
            self.assertEqual(isolated, "pinned-source")

    def test_pcm_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "w0.pcm").write_bytes(b"\0" * 4)
            self.assertEqual(worker.checked_audio(root, "w0"), root / "w0.pcm")
            for prefix in ("../w0", "w0.pcm", "測試", 1):
                with self.assertRaises(ValueError):
                    worker.checked_audio(root, prefix)
            (root / "w0.pcm").write_bytes(b"\0")
            with self.assertRaises(ValueError):
                worker.checked_audio(root, "w0")

    def test_text_boundary(self):
        self.assertEqual(worker.checked_text("你好", "zh"), "Chinese")
        for text, language in (("", "zh"), ("a" * 8193, "ja"), ("hi", "en")):
            with self.assertRaises(ValueError):
                worker.checked_text(text, language)
        with self.assertRaises(ValueError):
            worker.Worker().infer({"text": "你好", "language": "zh"})


if __name__ == "__main__":
    unittest.main()

"""Synthetic decoder boundary tests; no model, NumPy or third-party packages."""
import importlib.util
from pathlib import Path
import unittest
import hashlib
import sys
import tempfile
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("research_decoder", Path(__file__).with_name("decoder.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class OccurrenceTests(unittest.TestCase):
    def test_serialized_word_ends_do_not_change_onsets_or_occurrences(self):
        class NumericEnd:
            def __float__(self):
                return 1.6

        spans = worker.serialize_word_spans([0, 2], [
            SimpleNamespace(start=1.25, end=NumericEnd()),
            SimpleNamespace(start=2.4, end=float('nan')),
        ], 0.5)
        self.assertEqual(spans, [
            {"index": 0, "start": 1.75, "end": 2.1},
            {"index": 2, "start": 2.9},
        ])
        self.assertEqual(worker.serialize_word_spans([0], [SimpleNamespace(start=1, end=None)], 0),
                         [{"index": 0, "start": 1.0}])
    def test_english_dictionary_contractions_and_oov_are_explicit(self):
        decoder = worker.ResearchDecoder()
        decoder.dictionaries = {"en": {"don't": ["d", "ow", "n", "t"]}}
        decoder.vocab = {"vocab": {"SP": 0, "en/d": 1, "en/ow": 2, "en/n": 3, "en/t": 4}}
        result = decoder.prepare({"language": "en", "words": [{"text": "don’t", "roman": ["don't"]}]})
        self.assertEqual(result["words"], ["don’t"])
        self.assertEqual(result["phones"], ["SP", "en/d", "en/ow", "en/n", "en/t", "SP"])
        with self.assertRaises(ValueError):
            decoder.prepare({"language": "en", "words": [{"text": "inventedword", "roman": ["inventedword"]}]})

    def test_only_pinned_source_executes_not_init_or_cached_bytecode(self):
        previous = {name: sys.modules.get(name) for name in ["tools", "tools.align_word", "tools.decoder"]}
        try:
            with tempfile.TemporaryDirectory() as directory:
                vendor = Path(directory)
                (vendor / "tools/__pycache__").mkdir(parents=True)
                (vendor / "tools/__init__.py").write_text('raise RuntimeError("must not execute")', encoding="utf-8")
                (vendor / "tools/__pycache__/decoder.cpython-314.pyc").write_bytes(b"untrusted cache")
                sources = {"tools/align_word.py": "MARKER = True\n", "tools/decoder.py": "from tools.align_word import MARKER\nclass AlignmentDecoder: pass\n"}
                entries = {}
                for name, source in sources.items():
                    (vendor / name).write_text(source, encoding="utf-8")
                    encoded = source.encode("utf-8")
                    entries[name] = {"bytes": len(encoded), "sha256": hashlib.sha256(encoded).hexdigest()}
                self.assertEqual(worker.load_pinned_decoder(vendor, entries).__module__, "tools.decoder")
                (vendor / "tools/decoder.py").write_text("raise RuntimeError('changed')", encoding="utf-8")
                with self.assertRaises(ValueError):
                    worker.load_pinned_decoder(vendor, entries)
        finally:
            for name, value in previous.items():
                if value is None:
                    sys.modules.pop(name, None)
                else:
                    sys.modules[name] = value
    def test_skipped_silence_and_repeated_text_keep_occurrence(self):
        self.assertEqual(worker.word_occurrences([0, 1, 2, 4, 5], [-1, 0, 0, -1, 2, 2]), [0, 2])

    def test_backward_and_out_of_range_paths_are_rejected(self):
        for indices in [[2, 1], [9], [-1]]:
            with self.assertRaises(ValueError):
                worker.word_occurrences(indices, [-1, 0, 1])

    def test_phone_sequence_retains_sp_and_global_cl(self):
        words = [{"text": "っ", "roman": ["cl"]}, {"text": "歌", "roman": ["u", "ta"]}]
        result = worker.phone_sequence(words, "ja", {"cl": ["cl"], "u": ["u"], "ta": ["t", "a"]}, {"SP": 0, "cl": 0, "ja/u": 1, "ja/t": 2, "ja/a": 3})
        self.assertEqual(result["phoneToWord"], [-1, 0, -1, 1, 1, 1, -1])
        self.assertEqual(result["phones"][1], "cl")
        self.assertEqual(result["words"], ["っ", "歌"])

    def test_unsupported_readings_do_not_create_timing(self):
        with self.assertRaises(ValueError):
            worker.phone_sequence([{"text": "歌", "roman": ["unknown"]}], "ja", {}, {"SP": 0})

    def test_crops_are_bounded_integer_frames(self):
        self.assertEqual(worker.frame_bounds(1.1, 2.35, 3000, 0.01), (110, 235))
        for start, end in [(float("nan"), 1), (1, float("inf")), (-1, 1), (3, 2), (1, 40)]:
            with self.assertRaises(ValueError):
                worker.frame_bounds(start, end, 3000, 0.01)

    def test_excessive_phone_states_are_rejected_before_decoder_allocation(self):
        with self.assertRaises(ValueError):
            worker.phone_sequence([{"text": "あ", "roman": ["a"]}] * 300, "ja", {"a": ["a"]}, {"SP": 0, "ja/a": 1})


if __name__ == "__main__":
    unittest.main()

"""Private JSON-line research worker. No installation, network or activation."""
import ctypes
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import re
import sys
import types
from typing import Any

MAX_BYTES = 2_097_152
MAX_STATES = 512
MAX_FRAMES = 3004


def load_pinned_decoder(vendor: Path, entries: dict) -> type:
    """Compile only verified source; never execute package initializers or pyc."""
    sources = {}
    for name in ["tools/align_word.py", "tools/decoder.py"]:
        source = (vendor / name).read_text(encoding="utf-8").replace("\r\n", "\n")
        encoded = source.encode("utf-8")
        if len(encoded) != entries[name]["bytes"] or hashlib.sha256(encoded).hexdigest() != entries[name]["sha256"]:
            raise ValueError("decoder source integrity")
        sources[name] = source
    package = types.ModuleType("tools")
    package.__path__ = []
    sys.modules["tools"] = package
    for filename in ["align_word", "decoder"]:
        name = f"tools.{filename}"
        module = types.ModuleType(name)
        module.__file__ = str(vendor / f"tools/{filename}.py")
        module.__package__ = "tools"
        sys.modules[name] = module
        # Trusted upstream source was checked above; this bypasses import bytecode caches.
        exec(compile(sources[f"tools/{filename}.py"], module.__file__, "exec"), module.__dict__)
    return sys.modules["tools.decoder"].AlignmentDecoder


def word_occurrences(path: list[int], mapping: list[int]) -> list[int]:
    """Map the official decoded path by source occurrence, never by text."""
    result = []
    for index in path:
        if not 0 <= index < len(mapping):
            raise ValueError("invalid phone path")
        word = mapping[index]
        if word >= 0 and (not result or word != result[-1]):
            result.append(word)
    if any(a >= b for a, b in zip(result, result[1:])):
        raise ValueError("nonmonotonic occurrence path")
    return result


def serialize_word_spans(occurrences: list[int], words: list, offset: float) -> list[dict]:
    """Keep the original onset calculation; missing ends decline fine evidence only."""
    spans = []
    for index, word in zip(occurrences, words):
        span = {"index": int(index), "start": float(word.start) + offset}
        try:
            end = float(word.end)
        except (AttributeError, TypeError, ValueError, OverflowError):
            end = None
        if end is not None and math.isfinite(end):
            span["end"] = end + offset
        spans.append(span)
    return spans


def phone_sequence(words: list[dict], language: str, dictionary: dict, vocab: dict) -> dict:
    """Keep display words separate from dictionary readings and phone states."""
    phones, mapping, texts = ["SP"], [-1], []
    for index, word in enumerate(words):
        values = []
        for key in word["roman"]:
            if key not in dictionary:
                raise ValueError("unsupported reading")
            values.extend(dictionary[key])
        if not values:
            raise ValueError("empty pronunciation")
        texts.append(word["text"])
        for value in values:
            symbol = "cl" if value == "cl" and vocab.get("cl") == 0 else f"{language}/{value}"
            if symbol not in vocab:
                raise ValueError("unsupported phone")
            phones.append(symbol)
            mapping.append(index)
        phones.append("SP")
        mapping.append(-1)
    if len(phones) > MAX_STATES or not texts:
        raise ValueError("phone budget")
    return {"phones": phones, "phoneToWord": mapping, "words": texts}


def frame_bounds(begin: float, end: float, total: int, hop: float) -> tuple[int, int]:
    """Reject invalid or unbounded crops before allocating decoder matrices."""
    if not all(math.isfinite(v) for v in [begin, end, hop]) or not 0 <= begin < end or end - begin > 20.701 or hop <= 0:
        raise ValueError("invalid decoder interval")
    left, right = int(begin / hop), int(math.ceil(end / hop))
    if not 0 <= left < right <= total <= MAX_FRAMES:
        raise ValueError("decoder frame budget")
    return left, right


def peak_rss_bytes() -> int | None:
    """OS working-set high-water mark includes allocations during decode."""
    if sys.platform != "win32":
        import resource
        return int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024)
    size = ctypes.c_size_t

    class Counters(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("faults", ctypes.c_ulong)] + [
            (name, size) for name in ["peak", "working", "peak_paged", "paged", "peak_nonpaged", "nonpaged", "pagefile", "peak_pagefile"]
        ]

    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    kernel, psapi = ctypes.windll.kernel32, ctypes.windll.psapi
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return int(counters.peak)


class ResearchDecoder:
    def __init__(self) -> None:
        self.ready = False

    def initialize(self, request: dict) -> dict:
        if self.ready:
            raise ValueError("already initialized")
        config = request["config"]
        environment = Path(config["environmentPath"]).resolve(strict=True)
        vendor = Path(config["vendorDir"]).resolve(strict=True)
        self.workspace = Path(request["workspace"]).resolve(strict=True)
        # An empty per-job cache prefix prevents loading unbound environment pyc.
        sys.pycache_prefix = str(self.workspace / "python-cache")
        sys.dont_write_bytecode = True
        sys.path.insert(0, str(environment))
        import numpy as np
        import pypinyin
        manifest = json.loads(Path(__file__).with_name("manifest.json").read_text(encoding="utf-8"))
        AlignmentDecoder = load_pinned_decoder(vendor, manifest["vendor"])
        for module in [np, pypinyin]:
            if not Path(module.__file__).resolve().is_relative_to(environment):
                raise ValueError("environment isolation")
        expected = {"numpy": "2.5.2", "pypinyin": "0.55.0"}
        if {distribution.metadata["Name"].lower() for distribution in importlib.metadata.distributions(path=[str(environment)])} != set(expected):
            raise ValueError("unexpected environment packages")
        if any(importlib.metadata.version(name) != version for name, version in expected.items()) or sys.version_info[:3] != (3, 14, 7):
            raise ValueError("runtime version")
        self.np, self.pypinyin, self.decoder_type = np, pypinyin, AlignmentDecoder
        model = Path(config["modelDir"])
        self.vocab = json.loads((model / "vocab.json").read_text(encoding="utf-8"))
        self.config = json.loads((model / "config.json").read_text(encoding="utf-8"))["mel_spec_config"]
        self.hop = self.config["hop_size"] / self.config["sample_rate"]
        self.dictionaries = {}
        for language, filename in [("zh", "ds-zh-pinyin-lite.txt"), ("ja", "japanese_dict_full.txt"), ("en", "ds_cmudict-07b.txt")]:
            self.dictionaries[language] = dict(
                (parts[0], parts[1].split()) for line in (model / filename).read_text(encoding="utf-8").splitlines()
                if len(parts := line.split("\t")) == 2
            )
        self.ready = True
        return {"ready": True, "python": sys.version.split()[0], "packages": expected, "peakRssBytes": peak_rss_bytes()}

    def prepare(self, request: dict) -> dict:
        words, language = request["words"], request["language"]
        if language not in self.dictionaries or not 0 < len(words) <= 2000:
            raise ValueError("unsupported language")
        if language == "zh":
            readings = self.pypinyin.lazy_pinyin("".join(w["text"] for w in words), style=self.pypinyin.Style.NORMAL, errors=lambda chars: list(chars))
            if len(readings) != len(words):
                raise ValueError("ambiguous reading")
            words = [dict(word, roman=[reading]) for word, reading in zip(words, readings)]
        return phone_sequence(words, language, self.dictionaries[language], self.vocab["vocab"])

    def decode(self, request: dict) -> dict:
        prefix = request["prefix"]
        if not isinstance(prefix, str) or not re.fullmatch(r"window-\d{1,5}", prefix):
            raise ValueError("logit path")
        frames = request["frames"]
        if not isinstance(frames, int) or not 1 <= frames <= MAX_FRAMES:
            raise ValueError("frame count")
        supplied = request["prepared"]
        if not 0 < len(supplied["phones"]) <= MAX_STATES or len(supplied["phones"]) != len(supplied["phoneToWord"]):
            raise ValueError("phone budget")
        frame_file, edge_file = [self.workspace / f"{prefix}-{kind}.bin" for kind in ["frame", "edge"]]
        if frame_file.stat().st_size != 144 * frames * 4 or edge_file.stat().st_size != frames * 4:
            raise ValueError("logit size")
        left, right = frame_bounds(request["begin"], request["end"], frames, self.hop)
        np = self.np
        frame = np.memmap(frame_file, dtype="<f4", mode="r", shape=(1, 144, frames))
        edge = np.memmap(edge_file, dtype="<f4", mode="r", shape=(1, frames))
        if not np.isfinite(frame[:, :, left:right]).all() or not np.isfinite(edge[:, left:right]).all():
            raise ValueError("nonfinite logits")
        decoder = self.decoder_type(self.vocab, self.config["sample_rate"], self.config["hop_size"])
        words, confidence = decoder.decode(frame[:, :, left:right], edge[:, left:right], (right - left) * self.hop,
                                           supplied["phones"], supplied["words"], supplied["phoneToWord"])
        occurrences = word_occurrences(decoder.ph_idx_seq, supplied["phoneToWord"])
        if len(occurrences) != len(words):
            raise ValueError("word occurrence mismatch")
        spans = serialize_word_spans(occurrences, words, left * self.hop)
        if not all(math.isfinite(span["start"]) for span in spans) or not math.isfinite(float(confidence)):
            raise ValueError("nonfinite decoder output")
        del frame, edge, decoder, words
        return {"spans": spans, "confidence": float(confidence), "peakRssBytes": peak_rss_bytes()}


def main() -> None:
    worker = ResearchDecoder()
    while raw := sys.stdin.buffer.readline(MAX_BYTES + 1):
        if len(raw) > MAX_BYTES or not raw.endswith(b"\n"):
            return
        request: dict[str, Any] = json.loads(raw)
        command = request.get("command")
        try:
            if command == "initialize":
                result = worker.initialize(request)
            elif worker.ready and command == "prepare":
                result = worker.prepare(request)
            elif worker.ready and command == "decode":
                result = worker.decode(request)
            else:
                raise ValueError("unknown command")
            response = {"id": request["id"], "ok": True, "result": result}
        except (ValueError, KeyError, TypeError, IndexError, OSError, ImportError, RuntimeError):
            # Third-party exceptions may embed lyrics or paths; never send their text.
            response = {"id": request["id"], "ok": False, "code": "RESEARCH_DECODER_FAILED"}
        data = json.dumps(response, ensure_ascii=False, allow_nan=False).encode("utf-8") + b"\n"
        if len(data) > MAX_BYTES:
            return
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()

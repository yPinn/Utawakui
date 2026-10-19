"""Offline, bounded Silero TorchScript frame probabilities; no hub or audio I/O."""
import array
from collections.abc import Sequence
import contextlib
import json
import math
from pathlib import Path
import sys
import time
from typing import Any

MAX_BYTES = 2_097_152


def decode_pcm(raw: bytes) -> array.array:
    if not raw or len(raw) % 4 or len(raw) > 1_920_000:
        raise ValueError("PCM budget")
    samples = array.array("f", raw)
    if any(not math.isfinite(x) or abs(x) > 1.000001 for x in samples):
        raise ValueError("PCM samples")
    return samples


def infer_frames(model: Any, torch: Any, samples: Sequence[float]) -> list[float]:
    model.reset_states()
    probabilities = []
    for offset in range(0, len(samples), 512):
        values = list(samples[offset:offset + 512])
        values.extend([0.] * (512 - len(values)))
        value = float(model(torch.tensor(values, dtype=torch.float32), 16000).item())
        if not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError("VAD probability")
        probabilities.append(value)
    return probabilities


class Worker:
    def __init__(self) -> None:
        self.model = None
        self.torch = None
        self.root = None

    def initialize(self, message: dict) -> dict:
        if self.model is not None:
            raise ValueError("initialized")
        import torch
        torch.set_num_threads(1)
        torch.set_num_interop_threads(1)
        self.root = Path(message["workspace"]).resolve(strict=True)
        model = Path(message["modelPath"]).resolve(strict=True)
        if not model.is_file() or model.stat().st_size > 8_388_608:
            raise ValueError("model budget")
        self.model = torch.jit.load(str(model), map_location="cpu").eval()
        self.torch = torch
        return {"ready": True, "torch": torch.__version__, "threads": torch.get_num_threads()}

    def infer(self, message: dict) -> dict:
        if self.model is None:
            raise ValueError("not initialized")
        prefix = message["prefix"]
        if not isinstance(prefix, str) or not prefix.startswith("w") or not prefix[1:].isdigit() or len(prefix) > 8:
            raise ValueError("prefix")
        file = self.root / f"{prefix}.pcm"
        if file.is_symlink() or file.stat().st_size > 1_920_000:
            raise ValueError("PCM budget")
        samples = decode_pcm(file.read_bytes())
        with self.torch.inference_mode():
            probabilities = infer_frames(self.model, self.torch, samples)
        import psutil
        memory = psutil.Process().memory_info()
        return {"probabilities": probabilities, "peakRssBytes": memory.peak_wset,
                "peakPrivateBytes": memory.peak_pagefile}


def main() -> None:
    worker = Worker()
    while True:
        raw = sys.stdin.buffer.readline(MAX_BYTES + 1)
        if not raw or len(raw) > MAX_BYTES or not raw.endswith(b"\n"):
            return
        message = json.loads(raw)
        started = time.monotonic()
        try:
            with contextlib.redirect_stdout(sys.stderr):
                if message["command"] == "initialize":
                    result = worker.initialize(message)
                elif message["command"] == "infer":
                    result = worker.infer(message)
                else:
                    raise ValueError("command")
            result["seconds"] = time.monotonic() - started
            response = {"id": message["id"], "ok": True, "result": result}
        except Exception as error:
            response = {"id": message["id"], "ok": False, "error": type(error).__name__}
        print(json.dumps(response, ensure_ascii=True, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()

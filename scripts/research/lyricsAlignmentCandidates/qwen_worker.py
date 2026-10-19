"""Offline research RPC worker; paths come only from the private local runner."""
import contextlib
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any

MAX_BYTES = 2_097_152


def checked_audio(workspace: Path, prefix: str) -> Path:
    if not isinstance(prefix, str) or not prefix.isascii() or not prefix.isalnum():
        raise ValueError("invalid PCM prefix")
    file = workspace / (prefix + ".pcm")
    if file.is_symlink() or not 0 < file.stat().st_size <= 30 * 16000 * 4 or file.stat().st_size % 4:
        raise ValueError("invalid PCM file")
    return file


def checked_text(text: str, language: str) -> str:
    if language not in ("zh", "ja") or not isinstance(text, str) or not 0 < len(text) <= 8192:
        raise ValueError("invalid alignment text")
    return {"zh": "Chinese", "ja": "Japanese"}[language]


class Worker:
    def __init__(self) -> None:
        self.model = None
        self.workspace = None

    def initialize(self, message: dict[str, Any]) -> dict[str, Any]:
        if self.model is not None:
            raise ValueError("already initialized")
        self.workspace = Path(message["workspace"]).resolve(strict=True)
        vendor = Path(message["vendorDir"]).resolve(strict=True)
        model = Path(message["modelDir"]).resolve(strict=True)
        if not self.workspace.is_dir() or not vendor.is_dir() or not model.is_dir():
            raise ValueError("invalid local directory")
        cache = self.workspace / "cache"
        cache.mkdir(exist_ok=True)
        sys.dont_write_bytecode = True
        sys.pycache_prefix = str(cache)
        os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", HF_HOME=str(cache), NUMBA_CACHE_DIR=str(cache), TOKENIZERS_PARALLELISM="false")
        sys.path.insert(0, str(vendor))
        import torch
        from qwen_asr import Qwen3ForcedAligner
        torch.set_num_threads(4)
        torch.set_num_interop_threads(1)
        self.model = Qwen3ForcedAligner.from_pretrained(str(model), dtype=torch.float32, device_map="cpu", attn_implementation="eager", local_files_only=True, trust_remote_code=False)
        return {"ready": True, "torch": torch.__version__, "threads": torch.get_num_threads()}

    def infer(self, message: dict[str, Any]) -> dict[str, Any]:
        if self.model is None:
            raise ValueError("not initialized")
        language = checked_text(message["text"], message["language"])
        file = checked_audio(self.workspace, message["prefix"])
        import numpy as np
        import psutil
        audio = np.fromfile(file, dtype="<f4")
        if not np.isfinite(audio).all() or np.max(np.abs(audio)) > 1.001:
            raise ValueError("invalid PCM samples")
        aligned = self.model.align(audio=(audio, 16000), text=message["text"], language=language)[0]
        spans = [{"text": item.text, "start": item.start_time, "end": item.end_time} for item in aligned.items]
        if len(spans) > 4096 or any(not math.isfinite(s["start"]) or not math.isfinite(s["end"]) for s in spans):
            raise ValueError("invalid alignment response")
        return {"spans": spans, "peakRssBytes": psutil.Process().memory_info().peak_wset}


def main() -> None:
    worker = Worker()
    while True:
        raw = sys.stdin.buffer.readline(MAX_BYTES + 1)
        if not raw:
            return
        if len(raw) > MAX_BYTES or not raw.endswith(b"\n"):
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
                    raise ValueError("invalid worker command")
            result["seconds"] = time.monotonic() - started
            response = {"id": message["id"], "ok": True, "result": result}
        except Exception as error:
            # Private research output contains only the exception class, never paths/text.
            response = {"id": message["id"], "ok": False, "error": type(error).__name__}
        encoded = json.dumps(response, ensure_ascii=True, allow_nan=False)
        if len(encoded.encode("utf-8")) > MAX_BYTES:
            return
        print(encoded, flush=True)


if __name__ == "__main__":
    main()

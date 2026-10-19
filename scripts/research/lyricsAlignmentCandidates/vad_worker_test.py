"""Protocol tests require no model or network."""
import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location("vad_worker", Path(__file__).with_name("vad_worker.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class VadTests(unittest.TestCase):
    def test_pcm_budget_and_finiteness(self):
        for raw in (b"", b"123", struct.pack("f", float("nan")), struct.pack("f", 1.1), b"\0"*(1920000+4)):
            with self.assertRaises(ValueError): module.decode_pcm(raw)
        self.assertEqual(list(module.decode_pcm(struct.pack("ff", 0., -.5))), [0., -.5])

    def test_frames_reset_and_last_padding(self):
        class Torch:
            float32 = None
            @staticmethod
            def tensor(values, dtype=None): return values
        class Result:
            def item(self): return .75
        class Model:
            def __init__(self): self.resets=0; self.calls=[]
            def reset_states(self): self.resets+=1
            def __call__(self, values, rate): self.calls.append((list(values),rate)); return Result()
        model=Model()
        self.assertEqual(module.infer_frames(model,Torch(),[0.]*512+[.25]),[.75,.75])
        module.infer_frames(model,Torch(),[0.]*512)
        self.assertEqual(model.resets,2)
        self.assertEqual([(len(v),rate) for v,rate in model.calls],[(512,16000)]*3)
        self.assertEqual(model.calls[1][0],[.25]+[0.]*511)

    def test_invalid_probability_rejected(self):
        class Torch:
            float32=None
            @staticmethod
            def tensor(values,dtype=None): return values
        class Model:
            def reset_states(self): pass
            def __call__(self,*args): return self
            def item(self): return float("nan")
        with self.assertRaises(ValueError): module.infer_frames(Model(),Torch(),[0.])

if __name__ == "__main__": unittest.main()

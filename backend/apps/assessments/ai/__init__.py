"""
AI assist for the Response Phase (docs/14).

One narrow job: read what the examinee said on each card in the first round and
point at the words that carry a **documented** R-PAS content category — the
percepts a coder would look at when filling in `coding.content`.

Three rules hold this package together:

* it is a **hint layer**, never a coder. Nothing here writes `coding`; the
  psychologist keeps the decision (docs/10 §5).
* the model is reached through an OpenAI-compatible **Iranian relay** (AvalAI by
  default), configured entirely from the environment.
* the relay is optional. With no key, no credit or no network, detection falls
  back to the local lexicon and the endpoint still answers.
"""
from apps.assessments.ai.detection import Detection, DetectionRun, run_detection

__all__ = ["Detection", "DetectionRun", "run_detection"]

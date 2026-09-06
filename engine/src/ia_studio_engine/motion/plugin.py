"""Local Kimodo SOMA inference; never use upstream download or text-service dispatch."""

from __future__ import annotations

import math
from pathlib import Path

from ia_studio_engine.adapters.loading import LoadRefusedError
from ia_studio_engine.core.jobqueue import CancelledError
from ia_studio_engine.motion.gltf import motion_glb

MODEL_ID = "kimodo-soma-rp-v1.1"


def load(folder: str, on: str):
    root = Path(folder).resolve()
    _local_files(root, on)
    try:
        from kimodo.model.kimodo_model import Kimodo
        from kimodo.model.twostage_denoiser import TwostageDenoiser
        from kimodo.motion_rep import KimodoMotionRep
        from kimodo.skeleton import SOMASkeleton30
        from safetensors.torch import load_file
    except ImportError as error:
        raise LoadRefusedError("the pinned motion engine package is not installed") from error

    representation = KimodoMotionRep(
        skeleton=SOMASkeleton30(), fps=30, stats_path=str(root / "stats/motion")
    )
    denoiser = TwostageDenoiser(
        motion_rep=representation,
        motion_mask_mode="concat",
        llm_shape=[1, 4096],
        use_text_mask=False,
        latent_dim=1024,
        ff_size=2048,
        num_layers=16,
        num_heads=8,
        activation="gelu",
        dropout=0.0,
        pe_dropout=0.0,
        norm_first=False,
        num_text_tokens_override=50,
        input_first_heading_angle=True,
    )
    state = load_file(str(root / "model.safetensors"))
    denoiser.load_state_dict(
        {key.replace("denoiser.backbone.", ""): value for key, value in state.items()}, strict=True
    )
    del state
    return Kimodo(
        denoiser=denoiser,
        text_encoder=_encoder(root, on),
        num_base_steps=1000,
        cfg_type="separated",
        device=on,
    ).eval()


def _local_files(root: Path, on: str):
    required = [
        "model.safetensors",
        "encoder/config.json",
        "encoder/tokenizer.json",
        "encoder/model.safetensors.index.json",
        "mntp/adapter_config.json",
        "mntp/adapter_model.safetensors",
        "adapter/adapter_config.json",
        "adapter/adapter_model.safetensors",
    ]
    required += [
        f"stats/motion/{part}/{stat}.npy"
        for part in ("body", "global_root", "local_root")
        for stat in ("mean", "std")
    ]
    if any(not (root / name).is_file() for name in required):
        raise LoadRefusedError("the complete local motion and text encoder files are required")
    if on not in ("cpu", "cuda"):
        raise LoadRefusedError("motion inference currently supports CPU and CUDA")


def _encoder(root: Path, on: str):
    import torch
    from kimodo.model.llm2vec.llm2vec import LLM2Vec
    from kimodo.model.llm2vec.llm2vec_wrapper import LLM2VecEncoder
    from peft import PeftModel
    from transformers import AutoConfig, AutoTokenizer

    base = str(root / "encoder")
    tokenizer = AutoTokenizer.from_pretrained(base, local_files_only=True, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"
    config = AutoConfig.from_pretrained(base, local_files_only=True, trust_remote_code=False)
    if config.model_type != "llama" or config.hidden_size != 4096:
        raise LoadRefusedError("incompatible local text encoder")
    model_class = LLM2Vec._get_model_class(config.__class__.__name__, enable_bidirectional=True)
    model = model_class.from_pretrained(
        base,
        local_files_only=True,
        trust_remote_code=False,
        use_safetensors=True,
        torch_dtype=torch.bfloat16,
    )
    model = PeftModel.from_pretrained(
        model, str(root / "mntp"), local_files_only=True, is_trainable=False
    ).merge_and_unload()
    model = PeftModel.from_pretrained(
        model, str(root / "adapter"), local_files_only=True, is_trainable=False
    )
    model.config._name_or_path = "meta-llama/Meta-Llama-3-8B-Instruct"
    encoder = LLM2VecEncoder.__new__(LLM2VecEncoder)
    encoder.llm_dim = 4096
    encoder._device = on
    encoder.model = (
        LLM2Vec(model=model, tokenizer=tokenizer, pooling_mode="mean", max_length=512).to(on).eval()
    )
    return encoder


def generate(model, params, destination, on):
    run_motion(model, params, destination, on, None, lambda: False)


def _parameters(params):
    prompt = params.get("prompt")
    seconds = params.get("seconds", 5)
    steps = params.get("steps", 50)
    seed = params.get("seed", 1)
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000:
        raise LoadRefusedError("motion generation needs a prompt")
    if (
        not isinstance(seconds, (int, float))
        or not math.isfinite(seconds)
        or not 1 <= seconds <= 30
    ):
        raise LoadRefusedError("motion duration must be between 1 and 30 seconds")
    if not isinstance(steps, int) or not 1 <= steps <= 100:
        raise LoadRefusedError("motion steps must be between 1 and 100")
    if not isinstance(seed, int) or not 0 <= seed < 2**32:
        raise LoadRefusedError("invalid motion seed")

    return prompt, seconds, steps, seed


def run_motion(model, params, destination, on, on_step, stopping):
    def check():
        if stopping and stopping():
            raise CancelledError("the motion generation was cancelled")

    check()
    prompt, seconds, steps, seed = _parameters(params)

    import torch

    def progress(indices):
        for index, value in enumerate(indices):
            check()
            if on_step:
                on_step(index, len(indices))
            yield value
        check()

    devices = [torch.cuda.current_device()] if on == "cuda" else []
    with torch.random.fork_rng(devices=devices), torch.inference_mode():
        torch.manual_seed(seed)
        output = model(
            [prompt],
            [round(seconds * model.fps)],
            num_denoising_steps=steps,
            num_samples=1,
            multi_prompt=True,
            post_processing=False,
            return_numpy=False,
            progress_bar=progress,
        )
    check()
    data = _export_motion(model, output, seed)
    check()
    Path(destination).write_bytes(data)


def _export_motion(model, output, seed):
    from kimodo.geometry import matrix_to_quaternion
    from kimodo.skeleton import global_rots_to_local_rots

    skeleton = model.output_skeleton
    local = global_rots_to_local_rots(output["global_rot_mats"][0], skeleton)
    rotations = matrix_to_quaternion(local).detach().cpu().numpy()[..., [1, 2, 3, 0]]
    data = motion_glb(
        names=list(skeleton.bone_order_names),
        parents=skeleton.joint_parents.cpu().tolist(),
        rest=skeleton.neutral_joints.cpu().numpy(),
        rotations=rotations,
        root=output["posed_joints"][0, :, skeleton.root_idx].detach().cpu().numpy(),
        fps=model.fps,
        provenance={
            "model": MODEL_ID,
            "seed": seed,
            "profile": "soma77-tpose-v1",
            "predictedJoints": 30,
            "outputJoints": 77,
        },
    )
    return data

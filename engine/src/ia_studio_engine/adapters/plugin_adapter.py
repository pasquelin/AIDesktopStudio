"""
Adapters for the families diffusers does not open. `PLUGINS`, at the foot of this file, names them.

The Python is ours (vendored or an extra). Weights stay in the digested folder, with no `.py`.
`torch.load(..., weights_only=True)` is the pickle path — PyTorch 2.6 refuses reducers.
"""

from __future__ import annotations

import sys
from functools import partial
from pathlib import Path
from typing import Any

from ia_studio_engine.adapters.device import (
    device,
    held_bytes,
    release_cache,
    result_frame,
    tensor_bytes,
)
from ia_studio_engine.adapters.loading import (
    NEEDS_PICTURE,
    NEEDS_PROMPT,
    LoadRefusedError,
    quietened,
    refuse_reason,
)
from ia_studio_engine.adapters.params import filled, knob, text
from ia_studio_engine.adapters.plugin_contract import Plugin
from ia_studio_engine.adapters.plugin_runtime import PluginAdapter
from ia_studio_engine.autorig import plugin as autorig_plugin
from ia_studio_engine.motion import plugin as motion_plugin

__all__ = [
    "PLUGINS",
    "Plugin",
    "PluginAdapter",
    "device",
    "held_bytes",
    "is_plugin_model",
    "quietened",
    "refuse_reason",
    "release_cache",
    "result_frame",
    "tensor_bytes",
]

_VENDOR = Path(__file__).resolve().parent.parent / "vendor"
if str(_VENDOR) not in sys.path:
    sys.path.insert(0, str(_VENDOR))


def _torch_load(path: Path) -> Any:
    import torch

    payload = torch.load(path, map_location="cpu", weights_only=True)
    if isinstance(payload, dict) and "state_dict" in payload:
        return payload["state_dict"]
    return payload


def _forget_local_repos() -> None:
    """`_load_craftsman` writes a module global; a folder it names may be gone by the next load."""
    encoders = sys.modules.get("craftsman.models.conditional_encoders.cond_encoder")
    if encoders is not None:
        encoders.LOCAL_CONFIGS = {}


def _carve(handle: dict[str, Any], picture: Any, mode: str) -> Any:
    """One `new_session()` per load, not per generation: it reads and initialises 176 MB."""
    return _require("rembg", "plugin").remove(picture.convert(mode), session=handle.get("rembg"))


def _picture(params: dict[str, Any]) -> Any:
    image = filled(params, "image")
    if image is None:
        # These families read a picture; the prompt-or-source refusal is a diffusers answer.
        raise LoadRefusedError(NEEDS_PICTURE)
    from PIL import Image

    # Read through rather than left lazy: the handle would otherwise stay open until a collection,
    # and a door lives for hours.
    with Image.open(str(image)) as opened:
        return opened.copy()


def _require(module: str, extra: str) -> Any:
    try:
        return __import__(module, fromlist=["*"])
    except ImportError as error:
        raise LoadRefusedError(f"{module} is not installed (extra {extra})") from error


def _load_triposr(folder: str, on: str) -> Any:
    tsr_system = _require("tsr.system", "plugin")
    from omegaconf import OmegaConf

    cfg = OmegaConf.load(str(Path(folder) / "config.yaml"))
    model = tsr_system.TSR(cfg)
    model.load_state_dict(_torch_load(Path(folder) / "model.ckpt"))
    model.to(on)
    model.eval()
    return model


def _run_triposr(model: Any, params: dict[str, Any], destination: str, on: str) -> None:
    import torch

    picture = _picture(params).convert("RGB")
    with torch.no_grad():
        codes = model([picture], device=on)
        meshes = model.extract_mesh(codes, has_vertex_color=True, resolution=256)
    meshes[0].export(destination)


def _load_trellis(folder: str, _on: str, text: bool) -> Any:
    pipelines = _require("trellis.pipelines", "plugin")
    cls = pipelines.TrellisTextTo3DPipeline if text else pipelines.TrellisImageTo3DPipeline
    pipeline = cls.from_pretrained(folder)
    pipeline.cuda()
    return pipeline


def _run_trellis(
    pipeline: Any, params: dict[str, Any], destination: str, _on: str, from_words: bool
) -> None:
    seed = knob(params, "seed", int, 1)
    if from_words:
        prompt = text(params, "prompt")
        if prompt is None:
            raise LoadRefusedError(NEEDS_PROMPT)
        outputs = pipeline.run(prompt, seed=seed)
    else:
        outputs = pipeline.run(_picture(params).convert("RGB"), seed=seed)

    gaussians = outputs.get("gaussian") if isinstance(outputs, dict) else None
    if gaussians:
        gaussians[0].save_ply(destination)
        return
    meshes = outputs.get("mesh") if isinstance(outputs, dict) else None
    if meshes:
        meshes[0].export(destination)
        return
    raise LoadRefusedError("TRELLIS returned no mesh")


def _load_trellis2(folder: str, _on: str) -> Any:
    pipelines = _require("trellis2.pipelines", "plugin")
    pipeline = pipelines.Trellis2ImageTo3DPipeline.from_pretrained(folder)
    pipeline.cuda()
    return pipeline


def _run_trellis2(pipeline: Any, params: dict[str, Any], destination: str, _on: str) -> None:
    result = pipeline.run(_picture(params).convert("RGB"))
    mesh = result[0] if isinstance(result, list | tuple) else result
    if hasattr(mesh, "export"):
        mesh.export(destination)
        return
    if hasattr(mesh, "save_ply"):
        mesh.save_ply(destination)
        return
    raise LoadRefusedError("TRELLIS.2 returned no mesh")


def _load_triposg(folder: str, _on: str) -> Any:
    _require("triposg.pipelines.pipeline_triposg", "plugin")
    from triposg.pipelines.pipeline_triposg import TripoSGPipeline

    pipeline = TripoSGPipeline.from_pretrained(folder, local_files_only=True)
    pipeline.to("cuda")
    return {"pipeline": pipeline, "rembg": _require("rembg", "plugin").new_session()}


def _run_triposg(handle: dict[str, Any], params: dict[str, Any], destination: str, on: str) -> None:
    import torch

    picture = _carve(handle, _picture(params), "RGB").convert("RGB")
    outputs = handle["pipeline"](
        image=picture,
        generator=torch.Generator(device=on).manual_seed(knob(params, "seed", int, 1)),
        num_inference_steps=knob(params, "steps", int, 50),
        guidance_scale=knob(params, "cfgScale", float, 7.0),
    ).samples[0]
    trimesh = _require("trimesh", "plugin")
    trimesh.Trimesh(outputs[0].astype("float32"), outputs[1]).export(destination)


# `configs/instant-nerf-large.yaml` of the InstantMesh repository. The checkpoint is loaded with
# strict=True, so a figure that drifts refuses the load rather than opening a wrong model.
INSTANT_NERF_LARGE = {
    "encoder_feat_dim": 768,
    "encoder_freeze": False,
    "transformer_dim": 1024,
    "transformer_layers": 16,
    "transformer_heads": 16,
    "triplane_low_res": 32,
    "triplane_high_res": 64,
    "triplane_dim": 80,
    "rendering_samples_per_ray": 128,
}


def _load_instantmesh(folder: str, on: str) -> Any:
    import torch

    _require("instantmesh.zero123plus", "plugin")
    from diffusers import EulerAncestralDiscreteScheduler
    from instantmesh.camera import get_zero123plus_input_cameras
    from instantmesh.models.lrm import InstantNeRF
    from instantmesh.zero123plus import Zero123PlusPipeline

    root = Path(folder)
    views = Zero123PlusPipeline.from_pretrained(
        folder, local_files_only=True, torch_dtype=torch.float16
    )
    views.scheduler = EulerAncestralDiscreteScheduler.from_config(
        views.scheduler.config, timestep_spacing="trailing"
    )
    views.to(on)

    shape = InstantNeRF(encoder_model_name=str(root / "dino"), **INSTANT_NERF_LARGE)
    weights = _torch_load(root / "lrm/instant_nerf_large.ckpt")
    lrm = "lrm_generator."
    shape.load_state_dict(
        {key[len(lrm) :]: value for key, value in weights.items() if key.startswith(lrm)},
        strict=True,
    )
    del weights
    shape.to(on).eval()
    return {
        "views": views,
        "shape": shape,
        "cameras": get_zero123plus_input_cameras(batch_size=1, radius=4.0).to(on),
        "rembg": _require("rembg", "plugin").new_session(),
    }


def _run_instantmesh(
    handle: dict[str, Any], params: dict[str, Any], destination: str, on: str
) -> None:
    import numpy as np
    import torch
    from einops import rearrange
    from instantmesh.framing import resize_foreground
    from torchvision.transforms import v2

    picture = resize_foreground(_carve(handle, _picture(params), "RGBA"), 0.85)

    # One 640x960 sheet of six views, which the reconstruction reads as a batch of six.
    sheet = handle["views"](
        picture,
        num_inference_steps=knob(params, "steps", int, 75),
        guidance_scale=knob(params, "cfgScale", float, 4.0),
        generator=torch.Generator(device=on).manual_seed(knob(params, "seed", int, 1)),
    ).images[0]
    views = torch.from_numpy(np.asarray(sheet, dtype=np.float32) / 255.0)
    views = rearrange(views.permute(2, 0, 1).contiguous(), "c (n h) (m w) -> (n m) c h w", n=3, m=2)
    views = v2.functional.resize(views.unsqueeze(0).to(on), 320, antialias=True).clamp(0, 1)

    with torch.no_grad():
        planes = handle["shape"].forward_planes(views, handle["cameras"])
        vertices, faces, colours = handle["shape"].extract_mesh(planes)

    trimesh = _require("trimesh", "plugin")
    # The repository's own glTF convention, which is the one this studio's viewer reads.
    turned = vertices @ np.array([[-1, 0, 0], [0, 1, 0], [0, 0, -1]], dtype=np.float32)
    trimesh.Trimesh(turned, faces, vertex_colors=colours).export(destination)


# What LGM's own inference normalises its four views by, before the splatter reads them.
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_DEVIATION = (0.229, 0.224, 0.225)


def _load_lgm(folder: str, on: str) -> Any:
    import torch

    _require("lgm.models", "plugin")
    from diffusers import AutoencoderKL, DDIMScheduler
    from lgm.models import LGM
    from lgm.mvdream.mv_unet import MultiViewUNetModel
    from lgm.mvdream.pipeline_mvdream import MVDreamPipeline
    from lgm.options import config_defaults
    from safetensors.torch import load_file
    from transformers import (
        CLIPImageProcessor,
        CLIPTextModel,
        CLIPTokenizer,
        CLIPVisionModel,
    )

    root = Path(folder)
    # Avoid `from_pretrained`: the published pipeline names untrusted code beside its weights.
    unet = MultiViewUNetModel.from_config(MultiViewUNetModel.load_config(str(root / "unet")))
    unet.load_state_dict(load_file(str(root / "unet/diffusion_pytorch_model.safetensors")))
    views = MVDreamPipeline(
        vae=AutoencoderKL.from_pretrained(str(root / "vae"), local_files_only=True),
        unet=unet,
        tokenizer=CLIPTokenizer.from_pretrained(str(root / "tokenizer"), local_files_only=True),
        text_encoder=CLIPTextModel.from_pretrained(
            str(root / "text_encoder"), local_files_only=True
        ),
        scheduler=DDIMScheduler.from_pretrained(str(root / "scheduler"), local_files_only=True),
        feature_extractor=CLIPImageProcessor.from_pretrained(
            str(root / "feature_extractor"), local_files_only=True
        ),
        image_encoder=CLIPVisionModel.from_pretrained(
            str(root / "image_encoder"), local_files_only=True
        ),
    )
    views.to(on, dtype=torch.float16)

    splatter = LGM(config_defaults["big"])
    splatter.load_state_dict(
        load_file(str(root / "lgm/model_fp16_fixrot.safetensors")), strict=False
    )
    splatter = splatter.half().to(on).eval()
    return {
        "views": views,
        "splatter": splatter,
        "rays": splatter.prepare_default_rays(on),
        "rembg": _require("rembg", "plugin").new_session(),
    }


def _run_lgm(handle: dict[str, Any], params: dict[str, Any], destination: str, on: str) -> None:
    import numpy as np
    import torch
    from kiui.op import recenter
    from torch.nn import functional
    from torchvision.transforms import functional as pictures

    carved = np.asarray(_carve(handle, _picture(params), "RGBA"))
    carved = recenter(carved, carved[..., -1] > 0, border_ratio=0.2).astype(np.float32) / 255.0
    flat = carved[..., :3] * carved[..., 3:4] + (1 - carved[..., 3:4])

    quartet = handle["views"](
        "",
        flat,
        guidance_scale=knob(params, "cfgScale", float, 5.0),
        num_inference_steps=knob(params, "steps", int, 30),
        elevation=0,
    )
    # The pipeline answers front, right, back, left; the splatter reads them in view order.
    ordered = np.stack([quartet[1], quartet[2], quartet[3], quartet[0]], axis=0)

    seen = torch.from_numpy(ordered).permute(0, 3, 1, 2).float().to(on)
    seen = functional.interpolate(seen, size=(256, 256), mode="bilinear", align_corners=False)
    seen = pictures.normalize(seen, IMAGENET_MEAN, IMAGENET_DEVIATION)
    seen = torch.cat([seen, handle["rays"]], dim=1).unsqueeze(0)

    with torch.no_grad(), torch.autocast(device_type=on, dtype=torch.float16):
        gaussians = handle["splatter"].forward_gaussians(seen)
    # Gaussians, not triangles: the rasterizer that would mesh them is non-commercial, and absent.
    handle["splatter"].gs.save_ply(gaussians, destination)


def _load_craftsman(folder: str, on: str) -> Any:
    import torch

    _require("craftsman", "plugin")
    from craftsman.models.conditional_encoders import cond_encoder
    from craftsman.pipeline import CraftsManPipeline

    root = Path(folder)
    # The encoder names two repositories to read a config shape from; the manifest fetched both,
    # and the checkpoint carries every tensor they would otherwise have pulled.
    cond_encoder.LOCAL_CONFIGS = {
        "openai/clip-vit-large-patch14": str(root / "clip"),
        "facebook/dinov2-base": str(root / "dinov2"),
    }
    return CraftsManPipeline.from_pretrained(folder, device=on, torch_dtype=torch.float32)


def _run_craftsman(pipeline: Any, params: dict[str, Any], destination: str, _on: str) -> None:
    meshes = pipeline(
        _picture(params),
        num_inference_steps=knob(params, "steps", int, 50),
        guidance_scale=knob(params, "cfgScale", float, 7.5),
        seed=knob(params, "seed", int, None),
    ).meshes
    if not meshes:
        raise LoadRefusedError("CraftsMan3D returned no mesh")
    meshes[0].export(destination)


def _load_mmaudio(folder: str, on: str, architecture: str) -> Any:
    _require("mmaudio", "plugin")
    from mmaudio.model.flow_matching import FlowMatching
    from mmaudio.model.networks import get_my_mmaudio
    from mmaudio.model.utils.features_utils import FeaturesUtils

    root = Path(folder)
    net = get_my_mmaudio(architecture).to(on).eval()
    net.load_weights(_torch_load(root / f"weights/mmaudio_{architecture}.pth"))
    features = FeaturesUtils(
        tod_vae_ckpt=str(root / "ext_weights/v1-44.pth"),
        synchformer_ckpt=str(root / "ext_weights/synchformer_state_dict.pth"),
        enable_conditions=True,
        mode="44k",
        bigvgan_vocoder_ckpt=str(root / "ext_weights/best_netG.pt"),
        need_vae_encoder=False,
    )
    features = features.to(on).eval()
    return {
        "net": net,
        "features": features,
        "fm": FlowMatching(min_sigma=0, inference_mode="euler", num_steps=25),
    }


def _run_mmaudio(handle: dict[str, Any], params: dict[str, Any], destination: str, on: str) -> None:
    import copy

    import torch
    import torchaudio
    from mmaudio.eval_utils import generate, load_video
    from mmaudio.model.sequence_config import CONFIG_44K

    prompt = text(params, "prompt") or ""
    video = filled(params, "video")
    clip_frames = sync_frames = None
    duration = knob(params, "seconds", float, 8.0)
    if video:
        info = load_video(str(video), duration)
        clip_frames = info.clip_frames.unsqueeze(0)
        sync_frames = info.sync_frames.unsqueeze(0)
        duration = info.duration_sec

    # A COPY: `CONFIG_44K` is a module singleton, and setting its duration in place leaks this
    # generation's length into every later one that reads the config before setting it.
    seq = copy.copy(CONFIG_44K)
    seq.duration = duration
    handle["net"].update_seq_lengths(seq.latent_seq_len, seq.clip_seq_len, seq.sync_seq_len)

    rng = torch.Generator(device=on)
    seed = knob(params, "seed", int, None)
    if seed is not None:
        rng.manual_seed(seed)

    audios = generate(
        clip_frames,
        sync_frames,
        [prompt],
        negative_text=[""],
        feature_utils=handle["features"],
        net=handle["net"],
        fm=handle["fm"],
        rng=rng,
        cfg_strength=knob(params, "cfgScale", float, 4.5),
    )
    torchaudio.save(destination, audios.float().cpu()[0], seq.sampling_rate)


#: Every family this adapter opens, and the three facts it needs: what opens it, what runs it, and
#: whether it demands CUDA. Anything narrower than a family — a TRELLIS variant, an MMAudio
#: architecture — is BOUND HERE, so no loader reads the id it was dispatched by.
PLUGINS: dict[str, Plugin] = {
    "kimodo-soma-rp-v1.1": Plugin(
        motion_plugin.load,
        motion_plugin.generate,
        devices=("cpu", "cuda"),
        run_cancellable=motion_plugin.run_motion,
        fallback_device="cpu",
    ),
    "make-it-animatable": Plugin(
        autorig_plugin.load,
        autorig_plugin.generate,
        auto_rig=autorig_plugin.auto_rig,
        devices=("cpu", "mps"),
    ),
    "triposr": Plugin(_load_triposr, _run_triposr),
    "trellis-text-large": Plugin(
        partial(_load_trellis, text=True), partial(_run_trellis, from_words=True), needs_cuda=True
    ),
    "trellis-image-large": Plugin(
        partial(_load_trellis, text=False), partial(_run_trellis, from_words=False), needs_cuda=True
    ),
    "trellis2-4b": Plugin(_load_trellis2, _run_trellis2, needs_cuda=True),
    "triposg": Plugin(_load_triposg, _run_triposg, needs_cuda=True),
    "instantmesh": Plugin(_load_instantmesh, _run_instantmesh, needs_cuda=True),
    "lgm": Plugin(_load_lgm, _run_lgm, needs_cuda=True),
    "craftsman3d": Plugin(_load_craftsman, _run_craftsman, needs_cuda=True),
    "mmaudio-small-44k": Plugin(partial(_load_mmaudio, architecture="small_44k"), _run_mmaudio),
    "mmaudio-medium-44k": Plugin(partial(_load_mmaudio, architecture="medium_44k"), _run_mmaudio),
    "mmaudio-large-44k": Plugin(partial(_load_mmaudio, architecture="large_44k"), _run_mmaudio),
}


def is_plugin_model(model_id: str) -> bool:
    """A name not in this table is a diffusers pipeline."""
    return model_id in PLUGINS

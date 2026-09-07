# Copyright (c) 2023, Zexin He
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


import torch.nn as nn
from transformers import ViTConfig, ViTImageProcessor
from einops import rearrange, repeat
from .dino import ViTModel


class DinoWrapper(nn.Module):
    """
    Dino v1 wrapper using huggingface transformer implementation.
    """
    def __init__(self, model_name: str, freeze: bool = True):
        super().__init__()
        self.model, self.processor = self._build_dino(model_name)
        self.camera_embedder = nn.Sequential(
            nn.Linear(16, self.model.config.hidden_size, bias=True),
            nn.SiLU(),
            nn.Linear(self.model.config.hidden_size, self.model.config.hidden_size, bias=True)
        )
        if freeze:
            self._freeze()

    def forward(self, image, camera):
        # image: [B, N, C, H, W]
        # camera: [B, N, D]
        # RGB image with [0,1] scale and properly sized
        if image.ndim == 5:
            image = rearrange(image, 'b n c h w -> (b n) c h w')
        dtype = image.dtype
        inputs = self.processor(
            images=image.float(), 
            return_tensors="pt", 
            do_rescale=False, 
            do_resize=False,
        ).to(self.model.device).to(dtype)
        # embed camera
        N = camera.shape[1]
        camera_embeddings = self.camera_embedder(camera)
        camera_embeddings = rearrange(camera_embeddings, 'b n d -> (b n) d')
        embeddings = camera_embeddings
        # This resampling of positional embedding uses bicubic interpolation
        outputs = self.model(**inputs, adaln_input=embeddings, interpolate_pos_encoding=True)
        last_hidden_states = outputs.last_hidden_state
        return last_hidden_states

    def _freeze(self):
        print(f"======== Freezing DinoWrapper ========")
        self.model.eval()
        for name, param in self.model.named_parameters():
            param.requires_grad = False

    @staticmethod
    def _build_dino(model_name: str):
        # Weights are never fetched here: the checkpoint is loaded with strict=True, so it
        # carries every encoder tensor. `model_name` is a folder holding the two configs.
        config = ViTConfig.from_pretrained(model_name, local_files_only=True)
        model = ViTModel(config, add_pooling_layer=False)
        processor = ViTImageProcessor.from_pretrained(model_name, local_files_only=True)
        return model, processor

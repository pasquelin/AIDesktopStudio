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

import numpy as np
import torch
import torch.nn as nn
import mcubes
from einops import rearrange, repeat

from .encoder.dino_wrapper import DinoWrapper
from .decoder.transformer import TriplaneTransformer
from .renderer.synthesizer import TriplaneSynthesizer


class InstantNeRF(nn.Module):
    """
    Full model of the large reconstruction model.
    """
    def __init__(
        self, 
        encoder_freeze: bool = False, 
        encoder_model_name: str = 'facebook/dino-vitb16', 
        encoder_feat_dim: int = 768,
        transformer_dim: int = 1024, 
        transformer_layers: int = 16, 
        transformer_heads: int = 16,
        triplane_low_res: int = 32, 
        triplane_high_res: int = 64, 
        triplane_dim: int = 80,
        rendering_samples_per_ray: int = 128,
    ):
        super().__init__()
        
        # modules
        self.encoder = DinoWrapper(
            model_name=encoder_model_name,
            freeze=encoder_freeze,
        )

        self.transformer = TriplaneTransformer(
            inner_dim=transformer_dim, 
            num_layers=transformer_layers, 
            num_heads=transformer_heads,
            image_feat_dim=encoder_feat_dim,
            triplane_low_res=triplane_low_res, 
            triplane_high_res=triplane_high_res, 
            triplane_dim=triplane_dim,
        )

        self.synthesizer = TriplaneSynthesizer(
            triplane_dim=triplane_dim, 
            samples_per_ray=rendering_samples_per_ray,
        )

    def forward_planes(self, images, cameras):
        # images: [B, V, C_img, H_img, W_img]
        # cameras: [B, V, 16]
        B = images.shape[0]

        # encode images
        image_feats = self.encoder(images, cameras)
        image_feats = rearrange(image_feats, '(b v) l d -> b (v l) d', b=B)
        
        # transformer generating planes
        planes = self.transformer(image_feats)

        return planes
    
    def forward_synthesizer(self, planes, render_cameras, render_size: int):
        render_results = self.synthesizer(
            planes, 
            render_cameras, 
            render_size,
        )
        return render_results

    def forward(self, images, cameras, render_cameras, render_size: int):
        # images: [B, V, C_img, H_img, W_img]
        # cameras: [B, V, 16]
        # render_cameras: [B, M, D_cam_render]
        # render_size: int
        B, M = render_cameras.shape[:2]

        planes = self.forward_planes(images, cameras)

        # render target views
        render_results = self.synthesizer(planes, render_cameras, render_size)

        return {
            'planes': planes,
            **render_results,
        }
    
    def extract_mesh(
        self, 
        planes: torch.Tensor, 
        mesh_resolution: int = 256, 
        mesh_threshold: int = 10.0, 
        **kwargs,
    ):
        '''
        Extract a 3D mesh from triplane nerf. Only support batch_size 1.
        :param planes: triplane features
        :param mesh_resolution: marching cubes resolution
        :param mesh_threshold: iso-surface threshold
        '''
        assert planes.shape[0] == 1
        device = planes.device

        grid_out = self.synthesizer.forward_grid(
            planes=planes,
            grid_size=mesh_resolution,
        )
        
        vertices, faces = mcubes.marching_cubes(
            grid_out['sigma'].squeeze(0).squeeze(-1).cpu().numpy(), 
            mesh_threshold,
        )
        vertices = vertices / (mesh_resolution - 1) * 2 - 1

        vertices_tensor = torch.tensor(vertices, dtype=torch.float32, device=device).unsqueeze(0)
        vertices_colors = self.synthesizer.forward_points(
            planes, vertices_tensor)['rgb'].squeeze(0).cpu().numpy()
        vertices_colors = (vertices_colors * 255).astype(np.uint8)

        return vertices, faces, vertices_colors

import { URL } from 'node:url'
import { readFileSync } from 'node:fs'

const text = name => readFileSync(new URL(`./licence-texts/${name}.txt`, import.meta.url), 'utf8')

export const kimodoLicences = [
  {
    name: 'Kimodo code',
    version: '1aece8c124d73d255ceff5086d983b844c9f4e94',
    spdx: 'Apache-2.0',
    text: text('kimodo-apache'),
    sources: 'https://github.com/nv-tlabs/kimodo/tree/1aece8c124d73d255ceff5086d983b844c9f4e94',
  },
  {
    name: 'Kimodo SOMA weights',
    version: '6c9233af1180b8151e3c4703477104af5dce9dd5',
    spdx: 'LicenseRef-NVIDIA-Open-Model',
    text: text('nvidia-open-model'),
    sources:
      'https://huggingface.co/nvidia/Kimodo-SOMA-RP-v1.1/blob/6c9233af1180b8151e3c4703477104af5dce9dd5/LICENSE',
  },
  {
    name: 'Meta Llama 3',
    version: '8afb486c1db24fe5011ec46dfbe5b5dccdb575c2',
    spdx: 'LicenseRef-Meta-Llama-3',
    attribution: 'Built with Meta Llama 3',
    text: [
      'Meta Llama 3 is licensed under the Meta Llama 3 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.',
      '',
      text('meta-llama3'),
      '',
      text('meta-llama3-use-policy'),
    ].join('\n'),
    sources: [
      'https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct/blob/8afb486c1db24fe5011ec46dfbe5b5dccdb575c2/LICENSE',
      'https://github.com/meta-llama/llama3/blob/a0940f9cf7065d45bb6675660f80d305c041a754/USE_POLICY.md',
    ].join('\n'),
  },
  {
    name: 'LLM2Vec motion encoder adapters',
    version: '31474e395ada192e8ed1586db6be79fb3b70c9c0 / baa8ebf04a1c2500e61288e7dad65e8ae42601a7',
    spdx: 'MIT / LicenseRef-Meta-Llama-3',
    text: [text('llm2vec-mit'), '', text('meta-llama3'), '', text('meta-llama3-use-policy')].join(
      '\n',
    ),
    sources: [
      'https://huggingface.co/McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp/tree/31474e395ada192e8ed1586db6be79fb3b70c9c0',
      'https://huggingface.co/McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised/tree/baa8ebf04a1c2500e61288e7dad65e8ae42601a7',
    ].join('\n'),
  },
]

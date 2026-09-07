import type { Scenario } from './run'
import * as read from './oracle'
import { boatImage, pixelArtBoat, paintedDot } from './setups'

/**
 * Section 68: the pixel-art grid, set and drawn on by value. What it measures is the CELLS a call
 * laid down — never what a picture looks like, which no bench can read.
 */
export const PIXEL_ART_SCENARIOS: readonly Scenario[] = [
  {
    name: '68.1 puts the document on a grid of 32 by 32',
    said: ['Passe ce document en pixel art, avec une grille de 32 sur 32.'],
    // « ce document » wants one open, as 39.2 does for the same sentence: with none the studio
    // answers `wrongSurface` and the whole rank reads as the model's fault.
    setup: boatImage,
    passed: run => (read.canvas(run)?.pixelCell ?? null) !== null && read.canvas(run)?.width === 32,
  },
  {
    name: '68.2 says whether the grid is on, and how big it is',
    said: ['Le mode pixel art est-il actif, et quelle est la taille de la grille ?'],
    setup: pixelArtBoat,
    passed: run => read.spoke(run) && read.answeredWith(run, 'canvas.state'),
  },
  {
    name: '68.3 lays a red cell where it was asked for',
    said: ['Pose un pixel rouge en 3, 4.'],
    setup: pixelArtBoat,
    passed: run => read.painted(run, 3, 4) === 0xff0000,
  },
  {
    name: '68.4 draws a line from one corner to the other',
    said: ['Trace une ligne noire du coin haut gauche au coin bas droit.'],
    setup: pixelArtBoat,
    passed: run =>
      read.paintedCells(run) >= 32 &&
      read.painted(run, 0, 0) === 0 &&
      read.painted(run, 31, 31) === 0,
  },
  {
    name: '68.5 fills a square of 8 by 8 in the middle',
    said: ['Dessine un carré bleu plein de 8 sur 8 au centre de la grille.'],
    setup: pixelArtBoat,
    passed: run => read.paintedCells(run) === 64 && read.painted(run, 12, 12) === 0x0000ff,
  },
  {
    name: '68.6 fills the whole layer',
    said: ['Remplis tout le calque en blanc.'],
    setup: pixelArtBoat,
    passed: run => read.paintedCells(run) === 1024,
  },
  {
    /**
     * Its decor lays the OPPOSITE conclusion — a red cell at (3, 4) — so nothing here passes by
     * doing nothing. The same shape as 19.6.
     */
    name: '68.7 erases a cell that was laid',
    said: ['Efface le pixel en 3, 4.'],
    setup: paintedDot,
    passed: run => read.painted(run, 3, 4) === null,
  },
  {
    name: '68.8 sends the grid in the prompt of a generation',
    said: ['Génère un sprite de personnage.'],
    setup: pixelArtBoat,
    passed: run =>
      read.promptSent(run, 'image', 'pixel art') && read.promptSent(run, 'image', '32x32'),
  },
  {
    /**
     * 🛑 Said as the GRID and not as « image normale », which the model read three times out of
     * three as the image WORKSPACE — `workspace.open`, never `canvas.setPixelArt`. The oracle is
     * untouched: what it reads is still that the grid came off.
     */
    name: '68.9 takes the document back off the grid',
    said: ['Enlève la grille de pixel art de ce document.'],
    setup: pixelArtBoat,
    passed: run => read.canvas(run)?.pixelCell === null,
  },
]

"""
tools/process_assets.py
Pipeline definitivo de procesamiento de assets para Mesa de Rol.

Funciones principales:
1. Color Unmixing + Despill: G = min(G, max(R, B)) para eliminar fondos verdes sin halos y sin erosión destructiva.
2. Procesamiento de sprites individuales o grillas 4x4.
3. Normalización al lienzo exacto de 128x168 px.
4. Generación y lectura de assets/offsets.json para ajuste fino en runtime.
"""

import os
import sys
import json
import argparse
from PIL import Image

TARGET_W = 128
TARGET_H = 168

def despill_and_chroma_key(img: Image.Image, green_thresh: int = 50, despill_margin: int = 0) -> Image.Image:
    """
    Elimina fondo verde mediante color unmixing y despill.
    Formula de despill: G = min(G, max(R, B) + despill_margin).
    Conserva antialiasing y pixel-art sin recortar contornos.
    """
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            max_rb = max(r, b)
            green_excess = g - max_rb

            # Si el exceso de verde supera el umbral, es fondo verde transparente
            if green_excess > green_thresh and g > 55:
                pixels[x, y] = (0, 0, 0, 0)
            elif green_excess > despill_margin:
                # Color unmixing / Despill: neutraliza el tono verde residual en el borde
                new_g = min(g, max_rb + despill_margin)
                # Mantener tono neutro en bordes semitransparentes
                pixels[x, y] = (r, new_g, b, a)

    return rgba

def normalize_to_canvas(img: Image.Image, target_w: int = TARGET_W, target_h: int = TARGET_H) -> Image.Image:
    """
    Asegura que la imagen tenga exactamente las dimensiones del lienzo base (target_w, target_h)
    sin recortar ni alterar proporciones. Si es de diferente tamaño, la centra.
    """
    if img.size == (target_w, target_h):
        return img

    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    offset_x = (target_w - img.width) // 2
    offset_y = (target_h - img.height) // 2
    canvas.paste(img, (offset_x, offset_y), img)
    return canvas

def process_single_sprite(input_path: str, output_path: str, green_thresh: int = 50) -> None:
    """Procesa un sprite individual, aplica despill y normaliza a 128x168."""
    img = Image.open(input_path)
    cleaned = despill_and_chroma_key(img, green_thresh=green_thresh)
    normalized = normalize_to_canvas(cleaned)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    normalized.save(output_path, "PNG")
    print(f"Sprite procesado: {output_path}")

def process_grid_4x4(grid_path: str, output_dir: str, prefix: str = "", green_thresh: int = 50) -> list[str]:
    """
    Divide una imagen de grilla 4x4 (16 sprites) en sprites individuales normalizados a 128x168.
    """
    grid = Image.open(grid_path)
    gw, gh = grid.size
    cell_w = gw // 4
    cell_h = gh // 4
    output_files = []

    idx = 1
    for row in range(4):
        for col in range(4):
            x0 = col * cell_w
            y0 = row * cell_h
            box = (x0, y0, x0 + cell_w, y0 + cell_h)
            cell = grid.crop(box)
            cleaned = despill_and_chroma_key(cell, green_thresh=green_thresh)
            normalized = normalize_to_canvas(cleaned)
            out_filename = f"{prefix}{idx}.png" if prefix else f"{idx}.png"
            out_path = os.path.join(output_dir, out_filename)
            normalized.save(out_path, "PNG")
            output_files.append(out_path)
            idx += 1

    print(f"Grilla 4x4 procesada: 16 sprites guardados en {output_dir}")
    return output_files

def clean_existing_hair_assets(base_tex_dir: str) -> int:
    """
    Inspecciona todas las texturas de pelo existentes y elimina halos verdes residuales
    usando despill matematico estricto sin mover pixeles ni erosionar.
    """
    cleaned_count = 0
    for cat in ["hombre", "mujer"]:
        folder = os.path.join(base_tex_dir, "pelo", cat)
        if not os.path.isdir(folder):
            continue
        for fname in sorted(os.listdir(folder)):
            if not fname.endswith(".png"):
                continue
            fpath = os.path.join(folder, fname)
            img = Image.open(fpath).convert("RGBA")
            pixels = img.load()
            w, h = img.size
            modified = False

            for y in range(h):
                for x in range(w):
                    r, g, b, a = pixels[x, y]
                    if a > 0:
                        max_rb = max(r, b)
                        # Exceso verde en halo
                        if g > max_rb:
                            new_g = max_rb
                            pixels[x, y] = (r, new_g, b, a)
                            modified = True

            if modified:
                img.save(fpath, "PNG")
                cleaned_count += 1

    print(f"Limpieza de halos verdes: {cleaned_count} archivos de pelo saneados.")
    return cleaned_count

def generate_offsets_json(base_tex_dir: str, offsets_file: str) -> dict:
    """
    Genera o actualiza assets/offsets.json con entradas para cada asset de pelo
    (hombre y mujer, frontal y back) con formato:
    { "asset_id": { "x": 0, "y": 0, "scale": 1.0, "layer": "front|back" } }
    Conserva ajustes previos si ya existen en el archivo.
    """
    existing = {}
    if os.path.exists(offsets_file):
        try:
            with open(offsets_file, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception as e:
            print(f"Aviso: No se pudo leer {offsets_file}, se creará uno nuevo: {e}")

    updated = dict(existing)
    added = 0

    for cat in ["hombre", "mujer"]:
        folder = os.path.join(base_tex_dir, "pelo", cat)
        if not os.path.isdir(folder):
            continue
        for fname in sorted(os.listdir(folder)):
            if not fname.endswith(".png"):
                continue
            is_back = fname.endswith("_back.png")
            num = fname.replace("_back.png", "").replace(".png", "")
            asset_id = f"pelo_{cat}_{num}_back" if is_back else f"pelo_{cat}_{num}"

            if asset_id not in updated:
                updated[asset_id] = {
                    "x": 0,
                    "y": 0,
                    "scale": 1.0,
                    "layer": "back" if is_back else "front"
                }
                added += 1

    os.makedirs(os.path.dirname(offsets_file), exist_ok=True)
    with open(offsets_file, "w", encoding="utf-8") as f:
        json.dump(updated, f, indent=2, ensure_ascii=False)

    print(f"Offsets: {len(updated)} assets registrados en {offsets_file} ({added} nuevos).")
    return updated

def main():
    parser = argparse.ArgumentParser(description="Pipeline de Assets para Mesa de Rol")
    parser.add_argument("--clean-halos", action="store_true", help="Limpia halos verdes en las texturas de pelo existentes")
    parser.add_argument("--gen-offsets", action="store_true", help="Genera/actualiza assets/offsets.json")
    parser.add_argument("--all", action="store_true", help="Ejecuta limpieza de halos y genera offsets")
    parser.add_argument("--repo-root", default=".", help="Ruta raíz del repositorio")

    args = parser.parse_args()
    root = os.path.abspath(args.repo_root)
    tex_dir = os.path.join(root, "tex")
    offsets_file = os.path.join(root, "assets", "offsets.json")

    if args.all or args.clean_halos:
        clean_existing_hair_assets(tex_dir)

    if args.all or args.gen_offsets or not os.path.exists(offsets_file):
        generate_offsets_json(tex_dir, offsets_file)

if __name__ == "__main__":
    main()

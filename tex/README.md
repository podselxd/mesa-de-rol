# Texturas de accesorios

El juego ya funciona sin esto (piel y pelo se ven con color, sin imagen). Esta carpeta es solo
para los accesorios opcionales de la ficha: **cabeza** y **arma**.

Cuando me pases una imagen, dime a qué accesorio pertenece y la guardo con el nombre exacto que
el juego espera. Si el nombre no coincide, el juego no rompe: simplemente no se ve el accesorio.

## Nombres exactos esperados

- `tex/cabeza/casco.png`
- `tex/cabeza/sombrero.png`
- `tex/cabeza/corona.png`
- `tex/cabeza/capucha.png`
- `tex/arma/espada.png`
- `tex/arma/arco.png`
- `tex/arma/baston.png`
- `tex/arma/daga.png`

## Formato recomendado

- PNG con **fondo transparente**.
- Cuadrada (por ejemplo 256×256 o 512×512), con el dibujo centrado y dejando aire alrededor:
  el juego la encoge a 44×44 px para la ficha, así que un dibujo que ya llena todo el cuadro
  se verá demasiado grande.
- Vista "de frente" o "de arriba", simple: en la ficha se ve muy pequeño.

Si quieres más accesorios (otro tipo de cabeza o arma, o una categoría nueva como "espalda"),
dímelo y añado la opción en el creador de personaje con su nombre de archivo.

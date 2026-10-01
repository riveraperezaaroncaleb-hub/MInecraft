# VoxelCraft — Clon estilo Minecraft en el navegador

## 1. Objetivo
Juego de mundo abierto en voxels, en 3D y en primera persona, que corre en el navegador. Mundo infinito generado proceduralmente, donde el jugador pueda minar, construir, craftear y sobrevivir.

> Usar texturas y assets propios o libres (CC0). No usar assets, nombres ni marcas de Mojang.

## 2. Stack
- Vite + JavaScript (ES modules)
- Three.js (render)
- Web Workers (generación de chunks y meshing)
- simplex-noise (terreno)
- IndexedDB (guardado del mundo)
- Vitest (tests)

## 3. Estructura
```
src/
  main.js
  engine/    renderer.js, camera.js, loop.js, input.js
  world/     world.js, chunk.js, chunkManager.js, mesher.js, generator.js, biomes.js
  blocks/    blockRegistry.js, textureAtlas.js
  player/    player.js, physics.js, raycast.js, inventory.js, crafting.js
  entities/  entity.js, mob.js, zombie.js, pig.js
  ui/        hud.js, hotbar.js, inventoryUI.js, craftingUI.js, menu.js
  storage/   save.js
  tests/
```

## 4. Mundo
- **Chunk:** 16×16×256 bloques (X, Z, Y).
- **Render distance:** configurable (4–16 chunks, por defecto 8).
- Los chunks se cargan y descargan alrededor del jugador.
- La generación y el meshing corren en Web Workers.
- **Meshing:** solo caras visibles (culling de caras ocultas entre bloques sólidos), con atlas de texturas y luz por vértice (ambient occlusion básico).
- Bloques transparentes (agua, hojas, vidrio) van en un mesh aparte.

## 5. Generación de terreno
- Ruido simplex 2D con varias octavas para la altura base.
- Capas: bedrock (y=0), piedra, tierra (3–4 capas), césped arriba.
- Nivel del mar en y=62. Debajo se llena de agua.
- **Cuevas:** ruido 3D, se eliminan bloques donde el valor supere un umbral.
- **Minerales:** carbón, hierro, oro y diamante, con distribución por altura y rareza.
- **Biomas** (por ruido de temperatura/humedad): llanura, bosque, desierto, montaña, nieve.
- **Árboles:** troncos + copa de hojas, con densidad según bioma.
- Semilla configurable (la misma semilla genera el mismo mundo).

## 6. Bloques (registro de datos)
Cada bloque se define así:
```js
{ id, name, textures: {top, side, bottom}, solid, transparent, hardness, tool, drops, lightEmit }
```
Bloques mínimos:
| Bloque | Dureza | Herramienta | Notas |
|---|---|---|---|
| Aire | — | — | No sólido |
| Césped | 0.6 | pala | Dropea tierra |
| Tierra | 0.5 | pala | |
| Piedra | 1.5 | pico | Dropea roca |
| Roca (cobblestone) | 2.0 | pico | |
| Arena | 0.5 | pala | Cae por gravedad |
| Grava | 0.6 | pala | Cae por gravedad |
| Tronco | 2.0 | hacha | |
| Hojas | 0.2 | — | Transparente |
| Tablones | 2.0 | hacha | |
| Cristal | 0.3 | — | Transparente, no dropea |
| Agua | — | — | Líquida, se esparce |
| Bedrock | indestructible | — | |
| Minerales | 3.0 | pico (hierro+) | Carbón, hierro, oro, diamante |
| Antorcha | 0 | — | Emite luz nivel 14 |
| Mesa de crafteo | 2.5 | hacha | Abre UI 3×3 |
| Horno | 3.5 | pico | Fundir |

## 7. Jugador
- Primera persona, mouse-look con Pointer Lock.
- **Controles:** WASD mover, Espacio saltar, Shift agacharse, Ctrl correr, E inventario, 1–9 hotbar, scroll cambia slot, clic izquierdo romper, clic derecho colocar, F5 cambiar cámara.
- **Hitbox:** 0.6 × 1.8 × 0.6. Altura de ojos: 1.62.
- **Física:** gravedad, colisión AABB contra bloques, salto de ~1.25 bloques, auto-detección de suelo.
- **Agua:** nadar con Espacio, movimiento más lento.
- **Modo creativo:** vuelo (doble salto), inventario infinito, rompe todo al instante. Alternable con tecla.

## 8. Interacción con bloques
- **Raycast voxel** (algoritmo DDA, alcance 5 bloques).
- Resaltar el bloque apuntado con un contorno wireframe.
- **Romper:** mantener clic; el tiempo depende de dureza y herramienta. Mostrar animación de grietas.
- **Colocar:** en la cara apuntada, sin solapar con la hitbox del jugador.
- Al modificar un bloque se rehace el mesh de su chunk y de los vecinos si está en el borde.

## 9. Inventario y crafteo
- Hotbar de 9 slots + inventario de 27 slots. Stacks de hasta 64.
- Drag & drop de ítems.
- **Crafteo:** cuadrícula 2×2 (inventario) y 3×3 (mesa). Recetas definidas en JSON (con forma y sin forma).
- Recetas mínimas: tronco→tablones, tablones→palos, mesa de crafteo, herramientas (madera, piedra, hierro, diamante), horno, antorcha.
- **Herramientas:** tienen durabilidad y velocidad de minado según el material.
- **Horno:** fundir mineral (hierro, oro) y cocinar comida usando combustible.

## 10. Supervivencia
- Vida (10 corazones) y hambre (10 muslos).
- Daño por caída, ahogamiento y mobs.
- El hambre baja con la actividad; si llega a 0 se pierde vida.
- Comer restaura hambre. Regeneración si el hambre está alta.
- Muerte: respawn en el punto de aparición.

## 11. Ciclo día/noche e iluminación
- Ciclo de 20 minutos reales.
- Cielo con gradiente, sol y luna, y niebla según distancia.
- **Luz:** propagación por flood-fill (sol 0–15 y luz de bloque 0–15). Las antorchas iluminan en radio.
- Las cuevas y la noche son oscuras de verdad.

## 12. Mobs
- **Pasivos:** cerdo, vaca (vagan al azar, dropean comida).
- **Hostiles:** zombi (aparece de noche o en oscuridad, persigue y ataca cuerpo a cuerpo).
- IA simple: estados idle / wander / chase / attack, con pathfinding básico (seguir al jugador evitando obstáculos de 1 bloque).
- Spawn/despawn según distancia al jugador y nivel de luz.
- Modelos hechos con cajas (estilo blocky), animación de caminar por rotación de extremidades.

## 13. UI / HUD
- Mira (crosshair) central.
- Hotbar inferior con slot seleccionado resaltado.
- Barras de vida y hambre.
- Menú de pausa (Esc): continuar, opciones, guardar y salir.
- Opciones: render distance, FOV, sensibilidad, volumen.
- Pantalla de depuración (F3): FPS, coordenadas, chunk actual, bioma.

## 14. Sonido
- Pasos según el bloque pisado, romper/colocar bloque, daño, sonidos de mobs.
- Música ambiental suave. Todo con Web Audio API y assets libres.

## 15. Guardado
- Guardar solo los chunks modificados (diff contra la generación) en IndexedDB.
- Guardar posición del jugador, inventario, vida, hambre, hora y semilla.
- Autoguardado cada 60 s y al salir.

## 16. Rendimiento (obligatorio)
- Meta: 60 FPS con render distance 8.
- Frustum culling por chunk.
- Reutilizar geometrías y buffers (object pooling).
- Limitar chunks procesados por frame (máx. 2).
- Medir y mostrar FPS en la pantalla de depuración.

## 17. Buenas prácticas
- Código modular, una responsabilidad por archivo.
- Comentarios en las partes complejas (meshing, raycast, luz).
- Constantes en un archivo de configuración (`config.js`), sin números mágicos.
- Tests con Vitest: generación determinista por semilla, raycast, colisiones, recetas.
- README con instrucciones de instalación y controles.

## 18. Orden de implementación
1. Setup Vite + Three.js, loop, cámara y controles.
2. Chunk simple plano + meshing con culling de caras.
3. Atlas de texturas y registro de bloques.
4. Física y colisión del jugador.
5. Raycast + romper/colocar bloques.
6. Generación de terreno (ruido, capas, agua, árboles, biomas, cuevas, minerales).
7. Chunk manager con Web Workers.
8. Inventario, hotbar y crafteo.
9. Ciclo día/noche y luz.
10. Supervivencia (vida/hambre).
11. Mobs.
12. Sonido y guardado.
13. Optimización, tests y pulido.

## 19. Criterios de aceptación
- [ ] Mundo infinito que carga sin trabarse al caminar.
- [ ] Se puede romper y colocar cualquier bloque.
- [ ] Se puede craftear una pico de madera → piedra → hierro.
- [ ] Hay día, noche y mobs hostiles de noche.
- [ ] El progreso se guarda y se recupera al recargar.
- [ ] Mantiene ≥ 50 FPS en una laptop normal.
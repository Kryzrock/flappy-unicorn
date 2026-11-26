# Flappy Unicorn 🦄🍄💨

Clon arcade web de Flappy Bird protagonizado por un **unicornio volador con alas animadas** que se propulsa y acelera mediante **flatulencias mágicas arcoíris**, recolecta **hongos** y tiene como misión final encontrar a la **Reina Hongo**.

## Controles
- **Espacio / Flecha arriba / W / Clic / Toque**: Aletear, lanzar propulsión de flatulencia mágica y acelerar hacia adelante.
- **P / Esc**: Pausar o reanudar.
- **M**: Silenciar o activar sonido.

## Cómo jugar
1. Cruza los pilares del cielo evitando chocar.
2. Recolecta **15 hongos mágicos** (`🍄`) en el camino.
3. Al llegar a los 15 hongos aparecerá la **Reina Hongo** (`👑`): vuela hasta ella para completar la misión.

## Cómo probar en local
Puedes abrir `index.html` directamente en tu navegador o servir la carpeta con cualquier servidor estático:

```bash
npx serve .
```

## Cómo alojar y compartir gratis
Al ser una app web estática (`index.html`, `style.css`, `game.js`), no requiere compilación ni servidor backend:

1. **Vercel** (la opción más rápida para compartir un link):
   ```bash
   npx vercel --prod
   ```
   O sube la carpeta a GitHub e impórtala en [vercel.com](https://vercel.com) con Framework Preset: *Other*.
2. **GitHub Pages**:
   Sube estos archivos a un repositorio de GitHub y activa **Settings → Pages → Deploy from a branch (`main` / `/root`)**.
3. **Netlify Drop**:
   Arrastra la carpeta del proyecto directamente en [app.netlify.com/drop](https://app.netlify.com/drop).

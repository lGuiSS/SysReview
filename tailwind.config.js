/** @type {import('tailwindcss').Config} */

// Cores do tema (Papel jornal): os valores ficam em variáveis CSS em src/index.css,
// para o modo escuro poder ajustar tons da marca sem duplicar classes.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const ramp = (name) => Object.fromEntries(
  SHADES.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`])
);

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Neutros de papel no claro, grafite frio no escuro
        gray: ramp('gray'),
        // Marca: azul de tinta quase preto (substitui o antigo indigo)
        brand: ramp('brand'),
        white: 'rgb(var(--white) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};

// Catálogo de fondos que ve el usuario: nombre, ambiente, sonido y precio (0 = incluido con la app).
import { devMode, isOwned } from './store.js';

export const THEMES = [
  {
    id: 'clasica',
    name: 'Biblioteca clásica',
    mood: 'Caoba, papel verde y el fuego de la chimenea',
    sound: 'fire',
    price: 0,
    preview: 'themes/clasica.jpg',
  },
  {
    id: 'mansion',
    name: 'Mansión frente al mar',
    mood: 'Mármol, oro y el océano al atardecer',
    sound: 'ocean',
    price: 0,
    preview: 'themes/mansion.jpg',
  },
  {
    id: 'jazz',
    name: 'Salón de jazz',
    mood: 'Nogal, art déco y un vinilo girando',
    sound: 'jazz',
    price: 0,
    preview: 'themes/jazz.jpg',
  },
  {
    id: 'atico',
    name: 'Ático moderno',
    mood: 'Roble, luces de la ciudad y lluvia en el vidrio',
    sound: 'city',
    price: 0,
    preview: 'themes/atico.jpg',
  },
  {
    id: 'paddock',
    name: 'Paddock Club',
    mood: 'Rojo Maranello, cascos y autos pasando por la recta',
    sound: 'paddock',
    price: 0.99,
    preview: 'themes/paddock.jpg',
  },
  {
    id: 'tierra',
    name: 'Palco de tierra batida',
    mood: 'París, arcilla roja y trofeos de campeón',
    sound: 'paris',
    price: 0.99,
    preview: 'themes/tierra.jpg',
  },
];

// Sonidos de ambiente que se pueden elegir en los ajustes de sonido.
export const AMBIENTS = {
  theme: 'Según el fondo',
  fire: 'Chimenea',
  ocean: 'Olas del mar',
  jazz: 'Jazz suave',
  city: 'Lluvia y piano',
  paddock: 'Motores y tribuna',
  paris: 'Tarde en París',
  rain: 'Lluvia',
  off: 'Silencio',
};

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const isUnlocked = (theme) => theme.price === 0 || devMode() || isOwned(theme.id);

export const priceLabel = (theme) => `${theme.price.toFixed(2).replace('.', ',')} US$`;

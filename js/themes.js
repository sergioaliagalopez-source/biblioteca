// Catálogo de fondos que ve el usuario: nombre, ambiente, sonido y precio (0 = incluido con la app).
import { devMode, isOwned } from './store.js';

// Colecciones del panel de fondos: al abrirlo se ven los incluidos; F1 y Deportes son pestañas aparte.
export const COLLECTIONS = [
  { id: 'incluidos', name: 'Incluidos', mood: 'Los cuatro ambientes que vienen con la app' },
  { id: 'f1', name: 'F1', mood: 'Velocidad, boxes y el rugido de la recta' },
  { id: 'deportes', name: 'Deportes', mood: 'Estadios, canchas y trofeos de campeón' },
];

export const THEMES = [
  {
    id: 'clasica',
    collection: 'incluidos',
    name: 'Biblioteca clásica',
    mood: 'Caoba, papel verde y el fuego de la chimenea',
    sound: 'fire',
    price: 0,
    preview: 'themes/clasica.jpg',
  },
  {
    id: 'mansion',
    collection: 'incluidos',
    name: 'Mansión frente al mar',
    mood: 'Mármol, oro y el océano al atardecer',
    sound: 'ocean',
    price: 0,
    preview: 'themes/mansion.jpg',
  },
  {
    id: 'jazz',
    collection: 'incluidos',
    name: 'Salón de jazz',
    mood: 'Nogal, art déco y un vinilo girando',
    sound: 'jazz',
    price: 0,
    preview: 'themes/jazz.jpg',
  },
  {
    id: 'atico',
    collection: 'incluidos',
    name: 'Ático moderno',
    mood: 'Roble, luces de la ciudad y lluvia en el vidrio',
    sound: 'city',
    price: 0,
    preview: 'themes/atico.jpg',
  },
  {
    id: 'paddock',
    collection: 'f1',
    name: 'Paddock Club',
    mood: 'Rojo Maranello, cascos y autos pasando por la recta',
    sound: 'paddock',
    price: 1.99,
    preview: 'themes/paddock.jpg',
  },
  {
    id: 'tierra',
    collection: 'deportes',
    name: 'Tennis',
    mood: 'París, arcilla roja y trofeos de campeón',
    sound: 'paris',
    price: 1.99,
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

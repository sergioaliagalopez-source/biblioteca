// Catálogo de fondos que ve el usuario: nombre, ambiente, sonido y precio.
// Mientras la app está en prueba (FREE_TRIAL) todos los fondos se pueden usar gratis.

export const FREE_TRIAL = true;

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
    price: 0.99,
    preview: 'themes/mansion.jpg',
  },
  {
    id: 'jazz',
    name: 'Salón de jazz',
    mood: 'Nogal, art déco y un vinilo girando',
    sound: 'jazz',
    price: 0.99,
    preview: 'themes/jazz.jpg',
  },
  {
    id: 'atico',
    name: 'Ático moderno',
    mood: 'Roble, luces de la ciudad y lluvia en el vidrio',
    sound: 'city',
    price: 0.99,
    preview: 'themes/atico.jpg',
  },
];

// Sonidos de ambiente que se pueden elegir en los ajustes de sonido.
export const AMBIENTS = {
  theme: 'Según el fondo',
  fire: 'Chimenea',
  ocean: 'Olas del mar',
  jazz: 'Jazz suave',
  city: 'Lluvia y piano',
  rain: 'Lluvia',
  off: 'Silencio',
};

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export const isUnlocked = (theme) => FREE_TRIAL || theme.price === 0;

# Biblioteca

Lector de libros en PDF con aspecto de libro de tapa dura, dentro de una biblioteca 3D cálida y tranquila.

## Cómo abrirla

Doble clic en **`Abrir Biblioteca.bat`**. Se abre el navegador en `http://localhost:8765`.
Deja abierta la ventanita minimizada del servidor mientras leas.

> Necesita internet la primera vez (descarga las librerías 3D y de PDF, y busca los datos de cada libro).

## En el iPhone

1. Abre en **Safari** la dirección donde está publicada (GitHub Pages).
2. Toca **Compartir** (el cuadrado con la flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Ábrela desde su ícono: va a pantalla completa y funciona sin internet una vez abierta la primera vez.

En el teléfono: desliza a los lados (o usa los puntos de abajo) para ver los otros tramos de la estantería,
y **mantén apretado** un libro para ver sus opciones. Para resaltar: botón **Resaltar**, mantén apretada una
palabra, ajusta la selección con las manijas y toca **Resaltar**. Los PDF se agregan desde la app Archivos
(incluye iCloud Drive y OneDrive). La biblioteca del iPhone es independiente de la de la PC.

## Qué hace

- **Añadir libro**: botón arriba a la derecha o arrastrar el PDF a la ventana. La app lee el PDF,
  busca el libro en Google Books y Open Library y te muestra título, autor, año, categoría y portada para confirmar.
- **Portada original**: si la primera página del PDF es la portada, la usa; si no, trae la del catálogo.
  La tela de las tapas, las guardas marmoladas y la cinta toman los colores de esa portada.
- **Categorías**: pestañas arriba. `+` para crear una; clic derecho sobre una pestaña para renombrarla o borrarla.
  Clic derecho sobre un libro para moverlo, editarlo o quitarlo.
- **Leer**: clic en un libro. Sale de la estantería, se abre la tapa y pasas hojas con clic, flechas, rueda o deslizando.
- **La cinta**: botón **Cinta** (o tecla `B`) y la cinta cae sobre la página. La próxima vez el libro se abre ahí.
  Si estás en otra página, la punta de la cinta asoma por abajo del lomo: clic en ella para volver.
- **Resaltar**: botón **Resaltar** (o tecla `H`) en el lector. Elige un color (amarillo, verde, rosa, azul o naranja)
  y selecciona el texto con el ratón. Clic sobre un resaltado para cambiarle el color o quitarlo.
  **Mis resaltados** lista todos los del libro; clic en uno para ir a su página. `Esc` o **Listo** para volver a pasar hojas con clic.
  (Los PDF escaneados como imagen no tienen texto, así que no se pueden resaltar.)
- **Buscar**: la lupa de arriba (o `Ctrl+K`, o la tecla `/`). Escribe parte del título, el autor o la categoría
  (sin importar tildes); con `↑` `↓` eliges y `Enter` abre el libro. Sin escribir nada, muestra los leídos recientemente.
- **Fondos**: botón de abajo a la derecha. Seis ambientes, cada uno con su sonido.
  Incluidos con la app: **Biblioteca clásica** (chimenea), **Mansión frente al mar** (olas),
  **Salón de jazz** (jazz suave) y **Ático moderno** (lluvia tranquila y piano, con relámpagos y truenos).
  De pago, 0,99 US$ cada uno:
  - **Paddock Club**: suite sobre la recta. Cada 45 segundos se encienden los semáforos y pasan los autos.
    Tiene cascos, autos a escala y un traje enmarcado.
  - **Tennis**: palco vacío frente a una cancha de arcilla en París.
    En el cielo pasan globo, avión y pájaros. Un cuidador pasa la alfombra por la cancha y cada tanto se encienden los aspersores.
    Tiene pelotas firmadas, raquetas, copas de campeón de otros años y un tubo de pelotas.

  Un fondo bloqueado muestra un candado. Al tocarlo ofrece **Comprar**, **Probar 30 segundos** o **pegar el código** recibido por email.
- **Sonido**: ícono de parlante arriba (y en la barra del lector). Volumen general, ambiente y hojas/cinta;
  y el ambiente: el del fondo, o chimenea, olas, jazz, lluvia y piano, motores, tarde en París, lluvia o silencio.

## Atajos en el lector

`→` / `←` pasar hoja · `B` cinta · `H` resaltar · `+` / `−` zoom · `Inicio` / `Fin` · `Esc` volver a la biblioteca

## Guardar en la nube (OneDrive)

1. Clic en **☁ Guardar en la nube** (arriba a la derecha) → **Elegir carpeta**.
2. Elige o crea una carpeta dentro de tu OneDrive, por ejemplo `OneDrive › Biblioteca`, y acepta el permiso de Chrome.
3. Listo: libros, categorías, cintas y la última página leída se guardan ahí y OneDrive los sube a la nube.

En otra PC: abre la app, **☁ Guardar en la nube** y elige **la misma carpeta**. Si la app está abierta en dos PC,
se actualiza sola al volver a la ventana. Al abrirla, Chrome puede pedirte un clic en **Abrir mi biblioteca** para
volver a dar permiso (elige «Permitir en cada visita» si aparece).

Dentro de la carpeta: `biblioteca.json` (datos), `libros/` (los PDF) y `portadas/`. No borres ni renombres esos archivos.
Funciona en Chrome o Edge de computadora.

## Si no conectas una carpeta

Todo queda en el propio navegador de esta PC. Tus archivos PDF originales no se tocan.

## Versión de desarrollador (todo desbloqueado)

- **En la PC** (`Abrir Biblioteca.bat`, `localhost`): siempre es versión de desarrollador.
  Aparece la etiqueta **DEV** junto al nombre.
- **En cualquier otro dispositivo**: abre una vez la dirección publicada con `#dev=TU-CÓDIGO` al final.
  El código es el que te dio Claude; no lo escribas en este repositorio, que es público.
  Queda activado en ese dispositivo hasta que abras la dirección con `#dev=off`.
- **Versión pública**: la dirección publicada tal cual. Ahí los fondos de pago muestran el candado.

## Cobrar los fondos (Lemon Squeezy)

Lemon Squeezy cobra con tarjeta o PayPal en todo el mundo, se ocupa de los impuestos y te paga a tu
banco o a PayPal. Comisión aproximada: 5 % + 0,50 US$ por venta.

1. Crea una cuenta en lemonsqueezy.com y una tienda. Completa los datos de pago (Settings → Payouts).
2. Crea un producto por fondo, «Paddock Club» y «Tennis», a 0,99 US$.
   En cada uno activa **Generate license keys**, con un límite de activaciones de 5.
3. Copia en `js/store.js`, dentro de `PAYMENTS`:
   - `storeId`: el número de la tienda (Settings → Stores).
   - Para cada fondo, `checkout`: el enlace de compra del producto (Share → enlace).
   - Para cada fondo, `productId`: el número del producto (aparece en la dirección al editarlo).
4. Publica. Mientras falten esos datos, **Comprar** avisa que los pagos aún no están habilitados.

Cómo compra la gente: toca **Comprar**, paga y recibe por email un código de licencia.
Lo pega en la app y el fondo queda desbloqueado. El mismo código sirve en sus otros dispositivos.

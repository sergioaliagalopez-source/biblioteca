# Servidor local de la Biblioteca. Igual que `python -m http.server`, pero le pide al
# navegador que revise siempre si hay archivos nuevos, así una actualización de la app
# nunca mezcla archivos viejos (guardados en caché) con nuevos.
import functools
import http.server
import pathlib
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = pathlib.Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as httpd:
        print(f'Biblioteca en http://localhost:{PORT}  (cierra esta ventana para apagarla)')
        httpd.serve_forever()

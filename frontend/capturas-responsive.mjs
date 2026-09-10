/**
 * Capturas de pantalla a distintos anchos, para mirar lo que ninguna medida
 * detecta: apiñamiento, jerarquía perdida, un título que entra pero en cuatro
 * líneas. Las auditorías dicen si algo se sale; esto dice si se lee.
 *
 * Es de QA y no forma parte del build. Las imágenes van al directorio que se
 * pase como primer argumento.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { buscarNavegador } from './auditoria-responsive-comun.mjs';

const BASE = 'http://localhost:4173';
const SALIDA = process.argv[2] ?? './capturas';
fs.mkdirSync(SALIDA, { recursive: true });

const ANCHOS = [
  { nombre: '320', ancho: 320, alto: 900 },
  { nombre: '360', ancho: 360, alto: 900 },
  { nombre: '768', ancho: 768, alto: 1100 },
  { nombre: '1280', ancho: 1280, alto: 900 },
];

const RUTAS = process.env.RUTAS
  ? process.env.RUTAS.split(',').map((r) => [r, r.replace(/\W+/g, '-')])
  : [
      ['/', 'inicio'],
      ['/buscar', 'buscar'],
      ['/tipo', 'tipo'],
      ['/estado-animo', 'estado-animo'],
      ['/quien-esta-viendo', 'quien-esta-viendo'],
      ['/crear-cuenta', 'crear-cuenta'],
      ['/acerca-de', 'acerca-de'],
    ];

const navegador = await puppeteer.launch({
  executablePath: buscarNavegador(fs),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const a of ANCHOS) {
  const page = await navegador.newPage();
  await page.setViewport({
    width: a.ancho,
    height: a.alto,
    deviceScaleFactor: 2,
    isMobile: a.ancho < 768,
    hasTouch: a.ancho < 768,
  });
  for (const [ruta, nombre] of RUTAS) {
    await page.goto(BASE + ruta, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1500));
    const destino = path.join(SALIDA, `${nombre}-${a.nombre}.png`);
    await page.screenshot({ path: destino, fullPage: true });
    console.log(destino);
  }
  await page.close();
}

await navegador.close();

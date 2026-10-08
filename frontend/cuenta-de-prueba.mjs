/**
 * Alta de una cuenta descartable para las auditorías que necesitan sesión
 * (auditoria-a11y.mjs y recorrido-lector-sesion.mjs).
 *
 * POR QUÉ NO ALCANZA CON LLENAR EL FORMULARIO: desde que la verificación de
 * correo es obligatoria (2026-08-29), el alta no abre sesión ni navega; termina
 * en "Revisá tu correo", y el login contesta EMAIL_NOT_VERIFIED hasta que la
 * persona abre el enlace. Las dos auditorías daban por hecho la navegación y
 * morían ahí, antes de todas las pantallas con sesión, dejando además la
 * cuenta huérfana.
 *
 * Así que esto hace los tres pasos: el alta por la pantalla (que así queda
 * auditada), marcar la cuenta como verificada en la base con
 * `cuentasDePrueba.js --verificar` (que solo toca cuentas con prefijo de
 * auditoría), y entrar por la pantalla de login.
 *
 * Necesita el backend en 3000 con el mismo .env que usa cuentasDePrueba.js,
 * o sea la misma rama de Neon.
 */
import { spawnSync } from 'node:child_process';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function crearCuentaYEntrar(page, base, cuenta) {
  await page.goto(base + '/crear-cuenta', { waitUntil: 'networkidle2' });
  await page.type('#nombre', cuenta.nombre);
  await page.type('#correo', cuenta.correo);
  await page.type('#contrasena', cuenta.contrasena);
  await page.evaluate((fecha) => {
    const campo = document.querySelector('#fecha-nacimiento');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(campo, fecha);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }, cuenta.fechaNacimiento);
  // La aceptación de los Términos es obligatoria y el servidor la exige además del cliente.
  await page.click('#acepto-terminos');
  await page.click('button[type="submit"]');

  /**
   * El alta termina en una pantalla propia y no navega. Se espera por el
   * encabezado de esa pantalla, y si no aparece se falla con lo que dice el
   * formulario, que es el motivo real.
   */
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('h1')].some((h) => h.textContent.includes('Revisá tu correo')),
      { timeout: 15000 }
    );
  } catch {
    const motivo = await page.evaluate(
      () => document.querySelector('[role="alert"]')?.textContent?.trim() ?? 'sin mensaje en pantalla'
    );
    throw new Error(`No se pudo crear la cuenta de prueba. El formulario dice: ${motivo}`);
  }

  const r = spawnSync(process.execPath, ['src/scripts/cuentasDePrueba.js', '--verificar', cuenta.correo], {
    cwd: '../backend',
    encoding: 'utf8',
  });
  if (!/Cuenta verificada/.test(r.stdout ?? '')) {
    throw new Error(`No se pudo verificar la cuenta de prueba: ${(r.stdout || r.stderr || '').trim()}`);
  }

  await page.goto(base + '/iniciar-sesion', { waitUntil: 'networkidle2' });
  await page.type('#correo', cuenta.correo);
  await page.type('#contrasena', cuenta.contrasena);
  await page.click('button[type="submit"]');
  for (let i = 0; i < 30 && page.url().includes('/iniciar-sesion'); i++) await esperar(300);

  /**
   * Sin esta comprobación, un login fallido NO rompe la auditoría: RutaPrivada
   * manda a /iniciar-sesion y las pantallas con sesión se auditan igual, pero
   * auditando el login una y otra vez y dando 0 problemas. Ya pasó una vez.
   */
  if (page.url().includes('/iniciar-sesion')) {
    const motivo = await page.evaluate(
      () => document.querySelector('[role="alert"]')?.textContent?.trim() ?? 'sin mensaje en pantalla'
    );
    throw new Error(`No se pudo entrar con la cuenta de prueba. El formulario dice: ${motivo}`);
  }
}
